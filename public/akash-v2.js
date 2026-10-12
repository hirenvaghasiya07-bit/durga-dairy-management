/* Akash V2 business layer — Hiren portal untouched */
(function(){
  if(typeof isAkash!=='function'||!isAkash()) return;

  function A(){ db.settings=db.settings||{}; db.settings.akashV2=db.settings.akashV2||{}; const a=db.settings.akashV2;
    a.purchases=Array.isArray(a.purchases)?a.purchases:[];
    a.sales=Array.isArray(a.sales)?a.sales:[];
    a.collections=Array.isArray(a.collections)?a.collections:[];
    a.slabs=Array.isArray(a.slabs)?a.slabs:[{id:'a_slab_25',name:'₹74 / L',extraPercent:25,rate:74},{id:'a_slab_15',name:'₹82 / L',extraPercent:15,rate:82}];
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
  const purchaseTotal=x=>num(x.vendorMorning)+num(x.vendorEvening);const purchaseAmt=x=>purchaseTotal(x)*num(x.rate||effectivePurchaseRate(x.date));
  const akashQty=x=>num(x.akashMorning)+num(x.akashEvening);
  const saleable=x=>num(x.actualQty);
  const rateGroups=ss=>[...new Set(ss.map(x=>num(x.rate)))].sort((p,q)=>p-q).map(r=>({id:'r'+r,name:'₹'+r+' per litre'}));
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
    const ps=periodRows(z.purchases,start,end), ss=periodRows(z.sales,start,end), cs=periodRows(z.collections,start,end), ex=periodRows(z.expenses||[],start,end);
    const vendorPurchase=sum(ps,purchaseAmt), ownPurchase=sum(ps,akashQty);
    const sales=sum(ss,saleAmount), actual=sum(ss,x=>x.actualQty), sellable=sum(ss,saleable), profit=sum(ss,saleProfit);
    const collection=sum(cs,x=>x.amount), exp=sum(ex,x=>x.amount), vendorPaid=sum(ps,x=>x.paid);
    const payable=(z.vendors||[]).reduce((s,v)=>s+Math.max(0,num(v.openingBalance)-num(v.openingPaid)),0)+sum(z.purchases,x=>Math.max(0,purchaseAmt(x)-num(x.paid)));const vb={};(z.vendors||[]).forEach(v=>{const o=Math.max(0,num(v.openingBalance)-num(v.openingPaid));if(o)vb[v.name]=o});z.purchases.forEach(x=>{const k=x.vendor||"Main Vendor";vb[k]=(vb[k]||0)+Math.max(0,purchaseAmt(x)-num(x.paid))});const vbText=Object.keys(vb).map(k=>esc(k)+": "+moneyA(vb[k])).join(" • ")||"No pending";
    const cashIn=sum(ss,x=>x.cashAmount)+sum(cs,x=>x.cashAmount);
    const bankIn=sum(ss,x=>x.bankAmount)+sum(cs,x=>x.bankAmount);
    const cashOut=exp+vendorPaid;
    const cashBalance=cashIn-cashOut, bankBalance=bankIn;
    const margin=sales?profit/sales*100:0;
    const recent=[...ss.map(x=>({date:x.date,type:'Daily Sale',desc:x.slabName,amount:saleAmount(x)})),...cs.map(x=>({date:x.date,type:'Bill Collection',desc:x.note||'Bulk collection',amount:x.amount})),...ps.map(x=>({date:x.date,type:'Milk Purchase',desc:'Main Vendor',amount:purchaseAmt(x)})),...ex.map(x=>({date:x.date,type:'Expense',desc:x.category||'Expense',amount:-num(x.amount)}))].sort((x,y)=>String(y.date).localeCompare(String(x.date))).slice(0,12);
    const slabCards=rateGroups(ss).map(s=>{
      const rows=ss.filter(x=>('r'+num(x.rate))===s.id), q=sum(rows,x=>x.actualQty), sq=sum(rows,saleable), rev=sum(rows,saleAmount), pr=sum(rows,saleProfit), pct=rev?pr/rev*100:0;
      return '<div class="card"><h3 style="margin:0 0 8px">'+esc(s.name)+'</h3><div class="small">Actual Milk</div><b>'+q.toFixed(2)+' L</b><div class="small" style="margin-top:7px">Saleable Milk</div><b>'+sq.toFixed(2)+' L</b><div class="small" style="margin-top:7px">Sales</div><b>'+moneyA(rev)+'</b><div class="small" style="margin-top:7px">Profit</div><b class="'+(pr>=0?'kpiGood':'kpiBad')+'">'+moneyA(pr)+' • '+pct.toFixed(2)+'%</b></div>';
    }).join('');
    const max=Math.max(1,...[vendorPurchase,sales,collection,exp].map(Number));
    const bars=[['Purchase',vendorPurchase],['Sale',sales],['Collection',collection],['Expense',exp]].map(([n,v])=>'<div class="bar" style="height:'+Math.max(8,v/max*145)+'px"><span>'+n+' '+moneyA(v)+'</span></div>').join('');
    const body='<div class="sectionhead"><div><h1>Akash Dashboard</h1><div class="muted">Business position • '+fmtDate(today())+'</div></div><div class="toolbar"><button class="btn green" onclick="akashPurchaseModal()">+ Bill Purchase</button><button class="btn" onclick="akashSaleModal()">+ Daily Sale</button><button class="btn orange" onclick="akashCollectionModal()">+ Bill Collection</button><button class="btn" onclick="akExpOpen()">₹ Expense</button></div></div>'+
      '<div class="grid">'+metric('Total Purchase',moneyA(vendorPurchase),'Main Vendor • current month')+metric('Akash Purchase',ownPurchase.toFixed(2)+' L','Own allocated milk')+metric('Total Sales',moneyA(sales),sellable.toFixed(2)+' L saleable')+metric('Profit',moneyA(profit),margin.toFixed(2)+'% margin')+metric('Bill Collection',moneyA(collection),'Bulk • no customer entry')+metric('Cash Balance',moneyA(cashBalance),'Cash collections − cash out')+metric('Bank / UPI',moneyA(bankBalance),'UPI + Bank collections')+metric('Vendor Payable',moneyA(payable),vbText)+'</div>'+
      '<div class="charts section"><div class="card"><h2>Monthly Movement</h2><div class="chartbar">'+bars+'</div></div><div class="card"><h2>Cash vs Bank</h2><div class="two"><div class="notice"><b>Cash</b><br><span style="font-size:20px">'+moneyA(cashBalance)+'</span></div><div class="notice"><b>Bank / UPI</b><br><span style="font-size:20px">'+moneyA(bankBalance)+'</span></div></div></div><div class="card"><h2>Sales & Profit</h2><div class="notice"><b>Actual Milk</b><br>'+actual.toFixed(2)+' L</div><div class="notice" style="margin-top:8px"><b>Saleable Milk</b><br>'+sellable.toFixed(2)+' L</div><div class="notice" style="margin-top:8px"><b>Profit %</b><br>'+margin.toFixed(2)+'%</div></div></div>'+
      '<div class="sectionhead"><h2>Sale Rate Performance</h2></div><div class="two">'+slabCards+'</div>'+
      '<div class="card section"><div class="sectionhead"><h2>Recent Transactions</h2><span class="muted">Latest business movements</span></div>'+tableRows(recent.map((x,i)=>({...x,id:String(i),_entity:'akashRecent'})),[['Date',x=>fmtDate(x.date)],['Type',x=>esc(x.type)],['Description',x=>esc(x.desc)],['Amount',x=>moneyA(x.amount)]],false)+'</div>'+
      '<div class="card section"><h2>Pending Bulk Bills</h2><div class="muted">Customer-wise balances are not maintained here. Billing remains in the other software.</div></div>';
    akashShell('dashboard',body,'Akash Dashboard');
  }

  function akashPurchaseModal(item){
    item=item||{id:uid(),date:today(),vendorMorning:0,vendorEvening:0,akashMorning:0,akashEvening:0,paid:0};
    const edit=!!item._edit;
    const rate=effectivePurchaseRate(item.date);
    modal((edit?'Edit':'Add')+' Bill Purchase','<div class="notice">Main Vendor total is Akash\'s purchase. Akash quantity is the quantity allocated to Akash. Your dairy quantity remains separate.</div><div class="formgrid" style="margin-top: --- TRUNCATED --- 29,474 chars