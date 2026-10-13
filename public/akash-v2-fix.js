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
    +'<div class="field"><label>Category</label><select id="cat">'+opts(CATS().concat(c&&!CATS().includes(c)?[c]:[]),c)+'</select></div>'
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
window.addExpense=function(){
  modal('Add Expense',formHtml(null),function(){
    var r=readForm();
    if(!r.date||!r.amount||r.amount<=0)return alert('Select a date and enter an amount greater than zero.');
    var rec={id:uid(),date:r.date,category:r.category,amount:r.amount,paymentMode:r.paymentMode,description:r.description,businessId:'akash',userId:user()?.id||'u_akash',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    AL().push(rec);audit('CREATE','Expense',rec.id,null,rec);save();closeModal();render('expenses');
  });
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
function akExpenseSafeId(v){return String(v).replace(/[^a-zA-Z0-9_-]/g,'_')}
window.akExpEditDate=function(date){
 var ids=(window.__akExpenseVisibleIdsByDate||{})[date]||[],rows=ids.map(function(id){return AL().find(function(x){return x.id===id})}).filter(Boolean);if(!rows.length)return alert('No visible expense entries for this date.');
 var pays=['Cash','UPI','Bank','Credit','Other'];
 var body='<div class="field"><label>Apply date to these entries</label><input type="date" id="akExpenseGroupDate" value="'+date+'"></div>'+rows.map(function(x){var id=akExpenseSafeId(x.id);return '<div class="card" style="margin:8px 0;padding:10px"><b>'+esc(x.category||'Expense')+' • '+money(x.amount)+'</b><div class="formgrid"><div class="field"><label>Category</label><select id="akEgc_'+id+'">'+[...new Set(CATS().concat(x.category||[]))].filter(Boolean).map(function(c){return '<option value="'+esc(c)+'" '+(c===x.category?'selected':'')+'>'+esc(c)+'</option>'}).join('')+'</select></div><div class="field"><label>Amount ₹</label><input id="akEga_'+id+'" type="number" step="0.01" value="'+n(x.amount)+'"></div><div class="field"><label>Payment</label><select id="akEgp_'+id+'">'+pays.map(function(p){return '<option '+(p===(x.paymentMode||'Cash')?'selected':'')+'>'+p+'</option>'}).join('')+'</select></div><div class="field span2"><label>Description</label><textarea id="akEgd_'+id+'">'+esc(x.description||'')+'</textarea></div></div></div>'}).join('');
 modal('Edit Expense Entries • '+fmtDate(date),body,function(){var newDate=val('akExpenseGroupDate');if(!newDate)return alert('Select a valid date.');for(var x of rows){var id=akExpenseSafeId(x.id),amount=n(val('akEga_'+id)),category=val('akEgc_'+id),description=val('akEgd_'+id);if(amount<=0)return alert('Every expense amount must be greater than zero.');if(category==='Home'&&!description.trim())return alert('Home expense description is required.');}rows.forEach(function(x){var id=akExpenseSafeId(x.id),before=JSON.parse(JSON.stringify(x));Object.assign(x,{date:newDate,category:val('akEgc_'+id),amount:n(val('akEga_'+id)),paymentMode:val('akEgp_'+id),description:val('akEgd_'+id),updatedAt:new Date().toISOString()});audit('UPDATE','Expense',x.id,before,x)});save();closeModal();render('expenses')});
};
window.akExpDelDate=function(date){var ids=(window.__akExpenseVisibleIdsByDate||{})[date]||[],rows=ids.map(function(id){return AL().find(function(x){return x.id===id})}).filter(Boolean);if(!rows.length)return alert('No visible expense entries for this date.');if(!confirm('Delete '+rows.length+' visible expense entries dated '+fmtDate(date)+'? This cannot be undone from this screen.'))return;var tomb=db.settings.akashV2.__tomb=db.settings.akashV2.__tomb||{};tomb.expenses=tomb.expenses||{};rows.forEach(function(x){var list=AL(),i=list.findIndex(function(y){return y.id===x.id});if(i>=0){var old=list.splice(i,1)[0];tomb.expenses[String(old.id)]={id:String(old.id),deletedAt:new Date().toISOString(),businessId:'akash',userId:user()?.id||'u_akash'};audit('DELETE','Expense',old.id,old,null)}});save();render('expenses')};
function toggleAkExpenseDate(date){window.__akExpenseOpenDates=window.__akExpenseOpenDates||{};window.__akExpenseOpenDates[date]=!window.__akExpenseOpenDates[date];expRender(window.__akExpenseMode||'all',window.__akExpenseValue||'')}
function expRender(mode,value){
  mode=mode||'all';value=value||'';window.__akExpenseMode=mode;window.__akExpenseValue=value;
  var sel=document.getElementById('expenseCategory'),cat=sel?sel.value:'all';
  var rows=AL().filter(function(x){return filterDate(x.date,mode,value)}).sort(function(a,b){return String(b.date).localeCompare(String(a.date))});
  if(cat!=='all')rows=rows.filter(function(x){return x.category===cat});
  var total=rows.reduce(function(s,x){return s+n(x.amount)},0),byDate={};
  rows.forEach(function(x){if(x.date)(byDate[x.date]=byDate[x.date]||[]).push(x)});
  var dates=Object.keys(byDate).sort(function(a,b){return b.localeCompare(a)});
  var grouped=dates.map(function(date){
    var list=byDate[date],dayTotal=list.reduce(function(s,x){return s+n(x.amount)},0),open=!!window.__akExpenseOpenDates?.[date],byCat={};
    list.forEach(function(x){var c=x.category||'Uncategorized';byCat[c]=(byCat[c]||0)+n(x.amount)});
    var breakdown=Object.keys(byCat).sort().map(function(c){return '<tr><td>'+esc(c)+'</td><td>'+money(byCat[c])+'</td></tr>'}).join('');
    var details=list.map(function(x){return '<tr><td>'+esc(x.category||'')+'</td><td>'+money(x.amount)+'</td><td>'+esc(x.description||'')+'</td><td>'+esc(x.paymentMode||'')+'</td><td><button class="btn sm gray" data-id="'+x.id+'" onclick="akExpEdit(this.dataset.id)">Edit</button> <button class="btn sm red" data-id="'+x.id+'" onclick="akExpDel(this.dataset.id)">Delete</button></td></tr>'}).join('');
    window.__akExpenseVisibleIdsByDate=window.__akExpenseVisibleIdsByDate||{};window.__akExpenseVisibleIdsByDate[date]=list.map(function(x){return x.id});
    return '<div class="card section" style="padding:0;overflow:hidden"><div style="display:flex;gap:8px;align-items:center;padding:6px 10px"><button type="button" data-date="'+date+'" onclick="toggleAkExpenseDate(this.dataset.date)" style="flex:1;min-width:0;display:flex;justify-content:space-between;align-items:center;text-align:left;border:0;background:transparent;padding:8px;cursor:pointer"><span><b>'+fmtDate(date)+'</b><span class="muted" style="display:block">'+list.length+' expense entries</span></span><span style="text-align:right"><b>'+money(dayTotal)+'</b><span class="muted" style="display:block">'+(open?'Hide details':'View details')+'</span></span></button><div class="toolbar"><button class="btn sm gray" data-date="'+date+'" onclick="akExpEditDate(this.dataset.date)">Edit Entries</button><button class="btn sm red" data-date="'+date+'" onclick="akExpDelDate(this.dataset.date)">Delete Entries</button></div></div><div style="display:'+(open?'block':'none')+';padding:12px;border-top:1px solid var(--line)"><h3>Expense history • '+fmtDate(date)+'</h3><div class="tablewrap"><table class="table"><thead><tr><th>Category</th><th>Category Total</th></tr></thead><tbody>'+breakdown+'<tr><td><b>Day Total</b></td><td><b>'+money(dayTotal)+'</b></td></tr></tbody></table></div><div class="tablewrap"><table class="table"><thead><tr><th>Category</th><th>Amount</th><th>Description</th><th>Payment</th><th>Actions</th></tr></thead><tbody>'+details+'</tbody></table></div><div style="text-align:right"><b>Date Total: '+money(dayTotal)+'</b></div></div></div>';
  }).join('');
  shell('expenses',
    dateFilters('expenseFilter','expenses')
    +'<div class="sectionhead"><div><h1>Expenses</h1><div class="muted">Akash expenses grouped by date. Open a date to edit or delete individual entries.</div></div><div class="toolbar"><button class="btn red" onclick="addExpense()">+ Add Expense</button><button class="btn gray" onclick="akExpManageCategories()">Manage Categories</button></div></div>'
    +'<div class="card section"><div class="toolbar"><label>Category</label><select id="expenseCategory" onchange="renderExpenses()"><option value="all" '+(cat==='all'?'selected':'')+'>All Categories</option>'+opts(CATS(),cat)+'</select><span class="pill green">Total: '+money(total)+'</span></div></div>'
    +'<div class="card section"><h2>Expense Entries • Date-wise</h2>'+grouped+(dates.length?'':'<div class="empty">No expenses for this period.</div>')+'</div>'
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
