const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('dist/preferences.js', 'utf8');

function setup(rows = new Map(), local = new Map()) {
  let fail = false;
  const db = {from(table) {
    assert.equal(table, 'sm_user_preferences');
    return {
      select() {return {eq(_, uid) {return Promise.resolve({data:[...rows].filter(([key])=>key.startsWith(uid+':')).map(([, row])=>structuredClone(row))});}};},
      async upsert(input, options) {
        if (fail) return {error: new Error('offline')};
        for (const row of Array.isArray(input) ? input : [input]) {
          assert(row.value && typeof row.value === 'object');
          const key = row.user_id+':'+row.key;
          if (!rows.has(key) || !options.ignoreDuplicates) rows.set(key, structuredClone(row));
        }
        return {data: null};
      }
    };
  }};
  const context = {window:{},db,document:{dispatchEvent(){}},Event:class{},localStorage:{getItem:key=>local.get(key)??null,key:i=>[...local.keys()][i],get length(){return local.size;}}};
  vm.createContext(context); vm.runInContext(source,context);
  return {prefs:context.window.SamandisPreferences, rows, failWrites(value){fail=value;}};
}

test('imports existing preferences without clearing browser data; remote values win',async()=>{
  const local=new Map([['samandis-layout-v2','board'],['samandis-project-selection-v1:A','{"personal":"project-a"}'],['samandis-task-sort-v1:A:team:team','owner']]);
  const env=setup(new Map([['A:layout',{key:'layout',value:{data:'list'}}]]),local);
  await env.prefs.load('A');
  assert.equal(env.prefs.get('layout'),'list');
  assert.equal(env.prefs.get('personal_project'),'project-a');
  assert.equal(env.prefs.get('sort:team:team'),'owner');
  assert.equal(local.size,3);
});
test('persists null selections and layout across devices without account leakage',async()=>{
  const first=setup(); await first.prefs.load('A');
  await first.prefs.set('layout','board'); await first.prefs.set('personal_project',null);
  const second=setup(first.rows); await second.prefs.load('A');
  assert.equal(second.prefs.get('layout'),'board'); assert.equal(second.prefs.get('personal_project','missing'),null);
  await second.prefs.load('B'); assert.equal(second.prefs.get('layout','list'),'list');
  await second.prefs.set('layout','list'); await second.prefs.load('A');
  assert.equal(second.prefs.get('layout'),'board');
});
test('serializes quick changes and reports failed saves instead of pretending success',async()=>{
  const env=setup(); await env.prefs.load('A');
  await Promise.all([env.prefs.set('layout','board'),env.prefs.set('layout','list')]);
  assert.equal(env.rows.get('A:layout').value.data,'list');
  env.failWrites(true); await assert.rejects(env.prefs.set('layout','board'),/offline/);
  assert.equal(env.prefs.get('layout'),'list');
  await env.prefs.load(null); assert.equal(env.prefs.get('layout','list'),'list');
  await assert.rejects(env.prefs.set('layout','board'));
});
