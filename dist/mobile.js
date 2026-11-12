(function () {
  'use strict';
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Service worker registration:', error));
  }
  const source = document.querySelector('#deskNav');
  if (!source) return;
  const nav = document.createElement('nav');
  nav.className = 'mobile-navigation';
  nav.setAttribute('aria-label', 'پیمایش اصلی');
  source.querySelectorAll('[data-desk-view]').forEach(original => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mobileView = original.dataset.deskView;
    button.innerHTML = original.querySelector('svg').outerHTML + '<span>' + original.querySelector('span').textContent + '</span>';
    button.addEventListener('click', () => original.click());
    const sync = () => {
      const active = original.classList.contains('active');
      button.hidden = original.hidden;
      button.querySelector('span').textContent = original.querySelector('span').textContent;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    };
    new MutationObserver(sync).observe(original, {attributes: true, attributeFilter: ['class', 'hidden'], childList: true, subtree: true, characterData: true});
    sync();
    nav.append(button);
  });
  document.body.append(nav);
  const syncVisibility = () => {
    const loggedIn = !document.body.classList.contains('shared-app') || (typeof mine === 'function' && Boolean(mine()));
    nav.hidden = !loggedIn;
    document.body.classList.toggle('has-mobile-navigation', loggedIn);
  };
  const identity = document.querySelector('#deskIdentity');
  if (identity) new MutationObserver(syncVisibility).observe(identity, {childList: true, subtree: true});
  syncVisibility();
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('desk-menu-open')) document.querySelector('#deskOverlay').click();
  });
})();
