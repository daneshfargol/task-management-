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
      handle.type = 'button'; handle.className = 'board-drag-handle'; handle.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4"/></svg>';
      handle.draggable = false; handle.dataset.boardTask = id;
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

  let preview = null;
  function finishPointer() { preview?.remove(); preview = null; touch = null; clear(); }
  document.addEventListener('pointerdown', event => {
    if (event.button !== 0 || saving || busy) return;
    const card = event.target.closest?.('.desk-board .desk-task-card');
    const handle = card?.querySelector('.board-drag-handle');
    if (!handle || handle.disabled || event.target.closest('input,textarea,select,.task-overflow-button,.task-tick,.board-move-options,.row-upload')) return;
    if (event.pointerType !== 'mouse' && !event.target.closest('.board-drag-handle')) return;
    touch = {id:event.pointerId,task:handle.dataset.boardTask,handle,card,x:event.clientX,y:event.clientY,moved:false};
    event.target.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove', event => {
    if (!touch || touch.id !== event.pointerId) return;
    if (!touch.moved && Math.hypot(event.clientX-touch.x,event.clientY-touch.y)<8) return;
    event.preventDefault();
    if (!touch.moved) {
      touch.moved=true;dragged=touch.task;
      const rect=touch.card.getBoundingClientRect();
      preview=touch.card.cloneNode(true);preview.classList.add('board-drag-preview');
      preview.style.width=rect.width+'px';preview.setAttribute('aria-hidden','true');
      preview.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
      document.body.append(preview);touch.card.classList.add('board-dragging');
    }
    preview.style.left=event.clientX+14+'px';preview.style.top=event.clientY+10+'px';
    highlight(document.elementFromPoint(event.clientX,event.clientY)?.closest('.desk-lane'));
    const board=touch.card.closest('.desk-board'),r=board.getBoundingClientRect();
    if(event.clientX<r.left+40)board.scrollBy(-18,0);
    if(event.clientX>r.right-40)board.scrollBy(18,0);
  },{passive:false});
  document.addEventListener('pointerup', event => {
    if(!touch||touch.id!==event.pointerId)return;
    const current=touch,lane=document.elementFromPoint(event.clientX,event.clientY)?.closest('.desk-lane');
    if(current.moved){event.preventDefault();suppressClickUntil=Date.now()+500}
    finishPointer();
    if(current.moved&&lane)move(current.task,laneState(lane));
  });
  document.addEventListener('click',event=>{if(Date.now()<suppressClickUntil&&event.target.closest?.('.desk-task-card')){event.preventDefault();event.stopImmediatePropagation()}},true);
  document.addEventListener('pointercancel',finishPointer);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { finishPointer(); document.querySelectorAll('.board-move-options').forEach(node => node.remove()); } });
  const previousTasks = renderTasks;
  renderTasks = function(...args) { finishPointer(); const result = previousTasks(...args); enhance(); return result; };
  // Other layout and sorting modules can also rebuild the board.
  const host = document.querySelector('#sharedApp');
  if (host) new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches?.('.desk-board,.desk-task-card') || node.querySelector?.('.desk-board,.desk-task-card'))))) enhance();
  }).observe(host, {childList: true, subtree: true});
  enhance();
})();
