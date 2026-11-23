(() => {
  'use strict';
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  const key = 'samandis-daily-update';
  let timer;
  const tehranNow = () => new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Tehran'}));
  const dayKey = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const canRefresh = () => !document.querySelector('dialog[open],#sharedDialog[open],.modal-open');

  async function refreshForDay(day) {
    if (sessionStorage.getItem(key) === dayKey(day) || !canRefresh()) return false;
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
    sessionStorage.setItem(key, dayKey(day));
    return true;
  }

  function schedule() {
    clearTimeout(timer);
    const now = tehranNow();
    const target = new Date(now);
    target.setHours(14, 0, 0, 0);
    const today = dayKey(now);
    if (now >= target && sessionStorage.getItem(key) !== today) {
      refreshForDay(now).finally(() => { timer = setTimeout(schedule, 5 * 60 * 1000); });
      return;
    }
    if (now >= target) target.setDate(target.getDate() + 1);
    timer = setTimeout(async () => {
      if (!canRefresh()) { timer = setTimeout(schedule, 5 * 60 * 1000); return; }
      await refreshForDay(tehranNow());
      schedule();
    }, Math.max(1000, target - now));
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!canRefresh() || sessionStorage.getItem('samandis-controller-reloaded')) return;
    sessionStorage.setItem('samandis-controller-reloaded', '1');
    location.reload();
  });
  schedule();
})();
