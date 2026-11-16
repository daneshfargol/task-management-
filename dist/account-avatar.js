(() => {
  'use strict';
  const presets = Array.from({length: 5}, (_, i) => ({id: i + 1, src: 'avatars/avatar-' + (i + 1) + '.svg', label: i < 3 ? 'آواتار مرد ' + (i + 1) : 'آواتار زن ' + (i - 2)}));
  const pref = () => window.SamandisPreferences?.get('profile-avatar', null);
  const source = value => value?.kind === 'preset' ? presets.find(p => p.id === value.id)?.src || '' : value?.kind === 'photo' && /^data:image\/jpeg;base64,/.test(value.src || '') ? value.src : '';
  let dialog, draft, busy = false;
  function paint() {
    const avatar = document.querySelector('#deskIdentity .desk-user-avatar');
    if (!avatar) return;
    const src = source(pref());
    if (avatar.dataset.avatarSource !== src) {
      avatar.dataset.avatarSource = src;
      if (src) { const img = document.createElement('img'); img.src = src; img.alt = ''; avatar.replaceChildren(img); }
      else { avatar.textContent = typeof mine === 'function' ? mine()?.name?.[0] || '' : ''; }
    }
    avatar.setAttribute('role', 'button'); avatar.tabIndex = 0; avatar.title = 'انتخاب عکس یا آواتار'; avatar.setAttribute('aria-label', avatar.title);
    avatar.onclick = open;
    avatar.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
  }
  function preview() {
    const src = source(draft), target = dialog.querySelector('.avatar-preview');
    target.replaceChildren();
    if (src) { const img = document.createElement('img'); img.src = src; img.alt = 'پیش‌نمایش تصویر حساب'; target.append(img); }
    else target.textContent = typeof mine === 'function' ? mine()?.name?.[0] || '' : '';
    dialog.querySelectorAll('[data-avatar]').forEach(b => b.setAttribute('aria-pressed', String(draft?.kind === 'preset' && draft.id === Number(b.dataset.avatar))));
  }
  function ensure() {
    if (dialog) return;
    dialog = document.createElement('dialog'); dialog.className = 'avatar-dialog'; dialog.dataset.ownDismiss = 'true'; dialog.setAttribute('aria-labelledby', 'avatarTitle');
    dialog.innerHTML = '<div class="avatar-dialog-head"><h2 id="avatarTitle">عکس و آواتار حساب</h2><button type="button" data-avatar-close aria-label="بستن">×</button></div><div class="avatar-preview"></div><p class="avatar-hint">یکی از آواتارها را انتخاب کنید یا عکس خودتان را بارگذاری کنید.</p><div class="avatar-options"></div><div class="avatar-upload"><label class="secondary" for="avatarFile">انتخاب عکس از دستگاه</label><input id="avatarFile" type="file" accept="image/jpeg,image/png,image/webp" hidden><button type="button" class="text-btn" data-avatar-reset>بدون عکس</button></div><p class="avatar-status" role="status" aria-live="polite"></p><div class="avatar-actions"><button type="button" class="primary" data-avatar-save>ذخیره تصویر</button><button type="button" class="secondary" data-avatar-close>انصراف</button></div>';
    for (const p of presets) { const b = document.createElement('button'); b.type = 'button'; b.dataset.avatar = p.id; b.setAttribute('aria-label', p.label); b.innerHTML = '<img src="' + p.src + '" alt="">'; b.onclick = () => { if (!busy) { draft = {kind: 'preset', id: p.id}; preview(); } }; dialog.querySelector('.avatar-options').append(b); }
    dialog.querySelectorAll('[data-avatar-close]').forEach(b => b.onclick = () => { if (!busy) dialog.close(); });
    dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
    dialog.querySelector('[data-avatar-reset]').onclick = () => { if (!busy) { draft = null; preview(); } };
    dialog.querySelector('#avatarFile').onchange = async e => {
      const file = e.target.files?.[0]; if (!file || busy) return;
      const status = dialog.querySelector('.avatar-status'); status.textContent = '';
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { status.textContent = 'عکس JPG، PNG یا WebP با حجم کمتر از ۱۰ مگابایت انتخاب کنید.'; e.target.value = ''; return; }
      busy = true; dialog.querySelector('[data-avatar-save]').disabled = true;
      const url = URL.createObjectURL(file);
      try {
        const img = new Image(); img.src = url; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d'), side = Math.min(img.naturalWidth, img.naturalHeight);
        if (!side) throw new Error('invalid image');
        ctx.fillStyle = '#f3f0e5'; ctx.fillRect(0, 0, 256, 256); ctx.drawImage(img, (img.naturalWidth-side)/2, (img.naturalHeight-side)/2, side, side, 0, 0, 256, 256);
        draft = {kind: 'photo', src: canvas.toDataURL('image/jpeg', .82)}; preview();
      } catch { status.textContent = 'عکس باز نشد؛ یک فایل دیگر انتخاب کنید.'; }
      finally { URL.revokeObjectURL(url); e.target.value = ''; busy = false; dialog.querySelector('[data-avatar-save]').disabled = false; }
    };
    dialog.querySelector('[data-avatar-save]').onclick = async () => {
      if (busy) return; busy = true; const b = dialog.querySelector('[data-avatar-save]'); b.disabled = true;
      const status = dialog.querySelector('.avatar-status'); status.textContent = 'در حال ذخیره…';
      try { await SamandisPreferences.set('profile-avatar', draft); paint(); dialog.close(); }
      catch { status.textContent = 'تصویر ذخیره نشد؛ دوباره تلاش کنید.'; }
      finally { busy = false; b.disabled = false; }
    };
    document.body.append(dialog);
  }
  function open() {
    if (typeof mine !== 'function' || !mine()) return;
    ensure(); if (dialog.open) return;
    draft = pref(); dialog.querySelector('.avatar-status').textContent = ''; preview(); dialog.showModal();
  }
  function mount() {
    paint();
    const profile = document.querySelector('.account-profile-details');
    if (profile && !profile.querySelector('.avatar-profile-link')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary avatar-profile-link'; b.textContent = 'انتخاب عکس یا آواتار'; b.onclick = open; profile.prepend(b); }
    const panel = document.querySelector('#accountMorePanel');
    const link = panel?.querySelector('.avatar-menu-link'); if (link) link.hidden = typeof mine !== 'function' || !mine();
    if (panel && !panel.querySelector('.avatar-menu-link')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'account-settings-link avatar-menu-link'; b.textContent = 'عکس و آواتار من'; b.onclick = () => { document.querySelector('.account-more[aria-expanded=true]')?.click(); open(); }; panel.append(b); }
  }
  document.addEventListener('samandis-preferences-loaded', mount);
  const observer = new MutationObserver(mount); observer.observe(document.body, {childList: true, subtree: true});
  window.addEventListener('pagehide', () => observer.disconnect(), {once: true}); mount();
})();
