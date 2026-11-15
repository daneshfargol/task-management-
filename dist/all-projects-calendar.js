/* Account-level, read-only calendar; current team/personal project stays untouched. */
(() => {
  'use strict';
  if (!document.body.classList.contains('shared-app')) return;
  const model = SamandisAllCalendarModel, q = s=>document.querySelector(s);
  const today = ()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const label = iso=>new Intl.DateTimeFormat('fa-IR',{dateStyle:'full',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
  let user=null,allowed=false,permissionAt=0,permissionRequest=null,revision=0,request=0;
  let projects=[],events=[],colors={},loadedAt=0,loading=false,error='',filter='',includeDone=true;
  let month=SamandisDates.display(today()).slice(0,7),selected=today();
  const sidebar=q('#desktopSidebar'),bottom=q('.desk-bottom');
  if(!sidebar||!bottom)return;
  const entry=document.createElement('div');entry.className='all-calendar-entry';entry.hidden=true;
  const launch=document.createElement('button');launch.type='button';launch.id='allProjectsCalendarButton';launch.className='all-calendar-launch';
  launch.innerHTML='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v5M17 3v5M3 11h18M7 15h3M14 15h3"/></svg><span>تقویم همهٔ پروژه‌ها</span>';
  entry.append(launch);bottom.before(entry);
  const dialog=document.createElement('dialog');dialog.id='unifiedCalendarDialog';dialog.setAttribute('aria-label','تقویم همهٔ پروژه‌ها');document.body.append(dialog);
  function syncButton(){const show=allowed&&!!session?.user?.id&&session.user.id===user&&!!mine();entry.hidden=!show;sidebar.classList.toggle('has-all-projects-calendar',show);}
  function clear(uid){revision++;request++;user=uid||null;allowed=false;permissionAt=0;permissionRequest=null;projects=[];events=[];colors={};loadedAt=0;loading=false;error='';filter='';includeDone=true;if(dialog.open)dialog.close();dialog.innerHTML='';syncButton();}
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
  function taskHTML(e){return '<details class="uc-task '+(e.done?'is-done':'')+'" style="'+colorStyle(e.projectKey)+'"><summary><span class="uc-project-name">'+esc(e.projectName)+'</span><span class="uc-task-name"> — '+esc(e.title)+'</span><small>'+esc(e.status)+'</small></summary><div class="uc-task-info">'+(e.owner?'<p>مسئول: '+esc(e.owner)+'</p>':'')+(e.description?'<p class="uc-description">'+esc(e.description)+'</p>':'')+'<p>'+(e.due?'مهلت: '+label(e.due):'مهلت تعیین نشده است')+'</p></div></details>';}
  function draw(focus){
    if(!dialog.open||!allowed||session?.user?.id!==user)return;
    const [first,next]=bounds(),all=model.filter(events,filter,includeDone),dated=all.filter(e=>e.due),undated=all.filter(e=>!e.due),days=model.days(first,next);
    const title=new Intl.DateTimeFormat('fa-IR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(first+'T12:00:00Z'));
    const byDay=new Map();for(const e of dated){if(!byDay.has(e.due))byDay.set(e.due,[]);byDay.get(e.due).push(e);}
    const monthEvents=dated.filter(e=>e.due>=first&&e.due<next),agenda=byDay.get(selected)||[];
    dialog.innerHTML='<div class="uc-header"><div><h2>تقویم همهٔ پروژه‌ها</h2><p>همهٔ کارهای پروژه‌ها و اعضا، بر اساس مهلت ثبت‌شده</p></div><button type="button" class="uc-close" data-uc-action="close" aria-label="بستن تقویم">×</button></div><div class="uc-content"><div class="uc-toolbar"><div class="uc-month-nav"><button type="button" data-uc-action="previous" aria-label="ماه قبل">→</button><h3>'+title+'</h3><button type="button" data-uc-action="next" aria-label="ماه بعد">←</button><button type="button" data-uc-action="today">ماه جاری</button></div><div class="uc-options"><label><input type="checkbox" id="ucIncludeDone" '+(includeDone?'checked':'')+'> انجام‌شده‌ها</label><button type="button" data-uc-action="refresh" '+(loading?'disabled':'')+'>تازه‌سازی</button></div></div><div class="uc-legend" aria-label="راهنمای رنگ پروژه‌ها"><button type="button" data-uc-project="" class="'+(!filter?'selected':'')+'" aria-pressed="'+!filter+'">همه پروژه‌ها</button>'+projects.map(p=>'<button type="button" data-uc-project="'+esc(p.key)+'" class="'+(filter===p.key?'selected':'')+'" aria-pressed="'+(filter===p.key)+'" style="'+colorStyle(p.key)+'"><i aria-hidden="true"></i>'+esc(p.name)+'</button>').join('')+'</div>'+(loading?'<div class="uc-message" role="status">در حال دریافت تقویم پروژه‌ها…</div>':error?'<div class="uc-error" role="alert">'+esc(error)+' <button type="button" data-uc-action="refresh">تلاش دوباره</button></div>':'')+'<div class="uc-summary">'+fa(monthEvents.length)+' کار و موعد در این ماه · '+fa(projects.length)+' پروژه <span>برای دیدن جزئیات، یک روز را انتخاب کنید.</span></div><div class="uc-layout"><section class="uc-calendar" aria-label="تقویم ماه"><div class="uc-weekdays">'+['ش','ی','د','س','چ','پ','ج'].map(d=>'<span>'+d+'</span>').join('')+'</div><div class="uc-grid">'+days.map(day=>{
      if(!day)return '<div class="uc-day uc-blank" aria-hidden="true"></div>';
      const list=byDay.get(day)||[],dayProjects=[...new Set(list.map(e=>e.projectKey))];
      return '<button type="button" class="uc-day '+(day===today()?'today ':'')+(day===selected?'selected':'')+'" data-uc-day="'+day+'" aria-pressed="'+(day===selected)+'" aria-label="'+esc(label(day))+'؛ '+fa(list.length)+' کار"><span class="uc-day-top"><b>'+fa(Number(SamandisDates.display(day).split('/')[2]))+'</b>'+(list.length?'<small>'+fa(list.length)+'</small>':'')+'</span><span class="uc-mini-events">'+list.slice(0,2).map(e=>'<span class="uc-mini-event '+(e.done?'is-done':'')+'" style="'+colorStyle(e.projectKey)+'" title="'+esc(e.projectName+' — '+e.title)+'">'+esc(e.projectName+' — '+e.title)+'</span>').join('')+(list.length>2?'<span class="uc-more">'+fa(list.length-2)+' مورد دیگر</span>':'')+'</span><span class="uc-day-dots" aria-hidden="true">'+dayProjects.map(key=>'<i style="'+colorStyle(key)+'"></i>').join('')+'</span></button>';
    }).join('')+'</div></section><section class="uc-agenda" aria-live="polite"><h3>'+label(selected)+'</h3><p>'+fa(agenda.length)+' کار و موعد</p>'+(agenda.length?agenda.map(taskHTML).join(''):'<div class="uc-empty">برای این روز کاری با مهلت ثبت‌شده وجود ندارد.</div>')+'</section></div>'+(undated.length?'<details class="uc-undated"><summary>'+fa(undated.length)+' کار بدون مهلت</summary>'+undated.map(taskHTML).join('')+'</details>':'')+'</div>';
    dialog.querySelector('#ucIncludeDone').onchange=e=>{includeDone=e.target.checked;draw('#ucIncludeDone');};
    if(focus)dialog.querySelector(focus)?.focus({preventScroll:true});
  }
  dialog.addEventListener('click',e=>{
    const day=e.target.closest('[data-uc-day]');if(day){selected=day.dataset.ucDay;draw('[data-uc-day="'+selected+'"]');return;}
    const p=e.target.closest('[data-uc-project]');if(p){filter=p.dataset.ucProject;draw('[data-uc-project="'+filter+'"]');return;}
    const button=e.target.closest('[data-uc-action]');if(!button)return;
    const action=button.dataset.ucAction;
    if(action==='close'){dialog.close();return;}
    if(action==='refresh'){permission(true).then(ok=>{if(ok)load();else dialog.close();});return;}
    if(action==='today'){month=SamandisDates.display(today()).slice(0,7);selected=today();}
    else{let [y,m]=month.split('/').map(Number);m+=action==='next'?1:-1;if(m<1){m=12;y--;}if(m>12){m=1;y++;}month=y+'/'+String(m).padStart(2,'0');selected=SamandisDates.parse(y+'/'+m+'/1');}
    draw('[data-uc-action="'+action+'"]');
  });
  launch.onclick=async()=>{
    launch.disabled=true;try{
      if(!await permission(true)){message('این تقویم برای حساب فعلی در دسترس نیست.');return;}
      if(!dialog.open)dialog.showModal();draw();if(Date.now()-loadedAt>20000)await load();
    }finally{launch.disabled=false;}
  };
  const previousRender=render;
  render=function(...args){const result=previousRender(...args);syncButton();if(session&&mine())permission();return result;};
  const previousAccount=loadAccount;
  loadAccount=async function(account){clear(account?.user?.id);const token=revision;await previousAccount(account);if(token===revision&&account?.user?.id===session?.user?.id&&mine())await permission();};
  if(session&&mine())permission();
})();
