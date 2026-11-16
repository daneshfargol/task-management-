/* Pure calendar projection. It never changes source tasks or their dates. */
((root, factory) => {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.SamandisAllCalendarModel = model;
})(typeof window === 'object' ? window : globalThis, () => {
  const palette = [
    ['#365caa','#edf2ff'], ['#08796d','#e8f6f1'], ['#a55316','#fff1e6'],
    ['#8143a8','#f5edfb'], ['#a53965','#fcecf3'], ['#167792','#e9f6fb'],
    ['#78651a','#faf5dc'], ['#506c31','#f0f6e7'], ['#9b3d36','#fcefed'],
    ['#5747aa','#f0edfc'], ['#7b553e','#f8f0e9'], ['#3c6172','#edf4f8']
  ];
  function color(index) {
    if (index < palette.length) return {ink:palette[index][0],soft:palette[index][1]};
    const hue = Math.round(index * 137.508) % 360;
    return {ink:`hsl(${hue} 55% 30%)`,soft:`hsl(${hue} 65% 95%)`};
  }
  function assignColors(projects, saved = {}) {
    const result = {}, used = new Set();
    const sorted = [...projects].sort((a,b)=>a.key.localeCompare(b.key));
    for (const p of sorted) {
      const index = saved[p.key];
      if (Number.isInteger(index) && index >= 0 && index < 10000 && !used.has(index)) {
        result[p.key] = index; used.add(index);
      }
    }
    for (const p of sorted) if (result[p.key] === undefined) {
      let index = 0; while (used.has(index)) index++;
      result[p.key] = index; used.add(index);
    }
    return result;
  }
  function projectRows(team, personal) {
    return [...team.map(p=>({...p,key:'team:'+p.id,kind:'team'})),
      ...personal.map(p=>({...p,key:'personal:'+p.id,kind:'personal'}))];
  }
  function events(projects, teamTasks, personalTasks, milestones, trash, members) {
    const projectMap = new Map(projects.map(p=>[p.key,p]));
    const people = new Map(members.map(m=>[m.id,m.name]));
    const deleted = new Set(trash.map(t=>t.task_id));
    const result = [];
    function add(row, kind, extra) {
      const p = projectMap.get((kind === 'personal'?'personal:':'team:') + row.project_id);
      if (!p) return;
      result.push({id:kind+':'+row.id,sourceId:row.id,projectId:p.id,projectKey:p.key,projectName:p.name,title:row.title,
        description:row.description||'',due:row.due||null,kind,...extra});
    }
    for (const t of teamTasks) if (!deleted.has(t.id)) add(t,'team',{
      done:t.status==='done',status:{open:'در دست انجام',review:'منتظر تأیید',done:'انجام‌شده'}[t.status]||t.status,
      owner:people.get(t.owner_id)||'عضو پیشین'
    });
    for (const t of personalTasks) if (!t.deleted) add(t,'personal',{
      done:!!t.done,status:t.done?'انجام‌شده':'در دست انجام',
      owner:(t.responsible_names?.length?t.responsible_names:[t.responsible_name]).filter(Boolean).join('، ')
    });
    for (const t of milestones) add(t,'milestone',{done:t.status==='delivered',status:'موعد تحویل پروژه',owner:''});
    return result.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||a.projectName.localeCompare(b.projectName,'fa')||a.title.localeCompare(b.title,'fa'));
  }
  function filter(events, projectKey, includeDone) {
    return events.filter(e=>(!projectKey||e.projectKey===projectKey)&&(includeDone||!e.done));
  }
  function days(first, next) {
    const start = Date.parse(first+'T12:00:00Z'), end = Date.parse(next+'T12:00:00Z');
    const offset = (new Date(start).getUTCDay()+1)%7;
    const cells = Array(offset).fill(null);
    for (let d=start;d<end;d+=86400000) cells.push(new Date(d).toISOString().slice(0,10));
    while (cells.length%7) cells.push(null);
    return cells;
  }
  return {color,assignColors,projectRows,events,filter,days};
});
