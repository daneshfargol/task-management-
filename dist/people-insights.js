/* Management drill-down: current task snapshots and separately labelled recorded activity. */
(() => {
  'use strict';
  if (!document.body.classList.contains('shared-app')) return;
  const day = value => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const days = (a,b) => Math.max(0,Math.floor((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000));
  const plus = (value,n) => {const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  const fmt = value => value ? new Intl.DateTimeFormat('fa-IR',{day:'numeric',month:'short',timeZone:'Asia/Tehran'}).format(new Date(value.length===10?value+'T12:00:00Z':value)) : 'بدون تاریخ';
  function metrics(list,today) {
    const open=list.filter(t=>t.status!=='done'),done=list.filter(t=>t.status==='done');
    const timed=done.filter(t=>t.due&&t.approved_at);
    const onTime=timed.filter(t=>day(t.approved_at)<=t.due);
    const durations=done.filter(t=>t.created_at&&t.approved_at&&Date.parse(t.approved_at)>=Date.parse(t.created_at)).map(t=>days(day(t.created_at),day(t.approved_at)));
    return {open,done,late:open.filter(t=>t.due&&t.due<today),review:list.filter(t=>t.status==='review'),soon:open.filter(t=>t.due&&t.due>=today&&t.due<=plus(today,7)),undated:open.filter(t=>!t.due),rate:list.length?Math.round(done.length/list.length*100):null,timed:timed.length,onTime:timed.length?Math.round(onTime.length/timed.length*100):null,cycle:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):null};
  }
  let generation=0,model=null;
  const dialog=()=>el('#sharedDialog'),root=()=>el('#sharedDetail');
  function scoped() {
    if (!model) return [];
    return model.tasks.filter(t=>(model.relation==='owned'?t.owner_id===model.member.id:t.collaborators?.includes(model.member.id)&&t.owner_id!==model.member.id));
  }
  function filterTasks(list) {
    const today=model.today;
    return list.filter(t=>{
      const f=model.filter;
      return (!model.query||(t.title+' '+(t.description||'')).toLocaleLowerCase('fa').includes(model.query.toLocaleLowerCase('fa')))&&
        (f==='all'||f===t.status||f==='late'&&t.status!=='done'&&t.due&&t.due<today||f==='soon'&&t.status!=='done'&&t.due&&t.due>=today&&t.due<=plus(today,7)||f==='undated'&&t.status!=='done'&&!t.due);
    }).sort((a,b)=>Number(a.status==='done')-Number(b.status==='done')||(a.due||'9999').localeCompare(b.due||'9999'));
  }
  function taskList() {
    const list=filterTasks(scoped());
    el('#insightTaskCount').textContent=fa(list.length)+' کار';
    el('#insightTasks').innerHTML=list.length?list.map(t=>'<button type="button" class="insight-task" data-insight-task="'+esc(t.id)+'"><span><b>'+esc(t.title)+'</b><small>'+esc(labels[t.status]||t.status)+(model.relation==='collaboration'?' · مسئول اصلی: '+esc(person(t.owner_id)):'')+'</small></span><span class="'+(t.status!=='done'&&t.due&&t.due<model.today?'insight-danger':'')+'">'+(t.due?fmt(t.due):'بدون مهلت')+(t.status!=='done'&&t.due&&t.due<model.today?'<small>'+fa(days(t.due,model.today))+' روز تأخیر</small>':'')+'</span></button>').join(''):'<p class="insight-empty">کاری با این فیلتر وجود ندارد.</p>';
    el('#insightTasks').querySelectorAll('[data-insight-task]').forEach(button=>button.onclick=()=>{const id=button.dataset.insightTask;dialog().close();detail(id);});
    root().querySelectorAll('[data-insight-filter]').forEach(button=>{button.classList.toggle('active',button.dataset.insightFilter===model.filter);button.setAttribute('aria-pressed',String(button.dataset.insightFilter===model.filter));});
  }
  function trend() {
    if (!el('#insightTrend')||!model) return;
    if (model.events===null) {el('#insightTrend').innerHTML='<p class="insight-empty">در حال دریافت رویدادهای ثبت‌شده…</p>';return;}
    if (model.eventsError) {el('#insightTrend').innerHTML='<p class="insight-empty">رویدادها دریافت نشد. نمودار روند فعلاً در دسترس نیست.</p><button type="button" id="retryInsightEvents">تلاش دوباره</button>';el('#retryInsightEvents').onclick=loadEvents;return;}
    const ids=new Set(scoped().map(t=>t.id)),events=model.events.filter(e=>ids.has(e.task_id));
    const step=Math.ceil(model.period/6),buckets=[];
    for(let i=0;i<6;i++){const start=plus(model.today,-model.period+1+i*step),end=plus(start,step-1);if(start>model.today)break;const inRange=events.filter(e=>day(e.created_at)>=start&&day(e.created_at)<=end);buckets.push({start,end:end>model.today?model.today:end,submit:inRange.filter(e=>e.kind==='submit').length,approve:inRange.filter(e=>e.kind==='approve').length});}
    const max=Math.max(1,...buckets.flatMap(b=>[b.submit,b.approve]));
    el('#insightTrend').innerHTML='<div class="insight-legend"><span><i class="is-blue"></i>ارسال برای تأیید</span><span><i class="is-green"></i>تأیید نهایی</span></div><div class="insight-trend-bars">'+buckets.map(b=>'<div class="insight-trend-group"><div class="insight-trend-columns"><div class="is-blue" style="height:'+Math.max(2,b.submit/max*100)+'%" title="'+fa(b.submit)+' ارسال"><b>'+fa(b.submit)+'</b></div><div class="is-green" style="height:'+Math.max(2,b.approve/max*100)+'%" title="'+fa(b.approve)+' تأیید"><b>'+fa(b.approve)+'</b></div></div><small>'+fmt(b.start)+'<br>'+fmt(b.end)+'</small></div>').join('')+'</div><p class="insight-caption">تعداد رویدادهای ثبت‌شده برای این کارها؛ ارسال مجدد یک کار می‌تواند چند رویداد داشته باشد. تأییدها توسط تأییدکننده ثبت می‌شوند.</p><details class="insight-data-table"><summary>جدول اعداد نمودار</summary><table><thead><tr><th>بازه</th><th>ارسال</th><th>تأیید</th></tr></thead><tbody>'+buckets.map(b=>'<tr><td>'+fmt(b.start)+' تا '+fmt(b.end)+'</td><td>'+fa(b.submit)+'</td><td>'+fa(b.approve)+'</td></tr>').join('')+'</tbody></table></details>';
    const recent=events.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,6);
    el('#insightRecent').innerHTML=recent.length?recent.map(e=>{const t=model.tasks.find(t=>t.id===e.task_id);return '<div><span>'+esc(({submit:'ارسال برای تأیید',approve:'تأیید نهایی',report:'گزارش / بازخورد',correct:'درخواست اصلاح',file:'ثبت فایل',created:'تعریف کار',edit:'ویرایش',assign:'تغییر ارجاع',reopen:'بازگشایی'})[e.kind]||'به‌روزرسانی')+' · '+esc(t?.title||'کار')+'</span><small>'+fmt(e.created_at)+' · '+esc(person(e.actor_id))+'</small></div>';}).join(''):'<p class="insight-empty">در این بازه رویدادی برای این کارها ثبت نشده است.</p>';
  }
  function renderDashboard() {
    if(!model)return;
    const list=scoped(),m=metrics(list,model.today),counts=['open','review','done'].map(s=>list.filter(t=>t.status===s).length),percent=counts.map(c=>list.length?c/list.length*100:0);
    const kpis=[['کارهای این نقش',list.length,'all'],['در دست اقدام',counts[0],'open'],['عقب‌افتاده',m.late.length,'late'],['منتظر تأیید',m.review.length,'review'],['سررسید ۷ روز آینده',m.soon.length,'soon'],['بدون مهلت',m.undated.length,'undated']];
    const age=[[1,3,'۱ تا ۳ روز'],[4,7,'۴ تا ۷ روز'],[8,14,'۸ تا ۱۴ روز'],[15,Infinity,'بیش از ۱۴ روز']].map(([a,b,label])=>({label,n:m.late.filter(t=>{const d=days(t.due,model.today);return d>=a&&d<=b}).length}));
    const maxAge=Math.max(1,...age.map(a=>a.n));
    const reviewDays=m.review.filter(t=>t.submitted_at).map(t=>days(day(t.submitted_at),model.today));
    root().innerHTML='<div class="shared-task-head"><div><span class="insight-eyebrow">گزارش مدیریتی فرد · '+esc(project.name)+'</span><h2>'+esc(model.member.name)+'</h2><p class="insight-caption">'+esc(model.member.title||'عضو پروژه')+' · وضعیت فعلی تا '+fmt(model.today)+'</p></div><button type="button" class="shared-close" id="sharedClose" aria-label="بستن گزارش">×</button></div><section class="people-insight"><div class="insight-toolbar"><div class="insight-switch"><button type="button" data-insight-role="owned" class="'+(model.relation==='owned'?'active':'')+'">مسئول اصلی</button><button type="button" data-insight-role="collaboration" class="'+(model.relation==='collaboration'?'active':'')+'">همکاری</button></div><label>روند رویدادها<select id="insightPeriod"><option value="30">۳۰ روز اخیر</option><option value="90">۹۰ روز اخیر</option></select></label></div><p class="insight-caption">'+(model.from||model.to?'کارهای دارای مهلت در بازهٔ '+(model.from?fmt(model.from):'ابتدا')+' تا '+(model.to?fmt(model.to):'انتها')+'؛ کار بدون مهلت با تاریخ ایجاد فیلتر شده است.':'همهٔ کارهای قابل‌دسترسی این پروژه؛ مسئولیت اصلی و همکاری جدا محاسبه می‌شوند.')+'</p><div class="insight-kpis">'+kpis.map(([title,n,filter])=>'<button type="button" data-insight-filter="'+filter+'" class="'+(filter==='late'&&n?'is-alert':'')+'"><span>'+title+'</span><b>'+fa(n)+'</b></button>').join('')+'</div><div class="insight-grid"><section class="insight-panel"><h3>ترکیب وضعیت کارها</h3><div class="insight-status"><div class="insight-donut" role="img" aria-label="'+counts.map((n,i)=>labels[['open','review','done'][i]]+': '+fa(n)).join('، ')+'" style="background:'+(list.length?'conic-gradient(#7397d4 0 '+percent[0]+'%,#d9b86d '+percent[0]+'% '+(percent[0]+percent[1])+'%,#75ac99 '+(percent[0]+percent[1])+'% 100%)':'var(--ui-line,#e2e8f1)')+'"><div><b>'+(m.rate===null?'—':fa(m.rate)+'٪')+'</b><small>تأیید نهایی</small></div></div><div class="insight-status-labels">'+counts.map((n,i)=>'<button type="button" data-insight-filter="'+['open','review','done'][i]+'"><i class="'+['is-blue','is-gold','is-green'][i]+'"></i>'+labels[['open','review','done'][i]]+'<b>'+fa(n)+'</b></button>').join('')+'</div></div></section><section class="insight-panel"><h3>موارد نیازمند پیگیری</h3><div class="insight-summary"><p><b>'+fa(m.late.length)+'</b> کار از مهلت عبور کرده است.</p><p><b>'+fa(m.review.length)+'</b> کار منتظر تصمیم تأییدکننده است'+(reviewDays.length?'؛ قدیمی‌ترین: '+fa(Math.max(...reviewDays))+' روز':'')+'.</p><p><b>'+fa(m.soon.length)+'</b> کار در ۷ روز آینده سررسید دارد.</p></div><div class="insight-quality"><span>تأیید در مهلت<b>'+(m.onTime===null?'داده کافی نیست':fa(m.onTime)+'٪')+'</b><small>از '+fa(m.timed)+' کار دارای مهلت و تاریخ تأیید؛ زمان تأیید ممکن است به بررسی مدیر وابسته باشد.</small></span><span>میانگین تا تأیید نهایی<b>'+(m.cycle===null?'—':fa(m.cycle)+' روز')+'</b><small>از تاریخ ایجاد تا آخرین تأیید؛ معیارِ زمان کارکرد فرد نیست.</small></span></div></section><section class="insight-panel"><h3>روند ارسال و تأیید</h3><div id="insightTrend"></div></section><section class="insight-panel"><h3>عمر تأخیرِ کارهای باز</h3><div class="insight-aging">'+age.map(a=>'<button type="button" data-insight-filter="late"><span>'+a.label+'</span><i><em style="width:'+a.n/maxAge*100+'%"></em></i><b>'+fa(a.n)+'</b></button>').join('')+'</div><p class="insight-caption">مبنای تأخیر، مهلت ثبت‌شده و روز جاری تهران است. کارهای بدون مهلت در این نمودار نیستند.</p></section></div><section class="insight-panel"><div class="insight-list-head"><h3>کارهای قابل پیگیری <small id="insightTaskCount"></small></h3><button type="button" id="insightExport">دریافت CSV</button></div><div class="insight-list-tools"><select id="insightFilter" aria-label="فیلتر کارها">'+[['all','همه کارها'],['open','در دست اقدام'],['review','منتظر تأیید'],['done','تأییدشده'],['late','عقب‌افتاده'],['soon','سررسید نزدیک'],['undated','بدون مهلت']].map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('')+'</select><input id="insightSearch" type="search" placeholder="جست‌وجو در کارهای این فرد…" aria-label="جست‌وجوی کارهای فرد"></div><div id="insightTasks"></div></section><section class="insight-panel"><h3>آخرین رویدادهای این کارها</h3><div id="insightRecent"></div></section></section>';
    el('#sharedClose').onclick=()=>dialog().close();
    root().querySelectorAll('[data-insight-role]').forEach(b=>b.onclick=()=>{model.relation=b.dataset.insightRole;model.filter='all';model.query='';renderDashboard();});
    root().querySelectorAll('[data-insight-filter]').forEach(b=>b.onclick=()=>{model.filter=b.dataset.insightFilter;el('#insightFilter').value=model.filter;taskList();el('#insightTasks').scrollIntoView({block:'nearest',behavior:'smooth'});});
    el('#insightFilter').value=model.filter;el('#insightFilter').onchange=e=>{model.filter=e.target.value;taskList();};
    el('#insightSearch').value=model.query;el('#insightSearch').oninput=e=>{model.query=e.target.value;taskList();};
    el('#insightPeriod').value=model.period;el('#insightPeriod').onchange=e=>{model.period=Number(e.target.value);loadEvents();};
    el('#insightExport').onclick=()=>{const cell=v=>'"'+String(v??'').replace(/^\s*[=+@\-]/,"'"+'$&').replaceAll('"','""')+'"';const rows=[['عنوان','وضعیت','مسئول اصلی','مهلت'],...filterTasks(scoped()).map(t=>[t.title,labels[t.status],person(t.owner_id),t.due||''])];const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='گزارش-'+model.member.name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    taskList();trend();
  }
  async function loadEvents() {
    if(!model)return;const current=model,token=++generation,pid=current.projectId,uid=session?.user.id;
    current.events=null;current.eventsError=false;trend();
    try {
      let events=[];const ids=current.tasks.map(t=>t.id),since=plus(current.today,-current.period+1)+'T00:00:00+03:30';
      for(let i=0;i<ids.length;i+=50){for(let offset=0;;offset+=500){const rows=await checked(db.from('sm_events').select('id,task_id,kind,created_at,actor_id').eq('project_id',pid).in('task_id',ids.slice(i,i+50)).gte('created_at',since).order('created_at').order('id').range(offset,offset+499));if(token!==generation||model!==current||session?.user.id!==uid||project?.id!==pid||!management()||!dialog().open)return;events.push(...rows);if(rows.length<500)break;}}
      if(token!==generation||model!==current)return;current.events=events;trend();
    } catch(_){if(token===generation&&model===current){current.events=[];current.eventsError=true;trend();}}
  }
  function open(memberId) {
    if(!management())return;const member=members.find(m=>m.id===memberId);if(!member)return;
    const from=el('#peopleRange [name=from]')?.value||'',to=el('#peopleRange [name=to]')?.value||'';
    model={member,projectId:project.id,today:day(Date.now()),from,to,relation:'owned',filter:'all',query:'',period:30,events:null,eventsError:false,tasks:tasks.filter(t=>{const d=t.due||(t.created_at||'').slice(0,10);return (t.owner_id===memberId||t.collaborators?.includes(memberId))&&(!from||d>=from)&&(!to||d<=to);})};
    selectedTask=null;dialog().classList.remove('task-focus-layout');dialog().classList.add('people-insight-dialog');
    renderDashboard();if(!dialog().open)dialog().showModal();dialog().scrollTop=0;
    dialog().addEventListener('close',()=>{generation++;model=null;dialog().classList.remove('people-insight-dialog');},{once:true});
    loadEvents();
  }
  const previous=renderReports;
  renderReports=function(...args){const result=previous(...args);if(management())el('#sharedContent').querySelectorAll('[data-person-report]').forEach(button=>{button.onclick=()=>open(button.dataset.personReport);button.setAttribute('aria-label','گزارش مدیریتی '+(members.find(m=>m.id===button.dataset.personReport)?.name||''));button.setAttribute('aria-haspopup','dialog');button.removeAttribute('aria-expanded');});return result;};
})();
