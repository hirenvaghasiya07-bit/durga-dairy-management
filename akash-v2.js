/* Akash V2 business layer — Hiren portal untouched */
(function(){
  if(typeof isAkash!=='function'||!isAkash()) return;

  function A(){ db.settings=db.settings||{}; db.settings.akashV2=db.settings.akashV2||{}; const a=db.settings.akashV2;
    a.purchases=Array.isArray(a.purchases)?a.purchases:[];
    a.sales=Array.isArray(a.sales)?a.sales:[];
    a.collections=Array.isArray(a.collections)?a.collections:[];
    a.slabs=Array.isArray(a.slabs)?a.slabs:[{id:'a_slab_25',name:'25% Water • ₹74',waterPercent:25,rate:74},{id:'a_slab_15',name:'15% Water • ₹82',waterPercent:15,rate:82}];
    return a;
  }
  const a=()=>A();
  const saveA=()=>{save();};
  const moneyA=n=>money(num(n));
  const today=()=>iso();
  const rateAt=(date)=>{
    const h=(a().purchaseRates||[]).filter(x=>String(x.date)<=String(date)).sort((x,y)=>String(x.date).localeCompare(String(y.date)));
    return h.length?num(h[h.length-1].rate):72;
  };
  const purchaseTotal=x=>num(x.vendorMorning)+num(x.vendorEvening);
  const akashQty=x=>num(x.akashMorning)+num(x.akashEvening);
  const saleable=x=>num(x.actualQty)*(1+num(x.waterPercent)/100);
  const saleAmount=x=>saleable(x)*num(x.rate);
  const saleCost=x=>num(x.actualQty)*rateAt(x.date);
  const saleProfit=x=>saleAmount(x)-saleCost(x);
  const periodRows=(arr,from,to)=>arr.filter(x=>String(x.date)>=from&&String(x.date)<=to);
  const sum=(arr,fn)=>arr.reduce((s,x)=>s+num(fn(x)),0);

  function ensurePurchaseRates(){
    const z=a(); z.purchaseRates=Array.isArray(z.purchaseRates)?z.purchaseRates:[{date:'2000-01-01',rate:72}];
    return z.purchaseRates;
  }
  function purchaseRateHistory(){
    ensurePurchaseRates();
    return a().purchaseRates.sort((x,y)=>String(x.date).localeCompare(String(y.date)));
  }
  function effectivePurchaseRate(date){const h=purchaseRateHistory().filter(x=>String(x.date)<=String(date));return h.length?num(h[h.length-1].rate):72}

  function akashNavItems(){
    return [['dashboard','⌂ Dashboard'],['sales','▣ Daily Sale'],['collections','▤ Bill Collection'],['milk','🥛 Milk Purchase'],['expenses','₹ Expense'],['cash','◉ Cash Flow'],['reports','▥ Reports'],['audit','◌ Activity Log']].filter(([k])=>allowed(user()?.role,k)||k==='dashboard'||k==='audit');
  }
  const oldNavItems=window.__akashOldNavItems||navItems;
  window.__akashOldNavItems=oldNavItems;
  window.navItems=akashNavItems;

  function akashShell(active,body,title){
    shell(active,body,title);
  }

  function akashDashboard(){
    const z=a(), start=iso().slice(0,7)+'-01', end=iso();
    const ps=periodRows(z.purchases,start,end), ss=periodRows(z.sales,start,end), cs=periodRows(z.collections,start,end), ex=periodRows(db.expenses||[],start,end);
    const vendorPurchase=sum(ps,purchaseTotal), ownPurchase=sum(ps,akashQty);
    const sales=sum(ss,saleAmount), actual=sum(ss,x=>x.actualQty), sellable=sum(ss,saleable), profit=sum(ss,saleProfit);
    const collection=sum(cs,x=>x.amount), exp=sum(ex,x=>x.amount), vendorPaid=sum(ps,x=>x.paid);
    const payable=sum(ps,x=>Math.max(0,purchaseTotal(x)-num(x.paid)));
    const cashIn=sum(ss,x=>x.cashAmount)+sum(cs,x=>x.cashAmount);
    const bankIn=sum(ss,x=>x.bankAmount)+sum(cs,x=>x.bankAmount);
    const cashOut=exp+vendorPaid;
    const cashBalance=cashIn-cashOut, bankBalance=bankIn;
    const margin=sales?profit/sales*100:0;
    const recent=[...ss.map(x=>({date:x.date,type:'Daily Sale',desc:x.slabName,amount:saleAmount(x)})),...cs.map(x=>({date:x.date,type:'Bill Collection',desc:x.note||'Bulk collection',amount:x.amount})),...ps.map(x=>({date:x.date,type:'Milk Purchase',desc:'Main Vendor',amount:purchaseTotal(x)})),...ex.map(x=>({date:x.date,type:'Expense',desc:x.category||'Expense',amount:-num(x.amount)}))].sort((x,y)=>String(y.date).localeCompare(String(x.date))).slice(0,12);
    const slabCards=z.slabs.map(s=>{
      const rows=ss.filter(x=>x.slabId===s.id), q=sum(rows,x=>x.actualQty), sq=sum(rows,saleable), rev=sum(rows,saleAmount), pr=sum(rows,saleProfit), pct=rev?pr/rev*100:0;
      return '<div class="card"><h3 style="margin:0 0 8px">'+esc(s.name)+'</h3><div class="small">Actual Milk</div><b>'+q.toFixed(2)+' L</b><div class="small" style="margin-top:7px">Saleable Milk</div><b>'+sq.toFixed(2)+' L</b><div class="small" style="margin-top:7px">Sales</div><b>'+moneyA(rev)+'</b><div class="small" style="margin-top:7px">Profit</div><b class="'+(pr>=0?'kpiGood':'kpiBad')+'">'+moneyA(pr)+' • '+pct.toFixed(2)+'%</b></div>';
    }).join('');
    const max=Math.max(1,...[vendorPurchase,sales,collection,exp].map(Number));
    const bars=[['Purchase',vendorPurchase],['Sale',sales],['Collection',collection],['Expense',exp]].map(([n,v])=>'<div class="bar" style="height:'+Math.max(8,v/max*145)+'px"><span>'+n+' '+moneyA(v)+'</span></div>').join('');
    const body='<div class="sectionhead"><div><h1>Akash Dashboard</h1><div class="muted">Business position • '+fmtDate(today())+'</div></div><div class="toolbar"><button class="btn green" onclick="akashPurchaseModal()">+ Bill Purchase</button><button class="btn" onclick="akashSaleModal()">+ Daily Sale</button><button class="btn orange" onclick="akashCollectionModal()">+ Bill Collection</button></div></div>'+
      '<div class="grid">'+metric('Total Purchase',moneyA(vendorPurchase),'Main Vendor • current month')+metric('Akash Purchase',ownPurchase.toFixed(2)+' L','Own allocated milk')+metric('Total Sales',moneyA(sales),sellable.toFixed(2)+' L saleable')+metric('Profit',moneyA(profit),margin.toFixed(2)+'% margin')+metric('Bill Collection',moneyA(collection),'Bulk • no customer entry')+metric('Cash Balance',moneyA(cashBalance),'Cash collections − cash out')+metric('Bank / UPI',moneyA(bankBalance),'UPI + Bank collections')+metric('Vendor Payable',moneyA(payable),'Main Vendor pending')+'</div>'+
      '<div class="charts section"><div class="card"><h2>Monthly Movement</h2><div class="chartbar">'+bars+'</div></div><div class="card"><h2>Cash vs Bank</h2><div class="two"><div class="notice"><b>Cash</b><br><span style="font-size:20px">'+moneyA(cashBalance)+'</span></div><div class="notice"><b>Bank / UPI</b><br><span style="font-size:20px">'+moneyA(bankBalance)+'</span></div></div></div><div class="card"><h2>Sales & Profit</h2><div class="notice"><b>Actual Milk</b><br>'+actual.toFixed(2)+' L</div><div class="notice" style="margin-top:8px"><b>Saleable Milk</b><br>'+sellable.toFixed(2)+' L</div><div class="notice" style="margin-top:8px"><b>Profit %</b><br>'+margin.toFixed(2)+'%</div></div></div>'+
      '<div class="sectionhead"><h2>Slab Performance</h2></div><div class="two">'+slabCards+'</div>'+
      '<div class="card section"><div class="sectionhead"><h2>Recent Transactions</h2><span class="muted">Latest business movements</span></div>'+tableRows(recent.map((x,i)=>({...x,id:String(i),_entity:'akashRecent'})),[['Date',x=>fmtDate(x.date)],['Type',x=>esc(x.type)],['Description',x=>esc(x.desc)],['Amount',x=>moneyA(x.amount)]],false)+'</div>'+
      '<div class="card section"><h2>Pending Bulk Bills</h2><div class="muted">Customer-wise balances are not maintained here. Billing remains in the other software.</div></div>';
    akashShell('dashboard',body,'Akash Dashboard');
  }

  function akashPurchaseModal(item){
    item=item||{id:uid(),date:today(),vendorMorning:0,vendorEvening:0,akashMorning:0,akashEvening:0,paid:0};
    const edit=!!item._edit;
    const rate=effectivePurchaseRate(item.date);
    modal((edit?'Edit':'Add')+' Bill Purchase','<div class="notice">Main Vendor total is Akash\'s purchase. Akash quantity is the quantity allocated to Akash. Your dairy quantity remains separate.</div><div class="formgrid" style="margin-top:12px"><div class="field"><label>Date</label><input id="apDate" type="date" value="'+item.date+'"></div><div class="field"><label>Purchase Rate ₹/L</label><input id="apRate" type="number" step="0.01" value="'+rate+'"></div><div class="field"><label>Main Vendor • Morning L</label><input id="apVM" type="number" step="0.01" value="'+num(item.vendorMorning)+'"></div><div class="field"><label>Main Vendor • Evening L</label><input id="apVE" type="number" step="0.01" value="'+num(item.vendorEvening)+'"></div><div class="field"><label>Akash • Morning L</label><input id="apAM" type="number" step="0.01" value="'+num(item.akashMorning)+'"></div><div class="field"><label>Akash • Evening L</label><input id="apAE" type="number" step="0.01" value="'+num(item.akashEvening)+'"></div><div class="field"><label>Paid ₹</label><input id="apPaid" type="number" step="0.01" value="'+num(item.paid)+'"></div><div class="field"><label>Vendor / Note</label><input id="apNote" value="'+esc(item.note||'Main Vendor')+'"></div></div><div class="notice" style="margin-top:12px">Main Vendor Qty: <b id="apTotal">0</b> L • Akash Qty: <b id="apAkash">0</b> L • Total ₹: <b id="apAmount">₹0</b> • Balance: <b id="apBal">₹0</b></div>',()=>{
      const next={...item}; next.date=val('apDate');next.rate=effectivePurchaseRate(next.date); next.vendorMorning=num(val('apVM'));next.vendorEvening=num(val('apVE'));next.akashMorning=num(val('apAM'));next.akashEvening=num(val('apAE'));next.paid=num(val('apPaid'));next.note=val('apNote');next.total=purchaseTotal(next)*next.rate;next.akashQty=akashQty(next);next.akashAmount=next.akashQty*next.rate;delete next._edit;
      if(edit){const i=a().purchases.findIndex(x=>x.id===next.id);if(i>=0)a().purchases[i]=next}else a().purchases.push(next);
      audit(edit?'UPDATE':'CREATE','akashPurchase',next.id,null,next);saveA();closeModal();render('milk');
    });
    setTimeout(()=>{['apDate','apVM','apVE','apAM','apAE','apPaid'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>{const d=val('apDate'),r=effectivePurchaseRate(d),t=num(val('apVM'))+num(val('apVE')),q=num(val('apAM'))+num(val('apAE'));document.getElementById('apTotal').textContent=q? (t.toFixed(2)):'0';document.getElementById('apAkash').textContent=q.toFixed(2);document.getElementById('apAmount').textContent=moneyA(t*r);document.getElementById('apBal').textContent=moneyA(t*r-num(val('apPaid')))}));},50);
  }

  function renderAkashMilk(){
    const z=a(), rows=[...z.purchases].sort((x,y)=>String(y.date).localeCompare(String(x.date)));
    const total=sum(rows,purchaseTotal), own=sum(rows,akashQty), paid=sum(rows,x=>x.paid), due=sum(rows,x=>Math.max(0,purchaseTotal(x)-x.paid));
    const rateRows=purchaseRateHistory();
    const body='<div class="sectionhead"><div><h1>Milk Purchase</h1><div class="muted">Main Vendor purchase • Morning/Evening • Akash allocation</div></div><div class="toolbar"><button class="btn green" onclick="akashPurchaseModal()">+ Add Purchase</button><button class="btn gray" onclick="akashRateModal()">Purchase Rate History</button></div></div><div class="grid">'+metric('Main Vendor Purchase',total.toFixed(2)+' L')+metric('Akash Purchase',own.toFixed(2)+' L')+metric('Paid',moneyA(paid))+metric('Pending',moneyA(due))+'</div><div class="card section">'+tableRows(rows.map(x=>({...x,id:x.id,_entity:'akashPurchase'})),[['Date',x=>fmtDate(x.date)],['Vendor Morning',x=>num(x.vendorMorning).toFixed(2)+' L'],['Vendor Evening',x=>num(x.vendorEvening).toFixed(2)+' L'],['Total',x=>purchaseTotal(x).toFixed(2)+' L'],['Akash Qty',x=>akashQty(x).toFixed(2)+' L'],['Rate',x=>moneyA(x.rate||effectivePurchaseRate(x.date))],['Amount',x=>moneyA(purchaseTotal(x)*(x.rate||effectivePurchaseRate(x.date)))],['Paid',x=>moneyA(x.paid)],['Balance',x=>moneyA(Math.max(0,purchaseTotal(x)*(x.rate||effectivePurchaseRate(x.date))-num(x.paid)))],['Actions',x=>'<button class="btn sm gray" onclick="akashEditPurchase(\''+x.id+'\')">Edit</button> <button class="btn sm red" onclick="akashDeletePurchase(\''+x.id+'\')">Delete</button>']],false)+'</div><div class="card section"><h2>Rate History</h2>'+tableRows(rateRows.map(x=>({...x,id:x.id,_entity:'akashRate'})),[['Effective Date',x=>fmtDate(x.date)],['Rate',x=>moneyA(x.rate)],['Action',x=>'<button class="btn sm gray" onclick="akashRateModal(\''+x.id+'\')">Edit</button>']],false)+'</div>';
    akashShell('milk',body,'Bill Purchase');
  }

  function akashRateModal(id){
    const item=id?purchaseRateHistory().find(x=>x.id===id):{id:uid(),date:today(),rate:72};
    modal((id?'Edit':'Add')+' Purchase Rate','<div class="notice">The new rate applies from the selected effective date. Old entries keep their historical rate.</div><div class="formgrid" style="margin-top:12px"><div class="field"><label>Effective From</label><input id="arDate" type="date" value="'+item.date+'"></div><div class="field"><label>Rate ₹/L</label><input id="arRate" type="number" step="0.01" value="'+item.rate+'"></div></div>',()=>{
      const n={id:item.id||uid(),date:val('arDate'),rate:num(val('arRate'))};const z=a();const i=z.purchaseRates.findIndex(x=>x.id===n.id);if(i>=0)z.purchaseRates[i]=n;else z.purchaseRates.push(n);z.purchaseRates.sort((x,y)=>String(x.date).localeCompare(String(y.date)));saveA();closeModal();render('milk');
    });
  }

  function akashSaleModal(item){
    item=item||{id:uid(),date:today(),slabId:a().slabs[0]?.id||'',actualQty:0,rate:0,waterPercent:0,cashAmount:0,bankAmount:0};
    const edit=!!item._edit;
    const opts=a().slabs.map(s=>'<option value="'+s.id+'" '+(s.id===item.slabId?'selected':'')+'>'+esc(s.name)+'</option>').join('');
    modal((edit?'Edit':'Add')+' Daily Sale','<div class="notice">Select the slab once. Water and saleable quantity are calculated automatically. Actual milk remains the cost quantity.</div><div class="formgrid" style="margin-top:12px"><div class="field"><label>Date</label><input id="asDate" type="date" value="'+item.date+'"></div><div class="field"><label>Slab</label><select id="asSlab">'+opts+'</select></div><div class="field"><label>Actual Milk L</label><input id="asQty" type="number" step="0.01" value="'+num(item.actualQty)+'"></div><div class="field"><label>Sale Rate ₹/L</label><input id="asRate" type="number" step="0.01" value="'+num(item.rate)+'"></div><div class="field"><label>Water %</label><input id="asWater" type="number" step="0.01" value="'+num(item.waterPercent)+'" readonly></div><div class="field"><label>Cash Received ₹</label><input id="asCash" type="number" step="0.01" value="'+num(item.cashAmount)+'"></div><div class="field"><label>UPI / Bank Received ₹</label><input id="asBank" type="number" step="0.01" value="'+num(item.bankAmount)+'"></div></div><div class="notice" style="margin-top:12px">Water: <b id="asWaterQty">0</b> L • Saleable: <b id="asSaleQty">0</b> L • Sale Amount: <b id="asAmount">₹0</b> • Profit: <b id="asProfit">₹0</b> • Profit %: <b id="asPct">0%</b></div>',()=>{
      const s=a().slabs.find(x=>x.id===val('asSlab'));const n={...item};n.date=val('asDate');n.slabId=val('asSlab');n.slabName=s?.name||'';n.actualQty=num(val('asQty'));n.waterPercent=num(s?.waterPercent);n.rate=num(s?.rate);n.cashAmount=num(val('asCash'));n.bankAmount=num(val('asBank'));n.saleableQty=saleable(n);n.amount=saleAmount(n);n.profit=saleProfit(n);delete n._edit;
      if(edit){const i=a().sales.findIndex(x=>x.id===n.id);if(i>=0)a().sales[i]=n}else a().sales.push(n);
      audit(edit?'UPDATE':'CREATE','akashSale',n.id,null,n);saveA();closeModal();render('sales');
    });
    setTimeout(()=>{const rec=()=>{const s=a().slabs.find(x=>x.id===val('asSlab'));if(s){document.getElementById('asWater').value=s.waterPercent;document.getElementById('asRate').value=s.rate}const n={date:val('asDate'),actualQty:num(val('asQty')),waterPercent:num(s?.waterPercent),rate:num(s?.rate)};const w=n.actualQty*n.waterPercent/100;document.getElementById('asWaterQty').textContent=w.toFixed(3);document.getElementById('asSaleQty').textContent=(n.actualQty+w).toFixed(3);document.getElementById('asAmount').textContent=moneyA((n.actualQty+w)*n.rate);document.getElementById('asProfit').textContent=moneyA((n.actualQty+w)*n.rate-n.actualQty*effectivePurchaseRate(n.date));document.getElementById('asPct').textContent=((n.actualQty+w)*n.rate?(((n.actualQty+w)*n.rate-n.actualQty*effectivePurchaseRate(n.date))/((n.actualQty+w)*n.rate)*100).toFixed(2):'0')+'%'};document.getElementById('asSlab')?.addEventListener('change',rec);document.getElementById('asQty')?.addEventListener('input',rec);document.getElementById('asDate')?.addEventListener('change',rec);rec()},50);
  }

  function renderAkashSales(){
    const z=a(), rows=[...z.sales].sort((x,y)=>String(y.date).localeCompare(String(x.date)));
    const rev=sum(rows,saleAmount), profit=sum(rows,saleProfit), actual=sum(rows,x=>x.actualQty), saleq=sum(rows,saleable), pct=rev?profit/rev*100:0;
    const body='<div class="sectionhead"><div><h1>Daily Sale</h1><div class="muted">Slab-based sale • no customer-wise entry</div></div><div class="toolbar"><button class="btn" onclick="akashSaleModal()">+ Add Daily Sale</button><button class="btn gray" onclick="akashSlabModal()">Manage Slabs</button></div></div><div class="grid">'+metric('Sales',moneyA(rev))+metric('Actual Milk',actual.toFixed(2)+' L')+metric('Saleable Milk',saleq.toFixed(2)+' L')+metric('Profit',moneyA(profit),pct.toFixed(2)+'%')+'</div><div class="card section">'+tableRows(rows.map(x=>({...x,id:x.id,_entity:'akashSale'})),[['Date',x=>fmtDate(x.date)],['Slab',x=>esc(x.slabName)],['Actual Milk',x=>num(x.actualQty).toFixed(2)+' L'],['Water',x=>(num(x.saleableQty)-num(x.actualQty)).toFixed(3)+' L'],['Saleable',x=>num(x.saleableQty).toFixed(3)+' L'],['Rate',x=>moneyA(x.rate)],['Sale',x=>moneyA(saleAmount(x))],['Profit',x=>moneyA(saleProfit(x))],['Actions',x=>'<button class="btn sm gray" onclick="akashEditSale(\''+x.id+'\')">Edit</button> <button class="btn sm red" onclick="akashDeleteSale(\''+x.id+'\')">Delete</button>']],false)+'</div>';
    akashShell('sales',body,'Daily Sale');
  }

  function akashSlabModal(id){
    const item=id?a().slabs.find(x=>x.id===id):{id:uid(),name:'',waterPercent:0,rate:0};
    modal((id?'Edit':'Add')+' Sale Slab','<div class="notice">Create a slab once. It will appear in the Daily Sale dropdown every time you enter a sale.</div><div class="formgrid" style="margin-top:12px"><div class="field"><label>Slab Name</label><input id="slName" value="'+esc(item.name)+'" placeholder="25% Water • ₹74"></div><div class="field"><label>Water %</label><input id="slWater" type="number" step="0.01" value="'+num(item.waterPercent)+'"></div><div class="field"><label>Sale Rate ₹/L</label><input id="slRate" type="number" step="0.01" value="'+num(item.rate)+'"></div></div>',()=>{
      const n={id:item.id||uid(),name:val('slName')||((num(val('slWater'))+'% Water • ₹'+num(val('slRate')))),waterPercent:num(val('slWater')),rate:num(val('slRate'))};const z=a();const i=z.slabs.findIndex(x=>x.id===n.id);if(i>=0)z.slabs[i]=n;else z.slabs.push(n);saveA();closeModal();render('sales');
    });
  }
  function akashSlabManager(){
    const list=a().slabs.map(s=>'<div class="notice" style="margin-bottom:8px"><b>'+esc(s.name)+'</b> • '+s.waterPercent+'% water • ₹'+s.rate+' <button class="btn sm gray" style="float:right" onclick="akashSlabModal(\''+s.id+'\')">Edit</button></div>').join('');
    modal('Sale Slabs',list+'<button class="btn green" onclick="closeModal();akashSlabModal()">+ Add Slab</button>');
  }

  function renderAkashCollections(){
    const rows=[...a().collections].sort((x,y)=>String(y.date).localeCompare(String(x.date)));
    const total=sum(rows,x=>x.amount), cash=sum(rows,x=>x.cashAmount), bank=sum(rows,x=>x.bankAmount);
    const body='<div class="sectionhead"><div><h1>Bill Collection</h1><div class="muted">Bulk collection only • customer-wise data is intentionally not stored here</div></div><button class="btn orange" onclick="akashCollectionModal()">+ Bulk Collection</button></div><div class="grid">'+metric('Total Collection',moneyA(total))+metric('Cash',moneyA(cash))+metric('UPI / Bank',moneyA(bank))+metric('Entries',rows.length)+'</div><div class="card section">'+tableRows(rows.map(x=>({...x,id:x.id,_entity:'akashCollection'})),[['Date',x=>fmtDate(x.date)],['Total',x=>moneyA(x.amount)],['Cash',x=>moneyA(x.cashAmount)],['UPI / Bank',x=>moneyA(x.bankAmount)],['Note',x=>esc(x.note||'Bulk collection')],['Actions',x=>'<button class="btn sm gray" onclick="akashEditCollection(\''+x.id+'\')">Edit</button> <button class="btn sm red" onclick="akashDeleteCollection(\''+x.id+'\')">Delete</button>']],false)+'</div>';
    akashShell('collections',body,'Bill Collection');
  }
  function akashCollectionModal(item){
    item=item||{id:uid(),date:today(),cashAmount:0,bankAmount:0,note:'Bulk collection'};
    const edit=!!item._edit;
    modal((edit?'Edit':'Add')+' Bulk Bill Collection','<div class="notice">No customer name is required. Enter the total money received from the other billing software and split it between Cash and UPI / Bank.</div><div class="formgrid" style="margin-top:12px"><div class="field"><label>Date</label><input id="acDate" type="date" value="'+item.date+'"></div><div class="field"><label>Cash ₹</label><input id="acCash" type="number" step="0.01" value="'+num(item.cashAmount)+'"></div><div class="field"><label>UPI / Bank ₹</label><input id="acBank" type="number" step="0.01" value="'+num(item.bankAmount)+'"></div><div class="field"><label>Note</label><input id="acNote" value="'+esc(item.note||'Bulk collection')+'"></div></div><div class="notice" style="margin-top:12px">Total Collection: <b id="acTotal">'+moneyA(num(item.cashAmount)+num(item.bankAmount))+'</b></div>',()=>{
      const n={...item,date:val('acDate'),cashAmount:num(val('acCash')),bankAmount:num(val('acBank')),amount:num(val('acCash'))+num(val('acBank')),note:val('acNote')};delete n._edit;
      if(edit){const i=a().collections.findIndex(x=>x.id===n.id);if(i>=0)a().collections[i]=n}else a().collections.push(n);
      audit(edit?'UPDATE':'CREATE','akashCollection',n.id,null,n);saveA();closeModal();render('collections');
    });
    setTimeout(()=>{['acCash','acBank'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>document.getElementById('acTotal').textContent=moneyA(num(val('acCash'))+num(val('acBank')))))},30);
  }

  function renderAkashExpenses(){
    /* Keep the existing expense module exactly as it is; Akash-only navigation still uses it. */
    renderExpenses();
  }

  function renderAkashCash(){
    const z=a(), start=iso().slice(0,7)+'-01',end=iso(), ss=periodRows(z.sales,start,end),cs=periodRows(z.collections,start,end),ps=periodRows(z.purchases,start,end),ex=periodRows(db.expenses||[],start,end);
    const salesCash=sum(ss,x=>x.cashAmount),salesBank=sum(ss,x=>x.bankAmount),colCash=sum(cs,x=>x.cashAmount),colBank=sum(cs,x=>x.bankAmount),expenseCash=sum(ex,x=>String(x.paymentMode||'Cash')==='Cash'?x.amount:0),expenseBank=sum(ex,x=>String(x.paymentMode||'')!=='Cash'?x.amount:0),paid=sum(ps,x=>x.paid);
    const cash=salesCash+colCash-expenseCash-paid,bank=salesBank+colBank-expenseBank;
    const body='<div class="sectionhead"><div><h1>Cash Flow</h1><div class="muted">Current month money position</div></div></div><div class="grid">'+metric('Cash In',moneyA(salesCash+colCash))+metric('Bank / UPI In',moneyA(salesBank+colBank))+metric('Cash Out',moneyA(expenseCash+paid))+metric('Cash Balance',moneyA(cash))+metric('Bank Balance',moneyA(bank))+metric('Total Available',moneyA(cash+bank))+'</div><div class="two section"><div class="card"><h2>Cash</h2><p>Daily Sale Cash: <b>'+moneyA(salesCash)+'</b></p><p>Bill Collection Cash: <b>'+moneyA(colCash)+'</b></p><p>Expenses Cash: <b>'+moneyA(expenseCash)+'</b></p><p>Vendor Paid: <b>'+moneyA(paid)+'</b></p><hr><h2>'+moneyA(cash)+'</h2></div><div class="card"><h2>Bank / UPI</h2><p>Daily Sale UPI: <b>'+moneyA(salesBank)+'</b></p><p>Bill Collection UPI: <b>'+moneyA(colBank)+'</b></p><p>Non-cash Expenses: <b>'+moneyA(expenseBank)+'</b></p><hr><h2>'+moneyA(bank)+'</h2></div></div>';
    akashShell('cash',body,'Cash Flow');
  }

  function renderAkashReports(){
    const z=a(), ss=z.sales, ps=z.purchases, cs=z.collections, ex=db.expenses||[];
    const bySlab=z.slabs.map(s=>{const r=ss.filter(x=>x.slabId===s.id),rev=sum(r,saleAmount),pr=sum(r,saleProfit);return '<div class="card"><h3>'+esc(s.name)+'</h3><p>Actual: <b>'+sum(r,x=>x.actualQty).toFixed(2)+' L</b></p><p>Saleable: <b>'+sum(r,saleable).toFixed(2)+' L</b></p><p>Sales: <b>'+moneyA(rev)+'</b></p><p>Profit: <b>'+moneyA(pr)+'</b></p><p>Profit %: <b>'+(rev?(pr/rev*100).toFixed(2):'0')+'%</b></p></div>'}).join('');
    const body='<div class="sectionhead"><div><h1>Akash Reports</h1><div class="muted">Current stored position • all history</div></div></div><div class="grid">'+metric('Purchase',moneyA(sum(ps,purchaseTotal)))+metric('Sales',moneyA(sum(ss,saleAmount)))+metric('Collection',moneyA(sum(cs,x=>x.amount)))+metric('Expense',moneyA(sum(ex,x=>x.amount)))+'</div><div class="sectionhead"><h2>Slab-wise Profit</h2></div><div class="two">'+bySlab+'</div><div class="card section"><h2>Daily Position</h2>'+tableRows(ss.map(x=>({...x,id:x.id,_entity:'akashReport'})),[['Date',x=>fmtDate(x.date)],['Slab',x=>esc(x.slabName)],['Actual',x=>x.actualQty.toFixed(2)+' L'],['Saleable',x=>x.saleableQty.toFixed(2)+' L'],['Sales',x=>moneyA(saleAmount(x))],['Profit',x=>moneyA(saleProfit(x))]],false)+'</div>';
    akashShell('reports',body,'Reports');
  }

  function renderAkashCustomers(){
    const body='<div class="sectionhead"><div><h1>Customers</h1><div class="muted">Customer-wise billing is not maintained in Akash software.</div></div></div><div class="card"><h2>Bulk Billing Workflow</h2><p>Customer bills are prepared in the other billing software.</p><p>Here you only enter the total amount received for the day/period.</p><p>Use <b>Bill Collection</b> to split Cash and UPI / Bank.</p></div>';
    akashShell('customers',body,'Customers');
  }

  function editRow(arr,id,fn){const x=arr.find(r=>r.id===id);if(x)fn(x)}
  window.akashPurchaseModal=akashPurchaseModal;window.akashSaleModal=akashSaleModal;window.akashCollectionModal=akashCollectionModal;window.akashSlabModal=akashSlabModal;window.akashSlabManager=akashSlabManager;window.akashRateModal=akashRateModal;
  window.akashEditPurchase=id=>{const x=a().purchases.find(r=>r.id===id);if(x)akashPurchaseModal({...x,_edit:true})};
  window.akashDeletePurchase=id=>{if(!confirm('Delete this purchase entry?'))return;const i=a().purchases.findIndex(x=>x.id===id);if(i>=0){const old=a().purchases[i];a().purchases.splice(i,1);audit('DELETE','akashPurchase',id,old,null);saveA();render('milk')}};
  window.akashEditSale=id=>{const x=a().sales.find(r=>r.id===id);if(x)akashSaleModal({...x,_edit:true})};
  window.akashDeleteSale=id=>{if(!confirm('Delete this sale entry?'))return;const i=a().sales.findIndex(x=>x.id===id);if(i>=0){const old=a().sales[i];a().sales.splice(i,1);audit('DELETE','akashSale',id,old,null);saveA();render('sales')}};
  window.akashEditCollection=id=>{const x=a().collections.find(r=>r.id===id);if(x)akashCollectionModal({...x,_edit:true})};
  window.akashDeleteCollection=id=>{if(!confirm('Delete this collection entry?'))return;const i=a().collections.findIndex(x=>x.id===id);if(i>=0){const old=a().collections[i];a().collections.splice(i,1);audit('DELETE','akashCollection',id,old,null);saveA();render('collections')}};

  window.renderSales=function(){if(isAkash())return renderAkashSales();return undefined};
  window.renderCollections=function(){if(isAkash())return renderAkashCollections();return undefined};
  window.renderMilk=function(){if(isAkash())return renderAkashMilk();return undefined};
  window.renderCustomers=function(){if(isAkash())return renderAkashCustomers();return undefined};
  window.renderCash=function(){if(isAkash())return renderAkashCash();return undefined};
  window.renderReports=function(){if(isAkash())return renderAkashReports();return undefined};
  window.dashboard=function(){if(isAkash())return akashDashboard();return undefined};
  window.renderExpenses=function(){if(isAkash()){return renderExpensesOriginal?renderExpensesOriginal():undefined;}};
  if(!window.renderExpensesOriginal) window.renderExpensesOriginal=window.renderExpenses;
  /* Keep original expense renderer by capturing it before replacing nav; no override needed. */
  window.render=function(k){
    window.__durgaView=k;
    if(!isAkash()) return;
    if(k==='dashboard')return akashDashboard();
    if(k==='sales')return renderAkashSales();
    if(k==='collections')return renderAkashCollections();
    if(k==='milk')return renderAkashMilk();
    if(k==='expenses')return renderExpensesOriginal?renderExpensesOriginal():renderExpenses();
    if(k==='cash')return renderAkashCash();
    if(k==='reports')return renderAkashReports();
    if(k==='audit')return renderAudit();
    if(k==='customers')return renderAkashCustomers();
    /* hidden legacy screens are not navigated */
  };
  /* Fix expense capture: app.js has already defined it; preserve the original under a safe alias. */
  if(!window.__akashBooted){
    window.__akashBooted=true;
    render('dashboard');
  }
})();