const defaultMembers=[
 {name:'مریم احمدی (نمونه)',role:'عضو نمونه قبلی',legacy:true,active:false,access:'member'},
 {name:'رضا کریمی (نمونه)',role:'عضو نمونه قبلی',legacy:true,active:false,access:'member'},
 {name:'علی رضایی (نمونه)',role:'عضو نمونه قبلی',legacy:true,active:false,access:'member'},
 {name:'سارا محمدی (نمونه)',role:'عضو نمونه قبلی',legacy:true,active:false,access:'member'},
 {name:'رضا افشار',role:'مدیر پروژه',access:'director',active:true},
 {name:'احسان شاهین زاده',role:'سرپرست کارگاه',access:'supervisor',active:true},
 {name:'فرگل دانش',role:'کارشناس کنترل پروژه',access:'member',active:true},
 {name:'عرفان افشار',role:'کارشناس کنترل پروژه',access:'member',active:true},
 {name:'احمدرضا محمدامری',role:'سرپرست دفتر فنی',access:'member',active:true}
];let members;try{members=JSON.parse(localStorage.getItem('daraei-members-v1'))}catch{}if(!Array.isArray(members)||members.length<9)members=defaultMembers.map((m,i)=>({...m,id:'member-'+i,email:''}));

// Migrate the existing two management roles without remapping member IDs.
members.forEach((m,i)=>{if(m.access==='manage')m.access=i===4?'director':'supervisor'});
function isDirector(){return !!members[me()]?.active&&members[me()].access==='director'}
function isSupervisor(){return !!members[me()]?.active&&members[me()].access==='supervisor'}
function protectedMember(i){return members[i]?.access==='director'}
function canManageMember(i){return isDirector()||(isSupervisor()&&!protectedMember(i))}
function canAdminTask(t){return isDirector()||(isSupervisor()&&!protectedMember(t.owner))}
function canAssignOwner(i){return !!members[i]?.active&&!members[i]?.legacy&&(isDirector()||(isSupervisor()&&!protectedMember(i))||Number(i)===me())}
function managementLabel(m){return m.access==='director'?'همه بخش‌ها و همه اعضا':m.access==='supervisor'?'همه به‌جز مدیر پروژه':'کارهای محول‌شده به خود'}
