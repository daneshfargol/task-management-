(()=>{'use strict';
if(!document.body.classList.contains('shared-app'))return;
const unseen=id=>notices.some(n=>n.task_id===id&&!n.read&&n.reminder_days==null);
function decorate(){if(window.SAMANDIS_PERSONAL_MODE)return;document.querySelectorAll('#sharedContent [data-task],#sharedContent [data-shared-card]').forEach(title=>{const id=title.dataset.task||title.dataset.sharedCard,marker=title.querySelector('.task-unread-marker');if(!unseen(id)){marker?.remove();return}if(marker)return;const badge=document.createElement('span');badge.className='task-unread-marker';badge.setAttribute('aria-label','به‌روزرسانی جدید و دیده‌نشده');badge.title='به‌روزرسانی جدید و دیده‌نشده';badge.innerHTML='<span aria-hidden="true">●</span> جدید';title.append(badge)})}
async function markSeen(id){const rows=notices.filter(n=>n.task_id===id&&!n.read&&n.reminder_days==null);if(!rows.length)return;notices=notices.map(n=>rows.some(row=>row.id===n.id)?{...n,read:true}:n);const bell=document.querySelector('#sharedBell');if(bell)bell.textContent='اعلان‌ها '+fa(notices.filter(n=>!n.read).length);decorate();try{await Promise.all(rows.map(n=>rpc('sm_read_notice',{p_notice:n.id})))}catch(_){refresh().catch(()=>{})}}
const previousDetail=detail;detail=async function(id,...args){markSeen(id);return previousDetail(id,...args)};
const previousRender=render;render=function(...args){const result=previousRender(...args);decorate();return result};const previousTasks=renderTasks;renderTasks=function(...args){const result=previousTasks(...args);decorate();return result};decorate();
})();
