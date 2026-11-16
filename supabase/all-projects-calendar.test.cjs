const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../dist/all-projects-calendar-model.js');
const projects=model.projectRows([{id:'team',name:'پروژه تیمی'}],[{id:'p1',name:'پروژه اول'},{id:'p2',name:'پروژه دوم'}]);
test('project colors are unique, stable on reorder and preserved when adding a project',()=>{
  const colors=model.assignColors(projects);
  assert.equal(new Set(Object.values(colors)).size,projects.length);
  assert.deepEqual(model.assignColors([...projects].reverse(),colors),colors);
  const next=model.assignColors([...projects,{key:'personal:added'}],colors);
  for(const p of projects)assert.equal(next[p.key],colors[p.key]);
  const many=model.assignColors(Array.from({length:30},(_,i)=>({key:'p:'+i})));
  assert.equal(new Set(Object.values(many).map(i=>model.color(i).ink)).size,30);
});
test('aggregates every team member and personal project, excludes trash, retains undated work',()=>{
  const team=[{id:'a',project_id:'team',title:'کار مدیر',owner_id:'manager',due:'2026-11-21',status:'open'},
    {id:'b',project_id:'team',title:'کار همکار',owner_id:'other',due:'2026-11-21',status:'review'},
    {id:'trash',project_id:'team',title:'حذف شده',due:'2026-11-21',status:'open'}];
  const personal=[{id:'c',project_id:'p1',title:'کار شخصی',due:'2026-11-21',done:true,responsible_names:['پیمانکار']},
    {id:'d',project_id:'p2',title:'بدون مهلت',due:null,done:false},
    {id:'deleted',project_id:'p1',title:'حذف شخصی',deleted:true,due:'2026-11-21'}];
  const events=model.events(projects,team,personal,[],[{task_id:'trash'}],[{id:'manager',name:'مدیر'},{id:'other',name:'همکار'}]);
  assert.equal(events.length,4);
  assert(events.some(e=>e.title==='کار همکار'&&e.owner==='همکار'));
  const linked=events.find(e=>e.title==='کار همکار');
  assert.equal(linked.sourceId,'b');assert.equal(linked.projectId,'team');
  assert(events.some(e=>e.projectName==='پروژه دوم'&&e.due===null));
  assert.equal(model.filter(events,'',false).length,3);
  assert.equal(model.filter(events,'personal:p1',true).length,1);
  assert(!personal[0].status); // Projection leaves database records untouched.
});
test('personal navigation bridge opens the original task without rewriting saved project selection',async()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync('dist/personal-projects.js','utf8');
  const a=source.indexOf('if(shared)window.SamandisPersonalNavigation='),b=source.indexOf('\n})();',a);
  const selected=[],context={window:{},shared:true,personal:{id:'p1'},mode:'calendar',filter:'all',query:'متن',calendarMonth:'1405/08/01',loading:0,personalTasks:[{id:'task',deleted:false}],resetNav(){},render(){},taskForm(t){context.opened=t.id},async selectProject(id,options){selected.push({id,remember:options.remember});context.personal={id};}};
  vm.createContext(context);vm.runInContext(source.slice(a,b),context);
  const api=context.window.SamandisPersonalNavigation,original=api.context();
  await api.openTask('p2','task');assert.equal(context.opened,'task');assert.equal(selected[0].remember,false);
  await api.restore(original);assert.equal(context.personal.id,'p1');assert.equal(context.mode,'calendar');assert.equal(context.query,'متن');assert.equal(selected[1].remember,false);
  api.leave({renderNow:false});assert.equal(context.personal,null);
});
test('calendar weeks start on Saturday and include leap-day/month boundaries',()=>{
  const days=model.days('2024-02-01','2024-03-01');
  assert.equal(days.length%7,0);
  assert.equal(days.filter(Boolean).length,29);
  assert.equal(days.indexOf('2024-02-03')%7,0);
  assert(days.includes('2024-02-29'));
  assert(!days.includes('2024-03-01'));
});
test('same-named projects retain distinct identities and no unauthorized project is invented',()=>{
  const p=model.projectRows([{id:'a',name:'یک نام'}],[{id:'a',name:'یک نام'}]);
  assert.notEqual(p[0].key,p[1].key);
  assert.equal(model.events(p,[{id:'x',project_id:'not-visible',title:'محرمانه'}],[],[],[],[]).length,0);
});
