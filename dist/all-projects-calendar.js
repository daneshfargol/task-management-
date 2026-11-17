/* Account calendar with reversible navigation to the original task/file views. */
(() => {
  'use strict';
  if (!document.body.classList.contains('shared-app')) return;
  const model = SamandisAllCalendarModel, q = s=>document.querySelector(s);
  const today = ()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const label = iso=>new Intl.DateTimeFormat('fa-IR',{dateStyle:'full',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
  let user=null,allowed=false,permissionAt=0,permissionRequest=null,revision=0,request=0;
  let projects=[],events=[],colors={},loadedAt=0,loading=false,error='',filter='',includeDone=true;
  let month=SamandisDates.display(today()).slice(0,7),selected=today();
  let fullscreen=false,scrollLock=null,navigation=null,navigating=false,returning=false,calendarSuspended=false;
  const sidebar=q('#desktopSidebar'),bottom=q('.desk-bottom');
  if(!sidebar||!bottom)return;
  const entry=document.createElement('div');entry.className='all-calendar-entry';entry.hidden=true;
  const launch=document.createElement('button');launch.type='button';launch.id='allProjectsCalendarButton';launch.className='all-calendar-launch';
  launch.innerHTML='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v5M17 3v5M3 11h18M7 15h3M14 15h3"/></svg><span>تقویم همهٔ پروژه‌ها</span>';
  entry.append(launch);bottom.before(entry);
  const dialog=document.createElement('dialog');dialog.id='unifiedCalendarDialog';dialog.dataset.ownDismiss='true';dialog.setAttribute('aria-label','تقویم همهٔ پروژه‌ها');document.body.append(dialog);
  function lockScroll(){if(scrollLock)return;const root=document.documentElement;scrollLock={x:window.scrollX,y:window.scrollY,top:root.style.getPropertyValue('--uc-scroll-top')};root.style.setProperty('--uc-scroll-top',-scrollLock.y+'px');root.classList.add('uc-scroll-locked');}
  function unlockScroll(){if(!scrollLock)return;const saved=scrollLock;scrollLock=null;document.documentElement.classList.remove('uc-scroll-locked');if(saved.top)document.documentElement.style.setProperty('--uc-scroll-top',saved.top);else document.documentElement.style.removeProperty('--uc-scroll-top');if(window.scrollX!==saved.x||window.scrollY!==saved.y)window.scrollTo(saved.x,saved.y);}
  dialog.addEventListener('close',()=>{if(!dialog.open&&!navigation&&!calendarSuspended)unlockScroll();});
  dialog.addEventListener('wheel',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.preventDefault();},{passive:false});
  function syncButton(){const show=allowed&&!!session?.user?.id&&session.user.id===user&&!!mine();entry.hidden=!show;sidebar.classList.toggle('has-all-projects-calendar',show);}
  function clear(uid){revision++;request++;if(navigation)selectedTask=null;navigation=null;navigating=false;returning=false;calendarSuspended=false;fullscreen=false;user=uid||null;allowed=false;permissionAt=0;permissionRequest=null;projects=[];events=[];colors={};loadedAt=0;loading=false;error='';filter='';includeDone=true;if(dialog.open)dialog.close();dialog.innerHTML='';unlockScroll();syncButton();}
  async function permission(force=false){
    const uid=session?.user?.id;if(!uid||!mine()){if(user)clear(null);return false;}
    if(user!==uid)clear(uid);
    if(!force&&Date.now()-permissionAt<20000)return allowed;
    if(permissionRequest)return permissionRequest;
    const token=revision;
    const pending=checked(db.from('sm_personal_owners').select('member_id')).then(rows=>{
      if(token!==revision||session?.user?.id!==uid)return false;
      allowed=rows.length>0;permissionAt=Date.now();syncButton();return allowed;
    }).catch(()=>{if(token===revision){allowed=false;syncButton();}return false;}).finally(()=>{if(permissionRequest===pending)permissionRequest=null;});
    permissionRequest=pending;return pending;
  }
  async function allRows(make,token){
    const rows=[];for(let start=0;;start+=500){
      const page=await checked(make().range(start,start+499));
      if(token!==request)return null;
      rows.push(...page);if(page.length<500)return rows;
    }
  }
  async function load(){
    const uid=user,token=++request;loading=true;error='';draw();
    try{
      const [team,personal]=await Promise.all([
        allRows(()=>db.from('sm_projects').select('id,name').order('id'),token),
        allRows(()=>db.from('sm_personal_projects').select('id,name').order('id'),token)
      ]);
      if(token!==request||session?.user?.id!==uid)return;
      const ids=team.map(p=>p.id),pids=personal.map(p=>p.id);
      const [teamTasks,personalTasks,milestones,trash,people]=await Promise.all([
        ids.length?allRows(()=>db.from('sm_tasks').select('id,project_id,title,description,due,status,owner_id').in('project_id',ids).order('id'),token):[],
        pids.length?allRows(()=>db.from('sm_personal_tasks').select('id,project_id,title,description,due,done,deleted,responsible_names,responsible_name').in('project_id',pids).order('id'),token):[],
        ids.length?allRows(()=>db.from('sm_milestones').select('id,project_id,title,description,due,status').in('project_id',ids).order('id'),token):[],
        ids.length?allRows(()=>db.from('sm_task_trash').select('task_id').in('project_id',ids).order('task_id'),token):[],
        ids.length?allRows(()=>db.from('sm_members').select('id,name').in('project_id',ids).order('id'),token):[]
      ]);
      if(token!==request||session?.user?.id!==uid)return;
      projects=model.projectRows(team,personal);
      const saved=Object.fromEntries(projects.map(p=>[p.key,SamandisPreferences.get('calendar_color:'+p.key)]));
      colors=model.assignColors(projects,saved);
      for(const p of projects)if(saved[p.key]!==colors[p.key])SamandisPreferences.set('calendar_color:'+p.key,colors[p.key]).catch(()=>{if(user===uid)message('رنگ پروژه‌ها برای این حساب ذخیره نشد؛ اتصال را بررسی کنید.');});
      events=model.events(projects,teamTasks,personalTasks,milestones,trash,people);
      loadedAt=Date.now();
    }catch(e){if(token===request)error=failure(e);}
    finally{if(token===request){loading=false;draw();}}
  }
  function bounds(){
    const [y,m]=month.split('/').map(Number),ny=m===12?y+1:y,nm=m===12?1:m+1;
    return [SamandisDates.parse(y+'/'+m+'/1'),SamandisDates.parse(ny+'/'+nm+'/1')];
  }
  const colorStyle=key=>{const c=model.color(colors[key]||0);return '--uc-color:'+c.ink+';--uc-soft:'+c.soft;};
  function taskHTML(e){return '<button type="button" class="uc-task '+(e.done?'is-done':'')+'" data-uc-task="'+esc(e.id)+'" style="'+colorStyle(e.projectKey)+'"><span class="uc-project-name">'+esc(e.projectName)+'</span><span class="uc-task-name"> — '+esc(e.title)+'</span><small class="uc-task-status">'+esc(e.status)+(e.owner?' · '+esc(e.owner):'')+'</small><span class="uc-task-open">مشاهدهٔ کار و اطلاعات آن ←</span></button>';}
  function taskBack(){
    if(!navigation||!q('#sharedDialog')?.open)return;
    const root=q('#sharedDetail');if(!root)return;const existing=root.querySelector('.uc-task-return-bar');if(existing){if(existing.parentElement!==root||root.firstElementChild!==existing)root.prepend(existing);return;}
    const bar=document.createElement('div');bar.className='uc-task-return-bar';
    const back=document.createElement('button');back.type='button';back.id='ucTaskBack';back.textContent='→ بازگشت به تقویم همهٔ پروژه‌ها';back.onclick=returnToCalendar;bar.append(back);root.prepend(bar);
  }
  async function returnToCalendar(){
    const context=navigation;if(!context||returning)return;
    navigation=null;returning=true;selectedTask=null;const token=revision;q('.uc-task-return-bar')?.remove();
    if(q('#sharedDialog')?.open)q('#sharedDialog').close();
    try{
      if(context.user!==session?.user?.id||token!==revision)return;
      window.SamandisPersonalNavigation?.leave({renderNow:false});
      project=context.project;scope=context.scope;phase=context.phase;search=context.search;
      await refresh();if(context.user!==session?.user?.id||token!==revision)return;
      if(context.personal)await window.SamandisPersonalNavigation.restore(context.personal);
      if(context.user!==session?.user?.id||token!==revision)return;
      calendarSuspended=false;lockScroll();if(!dialog.open)dialog.showModal();draw();
      const content=dialog.querySelector('.uc-content');if(content)content.scrollTop=context.scroll;
      const agenda=dialog.querySelector('.uc-agenda');if(agenda)agenda.scrollTop=context.agendaScroll;
      loadedAt=0;await load();
    }catch(e){message('بازگشت به تقویم کامل نشد: '+failure(e));}
    finally{returning=false;if(!dialog.open){calendarSuspended=false;unlockScroll();}}
  }
  async function openTask(event){
    if(navigating||returning||!event||session?.user?.id!==user)return;
    const context={user,project,scope,phase,search,personal:window.SamandisPersonalNavigation?.context()||null,scroll:dialog.querySelector('.uc-content')?.scrollTop||0,agendaScroll:dialog.querySelector('.uc-agenda')?.scrollTop||0};
    navigation=context;navigating=true;calendarSuspended=true;dialog.close();
    try{
      if(event.kind==='personal'){
        if(!window.SamandisPersonalNavigation)throw Error('نمای پروژه شخصی آماده نیست.');
        await window.SamandisPersonalNavigation.openTask(event.projectId,event.sourceId);
      }else{
        window.SamandisPersonalNavigation?.leave({renderNow:false});
        const target=projects.find(p=>p.kind==='team'&&p.id===event.projectId);
        if(!target)throw Error('پروژه در دسترس نیست.');
        project=target;scope='all';phase='all';search='';await refresh();
        if(navigation!==context||context.user!==session?.user?.id)return;
        if(event.kind==='milestone'){
          const row=await checked(db.from('sm_milestones').select('*').eq('id',event.sourceId).single());
          if(navigation!==context)return;window.SamandisMilestoneForm?.(row);
        }else await detail(event.sourceId);
      }
      if(navigation!==context||context.user!==session?.user?.id)return;
      if(!q('#sharedDialog')?.open)throw Error('این کار دیگر در دسترس نیست.');
      taskBack();
    }catch(e){if(navigation!==context)return;message(failure(e));await returnToCalendar();}
    finally{navigating=false;}
  }
  const taskDialog=q('#sharedDialog');
  if(taskDialog)taskDialog.addEventListener('close',()=>{if(navigation&&!navigating&&!taskDialog.open)returnToCalendar();});
  if(q('#sharedDetail'))new MutationObserver(taskBack).observe(q('#sharedDetail'),{childList:true,subtree:true});
  q('#appBack')?.addEventListener('click',e=>{if(navigation||returning){e.preventDefault();e.stopImmediatePropagation();if(navigation)returnToCalendar();}},true);
  function draw(focus){
    if(!dialog.open||!allowed||session?.user?.id!==user)return;
    const agendaExpanded=dialog.querySelector('.uc-agenda')?.open||false;
    const scroll=dialog.querySelector('.uc-content')?.scrollTop||0,agendaScroll=dialog.querySelector('.uc-agenda')?.scrollTop||0;
    dialog.classList.toggle('uc-fullscreen',fullscreen);
    const [first,next]=bounds(),all=model.filter(events,filter,includeDone),dated=all.filter(e=>e.due),undated=all.filter(e=>!e.due),days=model.days(first,next);
    const title=new Intl.DateTimeFormat('fa-IR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(first+'T12:00:00Z'));
    const byDay=new Map();for(const e of dated){if(!byDay.has(e.due))byDay.set(e.due,[]);byDay.get(e.due).push(e);}
    const monthEvents=dated.filter(e=>e.due>=first&&e.due<next),agenda=byDay.get(selected)||[];
    dialog.innerHTML='<div class="uc-header"><div><h2>تقویم همهٔ پروژه‌ها</h2></div><div class="uc-window-actions"><button type="button" class="uc-maximize" data-uc-action="fullscreen" aria-pressed="'+fullscreen+'" aria-label="'+(fullscreen?'خروج از تمام‌صفحه':'تمام‌صفحه')+'"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/></svg><span>'+(fullscreen?'کوچک کردن':'تمام‌صفحه')+'</span></button><button type="button" class="uc-close" data-uc-action="close" aria-label="بستن تقویم">×</button></div></div><div class="uc-content"><div class="uc-toolbar"><div class="uc-month-nav"><button type="button" data-uc-action="previous" aria-label="ماه قبل">→</button><h3>'+title+'</h3><button type="button" data-uc-action="next" aria-label="ماه بعد">←</button><button type="button" data-uc-action="today">ماه جاری</button></div><div class="uc-options"><label><input type="checkbox" id="ucIncludeDone" '+(includeDone?'checked':'')+'> انجام‌شده‌ها</label><button type="button" data-uc-action="refresh" '+(loading?'disabled':'')+'>تازه‌سازی</button></div></div><div class="uc-legend" aria-label="راهنمای رنگ پروژه‌ها"><button type="button" data-uc-project="" class="'+(!filter?'selected':'')+'" aria-pressed="'+!filter+'">همه پروژه‌ها</button>'+projects.map(p=>'<button type="button" data-uc-project="'+esc(p.key)+'" class="'+(filter===p.key?'selected':'')+'" aria-pressed="'+(filter===p.key)+'" style="'+colorStyle(p.key)+'"><i aria-hidden="true"></i>'+esc(p.name)+'</button>').join('')+'</div>'+(loading?'<div class="uc-message" role="status">در حال دریافت تقویم پروژه‌ها…</div>':error?'<div class="uc-error" role="alert">'+esc(error)+' <button type="button" data-uc-action="refresh">تلاش دوباره</button></div>':'')+'<div class="uc-summary">'+fa(monthEvents.length)+' کار و موعد در این ماه · '+fa(projects.length)+' پروژه</div><div class="uc-layout'+(agenda.length?'':' uc-no-agenda')+'"><section class="uc-calendar" aria-label="تقویم ماه"><div class="uc-weekdays">'+['ش','ی','د','س','چ','پ','ج'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="uc-grid">'+days.map(day=>{
      if(!day)return '<div class="uc-day uc-blank" aria-hidden="true"></div>';
      const list=byDay.get(day)||[],dayProjects=[...new Set(list.map(e=>e.projectKey))];
      return '<button type="button" class="uc-day '+(day===today()?'today ':'')+(day===selected?'selected':'')+'" data-uc-day="'+day+'" aria-pressed="'+(day===selected)+'" aria-label="'+esc(label(day))+'؛ '+fa(list.length)+' کار"><span class="uc-day-top"><b>'+fa(Number(SamandisDates.display(day).split('/')[2]))+'</b>'+(list.length?'<small>'+fa(list.length)+'</small>':'')+'</span><span class="uc-mini-events">'+list.slice(0,2).map(e=>'<span data-uc-task="'+esc(e.id)+'" class="uc-mini-event '+(e.done?'is-done':'')+'" style="'+colorStyle(e.projectKey)+'" title="'+esc(e.projectName+' — '+e.title)+'">'+esc(e.projectName+' — '+e.title)+'</span>').join('')+(list.length>2?'<span class="uc-more">'+fa(list.length-2)+' مورد دیگر</span>':'')+'</span><span class="uc-day-dots" aria-hidden="true">'+dayProjects.map(key=>'<i style="'+colorStyle(key)+'"></i>').join('')+'</span></button>';
    }).join('')+'</div></section>'+(agenda.length?'<details class="uc-agenda" '+(agendaExpanded?'open':'')+'><summary><span>کارهای روز انتخاب‌شده<small>'+label(selected)+'</small></span><span class="uc-agenda-count">'+fa(agenda.length)+' کار <span class="uc-agenda-chevron" aria-hidden="true">⌄</span></span></summary><div class="uc-agenda-items">'+agenda.map(taskHTML).join('')+'</div></details>':'')+'</div>'+(undated.length?'<details class="uc-undated"><summary>'+fa(undated.length)+' کار بدون مهلت</summary>'+undated.map(taskHTML).join('')+'</details>':'')+'</div>';
    dialog.querySelector('#ucIncludeDone').onchange=e=>{includeDone=e.target.checked;draw('#ucIncludeDone');};
    dialog.querySelector('.uc-content').scrollTop=scroll;const agendaNode=dialog.querySelector('.uc-agenda');if(agendaNode)agendaNode.scrollTop=agendaScroll;
    if(focus)dialog.querySelector(focus)?.focus({preventScroll:true});
  }
  dialog.addEventListener('click',e=>{
    const task=e.target.closest('[data-uc-task]');if(task){openTask(events.find(t=>t.id===task.dataset.ucTask));return;}
    const day=e.target.closest('[data-uc-day]');if(day){selected=day.dataset.ucDay;draw('[data-uc-day="'+selected+'"]');return;}
    const p=e.target.closest('[data-uc-project]');if(p){filter=p.dataset.ucProject;draw('[data-uc-project="'+filter+'"]');return;}
    const button=e.target.closest('[data-uc-action]');if(!button)return;
    const action=button.dataset.ucAction;
    if(action==='close'){dialog.close();return;}
    if(action==='fullscreen'){fullscreen=!fullscreen;draw('[data-uc-action="fullscreen"]');return;}
    if(action==='refresh'){permission(true).then(ok=>{if(ok)load();else dialog.close();});return;}
    if(action==='today'){month=SamandisDates.display(today()).slice(0,7);selected=today();}
    else{let [y,m]=month.split('/').map(Number);m+=action==='next'?1:-1;if(m<1){m=12;y--;}if(m>12){m=1;y++;}month=y+'/'+String(m).padStart(2,'0');selected=SamandisDates.parse(y+'/'+m+'/1');}
    draw('[data-uc-action="'+action+'"]');
  });
  launch.onclick=async()=>{
    launch.disabled=true;try{
      if(!await permission(true)){message('این تقویم برای حساب فعلی در دسترس نیست.');return;}
      const agenda=dialog.querySelector('.uc-agenda');if(agenda)agenda.open=false;
      lockScroll();if(!dialog.open)dialog.showModal();draw();if(Date.now()-loadedAt>20000)await load();
    }finally{launch.disabled=false;}
  };
  const previousRender=render;
  render=function(...args){const result=previousRender(...args);syncButton();if(session&&mine())permission();return result;};
  const previousAccount=loadAccount;
  loadAccount=async function(account){clear(account?.user?.id);const token=revision;await previousAccount(account);if(token===revision&&account?.user?.id===session?.user?.id&&mine())await permission();};
  if(session&&mine())permission();
})();
