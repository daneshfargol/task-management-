/* Per-account preferences are stored in Postgres; browser copies are migration inputs only. */
(() => {
  'use strict';
  let user = null, generation = 0, values = new Map();
  const queues = new Map();
  const checkedResult = async query => {
    const result = await query;
    if (result.error) throw result.error;
    return result.data;
  };
  function legacy(uid) {
    const rows = new Map();
    try {
      const layout = localStorage.getItem('samandis-layout-v2');
      if (['list', 'board'].includes(layout)) rows.set('layout', layout);
      const selection = JSON.parse(localStorage.getItem('samandis-project-selection-v1:' + uid));
      if (selection && (selection.personal === null || typeof selection.personal === 'string')) rows.set('personal_project', selection.personal);
      const prefix = 'samandis-task-sort-v1:' + uid + ':';
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(prefix)) continue;
        const value = localStorage.getItem(key);
        if (['due', 'new', 'updated', 'status', 'owner'].includes(value)) rows.set('sort:' + key.slice(prefix.length), value);
      }
    } catch { /* Existing browser data is never cleared if browser storage is unavailable. */ }
    return rows;
  }
  window.SamandisPreferences = {
    get(key, fallback = null) { return values.has(key) ? values.get(key) : fallback; },
    async load(uid) {
      const token = ++generation;
      user = uid || null;
      values = new Map();
      if (!uid) return;
      let rows = await checkedResult(db.from('sm_user_preferences').select('key,value').eq('user_id', uid));
      if (token !== generation) return;
      const remote = new Map(rows.map(row => [row.key, row.value.data]));
      const missing = [...legacy(uid)].filter(([key]) => !remote.has(key)).map(([key, value]) => ({user_id: uid, key, value: {data: value}}));
      if (missing.length) {
        await checkedResult(db.from('sm_user_preferences').upsert(missing, {onConflict: 'user_id,key', ignoreDuplicates: true}));
        rows = await checkedResult(db.from('sm_user_preferences').select('key,value').eq('user_id', uid));
      }
      if (token !== generation) return;
      values = new Map(rows.map(row => [row.key, row.value.data]));
      document.dispatchEvent(new Event('samandis-preferences-loaded'));
    },
    set(key, value) {
      if (!user) return Promise.reject(new Error('برای ذخیره تنظیمات وارد حساب شوید.'));
      const uid = user, token = generation, previous = values.get(key), existed = values.has(key);
      values.set(key, value);
      const queueKey = uid + ':' + key;
      const task = (queues.get(queueKey) || Promise.resolve()).catch(() => {}).then(async () => {
        if (uid !== user || token !== generation) return;
        try {
          await checkedResult(db.from('sm_user_preferences').upsert({user_id: uid, key, value: {data: value}}, {onConflict: 'user_id,key'}));
        } catch (error) {
          if (token === generation && values.get(key) === value) {
            if (existed) values.set(key, previous); else values.delete(key);
          }
          throw error;
        }
      });
      queues.set(queueKey, task);
      task.finally(() => { if (queues.get(queueKey) === task) queues.delete(queueKey); }).catch(() => {});
      return task;
    }
  };
})();
