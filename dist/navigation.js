(function(){
 const shared=document.body.classList.contains('shared-app'),q=s=>document.querySelector(s);let stack=[],last=shared?scope:view,restoring=false;
 q('.desk-project-preview')?.remove();q('#deskManage [data-desk-view="reports"]')?.remove();const team=q('#deskManage [data-desk-view="members"] span');if(team)team.textContent='تیم پروژه';
 const back=document.createElement('button');back.type='button';back.className='app-back';back.id='appBack';back.innerHTML='<span>→</span> بازگشت';q('.desk-top-context').prepend(back);
 function sync(){const current=shared?scope:view,dialog=document.querySelector('dialog[open]');back.disabled=!dialog&&!stack.length&&(current==='mine');back.title=dialog?'بستن پنجره و برگشت به فهرست':'بازگشت به نمای قبلی'}
 back.onclick=()=>{const dialogs=Array.from(document.querySelectorAll('dialog[open]'));if(dialogs.length){const d=dialogs.at(-1),close=d.querySelector('#closeTask,#sharedClose');if(close)close.click();else d.close();document.body.classList.remove('task-drawer-open');sync();return}const next=stack.pop()||'mine';restoring=true;if(shared){scope=next;phase='all';search='';render()}else navigate(next);restoring=false;sync()};
 const previous=render;render=function(){const current=shared?scope:view;if(current!==last){if(!restoring)stack.push(last);last=current}previous();q('.team-subnav')?.remove();if(['members','reports'].includes(current)){
 q('#deskCrumb').textContent='تیم پروژه';q('#deskManage [data-desk-view="members"]')?.classList.add('active');const root=q(shared?'#sharedContent':'#workspace');if(root){const nav=document.createElement('div');nav.className='team-subnav';nav.innerHTML='<button data-team="members" class="'+(current==='members'?'selected':'')+'">اعضا و دسترسی‌ها</button><button data-team="reports" class="'+(current==='reports'?'selected':'')+'">گزارش‌ها و کارکرد</button>';root.before(nav);nav.querySelectorAll('button').forEach(b=>b.onclick=()=>{if(shared){scope=b.dataset.team;render()}else navigate(b.dataset.team)})}}
 sync();};
 document.querySelectorAll('dialog').forEach(d=>new MutationObserver(sync).observe(d,{attributes:true,attributeFilter:['open']}));render();
})();
