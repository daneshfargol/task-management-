const defaultMembers=[
 {name:'مریم احمدی (نمونه)',role:'عضو نمونه قبلی',legacy:true,active:false,access:'member'},
 {name:'رضا کریمی (نمونه)',role:'عضو نمونه قبلی',legacy:true,active:false,access:'member'},
 {name:'علی رضایی (نمونه)',role:'عضو نمونه قبلی',legacy:true,active:false,access:'member'},
 {name:'سارا محمدی (نمونه)',role:'عضو نمونه قبلی',legacy:true,active:false,access:'member'},
 {name:'رضا افشار',role:'مدیر پروژه',access:'manage',active:true},
 {name:'احسان شاهین زاده',role:'سرپرست کارگاه',access:'manage',active:true},
 {name:'فرگل دانش',role:'کارشناس کنترل پروژه',access:'member',active:true},
 {name:'عرفان افشار',role:'کارشناس کنترل پروژه',access:'member',active:true},
 {name:'احمدرضا محمدامری',role:'سرپرست دفتر فنی',access:'member',active:true}
];let members;try{members=JSON.parse(localStorage.getItem('daraei-members-v1'))}catch{}if(!Array.isArray(members)||members.length<9)members=defaultMembers.map((m,i)=>({...m,id:'member-'+i,email:''}));
