import webpush from 'npm:web-push@3.6.7';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
async function rpc(name, args = {}) {
  const result = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'},
    body: JSON.stringify(args),
  });
  if (!result.ok) throw new Error(`Database operation failed: ${result.status}`);
  return result.status === 204 ? null : result.json();
}
function sameSecret(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let different = 0;
  for (let i = 0; i < x.length; i++) different |= x[i] ^ y[i];
  return different === 0;
}
Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', {status: 405});
  try {
    const config = await rpc('sm_push_worker_config');
    if (!config?.enabled) return new Response('Push not configured', {status: 503});
    if (!sameSecret(request.headers.get('Authorization') || '', `Bearer ${config.secret}`)) return new Response('Unauthorized', {status: 401});
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    const jobs = await rpc('sm_push_claim');
    // Four concurrent sends; expired devices are disabled, transient failures are retried.
    for (let i = 0; i < jobs.length; i += 4) {
      await Promise.all(jobs.slice(i, i + 4).map(async job => {
        let status = 503;
        try {
          const target = new URL(job.subscription.endpoint);
          if (target.protocol !== 'https:' || target.port || target.username || target.password || !/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)$/i.test(target.hostname)) throw new Error('Invalid endpoint');
          const result = await webpush.sendNotification(job.subscription, JSON.stringify({
            title: 'سمندیس',
            body: job.test ? 'اعلان‌های این دستگاه فعال است.' : 'یک به‌روزرسانی تازه در کارهای شما ثبت شد.',
            tag: job.id,
            url: job.taskId ? `/shared.html?task=${encodeURIComponent(job.taskId)}` : '/shared.html',
          }), {TTL: 86400, urgency: 'normal', timeout: 12000});
          status = result.statusCode;
        } catch (error) { status = Number(error?.statusCode) || 503; }
        await rpc('sm_push_complete', {p_id: job.id, p_attempt: job.attempt, p_status: status});
      }));
    }
    return Response.json({processed: jobs.length});
  } catch (_) {
    // Never log credentials, subscriptions or notification contents.
    return new Response('Push processing failed', {status: 503});
  }
});
