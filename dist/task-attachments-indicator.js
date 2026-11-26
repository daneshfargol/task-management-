/* Ready files only; attachment visibility inherits the task/file RLS boundary. */
(()=>{'use strict';
  if(!document.body.classList.contains('shared-app'))return;
  function decorate(){
    if(window.SAMANDIS_PERSONAL_MODE)return;
    document.querySelectorAll('#sharedContent [data-task],#sharedContent [data-shared-card]').forEach(title=>{
      const id=title.dataset.task||title.dataset.sharedCard;
      const task=tasks.find(t=>t.id===id);
      const has=Array.isArray(task?.attachment_files)&&task.attachment_files.length>0;
      const old=title.querySelector('.task-attachment-icon');
      if(!has){old?.remove();return}
      if(old)return;
      const badge=document.createElement('span');
      badge.className='task-attachment-icon';
      badge.title='دارای پیوست';
      badge.setAttribute('role','img');
      badge.setAttribute('aria-label','دارای پیوست');
      badge.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9a6 6 0 0 1 9 9l-9 9"/></svg>';
      title.prepend(badge);
    });
  }
  const oldRender=render;
  render=function(...args){const result=oldRender(...args);decorate();return result};
  const oldTasks=renderTasks;
  renderTasks=function(...args){const result=oldTasks(...args);decorate();return result};
  decorate();
  for(const [href,src] of [['task-unread-markers.css?v=2',null],[null,'task-unread-markers.js?v=2'],['routine-reminders.css?v=1',null],[null,'routine-reminders.js?v=1']]){
    const node=document.createElement(src?'script':'link');
    if(src){node.async=false;node.src=src;document.body.append(node)}else{node.rel='stylesheet';node.href=href;document.head.append(node)}
  }
})();
