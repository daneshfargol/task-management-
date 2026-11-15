(() => {
  'use strict';
  const previous = loadAccount;
  let generation = 0;
  loadAccount = async function (account) {
    const token = ++generation;
    let error = null;
    try { await SamandisPreferences.load(account?.user?.id); } catch (e) { error = e; }
    if (token !== generation) return;
    await previous(account);
    if (error && token === generation && account?.user?.id === session?.user?.id) message('تنظیمات حساب دریافت نشد؛ اتصال را بررسی و دوباره وارد شوید. ' + failure(error));
  };
})();
