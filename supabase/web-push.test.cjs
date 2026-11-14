const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

async function workerTests() {
  let handler, calls = [], sent = [];
  const jobs = [
    {id: 'good', attempt: 1, taskId: 'task-1', subscription: {endpoint: 'https://fcm.googleapis.com/fcm/send/example'}},
    {id: 'gone', attempt: 2, test: true, subscription: {endpoint: 'https://web.push.apple.com/example'}},
    {id: 'internal', attempt: 3, subscription: {endpoint: 'https://127.0.0.1/admin'}},
  ];
  const source = fs.readFileSync(path.join(root, 'supabase/functions/samandis-push/index.ts'), 'utf8').replace("import webpush from 'npm:web-push@3.6.7';", '');
  vm.runInNewContext(source, {
    URL, Response, TextEncoder, console,
    Deno: {env: {get: name => name === 'SUPABASE_URL' ? 'https://db.example' : 'server-only'}, serve: value => handler = value},
    webpush: {setVapidDetails() {}, async sendNotification(subscription, payload) {
      sent.push({endpoint: subscription.endpoint, payload: JSON.parse(payload)});
      if (subscription.endpoint.includes('apple')) throw {statusCode: 410};
      return {statusCode: 201};
    }},
    fetch: async (url, options) => {
      const name = url.split('/').pop(); calls.push({name, args: JSON.parse(options.body)});
      if (name === 'sm_push_worker_config') return Response.json({enabled: true, secret: 'test-secret', publicKey: 'test-public', privateKey: 'test-private', subject: 'https://example.com'});
      if (name === 'sm_push_claim') return Response.json(jobs);
      return new Response(null, {status: 204});
    },
  });
  assert.equal((await handler(new Request('https://edge.example', {method: 'GET'}))).status, 405);
  assert.equal((await handler(new Request('https://edge.example', {method: 'POST'}))).status, 401);
  assert(!calls.some(call => call.name === 'sm_push_claim'), 'Unauthorized callers cannot claim deliveries');
  const response = await handler(new Request('https://edge.example', {method: 'POST', headers: {Authorization: 'Bearer test-secret'}}));
  assert.equal(response.status, 200);
  assert.equal(sent.length, 2, 'An internal network URL must never be contacted');
  const complete = calls.filter(call => call.name === 'sm_push_complete');
  assert.equal(complete.find(call => call.args.p_id === 'gone').args.p_status, 410);
  assert.equal(complete.find(call => call.args.p_id === 'good').args.p_status, 201);
  assert.equal(complete.find(call => call.args.p_id === 'internal').args.p_status, 503);
  assert(!sent[0].payload.body.includes('task-1'), 'Task contents stay off lock screens');
}

async function serviceWorkerTests() {
  const events = {}, notifications = [], opened = [];
  vm.runInNewContext(fs.readFileSync(path.join(root, 'dist/sw.js'), 'utf8'), {
    URL,
    self: {
      location: {origin: 'https://app.example'}, addEventListener: (name, fn) => events[name] = fn,
      registration: {showNotification: async (title, options) => notifications.push({title, options})},
      clients: {matchAll: async () => [], openWindow: async url => opened.push(url)},
    },
  });
  let pending;
  events.push({data: {json: () => ({url: 'https://attacker.example', body: 'hello'})}, waitUntil: p => pending = p});
  await pending;
  assert.equal(notifications[0].options.data.url, '/shared.html');
  events.notificationclick({notification: {close() {}, data: {url: 'https://attacker.example'}}, waitUntil: p => pending = p});
  await pending;
  assert.equal(opened[0], 'https://app.example/shared.html');
  events.push({data: {json: () => {throw Error('Malformed payload');}}, waitUntil: p => pending = p});
  await pending;
  assert.equal(notifications.length, 2, 'Malformed payloads still produce a safe notification');
}

(async () => {await workerTests(); await serviceWorkerTests(); console.log('Passed: webhook authorization, delivery results, SSRF guard, private lock-screen content, safe notification navigation and malformed payload.');})().catch(error => {console.error(error); process.exit(1);});
