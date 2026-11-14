(function () {
  'use strict';
  if (!document.body.classList.contains('shared-app')) return;
  const panel = document.createElement('section');
  panel.className = 'push-preferences';
  panel.hidden = true;
  panel.innerHTML = '<b>اعلان‌های این دستگاه</b><p class="push-status" role="status" aria-live="polite">در حال بررسی…</p><div><button type="button" data-push="enable">فعال‌کردن اعلان‌ها</button><button type="button" data-push="test" hidden>اعلان آزمایشی</button><button type="button" data-push="disable" hidden>خاموش‌کردن</button></div>';
  document.querySelector('.desk-bottom').prepend(panel);
  const status = panel.querySelector('.push-status');
  const buttons = [...panel.querySelectorAll('button')];
  let registration, settings, activeSubscription, accountId = null, busy = false, generation = 0;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const pwaPrompt = document.createElement('aside');
  pwaPrompt.className = 'pwa-push-prompt';pwaPrompt.hidden = true;
  pwaPrompt.innerHTML = '<span>اعلان کارهای جدید در اپ</span><button type="button">فعال‌کردن اعلان‌ها</button>';
  document.body.append(pwaPrompt);
  pwaPrompt.querySelector('button').onclick = () => { if (!busy) panel.querySelector('[data-push="enable"]').click(); };
  const supported = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const text = error => /denied|permission/i.test(error?.message || '') ? 'اجازهٔ اعلان بسته است؛ آن را از تنظیمات مرورگر یا گوشی تغییر دهید.' : /fetch|network/i.test(error?.message || '') ? 'ارتباط برقرار نشد؛ دوباره تلاش کنید.' : /30 seconds/.test(error?.message || '') ? 'برای آزمایش بعدی ۳۰ ثانیه صبر کنید.' : 'تنظیم اعلان ذخیره نشد؛ دوباره تلاش کنید.';
  function state(message, enabled = false) {
    status.textContent = message;
    pwaPrompt.hidden = !installed || !accountId || !supported || !settings?.ready || enabled || Notification.permission === 'denied';
    panel.querySelector('[data-push="enable"]').hidden = enabled || !supported || (ios && !installed) || !settings?.ready;
    panel.querySelector('[data-push="test"]').hidden = !enabled;
    panel.querySelector('[data-push="disable"]').hidden = !enabled;
  }
  async function call(name, args = {}) {
    const result = await db.rpc(name, args);
    if (result.error) throw result.error;
    return result.data;
  }
  function keyBytes(key) {
    const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }
  async function saveSubscription(subscription) {
    const json = subscription.toJSON();
    await call('sm_push_subscribe', {p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_device: ios ? 'iPhone / iPad' : /Android/.test(navigator.userAgent) ? 'Android' : 'Desktop'});
  }
  async function inspect() {
    const who = typeof mine === 'function' ? mine()?.user_id : null;
    panel.hidden = !who;
    if (who === accountId) return;
    accountId = who;
    const current = ++generation;
    pwaPrompt.hidden = true;
    settings = null;
    activeSubscription = null;
    if (!who) { pwaPrompt.hidden = true; return; }
    if (ios && !installed) { state('برای اعلان در آیفون، ابتدا از Safari گزینهٔ «افزودن به صفحهٔ اصلی» را بزنید و برنامه را از همان آیکون باز کنید.'); return; }
    if (!supported) { state('این مرورگر از اعلان پشتیبانی نمی‌کند. از نسخهٔ جدید Chrome، Edge، Firefox یا وب‌اپ نصب‌شدهٔ آیفون استفاده کنید.'); return; }
    try {
      const config = await call('sm_push_settings');
      if (current !== generation) return;
      settings = config;
      if (!settings?.ready) { state('سرویس ارسال اعلان هنوز روی سرور فعال نشده است.'); return; }
      registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (current !== generation) return;
      if (subscription && Notification.permission === 'granted') {
        await saveSubscription(subscription);
        activeSubscription = subscription;
        state('فعال است؛ اعلان کارهای خودتان را روی این دستگاه می‌گیرید.', true);
      } else state(Notification.permission === 'denied' ? 'اجازهٔ اعلان بسته است؛ از تنظیمات مرورگر یا گوشی آن را باز کنید.' : 'با اجازهٔ شما، اعلان‌های کارتان حتی هنگام بسته‌بودن برنامه نمایش داده می‌شود.');
    } catch (_) { if (current === generation) state('سرویس اعلان فعلاً در دسترس نیست. صفحه را دوباره باز کنید.'); }
  }
  panel.addEventListener('click', async event => {
    const action = event.target.closest('[data-push]')?.dataset.push;
    if (!action || busy) return;
    busy = true;
    buttons.forEach(button => button.disabled = true);
    try {
      if (action === 'enable') {
        // Permission must be requested directly from this user gesture, especially on iOS.
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') { state('اجازهٔ اعلان داده نشد؛ هر زمان خواستید از تنظیمات مرورگر فعالش کنید.'); return; }
        registration = registration || await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) subscription = await registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: keyBytes(settings.publicKey)});
        await saveSubscription(subscription);
        activeSubscription = subscription;
        state('اعلان‌ها فعال شد. برای بررسی، «اعلان آزمایشی» را بزنید.', true);
      } else if (action === 'disable') {
        if (activeSubscription) {
          await call('sm_push_unsubscribe', {p_endpoint: activeSubscription.endpoint});
          await activeSubscription.unsubscribe();
        }
        activeSubscription = null;
        state('اعلان‌های این دستگاه خاموش شد.');
      } else if (action === 'test' && activeSubscription) {
        await call('sm_push_test', {p_endpoint: activeSubscription.endpoint});
        state('اعلان آزمایشی در صف ارسال است؛ تنظیمات اعلان سیستم را هم بررسی کنید.', true);
      }
    } catch (error) { state(text(error), Boolean(activeSubscription)); }
    finally { busy = false; buttons.forEach(button => button.disabled = false); }
  });
  // Revoke this account's device subscription before its signed-in token is cleared.
  document.addEventListener('click', async event => {
    if (!event.target.closest('#signout') || !activeSubscription) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const button = event.target.closest('#signout');
    button.disabled = true;
    try {
      await call('sm_push_unsubscribe', {p_endpoint: activeSubscription.endpoint});
      await activeSubscription.unsubscribe();
      activeSubscription = null;
      await db.auth.signOut();
    } catch (_) { message('خاموش‌کردن اعلان و خروج کامل نشد؛ اتصال را بررسی و دوباره تلاش کنید.'); }
    finally { button.disabled = false; }
  }, true);
  new MutationObserver(inspect).observe(document.querySelector('#deskIdentity'), {childList: true, subtree: true});
  inspect();
  let openedTask = false;
  function openLinkedTask() {
    const id = new URL(location.href).searchParams.get('task');
    if (openedTask || !id || typeof mine !== 'function' || !mine() || typeof tasks === 'undefined') return;
    const task = tasks.find(item => item.id === id);
    if (!task) return;
    openedTask = true;
    const url = new URL(location.href); url.searchParams.delete('task'); history.replaceState(null, '', url);
    detail(task.id);
  }
  new MutationObserver(openLinkedTask).observe(document.querySelector('#deskIdentity'), {childList: true, subtree: true});
  openLinkedTask();
})();
