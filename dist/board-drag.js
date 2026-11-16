/* Board moves use the same revision-checked actions as the existing task buttons. */
(() => {
  'use strict';
  if (!document.body.classList.contains('shared-app')) return;
  let dragged = null, saving = false, touch = null, suppressClickUntil = 0;
  const laneState = lane => ['open', 'review', 'done'].find(state => lane?.classList.contains(state));
  function transition(task, destination) {
    if (!task || task.status === destination) return null;
    if (task.status === 'open' && destination === 'review' && (own(task) || canManage(task))) return 'submit';
    if (task.status === 'open' && destination === 'done' && management() && own(task) && reviewer(task)) return 'submit';
    if (task.status === 'review' && destination === 'done' && reviewer(task)) return 'approve';
    if (destination === 'open' && (task.status === 'review' ? own(task) || canManage(task) : task.status === 'done' && reviewer(task))) return 'reopen';
    return null;
  }
  function clear() {
    document.querySelectorAll('.board-drop-allowed,.board-drop-blocked,.board-dragging').forEach(node => node.classList.remove('board-drop-allowed', 'board-drop-blocked', 'board-dragging'));
    dragged = null;
  }
  function highlight(lane) {
    document.querySelectorAll('.board-drop-allowed,.board-drop-blocked').forEach(node => node.classList.remove('board-drop-allowed', 'board-drop-blocked'));
    if (!lane || !dragged) return;
    const task = tasks.find(item => item.id === dragged);
    if (task?.status === laneState(lane)) return;
    lane.classList.add(transition(task, laneState(lane)) ? 'board-drop-allowed' : 'board-drop-blocked');
  }
  async function move(id, destination) {
    if (saving || busy) return;
    const task = tasks.find(item => item.id === id);
    if (!task || task.status === destination) return;
    const kind = transition(task, destination);
    if (!kind) {
      message(task.status === 'open' && destination === 'done' ? 'این کار باید ابتدا به «منتظر تأیید» برود و سپس توسط تأییدکننده تأیید شود.' : 'این جابه‌جایی با وضعیت یا دسترسی فعلی شما مجاز نیست.');
      return;
    }
    saving = true;
    document.querySelectorAll('.board-drag-handle').forEach(button => button.disabled = true);
    try { await action(task, kind); }
    finally { saving = false; enhance(); }
  }
  function enhance() {
    document.querySelectorAll('.desk-board .desk-task-card').forEach(card => {
      const id = card.querySelector('[data-shared-card]')?.dataset.sharedCard;
      if (!id) return;
      const task = tasks.find(item => item.id === id);
      const possible = ['open', 'review', 'done'].filter(state => transition(task, state));
      let handle = card.querySelector('.board-drag-handle');
      if (!possible.length) { handle?.remove(); return; }
      if (handle) { handle.disabled = saving || busy; return; }
      handle = document.createElement('button');
      handle.type = 'button'; handle.className = 'board-drag-handle'; handle.textContent = '⠿';
      handle.draggable = true; handle.dataset.boardTask = id;
      handle.setAttribute('aria-label', 'جابه‌جایی کار بین ستون‌ها');
      handle.title = 'بکشید و در ستون مقصد رها کنید؛ با کلیک، مقصد را انتخاب کنید.';
      handle.disabled = saving || busy;
      handle.addEventListener('click', event => {
        event.stopPropagation();
        if (Date.now() < suppressClickUntil) return;
        card.querySelector('.board-move-options')?.remove();
        const choices = document.createElement('div'); choices.className = 'board-move-options';
        possible.forEach(destination => {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = 'انتقال به ' + labels[destination];
          button.onclick = () => { choices.remove(); move(id, destination); };
          choices.append(button);
        });
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'انصراف'; cancel.onclick = () => choices.remove(); choices.append(cancel);
        card.append(choices); choices.querySelector('button')?.focus();
      });
      card.prepend(handle);
    });
  }
  document.addEventListener('dragstart', event => {
    const handle = event.target.closest?.('.board-drag-handle');
    if (!handle || saving || busy) return;
    dragged = handle.dataset.boardTask;
    event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', dragged);
    const card = handle.closest('.desk-task-card'); card.classList.add('board-dragging');
    event.dataTransfer.setDragImage(card, card.clientWidth / 2, 24);
  });
  document.addEventListener('dragover', event => {
    if (!dragged) return;
    const lane = event.target.closest?.('.desk-board .desk-lane');
    if (!lane) { highlight(null); return; }
    event.preventDefault(); highlight(lane);
    event.dataTransfer.dropEffect = transition(tasks.find(task => task.id === dragged), laneState(lane)) ? 'move' : 'none';
  });
  document.addEventListener('drop', event => {
    if (!dragged) return;
    event.preventDefault(); const id = dragged, lane = event.target.closest?.('.desk-board .desk-lane');
    clear(); suppressClickUntil = Date.now() + 400;
    if (lane) move(id, laneState(lane));
  });
  document.addEventListener('dragend', clear);
  // A dedicated grip enables touch dragging while the rest of a card still scrolls normally.
  document.addEventListener('pointerdown', event => {
    const handle = event.target.closest?.('.board-drag-handle');
    if (!handle || event.pointerType === 'mouse' || saving || busy) return;
    touch = {id: event.pointerId, task: handle.dataset.boardTask, handle, x: event.clientX, y: event.clientY, moved: false};
    handle.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove', event => {
    if (!touch || touch.id !== event.pointerId) return;
    if (!touch.moved && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < 9) return;
    touch.moved = true; dragged = touch.task;
    touch.handle.closest('.desk-task-card').classList.add('board-dragging');
    highlight(document.elementFromPoint(event.clientX, event.clientY)?.closest('.desk-lane'));
    const board = touch.handle.closest('.desk-board'), rect = board.getBoundingClientRect();
    if (event.clientX < rect.left + 40) board.scrollBy(-18, 0);
    if (event.clientX > rect.right - 40) board.scrollBy(18, 0);
  });
  document.addEventListener('pointerup', event => {
    if (!touch || touch.id !== event.pointerId) return;
    const current = touch; touch = null;
    const lane = document.elementFromPoint(event.clientX, event.clientY)?.closest('.desk-lane');
    clear();
    if (current.moved) { suppressClickUntil = Date.now() + 500; if (lane) move(current.task, laneState(lane)); }
  });
  document.addEventListener('pointercancel', () => { touch = null; clear(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { touch = null; clear(); document.querySelectorAll('.board-move-options').forEach(node => node.remove()); } });
  const previousTasks = renderTasks;
  renderTasks = function(...args) { clear(); const result = previousTasks(...args); enhance(); return result; };
  // Other layout and sorting modules can also rebuild the board.
  const host = document.querySelector('#sharedApp');
  if (host) new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches?.('.desk-board,.desk-task-card') || node.querySelector?.('.desk-board,.desk-task-card'))))) enhance();
  }).observe(host, {childList: true, subtree: true});
  enhance();
})();
