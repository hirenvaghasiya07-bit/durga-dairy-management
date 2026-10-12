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
  const saleable=x=>num(x.actualQty)*(1+num(x.extraPercent)/100);
  const rateGroups=ss=>{const m=new Map();ss.forEach(x=>{const id=x.categoryId||('r'+num(x.rate)),name=x.categoryName||x.slabName||('₹'+num(x.rate)+' per litre');if(!m.has(id))m.set(id,{id,name});});return [...m.values()].sort((x,y)=>String(x.name).localeCompare(String(y.name)));};
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
      const rows=ss.filter(x=>(x.categoryId||('r'+num(x.rate)))===s.id), q=sum(rows,x=>x.actualQty), sq=sum(rows,saleable), rev=sum(rows,saleAmount), pr=sum(rows,saleProfit), pct=rev?pr/rev*100:0;
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
    modal((edit?'Edit':'Add')+' Bill Purchase','<div class="notice">Main Vendor total is Akash\'s purchase. Akash quantity is the quantity allocated to Akash. Your dairy quantity remains separate.</div><div class="formgrid" style="margin-top:12px"><div class="field"><label>Date</label><input id="apDate" type="date" value="'+item.date+'"></div><div class="field"><label>Purchase Rate ₹/L</label><input id="apRate" type="number" step="0.01" value="'+rate+'"></div><div class="field"><label>Main Vendor • Morning L</label><input id="apVM" type="number" step="0.01" value="'+num(item.vendorMorning)+'"></div><div class="field"><label>Main Vendor • Evening L</label><input id="apVE" type="number" step="0.01" value="'+num(item.vendorEvening)+'"></div><div class="field"><label>Akash • Morning L</label><input id="apAM" type="number" step="0.01" value="'+num(item.akashMorning)+'"></div><div class="field"><label>Akash • Evening L</label><input id="apAE" type="number" step="0.01" value="'+num(item.akashEvening)+'"></div><div class="field"><label>Paid ₹</label><input id="apPaid" type="number" step="0.01" value="'+num(item.paid)+'"></div><div class="field"><label>Vendor / Note</label><input id="apNote" value="'+esc(item.note||'Main Vendor')+'"></div></div><div class="notice" style="margin-top:12px">Main Vendor Qty: <b id="apTotal">0</b> L • Akash Qty: <b id="apAkash">0</b> L • Total ₹: <b id="apAmount">₹0</b> • Balance: <b id="apBal">₹0</b></div>',()=>{
      const next={...item}; next.date=val('apDate');next.rate=effectivePurchaseRate(next.date); next.vendorMorning=num(val('apVM'));next.vendorEvening=num(val('apVE'));next.akashMorning=num(val('apAM'));next.akashEvening=num(val('apAE'));next.paid=num(val('apPaid'));next.note=val('apNote');next.total=purchaseTotal(next)*next.rate;next.akashQty=akashQty(next);next.akashAmount=next.akashQty*next.rate;delete next._edit;
      if(edit){const i=a().purchases.findIndex(x=>x.id===next.id);if(i>=0)a().purchases[i]=next}else a().purchases.push(next);
      audit(edit?'UPDATE':'CREATE','akashPurchase',next.id,null,next);saveA();closeModal();render('milk');
    });
    setTimeout(()=>{['apDate','apVM','apVE','apAM','apAE','apPaid'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>{const d=val('apDate'),r=effectivePurchaseRate(d),t=num(val('apVM'))+num(val('apVE')),q=num(val('apAM'))+num(val('apAE'));document.getElementById('apTotal').textContent=q? (t.toFixed(2)):'0';document.getElementById('apAkash').textContent=q.toFixed(2);document.getElementById('apAmount').textContent=moneyA(t*r);document.getElementById('apBal').textContent=moneyA(t*r-num(val('apPaid')))}));},50);
  }

  function renderAkashMilk(){
    const z=a(), rows=[...z.purchases].sort((x,y)=>String(y.date).localeCompare(String(x.date)));
    const total=sum(rows,purchaseTotal), own=sum(rows,akashQty), paid=sum(rows,x=>x.paid), due=sum(rows,x=>Math.max(0,purchaseAmt(x)-num(x.paid)))+(z.vendors||[]).reduce((s,v)=>s+Math.max(0,num(v.openingBalance)-num(v.openingPaid)),0);
    const rateRows=purchaseRateHistory();
    const body='<div class="sectionhead"><div><h1>Milk Purchase</h1><div class="muted">Main Vendor purchase • Morning/Evening • Akash allocation</div></div><div class="toolbar"><button class="btn green" onclick="akashPurchaseModal()">+ Add Purchase</button><button class="btn gray" onclick="akashRateModal()">Purchase Rate History</button></div></div><div class="grid">'+metric('Main Vendor Purchase',total.toFixed(2)+' L')+metric('Akash Purchase',own.toFixed(2)+' L')+metric('Paid',moneyA(paid))+metric('Total Balance to Pay',moneyA(due),'Vendor payable')+'</div><div class="card section">'+tableRows(rows.map(x=>({...x,id:x.id,_entity:'akashPurchase'})),[['Date',x=>fmtDate(x.date)],['Vendor Morning',x=>num(x.vendorMorning).toFixed(2)+' L'],['Vendor Evening',x=>num(x.vendorEvening).toFixed(2)+' L'],['Total',x=>purchaseTotal(x).toFixed(2)+' L'],['Akash Qty',x=>akashQty(x).toFixed(2)+' L'],['Rate',x=>moneyA(x.rate||effectivePurchaseRate(x.date))],['Amount',x=>moneyA(purchaseTotal(x)*(x.rate||effectivePurchaseRate(x.date)))],['Paid',x=>moneyA(x.paid)],['Balance',x=>moneyA(Math.max(0,purchaseTotal(x)*(x.rate||effectivePurchaseRate(x.date))-num(x.paid)))],['Actions',x=>'<button class="btn sm gray" onclick="akashEditPurchase(\''+x.id+'\')">Edit</button> <button class="btn sm red" onclick="akashDeletePurchase(\''+x.id+'\')">Delete</button>']],false)+'</div><div class="card section"><h2>Rate History</h2>'+tableRows(rateRows.map(x=>({...x,id:x.id,_entity:'akashRate'})),[['Effective Date',x=>fmtDate(x.date)],['Rate',x=>moneyA(x.rate)],['Action',x=>'<button class="btn sm gray" onclick="akashRateModal(\''+x.id+'\')">Edit</button>']],false)+'</div>';
    akashShell('milk',body,'Bill Purchase');
  }

  function akashRateModal(id){
    const item=id?purchaseRateHistory().find(x=>x.id===id):{id:uid(),date:today(),rate:72};
    modal((id?'Edit':'Add')+' Purchase Rate','<div class="notice">The new rate applies from the selected effective date. Old entries keep their historical rate.</div><div class="formgrid" style="margin-top:12px"><div class="field"><label>Effective From</label><input id="arDate" type="date" value="'+item.date+'"></div><div class="field"><label>Rate ₹/L</label><input id="arRate" type="number" step="0.01" value="'+item.rate+'"></div></div>',()=>{
      const n={id:item.id||uid(),date:val('arDate'),rate:num(val('arRate'))};const z=a();const i=z.purchaseRates.findIndex(x=>x.id===n.id);if(i>=0)z.purchaseRates[i]=n;else z.purchaseRates.push(n);z.purchaseRates.sort((x,y)=>String(x.date).localeCompare(String(y.date)));saveA();closeModal();render('milk');
    });
  }

  function akashDateSelects(prefix,date){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date||'')),dy=m?m[3]:'',mo=m?m[2]:'',yr=m?m[1]:String(new Date().getFullYear()),months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    let s='<div class="field"><label>Day</label><select id="'+prefix+'D"><option value="">DD</option>';
    for(let d=1;d<=31;d++){const v=String(d).padStart(2,'0');s+='<option value="'+v+'" '+(dy===v?'selected':'')+'>'+v+'</option>';}
    s+='</select></div><div class="field"><label>Month</label><select id="'+prefix+'M"><option value="">MONTH</option>';
    months.forEach((n,i)=>{const v=String(i+1).padStart(2,'0');s+='<option value="'+v+'" '+(mo===v?'selected':'')+'>'+n+'</option>';});
    s+='</select></div><div class="field"><label>Year</label><select id="'+prefix+'Y"><option value="">YEAR</option>';
    for(let y=1950;y<=2100;y++)s+='<option value="'+y+'" '+(yr===String(y)?'selected':'')+'>'+y+'</option>';
    return s+'</select></div>';
  }
  function akashReadDate(prefix){const d=val(prefix+'D'),m=val(prefix+'M'),y=val(prefix+'Y');if(!d||!m||!y||Number(d)>new Date(Number(y),Number(m),0).getDate())return '';return y+'-'+m+'-'+d;}
  function akashDateLabel(date){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date||''));const names=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];return m?m[3]+'-'+names[Number(m[2])-1]+'-'+m[1]:'--';}
  function akashSaleCategories(){
    const z=a();
    if(!Array.isArray(z.saleCategories)||!z.saleCategories.length)z.saleCategories=[
      {id:'sale74',name:'74 वाला',priceHistory:[{date:'2000-01-01',rate:74}]},
      {id:'sale82',name:'82 वाला',priceHistory:[{date:'2000-01-01',rate:82}]},
      {id:'sale90',name:'90 वाला',priceHistory:[{date:'2000-01-01',rate:90}]}
    ];
    z.saleCategories.forEach((c,i)=>{if(!Array.isArray(c.priceHistory)||!c.priceHistory.length)c.priceHistory=[{date:'2000-01-01',rate:[74,82,90][i]||num(c.rate)||74}];});
    return z.saleCategories;
  }
  function akashCategoryRate(c,date){const h=(c.priceHistory||[]).filter(x=>String(x.date)<=String(date)).sort((x,y)=>String(x.date).localeCompare(String(y.date)));if(h.length)return num(h[h.length-1].rate);const all=(c.priceHistory||[]).slice().sort((x,y)=>String(x.date).localeCompare(String(y.date)));return all.length?num(all[0].rate):num(c.rate);}
  function akashSaleModal(item){
    const edit=!!item;
    const cats=akashSaleCategories();
    if(edit){
      const category=cats.find(c=>c.id===item.categoryId)||cats.find(c=>c.name===item.categoryName)||{id:item.categoryId||'legacy',name:item.categoryName||item.slabName||('₹'+num(item.rate)+' / L'),priceHistory:[{date:'2000-01-01',rate:num(item.rate)}]};const editCats=cats.slice();if(!editCats.some(c=>c.id===category.id))editCats.unshift(category);
      const body='<div class="field"><label>Date • Day / Month / Year</label><div class="formgrid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:6px">'+akashDateSelects('akEditDate',item.date)+'</div></div><div class="formgrid"><div class="field span2"><label>Price Category</label><select id="akEditCat">'+editCats.map(c=>'<option value="'+c.id+'" '+(c.id===category.id?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></div><div class="field"><label>Rate ₹/L</label><input id="akEditRate" type="number" step=".01" value="'+num(item.rate||akashCategoryRate(category,item.date))+'"></div><div class="field"><label>Milk Sold L</label><input id="akEditQty" type="number" step=".01" value="'+num(item.actualQty)+'"></div><div class="field"><label>Cash Received ₹</label><input id="akEditCash" type="number" step=".01" value="'+num(item.cashAmount)+'"></div><div class="field"><label>UPI / Bank ₹</label><input id="akEditBank" type="number" step=".01" value="'+num(item.bankAmount)+'"></div><div class="field"><label>Other Received ₹</label><input id="akEditOther" type="number" step=".01" value="'+num(item.otherAmount)+'"></div></div><div class="notice">Sale amount: <b id="akEditTotal">'+moneyA(num(item.actualQty)*num(item.rate))+'</b></div>';
      modal('Edit Daily Sale Entry',body,()=>{
        const date=akashReadDate('akEditDate'),cat=editCats.find(c=>c.id===val('akEditCat'));if(!date||!cat)return alert('Select a valid date and category.');
        const q=num(val('akEditQty')),r=num(val('akEditRate'))||akashCategoryRate(cat,date),amount=q*r,cash=num(val('akEditCash')),bank=num(val('akEditBank')),other=num(val('akEditOther'));
        if(q<0)return alert('Quantity cannot be negative.');if(cash+bank+other>amount+0.01)return alert('Received amounts cannot exceed sale amount.');
        const stored=a().sales.find(x=>x.id===item.id),old=JSON.parse(JSON.stringify(stored||item)),updated=Object.assign({},stored||item,{date,categoryId:cat.id,categoryName:cat.name,slabId:'',slabName:cat.name,actualQty:q,extraPercent:0,rate:r,saleableQty:q,amount,cashAmount:cash,bankAmount:bank,otherAmount:other,creditAmount:Math.max(0,amount-cash-bank-other),profit:amount-q*effectivePurchaseRate(date)});const idx=a().sales.findIndex(x=>x.id===item.id);if(idx>=0)a().sales[idx]=updated;
        audit('UPDATE','akashSale',item.id,old,updated);saveA();closeModal();render('sales');
      });
      setTimeout(()=>{['akEditQty','akEditRate'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>{const t=document.getElementById('akEditTotal');if(t)t.textContent=moneyA(num(val('akEditQty'))*num(val('akEditRate')))}));},20);
      return;
    }
    const date=window.__akashSalePresetDate||today();window.__akashSalePresetDate='';
    function row(c){const rate=akashCategoryRate(c,date);return '<div class="card" style="padding:9px;margin:0"><div class="formgrid" style="grid-template-columns:minmax(0,1.1fr) minmax(70px,.7fr) minmax(65px,.6fr) minmax(85px,.8fr) minmax(80px,.8fr);gap:6px;align-items:end"><b>'+esc(c.name)+'</b><div class="field"><label>Rate ₹/L</label><input id="akR_'+c.id+'" type="number" step=".01" value="'+rate+'"></div><div class="field"><label>Qty L</label><input id="akQ_'+c.id+'" type="number" step=".01" min="0"></div><div class="field"><label>Sale ₹</label><input id="akA_'+c.id+'" type="number" step=".01" value="0" readonly></div><div class="field"><label>Cash ₹</label><input id="akC_'+c.id+'" type="number" step=".01" value="0"></div><div class="field"><label>UPI / Bank ₹</label><input id="akB_'+c.id+'" type="number" step=".01" value="0"></div></div></div>';}
    const body='<div class="field"><label>Date • Day / Month / Year</label><div class="formgrid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:6px">'+akashDateSelects('akBatchDate',date)+'</div></div><div class="notice">All price categories appear together. The rate is chosen from the selected date’s price history. No slab or extra-water calculation is applied to new entries.</div><div id="akBatchRows" style="display:grid;gap:8px">'+cats.map(row).join('')+'</div><div class="notice">Daily Sale Total: <b id="akBatchTotal">₹0</b></div>';
    modal('Daily Sale • Category-wise Bulk Entry',body,()=>{
      const d=akashReadDate('akBatchDate');if(!d)return alert('Select a valid date.');
      const entries=[];let paymentError='';cats.forEach(c=>{const q=num(val('akQ_'+c.id)),r=num(val('akR_'+c.id)),amount=q*r,cash=num(val('akC_'+c.id)),bank=num(val('akB_'+c.id));if(q>0){if(cash+bank>amount+0.01){paymentError='Received cash/bank cannot exceed sale amount for '+c.name;return;}entries.push({id:uid(),date:d,categoryId:c.id,categoryName:c.name,slabId:'',slabName:c.name,actualQty:q,extraPercent:0,rate:r,saleableQty:q,amount,cashAmount:cash,bankAmount:bank,otherAmount:0,creditAmount:Math.max(0,amount-cash-bank),profit:amount-q*effectivePurchaseRate(d)});}});if(paymentError)return alert(paymentError);
      if(!entries.length)return alert('Enter quantity for at least one category.');
      entries.forEach(n=>{a().sales.push(n);audit('CREATE','akashSale',n.id,null,n);});saveA();closeModal();render('sales');
    });
    function recalc(reset){const d=akashReadDate('akBatchDate')||today();let total=0;cats.forEach(c=>{const q=document.getElementById('akQ_'+c.id),r=document.getElementById('akR_'+c.id),amount=document.getElementById('akA_'+c.id);if(reset&&r)r.value=akashCategoryRate(c,d);if(q&&r&&amount){amount.value=(num(q.value)*num(r.value)).toFixed(2);total+=num(amount.value);}});const t=document.getElementById('akBatchTotal');if(t)t.textContent=moneyA(total);}
    ['akBatchDateD','akBatchDateM','akBatchDateY'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>recalc(true)));
    cats.forEach(c=>{['akQ_'+c.id,'akR_'+c.id].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>recalc(false)));});recalc(false);
  }
  function renderAkashSales(){
    const z=a(),rows=[...z.sales].sort((x,y)=>String(y.date).localeCompare(String(x.date))),rev=sum(rows,saleAmount),profit=sum(rows,saleProfit),actual=sum(rows,x=>x.actualQty),pct=rev?profit/rev*100:0,byDate={};
    rows.forEach(x=>{if(x.date)(byDate[x.date]=byDate[x.date]||[]).push(x);});const dates=Object.keys(byDate).sort((x,y)=>y.localeCompare(x));
    const grouped=dates.map(date=>{const list=byDate[date],total=sum(list,saleAmount),open=!!window.__akashSaleOpen?.[date],cats={};list.forEach(x=>{const n=x.categoryName||x.slabName||('₹'+num(x.rate)+'/L');cats[n]=(cats[n]||0)+saleAmount(x);});const breakdown=Object.keys(cats).map(n=>'<tr><td>'+esc(n)+'</td><td>'+moneyA(cats[n])+'</td></tr>').join(''),detail=list.map(x=>'<tr><td>'+esc(x.categoryName||x.slabName||('₹'+num(x.rate)+'/L'))+'</td><td>'+num(x.actualQty).toFixed(2)+' L</td><td>'+moneyA(x.rate)+'</td><td>'+moneyA(saleAmount(x))+'</td><td>'+moneyA(saleProfit(x))+'</td><td><button class="btn sm gray" data-id="'+x.id+'" onclick="akashEditSale(this.dataset.id)">Edit</button> <button class="btn sm red" data-id="'+x.id+'" onclick="akashDeleteSale(this.dataset.id)">Delete</button></td></tr>').join(''),dt=date.replace(/"/g,'&quot;');return '<div class="card section" style="padding:0;overflow:hidden"><div style="display:flex;gap:8px;align-items:center;padding:10px"><button type="button" onclick="toggleAkashSaleDate(&quot;'+dt+'&quot;)" style="flex:1;display:flex;justify-content:space-between;text-align:left;border:0;background:#fff;padding:8px;cursor:pointer"><span><b>'+akashDateLabel(date)+'</b><span class="muted" style="display:block">'+list.length+' category entries</span></span><span style="text-align:right"><b>'+moneyA(total)+'</b><span class="muted" style="display:block">'+(open?'Hide details':'View details')+'</span></span></button><div class="toolbar"><button class="btn sm gray" onclick="toggleAkashSaleDate(&quot;'+dt+'&quot;)">Edit</button><button class="btn sm red" data-date="'+date+'" onclick="akashDeleteSaleDate(this.dataset.date)">Delete</button></div></div><div style="display:'+(open?'block':'none')+';padding:12px;border-top:1px solid var(--line)"><div class="sectionhead"><h3>Category-wise Sale • '+fmtDate(date)+'</h3><button class="btn sm green" data-date="'+date+'" onclick="akashAddSaleForDate(this.dataset.date)">+ Add Entry</button></div><div class="tablewrap"><table class="table"><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>'+breakdown+'<tr><td><b>Daily Sale Total</b></td><td><b>'+moneyA(total)+'</b></td></tr></tbody></table></div><div class="sectionhead"><h3>Bulk Sale Entries</h3><button class="btn sm red" data-date="'+date+'" onclick="akashDeleteSaleDate(this.dataset.date)">Delete All Bulk Entries</button></div><div class="tablewrap"><table class="table"><thead><tr><th>Category</th><th>Qty</th><th>Rate</th><th>Sale</th><th>Profit</th><th>Actions</th></tr></thead><tbody>'+detail+'</tbody></table></div></div></div>';}).join('');
    const body='<div class="sectionhead"><div><h1>Daily Sale</h1><div class="muted">Date-wise summary • open a date to manage categories</div></div><div class="toolbar"><button class="btn gray" onclick="akashSlabManager()">Create Category / Price</button><button class="btn green" onclick="akashSaleModal()">+ Add Daily Sale</button></div></div><div class="grid">'+metric('Sales',moneyA(rev))+metric('Actual Milk',actual.toFixed(2)+' L')+metric('Profit',moneyA(profit),pct.toFixed(2)+'%')+'</div><div class="card section"><h2>Daily Sale Entries • Date-wise</h2>'+grouped+(dates.length?'':'<div class="empty">No Daily Sale entries.</div>')+'</div>';
    akashShell('sales',body,'Daily Sale');
  }
  function akashSlabModal(id){
    const cats=akashSaleCategories(),old=id?cats.find(c=>c.id===id):null,item=old||{id:uid(),name:'',priceHistory:[{date:today(),rate:74}]},current=akashCategoryRate(item,today());
    const body='<div class="formgrid"><div class="field"><label>Category Name</label><input id="scName" value="'+esc(item.name)+'" placeholder="74 वाला"></div><div class="field"><label>Price ₹/L</label><input id="scRate" type="number" step=".01" value="'+current+'"></div></div><label>Rate Applicable From</label><div class="formgrid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:6px">'+akashDateSelects('scDate',today())+'</div><div class="notice">New price applies from the selected date; older dated sales retain their old price.</div>';
    modal((old?'Edit':'Create')+' Sale Category',body,()=>{const name=val('scName').trim(),d=akashReadDate('scDate'),r=num(val('scRate'));if(!name||!d)return alert('Enter a category name and valid effective date.');const c=old||{id:uid(),priceHistory:[]},previousName=c.name;c.name=name;c.priceHistory=c.priceHistory||[];const ix=c.priceHistory.findIndex(x=>x.date===d),entry={date:d,rate:r};if(ix>=0)c.priceHistory[ix]=entry;else c.priceHistory.push(entry);c.priceHistory.sort((x,y)=>String(x.date).localeCompare(String(y.date)));if(!old)cats.push(c);a().saleCategories=cats;a().sales.forEach(x=>{if(x.categoryId!==c.id)return;const before=JSON.parse(JSON.stringify(x));if(previousName!==name)x.categoryName=name; if(String(x.date)>=String(d)&&num(x.actualQty)>0){const nextRate=akashCategoryRate(c,x.date);if(num(x.rate)!==nextRate){x.rate=nextRate;x.amount=num(x.actualQty)*nextRate;x.extraPercent=0;x.saleableQty=num(x.actualQty);x.profit=x.amount-num(x.actualQty)*effectivePurchaseRate(x.date);x.creditAmount=Math.max(0,x.amount-num(x.cashAmount)-num(x.bankAmount)-num(x.otherAmount));}}if(previousName!==name||String(x.date)>=String(d))audit('UPDATE','akashSale',x.id,before,x);});saveA();closeModal();render('sales');});
  }
  function akashSlabManager(){const cats=akashSaleCategories(),list=cats.map(c=>'<div class="card" style="padding:10px;margin:8px 0"><div class="sectionhead"><div><b>'+esc(c.name)+'</b><div class="muted">Current rate '+moneyA(akashCategoryRate(c,today()))+'/L</div></div><button class="btn sm gray" data-id="'+c.id+'" onclick="akashSlabModal(this.dataset.id)">Edit</button></div></div>').join('');modal('Sale Categories & Prices',list+'<button class="btn green" onclick="closeModal();akashSlabModal()">+ Create Category</button>');}
  window.toggleAkashSaleDate=function(date){window.__akashSaleOpen=window.__akashSaleOpen||{};window.__akashSaleOpen[date]=!window.__akashSaleOpen[date];render('sales');};
  window.akashAddSaleForDate=function(date){window.__akashSalePresetDate=date;window.akashSaleModal();};
  window.akashDeleteSaleDate=function(date){const rows=a().sales.filter(x=>x.date===date);if(!rows.length)return;if(!confirm('Delete all sale category entries for '+fmtDate(date)+'?'))return;rows.forEach(x=>{const i=a().sales.findIndex(y=>y.id===x.id);if(i>=0){a().sales.splice(i,1);audit('DELETE','akashSale',x.id,x,null);}});saveA();render('sales');};
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
    const z=a(), start=iso().slice(0,7)+'-01',end=iso(), ss=periodRows(z.sales,start,end),cs=periodRows(z.collections,start,end),ps=periodRows(z.purchases,start,end),ex=periodRows(z.expenses||[],start,end);
    const salesCash=sum(ss,x=>x.cashAmount),salesBank=sum(ss,x=>x.bankAmount),colCash=sum(cs,x=>x.cashAmount),colBank=sum(cs,x=>x.bankAmount),expenseCash=sum(ex,x=>String(x.paymentMode||'Cash')==='Cash'?x.amount:0),expenseBank=sum(ex,x=>String(x.paymentMode||'')!=='Cash'?x.amount:0),paid=sum(ps,x=>x.paid);
    const cash=salesCash+colCash-expenseCash-paid,bank=salesBank+colBank-expenseBank;
    const body='<div class="sectionhead"><div><h1>Cash Flow</h1><div class="muted">Current month money position</div></div></div><div class="grid">'+metric('Cash In',moneyA(salesCash+colCash))+metric('Bank / UPI In',moneyA(salesBank+colBank))+metric('Cash Out',moneyA(expenseCash+paid))+metric('Cash Balance',moneyA(cash))+metric('Bank Balance',moneyA(bank))+metric('Total Available',moneyA(cash+bank))+'</div><div class="two section"><div class="card"><h2>Cash</h2><p>Daily Sale Cash: <b>'+moneyA(salesCash)+'</b></p><p>Bill Collection Cash: <b>'+moneyA(colCash)+'</b></p><p>Expenses Cash: <b>'+moneyA(expenseCash)+'</b></p><p>Vendor Paid: <b>'+moneyA(paid)+'</b></p><hr><h2>'+moneyA(cash)+'</h2></div><div class="card"><h2>Bank / UPI</h2><p>Daily Sale UPI: <b>'+moneyA(salesBank)+'</b></p><p>Bill Collection UPI: <b>'+moneyA(colBank)+'</b></p><p>Non-cash Expenses: <b>'+moneyA(expenseBank)+'</b></p><hr><h2>'+moneyA(bank)+'</h2></div></div>';
    akashShell('cash',body,'Cash Flow');
  }

  function renderAkashReports(){
    const z=a(), ss=z.sales, ps=z.purchases, cs=z.collections, ex=db.expenses||[];
    const bySlab=rateGroups(ss).map(s=>{const r=ss.filter(x=>('r'+num(x.rate))===s.id),rev=sum(r,saleAmount),pr=sum(r,saleProfit);return '<div class="card"><h3>'+esc(s.name)+'</h3><p>Actual: <b>'+sum(r,x=>x.actualQty).toFixed(2)+' L</b></p><p>Saleable: <b>'+sum(r,saleable).toFixed(2)+' L</b></p><p>Sales: <b>'+moneyA(rev)+'</b></p><p>Profit: <b>'+moneyA(pr)+'</b></p><p>Profit %: <b>'+(rev?(pr/rev*100).toFixed(2):'0')+'%</b></p></div>'}).join('');
    const body='<div class="sectionhead"><div><h1>Akash Reports</h1><div class="muted">Current stored position • all history</div></div></div><div class="grid">'+metric('Purchase',moneyA(sum(ps,purchaseAmt)))+metric('Sales',moneyA(sum(ss,saleAmount)))+metric('Collection',moneyA(sum(cs,x=>x.amount)))+metric('Expense',moneyA(sum(ex,x=>x.amount)))+'</div><div class="sectionhead"><h2>Category-wise Profit</h2></div><div class="two">'+bySlab+'</div><div class="card section"><h2>Daily Position</h2>'+tableRows(ss.map(x=>({...x,id:x.id,_entity:'akashReport'})),[['Date',x=>fmtDate(x.date)],['Price Category',x=>esc(x.slabName&&!/%/.test(x.slabName)?x.slabName:moneyA(x.rate)+' / L')],['Actual',x=>x.actualQty.toFixed(2)+' L'],['Saleable',x=>x.saleableQty.toFixed(2)+' L'],['Sales',x=>moneyA(saleAmount(x))],['Profit',x=>moneyA(saleProfit(x))]],false)+'</div>';
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