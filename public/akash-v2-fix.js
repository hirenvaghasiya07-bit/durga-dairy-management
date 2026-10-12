(function(){
function AL(){db.settings=db.settings||{};db.settings.akashV2=db.settings.akashV2||{};if(!Array.isArray(db.settings.akashV2.expenses))db.settings.akashV2.expenses=[];return db.settings.akashV2.expenses}
window.akExpList=AL;
if(typeof isAkash!=='function'||!isAkash())return;
var BASE_CATS=['Home','Fixed / Utility','EMI','Hospital','Car','Bike','Grocery','Fuel','Dairy Expense','Other'];
function CATS(){var a=db.settings?.akashV2||{};return [...new Set(BASE_CATS.concat(a.expenseCategories||[],AL().map(function(x){return String(x.category||'').trim()}).filter(Boolean)))].sort(function(a,b){return a.localeCompare(b)})}
var PAYS=['Cash','UPI','Bank','Credit','Other'];
function n(v){return Number(v||0)}
function opts(list,cur){return list.map(function(k){return '<option '+(k===cur?'selected':'')+'>'+k+'</option>'}).join('')}
function formHtml(x){
  var d=x?x.date:iso(),c=x?x.category:'Home',p=x?x.paymentMode:'Cash',a=x?x.amount:'',t=x?x.description:'';
  return '<div class="formgrid">'
    +'<div class="field"><label>Date</label><input id="date" type="date" value="'+d+'"></div>'
    +'<div class="field"><label>Category</label><select id="cat">'+opts(CATS,c)+'</select></div>'
    +'<div class="field"><label>Amount ₹</label><input id="amount" type="number" value="'+a+'"></div>'
    +'<div class="field"><label>Payment Mode</label><select id="pay">'+opts(PAYS,p)+'</select></div>'
    +'<div class="field span4"><label>Description</label><textarea id="desc">'+esc(t||'')+'</textarea></div>'
    +'</div>';
}
function readForm(){return {date:val('date'),category:val('cat'),amount:num(val('amount')),paymentMode:val('pay'),description:val('desc')}}
window.akExpManageCategories=function(){
  db.settings.akashV2=db.settings.akashV2||{};db.settings.akashV2.expenseCategories=Array.isArray(db.settings.akashV2.expenseCategories)?db.settings.akashV2.expenseCategories:[];
  var custom=db.settings.akashV2.expenseCategories.slice().sort(function(a,b){return a.localeCompare(b)});
  var body='<div class="field"><label>New Category</label><input id="akExpNewCategory" placeholder="Enter category name"></div><div class="section"><b>Custom Categories</b>'+ (custom.map(function(x){return '<div class="notice" style="margin-top:6px">'+esc(x)+' <button class="btn sm red" style="float:right" data-name="'+esc(x)+'" onclick="akExpRemoveCategory(this.dataset.name)">Remove</button></div>'}).join('')||'<p class="muted">No custom categories added.</p>')+'</div>';
  modal('Manage Expense Categories',body,function(){var name=val('akExpNewCategory').trim();if(!name)return alert('Enter a category name.');var list=db.settings.akashV2.expenseCategories;if(!list.includes(name))list.push(name);save();closeModal();expRender()});
};
window.akExpRemoveCategory=function(name){
  if(!confirm('Remove '+name+' from the category list? Existing expense records will be preserved.'))return;
  db.settings.akashV2.expenseCategories=(db.settings.akashV2.expenseCategories||[]).filter(function(x){return x!==name});
  closeModal();save();window.akExpManageCategories();
};
window.akExpEdit=function(id){
  var L=AL(),i=L.findIndex(function(x){return x.id===id});if(i<0)return;
  var old=JSON.parse(JSON.stringify(L[i]));
  modal('Edit Expense',formHtml(old),function(){
    try{var r=readForm();if(!r.amount){alert('Amount is required.');return;}Object.assign(L[i],r);audit('UPDATE','Expense',id,old,L[i]);save();closeModal();render('expenses');}
    catch(e){alert('Edit expense error: '+e.message)}
  });
};
window.akExpDel=function(id){
  if(!confirm('Delete this record? The action will be logged.'))return;
  var L=AL(),i=L.findIndex(function(x){return x.id===id});if(i<0)return;
  var old=L.splice(i,1)[0];db.settings.akashV2.__tomb=db.settings.akashV2.__tomb||{};db.settings.akashV2.__tomb.expenses=db.settings.akashV2.__tomb.expenses||{};db.settings.akashV2.__tomb.expenses[String(id)]={id:String(id),deletedAt:new Date().toISOString(),businessId:'akash',userId:'u_akash'};audit('DELETE','Expense',id,old,null);save();render('expenses');
};
function expRender(mode,value){
  mode=mode||'all';value=value||'';
  var sel=document.getElementById('expenseCategory'),cat=sel?sel.value:'all';
  var rows=AL().filter(function(x){return filterDate(x.date,mode,value)}).sort(function(a,b){return String(a.date).localeCompare(String(b.date))});
  if(cat!=='all')rows=rows.filter(function(x){return x.category===cat});
  var total=rows.reduce(function(s,x){return s+n(x.amount)},0);
  var cols=[
    ['Date',function(r){return fmtDate(r.date)}],
    ['Category',function(r){return esc(r.category||'')}],
    ['Amount',function(r){return money(r.amount)}],
    ['Description',function(r){return esc(r.description||'')}],
    ['Payment',function(r){return esc(r.paymentMode||'')}],
    ['Action',function(r){return '<button class="btn sm gray" data-id="'+r.id+'" onclick="akExpEdit(this.dataset.id)">Edit</button> <button class="btn sm red" data-id="'+r.id+'" onclick="akExpDel(this.dataset.id)">Delete</button>'}]
  ];
  shell('expenses',
    dateFilters('expenseFilter','expenses')
    +'<div class="sectionhead"><div><h1>Expenses</h1><div class="muted">Akash only. Filter by date and category. Records are oldest to newest.</div></div><button class="btn red" onclick="addExpense()">+ Add Expense</button></div>'
    +'<div class="card section"><div class="toolbar"><label>Category</label><select id="expenseCategory" onchange="renderExpenses()"><option value="all" '+(cat==='all'?'selected':'')+'>All Categories</option>'+opts(CATS(),cat)+'</select><span class="pill green">Total: '+money(total)+'</span></div></div>'
    +tableRows(rows,cols,false)
    +'<div class="card" style="margin-top:12px;text-align:right"><b>TOTAL: '+money(total)+'</b></div>',
    'Expenses');
}
var origRender=window.render;
var viewMap={dashboard:'dashboard',sales:'renderSales',collections:'renderCollections',milk:'renderMilk',cash:'renderCash',reports:'renderReports',audit:'renderAudit',customers:'renderCustomers'};
window.render=function(k){
  window.__durgaView=k;
  if(k==='expenses')return expRender();
  if(viewMap[k]&&typeof window[viewMap[k]]==='function')return window[viewMap[k]]();
  return origRender.apply(this,arguments);
};
window.renderExpenses=expRender;
document.addEventListener('click',function(ev){
  var el=ev.target,b=el&&el.closest?el.closest('button'):null;if(!b)return;
  var oc=b.getAttribute('onclick')||'';
  if(oc.indexOf('render(')<0||oc.indexOf('expenses')<0)return;
  if(!isAkash())return;
  ev.stopImmediatePropagation();ev.preventDefault();
  try{window.__durgaView='expenses';expRender()}catch(e){alert('Expense error: '+e.message)}
},true);
window.akExpRender=expRender;
window.akExpOpen=function(){try{window.__durgaView='expenses';expRender()}catch(e){alert('Expense error: '+e.message)}};
if(typeof akashDashboard==='function')window.dashboard=akashDashboard;
if(typeof renderAkashSales==='function')window.renderSales=renderAkashSales;
if(typeof renderAkashCollections==='function')window.renderCollections=renderAkashCollections;
if(typeof renderAkashMilk==='function')window.renderMilk=renderAkashMilk;
if(typeof renderAkashCustomers==='function')window.renderCustomers=renderAkashCustomers;
if(typeof renderAkashCash==='function')window.renderCash=renderAkashCash;
if(typeof renderAkashReports==='function')window.renderReports=renderAkashReports;
render('dashboard');
})();
