/**
 * Samandis Personal Routine Alarms & Timers
 * Phone-like alarms and recurring routine reminders for each team member.
 */
(function () {
  'use strict';

  const shared = document.body.classList.contains('shared-app');
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));

  const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  const DAY_SHORTS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

  // Convert English digits to Persian
  function faNum(str) {
    const p = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(str).replace(/[0-9]/g, d => p[Number(d)]);
  }

  // Get current user identifier to keep each user's alarms completely separate
  function getCurrentUserId() {
    if (shared) {
      if (typeof mine === 'function' && mine()?.id) return 'user_' + mine().id;
      if (typeof session !== 'undefined' && session?.user?.id) return 'auth_' + session.user.id;
      return 'shared_user';
    } else {
      if (typeof me === 'function') return 'persona_' + me();
      return 'demo_user';
    }
  }

  function getCurrentUserName() {
    if (shared && typeof mine === 'function' && mine()?.name) return mine().name;
    if (!shared && typeof me === 'function' && typeof people !== 'undefined' && people[me()]) return people[me()];
    return 'کاربر';
  }

  function getStorageKey() {
    return 'samandis_user_routines_v1_' + getCurrentUserId();
  }

  // Today's ISO date (YYYY-MM-DD)
  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  // Iranian Day of Week index (0 = Saturday, 1 = Sunday ... 6 = Friday)
  function getIranianDayOfWeek(date = new Date()) {
    return (date.getDay() + 1) % 7;
  }

  // Load user routines
  function loadRoutines() {
    try {
      const raw = localStorage.getItem(getStorageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}

    // Default template routines for a fresh user
    const defaultRoutines = [
      {
        id: 'routine_default_report',
        title: 'ثبت گزارش کار روزانه',
        note: 'ثبت اقدامات، مدارک و وضعیت کارهای روز در سامانه سمندیس',
        time: '16:00',
        days: [0, 1, 2, 3, 4], // شنبه تا چهارشنبه
        enabled: true,
        sound: true,
        notify: true,
        completedDates: [],
        created_at: new Date().toISOString()
      },
      {
        id: 'routine_default_morning',
        title: 'بررسی اولویت‌ها و کارتابل صبحگاهی',
        note: 'مرور کارهای نیازمند بررسی و هماهنگی با تیم در شروع روز کاری',
        time: '08:30',
        days: [0, 1, 2, 3, 4], // شنبه تا چهارشنبه
        enabled: true,
        sound: true,
        notify: true,
        completedDates: [],
        created_at: new Date().toISOString()
      }
    ];

    saveRoutines(defaultRoutines);
    return defaultRoutines;
  }

  // Save routines
  function saveRoutines(list) {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(list));
    } catch (e) {
      console.error('Failed to save routines', e);
    }
    updateNavBadges();
  }

  // Web Audio API Synthesizer - Melodious Smartphone Chime
  let audioCtx = null;
  function playAlarmChime() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;

      // 3-tone harmonic chime sequence repeated twice (E5, G#5, B5, E6)
      const notes = [
        { f: 659.25, start: 0.05, dur: 0.22 },   // E5
        { f: 830.61, start: 0.30, dur: 0.22 },   // G#5
        { f: 987.77, start: 0.55, dur: 0.35 },   // B5

        { f: 659.25, start: 1.10, dur: 0.22 },
        { f: 830.61, start: 1.35, dur: 0.22 },
        { f: 987.77, start: 1.60, dur: 0.35 },
        { f: 1318.51, start: 1.85, dur: 0.65 }  // E6 chime
      ];

      notes.forEach(n => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.f, now + n.start);

        gain.gain.setValueAtTime(0.0001, now + n.start);
        gain.gain.exponentialRampToValueAtTime(0.3, now + n.start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now + n.start);
        osc.stop(now + n.start + n.dur + 0.08);
      });
    } catch (err) {
      console.warn('Audio chime error:', err);
    }
  }

  // Quick success tone for marking done
  function playSuccessSound() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.001, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.3);
      });
    } catch (_) {}
  }

  // Native System Notification
  async function sendSystemNotification(routine) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const title = '⏰ یادآور کار روتین: ' + routine.title;
    const body = routine.note ? routine.note : 'زمان انجام این کار روتین در سمندیس فرا رسیده است.';
    const options = {
      body,
      icon: '/icons/apple-touch-serif.png',
      badge: '/icons/apple-touch-serif.png',
      tag: 'routine-' + routine.id,
      dir: 'rtl',
      lang: 'fa',
      renotify: true,
      requireInteraction: true
    };

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.showNotification) {
          return reg.showNotification(title, options);
        }
      }
      new Notification(title, options);
    } catch (_) {
      try { new Notification(title, options); } catch (e) {}
    }
  }

  // Next reminder human-readable calculation
  function getNextOccurrence(routine) {
    if (!routine.enabled || !routine.days || !routine.days.length) return 'غیرفعال';
    const now = new Date();
    const currentDay = getIranianDayOfWeek(now);
    const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    for (let offset = 0; offset < 7; offset++) {
      const targetDay = (currentDay + offset) % 7;
      if (routine.days.includes(targetDay)) {
        if (offset === 0) {
          if (routine.time > currentHHMM) {
            return `امروز ساعت ${faNum(routine.time)}`;
          }
        } else if (offset === 1) {
          return `فردا (${DAY_NAMES[targetDay]}) ساعت ${faNum(routine.time)}`;
        } else {
          return `${DAY_NAMES[targetDay]} ساعت ${faNum(routine.time)}`;
        }
      }
    }
    return `هفته بعد ساعت ${faNum(routine.time)}`;
  }

  // Summary text for days array
  function formatDaysSummary(days) {
    if (!days || !days.length) return 'هیچ روزی انتخاب نشده';
    if (days.length === 7) return 'همه روزها (هر روز)';
    const sorted = [...days].sort((a, b) => a - b);
    if (JSON.stringify(sorted) === JSON.stringify([0, 1, 2, 3, 4])) return 'شنبه تا چهارشنبه (روزهای کاری)';
    if (JSON.stringify(sorted) === JSON.stringify([0, 1, 2, 3, 4, 5])) return 'شنبه تا پنجشنبه';
    if (JSON.stringify(sorted) === JSON.stringify([0, 2, 4])) return 'روزهای فرد (ش، د، چ)';
    if (JSON.stringify(sorted) === JSON.stringify([1, 3, 5])) return 'روزهای زوج (ی، س، پ)';
    return days.map(d => DAY_NAMES[d]).join('، ');
  }

  // Time period indicator (صبح / عصر)
  function getTimePeriod(timeStr) {
    if (!timeStr) return '';
    const h = parseInt(timeStr.split(':')[0], 10);
    if (h < 12) return 'صبح';
    if (h < 17) return 'بعدازظهر';
    return 'غروب / شب';
  }

  // In-App Alarm Popup Screen
  function showAlarmPopup(routine) {
    const existing = q('#routineAlarmOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'routineAlarmOverlay';
    overlay.className = 'routine-alarm-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');

    const dayName = DAY_NAMES[getIranianDayOfWeek()];
    const timeDisplay = faNum(routine.time);

    overlay.innerHTML = `
      <div class="routine-alarm-modal">
        <div class="routine-alarm-icon">⏰</div>
        <div class="routine-alarm-time">${timeDisplay} · ${dayName}</div>
        <h2 class="routine-alarm-title">${esc(routine.title)}</h2>
        ${routine.note ? `<div class="routine-alarm-note">${esc(routine.note)}</div>` : ''}
        <div class="routine-alarm-actions">
          <button type="button" class="routine-alarm-btn-done" id="routineAlarmDoneBtn">✓ انجام دادم</button>
          <button type="button" class="routine-alarm-btn-snooze" id="routineAlarmSnoozeBtn">⏱ ۵ دقیقه بعد یادآوری کن</button>
          <button type="button" class="routine-alarm-btn-dismiss" id="routineAlarmDismissBtn">بستن</button>
        </div>
      </div>
    `;

    document.body.append(overlay);

    // Done button handler
    q('#routineAlarmDoneBtn').onclick = () => {
      const routines = loadRoutines();
      const current = routines.find(r => r.id === routine.id);
      if (current) {
        if (!Array.isArray(current.completedDates)) current.completedDates = [];
        const today = getTodayKey();
        if (!current.completedDates.includes(today)) current.completedDates.push(today);
        saveRoutines(routines);
      }
      playSuccessSound();
      overlay.remove();
      toastNotify(`«${routine.title}» برای امروز انجام شد. خداقوت!`);
      refreshViewIfActive();
    };

    // Snooze 5 minutes
    q('#routineAlarmSnoozeBtn').onclick = () => {
      const routines = loadRoutines();
      const current = routines.find(r => r.id === routine.id);
      if (current) {
        current.snoozedUntil = Date.now() + 5 * 60 * 1000;
        saveRoutines(routines);
      }
      overlay.remove();
      toastNotify('یادآوری ۵ دقیقه به تعویق افتاد.');
      refreshViewIfActive();
    };

    // Dismiss
    q('#routineAlarmDismissBtn').onclick = () => {
      overlay.remove();
    };
  }

  // Toast notification helper
  function toastNotify(text) {
    if (typeof toast === 'function') {
      toast(text);
    } else if (typeof message === 'function') {
      message(text);
    } else {
      const toastEl = q('#toast') || q('#sharedToast');
      if (toastEl) {
        toastEl.textContent = text;
        toastEl.hidden = false;
        setTimeout(() => { toastEl.hidden = true; }, 3500);
      }
    }
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Precision Alarm Checker - checks every 10 seconds
  function checkAlarms() {
    const routines = loadRoutines();
    if (!routines || !routines.length) return;

    const now = new Date();
    const currentDay = getIranianDayOfWeek(now);
    const todayKey = getTodayKey();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    let changed = false;

    routines.forEach(r => {
      if (!r.enabled) return;

      const isSnoozedDue = r.snoozedUntil && Date.now() >= r.snoozedUntil;
      const isRegularTime = Array.isArray(r.days) && r.days.includes(currentDay) && r.time === currentTime;
      const notAlreadyTriggeredToday = r.lastTriggeredDate !== todayKey;

      if (isSnoozedDue || (isRegularTime && notAlreadyTriggeredToday)) {
        r.lastTriggeredDate = todayKey;
        if (r.snoozedUntil) delete r.snoozedUntil;
        changed = true;

        if (r.sound !== false) playAlarmChime();
        if (r.notify !== false) sendSystemNotification(r);
        showAlarmPopup(r);
      }
    });

    if (changed) {
      saveRoutines(routines);
      refreshViewIfActive();
    }
  }

  setInterval(checkAlarms, 10000);
  setTimeout(checkAlarms, 1200);

  // Update navigation count badges
  function updateNavBadges() {
    const routines = loadRoutines();
    const activeCount = routines.filter(r => r.enabled).length;

    const navBadge = q('[data-desk-count="routines"]');
    if (navBadge) {
      navBadge.textContent = activeCount ? faNum(activeCount) + ' فعال' : '';
    }

    const topBtnDot = q('#deskAlarmsTopBtn .alarm-dot');
    if (topBtnDot) {
      topBtnDot.hidden = !activeCount;
    }
  }

  // Refresh dashboard if currently open
  function refreshViewIfActive() {
    const isCurrent = shared
      ? (typeof scope !== 'undefined' && scope === 'routines')
      : (typeof view !== 'undefined' && view === 'routines');
    if (isCurrent) {
      renderRoutinesDashboard();
    }
  }

  // Render Routines Dashboard
  function renderRoutinesDashboard() {
    const host = q(shared ? '#sharedContent' : '#workspace');
    if (!host) return;

    const crumb = q('#deskCrumb');
    if (crumb) crumb.textContent = 'کارهای روتین و تایمرها';

    const routines = loadRoutines();
    const activeCount = routines.filter(r => r.enabled).length;
    const todayKey = getTodayKey();
    const completedTodayCount = routines.filter(r => Array.isArray(r.completedDates) && r.completedDates.includes(todayKey)).length;

    // Find next upcoming alarm
    let nextAlarmText = 'تعیین نشده';
    const activeRoutines = routines.filter(r => r.enabled);
    if (activeRoutines.length) {
      nextAlarmText = getNextOccurrence(activeRoutines[0]);
    }

    const notifPermission = 'Notification' in window ? Notification.permission : 'unsupported';
    const showPermBanner = notifPermission === 'default';

    host.innerHTML = `
      <div class="routines-view">
        <div class="routines-header">
          <small>فضای شخصی ${esc(getCurrentUserName())} · یادآورها و زنگ‌های روزانه</small>
          <h1>⏰ کارهای روتین و تایمرهای من</h1>
          <p>برای کارهای دوره‌ای و روتین‌های روزمره خود ساعت و روزهای هفته را تعیین کنید تا دقیقاً مثل تایمر و آلارم گوشی به شما زنگ هشدار و نوتیفیکیشن بدهد.</p>
        </div>

        ${showPermBanner ? `
          <div class="routine-perm-banner">
            <span>🔔 برای دریافت زنگ و نوتیفیکیشن در زمان بسته بودن یا در پس‌زمینه، دسترسی اعلان را فعال کنید.</span>
            <button type="button" id="enableRoutineNotifBtn">فعال‌سازی اعلان‌های سیستم</button>
          </div>
        ` : ''}

        <div class="routines-stats-bar">
          <div class="routines-stats">
            <span class="routines-stat-item">روتین‌های فعال: <b>${faNum(activeCount)}</b> از ${faNum(routines.length)}</span>
            <span class="routines-stat-item">یادآوری بعدی: <b>${nextAlarmText}</b></span>
            <span class="routines-stat-item">کارهای انجام‌شده امروز: <b>${faNum(completedTodayCount)}</b></span>
          </div>
          <div class="routines-actions">
            <button type="button" class="secondary" id="testRoutineChimeBtn" title="تست پخش صدای زنگ آلارم">🔊 تست صدا</button>
            <button type="button" class="primary" id="newRoutineBtn">＋ افزودن کار تایمردار</button>
          </div>
        </div>

        ${routines.length ? `
          <div class="routines-grid">
            ${routines.map(r => {
              const isDoneToday = Array.isArray(r.completedDates) && r.completedDates.includes(todayKey);
              const nextOccurrence = getNextOccurrence(r);
              return `
                <article class="routine-card ${r.enabled ? '' : 'disabled'}" data-routine-card="${esc(r.id)}">
                  <div class="routine-card-head">
                    <div class="routine-time-box">
                      <span class="routine-time">${faNum(r.time)}</span>
                      <span class="routine-period">${getTimePeriod(r.time)}</span>
                    </div>
                    <label class="routine-switch" title="${r.enabled ? 'خاموش کردن آلارم' : 'روشن کردن آلارم'}">
                      <input type="checkbox" data-routine-toggle="${esc(r.id)}" ${r.enabled ? 'checked' : ''}>
                      <span class="routine-slider"></span>
                    </label>
                  </div>

                  <div class="routine-card-info">
                    <h3>${esc(r.title)}</h3>
                    ${r.note ? `<p>${esc(r.note)}</p>` : ''}
                  </div>

                  <div class="routine-days-row">
                    ${DAY_SHORTS.map((short, idx) => `
                      <span class="routine-day-badge ${(r.days || []).includes(idx) ? 'active' : ''}" title="${DAY_NAMES[idx]}">
                        ${short}
                      </span>
                    `).join('')}
                    <span class="routine-days-text">${formatDaysSummary(r.days)}</span>
                  </div>

                  <div class="routine-card-foot">
                    <div class="routine-next-text">
                      ${isDoneToday ? `<span class="routine-completed-tag">✓ امروز انجام شد</span>` : `<span>⏰ ${nextOccurrence}</span>`}
                    </div>
                    <div class="routine-card-actions">
                      <button type="button" class="routine-btn-mini" data-routine-test="${esc(r.id)}" title="تست زنگ این کار">تست</button>
                      <button type="button" class="routine-btn-mini" data-routine-edit="${esc(r.id)}">ویرایش</button>
                      <button type="button" class="routine-btn-mini danger" data-routine-delete="${esc(r.id)}">حذف</button>
                    </div>
                  </div>
                </article>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="routines-empty">
            <div style="font-size: 38px;">⏰</div>
            <p>هنوز کار تایمرداری برای خود ثبت نکرده‌اید. می‌توانید از نمونه‌های زیر با یک کلیک شروع کنید:</p>
            <div class="routines-suggestions">
              <div class="routines-suggestion-item">
                <div>
                  <span>ثبت گزارش کار روزانه</span>
                  <small>شنبه تا چهارشنبه · ساعت ۱۶:۰۰</small>
                </div>
                <button type="button" class="routine-btn-mini" data-add-suggested="report">＋ افزودن</button>
              </div>
              <div class="routines-suggestion-item">
                <div>
                  <span>بررسی کارتابل صبحگاهی و پروژه‌ها</span>
                  <small>شنبه تا چهارشنبه · ساعت ۰۸:۳۰</small>
                </div>
                <button type="button" class="routine-btn-mini" data-add-suggested="morning">＋ افزودن</button>
              </div>
              <div class="routines-suggestion-item">
                <div>
                  <span>جلسه هفتگی هماهنگی تیم</span>
                  <small>شنبه‌ها · ساعت ۱۰:۰۰</small>
                </div>
                <button type="button" class="routine-btn-mini" data-add-suggested="meeting">＋ افزودن</button>
              </div>
            </div>
          </div>
        `}
      </div>
    `;

    // Event Listeners for Dashboard
    if (q('#newRoutineBtn')) q('#newRoutineBtn').onclick = () => openRoutineForm();
    if (q('#testRoutineChimeBtn')) q('#testRoutineChimeBtn').onclick = () => {
      playAlarmChime();
      toastNotify('صدای زنگ آلارم پخش شد. 🔔');
    };
    if (q('#enableRoutineNotifBtn')) q('#enableRoutineNotifBtn').onclick = async () => {
      if ('Notification' in window) {
        const p = await Notification.requestPermission();
        if (p === 'granted') {
          toastNotify('اعلان‌های سیستم با موفقیت فعال شدند!');
          renderRoutinesDashboard();
        } else {
          toastNotify('دسترسی اعلان‌ها داده نشد.');
        }
      }
    };

    // Toggles
    qa('[data-routine-toggle]').forEach(input => {
      input.onchange = e => {
        const id = e.target.dataset.routineToggle;
        const routines = loadRoutines();
        const r = routines.find(x => x.id === id);
        if (r) {
          r.enabled = e.target.checked;
          saveRoutines(routines);
          const card = q(`[data-routine-card="${id}"]`);
          if (card) card.classList.toggle('disabled', !r.enabled);
          toastNotify(`آلارم «${r.title}» ${r.enabled ? 'روشن شد ⏰' : 'خاموش شد'}`);
          updateNavBadges();
        }
      };
    });

    // Edits
    qa('[data-routine-edit]').forEach(btn => {
      btn.onclick = () => {
        const routines = loadRoutines();
        const r = routines.find(x => x.id === btn.dataset.routineEdit);
        if (r) openRoutineForm(r);
      };
    });

    // Delete
    qa('[data-routine-delete]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.routineDelete;
        const routines = loadRoutines();
        const r = routines.find(x => x.id === id);
        if (!r) return;
        if (confirm(`آیا از حذف کار روتین «${r.title}» مطمئن هستید؟`)) {
          const updated = routines.filter(x => x.id !== id);
          saveRoutines(updated);
          toastNotify('کار روتین حذف شد.');
          renderRoutinesDashboard();
        }
      };
    });

    // Test specific routine
    qa('[data-routine-test]').forEach(btn => {
      btn.onclick = () => {
        const routines = loadRoutines();
        const r = routines.find(x => x.id === btn.dataset.routineTest);
        if (r) {
          playAlarmChime();
          showAlarmPopup(r);
        }
      };
    });

    // Quick suggestions add
    qa('[data-add-suggested]').forEach(btn => {
      btn.onclick = () => {
        const kind = btn.dataset.addSuggested;
        const routines = loadRoutines();
        if (kind === 'report') {
          routines.push({
            id: 'routine_' + Date.now(),
            title: 'ثبت گزارش کار روزانه',
            note: 'ثبت پیشرفت کارهای روز در سمندیس',
            time: '16:00',
            days: [0, 1, 2, 3, 4],
            enabled: true,
            sound: true,
            notify: true,
            completedDates: [],
            created_at: new Date().toISOString()
          });
        } else if (kind === 'morning') {
          routines.push({
            id: 'routine_' + Date.now(),
            title: 'بررسی اولویت‌ها و کارتابل صبحگاهی',
            note: 'مرور وظایف و برنامه‌ریزی روز کاری',
            time: '08:30',
            days: [0, 1, 2, 3, 4],
            enabled: true,
            sound: true,
            notify: true,
            completedDates: [],
            created_at: new Date().toISOString()
          });
        } else if (kind === 'meeting') {
          routines.push({
            id: 'routine_' + Date.now(),
            title: 'جلسه هفتگی هماهنگی تیم',
            note: 'جلسه بررسی وضعیت پروژه‌ها با اعضا',
            time: '10:00',
            days: [0],
            enabled: true,
            sound: true,
            notify: true,
            completedDates: [],
            created_at: new Date().toISOString()
          });
        }
        saveRoutines(routines);
        toastNotify('روتین پیشنهادی اضافه شد!');
        renderRoutinesDashboard();
      };
    });
  }

  // Routine Add/Edit Dialog
  function openRoutineForm(item = null) {
    const isEdit = Boolean(item);
    const existing = q('#routineFormDialog');
    if (existing) existing.remove();

    const dialog = document.createElement('dialog');
    dialog.id = 'routineFormDialog';
    dialog.className = 'desktop-shell';

    const selectedDays = isEdit && Array.isArray(item.days) ? item.days : [0, 1, 2, 3, 4];
    const defaultTime = isEdit ? item.time : '09:00';

    dialog.innerHTML = `
      <div style="max-width: 480px; padding: 22px 24px; direction: rtl; font-family: var(--app-font), sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #edf1f7; padding-bottom: 12px; margin-bottom: 14px;">
          <h2 style="font-size: 17px; font-weight: 650; color: #142d4d; margin: 0;">
            ${isEdit ? 'ویرایش کار تایمردار و روتین' : 'افزودن کار تایمردار جدید (آلارم)'}
          </h2>
          <button type="button" class="close" id="closeRoutineDialog" style="background:none;border:0;font-size:22px;cursor:pointer;color:#7c92ae;">×</button>
        </div>

        <form id="routineEditForm" class="routine-form-grid">
          <label>
            <span>عنوان کار یا روتین</span>
            <input name="title" required maxlength="120" placeholder="مثلاً: ثبت گزارش روزانه کارگاه" value="${esc(item?.title || '')}">
          </label>

          <label>
            <span>شرح یا یادداشت اختیاری</span>
            <textarea name="note" rows="2" maxlength="400" placeholder="توضیحات و نکاتی که هنگام زنگ زدن نمایش داده شود...">${esc(item?.note || '')}</textarea>
          </label>

          <label>
            <span>ساعت زنگ هشدار</span>
            <input name="time" type="time" required value="${defaultTime}" style="font-family: inherit; font-size: 14px; direction: ltr; text-align: right;">
          </label>

          <fieldset class="routine-days-picker">
            <legend>روزهای تکرار در هفته</legend>
            <div class="routine-presets-row">
              <button type="button" class="routine-preset-btn" data-preset="all">همه روزها</button>
              <button type="button" class="routine-preset-btn" data-preset="work">شنبه تا چهارشنبه</button>
              <button type="button" class="routine-preset-btn" data-preset="work6">شنبه تا پنجشنبه</button>
              <button type="button" class="routine-preset-btn" data-preset="odd">روزهای فرد</button>
              <button type="button" class="routine-preset-btn" data-preset="even">روزهای زوج</button>
            </div>
            <div class="routine-checkbox-days">
              ${DAY_NAMES.map((name, idx) => `
                <label class="routine-day-check-label">
                  <input type="checkbox" name="days" value="${idx}" ${selectedDays.includes(idx) ? 'checked' : ''}>
                  <span>${DAY_SHORTS[idx]}</span>
                  <small style="font-size: 9px; color: #8295ab;">${name.slice(0, 3)}</small>
                </label>
              `).join('')}
            </div>
          </fieldset>

          <div class="routine-checkbox-options">
            <label>
              <input type="checkbox" name="sound" ${item ? (item.sound !== false ? 'checked' : '') : 'checked'}>
              <span>پخش زنگ صوتی ملایم 🔔</span>
            </label>
            <label>
              <input type="checkbox" name="notify" ${item ? (item.notify !== false ? 'checked' : '') : 'checked'}>
              <span>ارسال اعلان مرورگر / سیستم 📱</span>
            </label>
          </div>

          <div class="routine-form-actions">
            <button type="button" class="secondary" id="cancelRoutineDialog">انصراف</button>
            <button type="submit" class="primary">${isEdit ? 'ذخیره تغییرات' : 'افزودن به روتین‌ها'}</button>
          </div>
        </form>
      </div>
    `;

    document.body.append(dialog);
    if (!dialog.open) dialog.showModal();

    q('#closeRoutineDialog').onclick = () => dialog.close();
    q('#cancelRoutineDialog').onclick = () => dialog.close();

    // Presets handler
    dialog.querySelectorAll('.routine-preset-btn').forEach(btn => {
      btn.onclick = () => {
        const preset = btn.dataset.preset;
        const checkboxes = dialog.querySelectorAll('input[name="days"]');
        let targetDays = [];
        if (preset === 'all') targetDays = [0, 1, 2, 3, 4, 5, 6];
        else if (preset === 'work') targetDays = [0, 1, 2, 3, 4];
        else if (preset === 'work6') targetDays = [0, 1, 2, 3, 4, 5];
        else if (preset === 'odd') targetDays = [0, 2, 4];
        else if (preset === 'even') targetDays = [1, 3, 5];

        checkboxes.forEach(cb => {
          cb.checked = targetDays.includes(Number(cb.value));
        });
      };
    });

    // Form Submit
    q('#routineEditForm').onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const title = String(fd.get('title') || '').trim();
      const note = String(fd.get('note') || '').trim();
      const time = String(fd.get('time') || '').trim();
      const days = fd.getAll('days').map(Number);
      const sound = fd.has('sound');
      const notify = fd.has('notify');

      if (!title) return alert('لطفاً عنوان کار را وارد کنید.');
      if (!time) return alert('لطفاً ساعت زنگ را مشخص کنید.');
      if (!days.length) return alert('حداقل یک روز در هفته را انتخاب کنید.');

      const routines = loadRoutines();

      if (isEdit) {
        const idx = routines.findIndex(r => r.id === item.id);
        if (idx >= 0) {
          routines[idx] = {
            ...routines[idx],
            title,
            note,
            time,
            days,
            sound,
            notify,
            updated_at: new Date().toISOString()
          };
        }
      } else {
        routines.unshift({
          id: 'routine_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          title,
          note,
          time,
          days,
          enabled: true,
          sound,
          notify,
          completedDates: [],
          created_at: new Date().toISOString()
        });
      }

      saveRoutines(routines);
      dialog.close();
      toastNotify(isEdit ? 'تغییرات روتین ذخیره شد.' : 'کار تایمردار جدید فعال شد ⏰');
      renderRoutinesDashboard();
    };
  }

  // Open Routines view or navigate to it
  window.SamandisOpenRoutines = function () {
    if (shared) {
      if (typeof scope !== 'undefined') {
        window.scope = 'routines';
        if (typeof render === 'function') render();
      }
    } else {
      if (typeof navigate === 'function') {
        navigate('routines');
      } else if (typeof render === 'function') {
        window.view = 'routines';
        render();
      }
    }
  };

  // Inject Navigation elements and hook render
  function setupIntegration() {
    // 1. Add top header alarm button if missing
    const actions = q('.desk-top-actions');
    if (actions && !q('#deskAlarmsTopBtn')) {
      const topBtn = document.createElement('button');
      topBtn.id = 'deskAlarmsTopBtn';
      topBtn.type = 'button';
      topBtn.className = 'desk-icon-button';
      topBtn.setAttribute('aria-label', 'تایمرها و روتین‌های من');
      topBtn.title = 'تایمرها و روتین‌های من';
      topBtn.innerHTML = `
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3M6.38 18.7 4 21M17.6 18.7 20 21"/>
        </svg>
        <span class="alarm-dot" hidden></span>
      `;
      topBtn.onclick = () => window.SamandisOpenRoutines();
      actions.prepend(topBtn);
    }

    // 2. Add Sidebar Button if missing
    const nav = q('#deskNav');
    if (nav && !q('[data-desk-view="routines"]')) {
      const routinesNavBtn = document.createElement('button');
      routinesNavBtn.type = 'button';
      routinesNavBtn.setAttribute('data-desk-view', 'routines');
      routinesNavBtn.innerHTML = `
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3M6.38 18.7 4 21M17.6 18.7 20 21"/>
        </svg>
        <span>تایمرها و روتین‌ها</span>
        <b data-desk-count="routines"></b>
      `;
      routinesNavBtn.onclick = () => {
        if (typeof closeMenu === 'function') closeMenu();
        window.SamandisOpenRoutines();
      };
      nav.append(routinesNavBtn);
    }

    // 3. Add to Account menu if available
    const panel = q('#accountMorePanel');
    if (panel && !q('#accountRoutinesLink')) {
      const link = document.createElement('button');
      link.id = 'accountRoutinesLink';
      link.type = 'button';
      link.className = 'account-settings-link';
      link.textContent = '⏰ تایمرها و روتین‌های من';
      link.onclick = () => {
        panel.hidden = true;
        window.SamandisOpenRoutines();
      };
      const trashLink = panel.querySelector('.account-trash-link') || panel.querySelector('.account-settings-link');
      if (trashLink) trashLink.after(link);
      else panel.append(link);
    }

    updateNavBadges();
  }

  // Hook into the render lifecycle
  function hookRender() {
    const prevRender = window.render;
    if (typeof prevRender === 'function') {
      window.render = function (...args) {
        setupIntegration();
        const currentView = shared
          ? (typeof scope !== 'undefined' ? scope : 'mine')
          : (typeof view !== 'undefined' ? view : 'mine');

        if (currentView === 'routines') {
          // Highlight active button in sidebar
          qa('[data-desk-view]').forEach(b => b.classList.toggle('active', b.dataset.deskView === 'routines'));
          renderRoutinesDashboard();
          updateNavBadges();
          return;
        }

        const res = prevRender.apply(this, args);
        setupIntegration();
        return res;
      };
    }
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupIntegration();
      hookRender();
    });
  } else {
    setupIntegration();
    hookRender();
  }
})();
