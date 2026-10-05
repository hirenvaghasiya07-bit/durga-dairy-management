(function(){
if(typeof isAkash!=='function'||!isAkash())return;
const Z=()=>db.settings?.akashV2||{purchases:[],sales:[],collections:[],slabs:[]};
const n=v=>Number(v||0), m=v=>money(n(v)), d=()=>iso();
function expRender(){const rows=(db.expenses||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));const total=rows.reduce((s,x)=>s+n(x.amount),0);shell('expenses','<div class="sectionhead"><div><h1>Expense</h1><div class="muted">Akash daily expense • unchanged workflow</div></div><button class="btn" onclick="addExpense()">+ Add Expense</button></div><div class="grid">'+metric('Total Expense',m(total))+metric('Entries',rows.length)+'</div><div class="card section">'+tableRows(rows.map(x=>({...x,id:x.id,_entity:'expenses'})),[['Date',x=>fmtDate(x.date)],['Category',x=>esc(x.category||'Other')],['Amount',x=>m(x.amount)],['Payment',x=>esc(x.paymentMode||'Cash')],['Description',x=>esc(x.description||'')],['Actions',x=>'<button class="btn sm gray" onclick="editGeneric(\\'expenses\\',\\''+x.id+'\\')">Edit</button>']],false)+'</div>','Expense')}
window.render=function(k){window.__durgaView=k;if(k==='dashboard')return dashboard();if(k==='sales')return renderSales();if(k==='collections')return renderCollections();if(k==='milk')return renderMilk();if(k==='expenses')return expRender();if(k==='cash')return renderCash();if(k==='reports')return renderReports();if(k==='audit')return renderAudit();if(k==='customers')return renderCustomers();};
window.dashboard=window.dashboard||function(){};
window.renderExpenses=expRender;
if(typeof akashDashboard==='function')window.dashboard=akashDashboard;
if(typeof renderAkashSales==='function')window.renderSales=renderAkashSales;
if(typeof renderAkashCollections==='function')window.renderCollections=renderAkashCollections;
if(typeof renderAkashMilk==='function')window.renderMilk=renderAkashMilk;
if(typeof renderAkashCustomers==='function')window.renderCustomers=renderAkashCustomers;
if(typeof renderAkashCash==='function')window.renderCash=renderAkashCash;
if(typeof renderAkashReports==='function')window.renderReports=renderAkashReports;
render('dashboard');
})();