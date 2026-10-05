const BASE_KEY='durga-dairy-v2-db';
let BUSINESS_ID=sessionStorage.getItem('durga-business')||'';
let KEY=BUSINESS_ID?BASE_KEY+'-'+BUSINESS_ID:BASE_KEY;
function businessName(){return BUSINESS_ID==='akash'?'Akash':BUSINESS_ID==='zero-two'?'Zero Two':'Hiren'}
function isAkash(){return BUSINESS_ID==='akash'}
function isZeroTwo(){return BUSINESS_ID==='zero-two'}
function businessDBKey(id=BUSINESS_ID){return BASE_KEY+'-'+id}
function selectBusiness(id){BUSINESS_ID=id;sessionStorage.setItem('durga-business',id);KEY=businessDBKey(id);location.reload()}
function portalChooser(){document.getElementById('root').innerHTML='<div class="login"><div class="loginbox"><h1>Durga Dairy</h1><p>Select Access</p><div class="notice">Hiren અને Akashના અલગ data યથાવત રહેશે. Zero Two માત્ર Full Access માટે બંનેનો combined report બતાવશે.</div><div class="toolbar" style="margin-top:16px"><button class="btn" style="width:100%;margin-bottom:8px" onclick="selectBusiness(\'hiren\')">Hiren</button><button class="btn green" style="width:100%;margin-bottom:8px" onclick="selectBusiness(\'akash\')">Akash</button><button class="btn orange" style="width:100%" onclick="selectBusiness(\'zero-two\')">All</button></div></div></div>'}
const CLOUD_API=location.hostname==='durga-dairy-live.hiren-vaghasiya07.workers.dev'?'https://durga-dairy-live-api.hiren-vaghasiya07.workers.dev':((window.DURGA_CONFIG&&window.DURGA_CONFIG.apiBase)||'');
const CLOUD_SYNC_SCHEMA='2026-10-05-v6';
let cloudState={status:CLOUD_API?'connecting':'local',lastSync:null,error:null};
const SYNC_ARRAYS=['users','prices','sales','collections','milk','stockPurchases','stockUsage','expenses','customers','vendors','vendorPayments','cashChecks','audit','customerSales','customerPayments','customerBills'];
function cloneCloud(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function recordTime(x){return x?.updatedAt||x?.updated_at||x?.createdAt||x?.created_at||''}
function newerRecord(a,b){const ta=recordTime(a),tb=recordTime(b);if(ta&&tb)return String(ta)>=String(tb)?a:b;if(tb&&!ta)return b;if(ta&&!tb)return a;return a}
function mergeCloudDB(local,remote){
  const base=structuredClone?structuredClone(defaultDB):JSON.parse(JSON.stringify(defaultDB)),out=Object.assign(base,remote||{},local||{});
  for(const key of SYNC_ARRAYS){
    const lm=Array.isArray(local?.[key])?local[key]:[],rm=Array.isArray(remote?.[key])?remote[key]:[],map=new Map();
    for(const x of rm)if(x?.id!=null)map.set(String(x.id),x);
    for(const x of lm)if(x?.id!=null){const id=String(x.id);map.set(id,map.has(id)?newerRecord(x,map.get(id)):x)}
    out[key]=[...map.values(),...rm.filter(x=>x?.id==null),...lm.filter(x=>x?.id==null)];
  }
  out.currentUser=local?.currentUser||remote?.currentUser||null;out.version=Math.max(num(local?.version),num(remote?.version),5);return out;
}
function cloudBusiness(remote){return BUSINESS_ID==='akash'?remote?.settings?.__businesses?.akash||null:remote||null}
function replaceFromCloud(remote){const currentUser=db.currentUser,source=cloudBusiness(remote);if(source){const base=structuredClone?structuredClone(defaultDB):JSON.parse(JSON.stringify(defaultDB)),cloud=cloneCloud(source);if(Array.isArray(cloud.users))cloud.users=cloud.users.map(u=>({...((base.users||[]).find(x=>x.id===u.id)||{}),...u}));db=Object.assign(base,cloud)}db.currentUser=currentUser;db.businessId=BUSINESS_ID;localStorage.setItem(KEY,JSON.stringify(db));window.__cloudSnapshot=cloneCloud(db)}
function syncSchemaKey(){return KEY+'::cloud-schema'}
function cloudSchemaReady(){return localStorage.getItem(syncSchemaKey())===CLOUD_SYNC_SCHEMA}
function setCloudSchema(){localStorage.setItem(syncSchemaKey(),CLOUD_SYNC_SCHEMA)}
async function ensureCloudToken(base){
  let token=localStorage.getItem('durga-token')||'';
  try{const test=await fetch(base+'/api/state?ts='+Date.now(),{method:'GET',headers:{'Authorization':'Bearer '+token,'Accept':'application/json','Cache-Control':'no-cache'},cache:'no-store'});if(test.ok)return token;if(test.status!==401&&test.status!==403)return token}catch(e){}
  const u=db.users.find(x=>x.id===db.currentUser);if(!u?.email||!u?.pin)return token;
  try{const lr=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({email:u.email,password:u.pin,workspaceId:'durga-dairy-'+BUSINESS_ID})});if(lr.ok){const j=await lr.json();token=j.token||'';if(token)localStorage.setItem('durga-token',token)}}catch(e){}
  return token;
}
async function cloudStateFetch(base,token){
  const t=await ensureCloudToken(base),r=await fetch(base+'/api/state?ts='+Date.now(),{method:'GET',headers:{'Authorization':'Bearer '+t,'Accept':'application/json','Cache-Control':'no-cache'},cache:'no-store'});if(!r.ok)throw new Error('Cloud read failed ('+r.status+')');return await r.json();
}
async function cloudSync(){
  if(!CLOUD_API||!db.currentUser)return;
  try{cloudState.status='syncing';const base=CLOUD_API.replace(//$/,''),token=await ensureCloudToken(base),state=await cloudStateFetch(base,token),remote=state.db||null;
    const hasLocalData=SYNC_ARRAYS.some(k=>Array.isArray(db?.[k])&&db[k].length>0),hasRemoteData=remote&&SYNC_ARRAYS.some(k=>Array.isArray(cloudBusiness(remote)?.[k])&&cloudBusiness(remote)[k].length>0);
    if(!cloudSchemaReady()){if(!hasLocalData&&hasRemoteData)replaceFromCloud(remote);setCloudSchema()}
    const currentUser=db.currentUser;if(remote){const rb=cloudBusiness(remote);if(rb){db=mergeCloudDB(db,rb);db.currentUser=currentUser;localStorage.setItem(KEY,JSON.stringify(db))}}
    let pushDB=db;if(BUSINESS_ID==='akash'){const baseRemote=remote?cloneCloud(remote):{};baseRemote.settings=Object.assign({},baseRemote.settings||{});baseRemote.settings.__businesses=Object.assign({},baseRemote.settings.__businesses||{},{akash:db});baseRemote.currentUser=null;pushDB=baseRemote}
    const push=await fetch(base+'/api/sync',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'Accept':'application/json'},body:JSON.stringify({workspaceId:'durga-dairy-'+BUSINESS_ID,db:pushDB})});if(!push.ok)throw new Error('Cloud write failed ('+push.status+')');
    const j=await push.json();if(j.db){const current=db.currentUser,b=cloudBusiness(j.db);if(b)db=mergeCloudDB(db,b);db.currentUser=current;db.businessId=BUSINESS_ID;localStorage.setItem(KEY,JSON.stringify(db));window.__cloudSnapshot=cloneCloud(db)}
    setCloudSchema();cloudState={status:'online',lastSync:new Date().toISOString(),error:null};
  }catch(e){cloudState={status:'offline',lastSync:cloudState.lastSync,error:e.message}}
}
async function cloudPull(){
  if(!CLOUD_API||!db.currentUser)return false;
  try{const base=CLOUD_API.replace(//$/,''),localHasData=SYNC_ARRAYS.some(k=>Array.isArray(db?.[k])&&db[k].length>0),j=await cloudStateFetch(base,'');if(j.db){const currentUser=db.currentUser,remote=j.db,source=cloudBusiness(remote),remoteHasData=source&&SYNC_ARRAYS.some(k=>Array.isArray(source?.[k])&&source[k].length>0);if(!cloudSchemaReady()){if(!localHasData&&remoteHasData)replaceFromCloud(remote);setCloudSchema()}if(source){db=mergeCloudDB(db,source);db.currentUser=currentUser;db.businessId=BUSINESS_ID;localStorage.setItem(KEY,JSON.stringify(db));window.__cloudSnapshot=cloneCloud(db)}cloudState={status:'online',lastSync:new Date().toISOString(),error:null};return true}return false}
  catch(e){cloudState={status:'offline',lastSync:cloudState.lastSync,error:e.message};return false}
}
function scheduleCloudSync(){clearTimeout(window.__durgaSyncTimer);window.__durgaSyncTimer=setTimeout(cloudSync,500)}
function startCloudRealtimeSync(){clearInterval(window.__durgaRealtimeTimer);if(!CLOUD_API)return;window.__durgaRealtimeTimer=setInterval(async()=>{if(!db.currentUser||document.hidden)return;const changed=await cloudPull();if(!changed||!document.getElementById('root')?.querySelector('.app')||document.getElementById('modal'))return;try{const v=window.__durgaView||'dashboard';if(v==='customerLedger'&&window.__customerLedgerId)renderCustomerLedger(window.__customerLedgerId);else if(v==='customerEntries'&&window.__customerLedgerId)editCustomerEntries(window.__customerLedgerId);else if(v==='dailyMilk')renderCustomerDailyMilk(window.__customerDailyDate||iso());else render(v)}catch(e){}},3000)}
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+Math.random();
const now=()=>new Date(); const iso=()=>now().toISOString().slice(0,10); const ym=d=>String(d||'').slice(0,7); const fmtDate=d=>{const [y,m,day]=String(d||'').slice(0,10).split('-'); return day&&m&&y?`${day}-${m}-${y}`:String(d||'')}; const filterDate=(d,mode='all',value='')=>{if(!value||mode==='all')return true; if(mode==='year')return String(d).slice(0,4)===value; if(mode==='month')return String(d).slice(0,7)===value; return String(d)===value};
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
const zeroTwoMoney=n=>money(n);
const num=n=>Number(n||0); const esc=s=>String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const defaultDB={version:2,users:[{id:'u_owner',name:'Hiren',email:'owner@durga.local',pin:'1234',role:'Owner',active:true},{id:'u_brother',name:'Brother',email:'brother@durga.local',pin:'3333',role:'Full Access Member',active:true},{id:'u_family',name:'Family Member',email:'family@durga.local',pin:'1111',role:'Family Member',active:true},{id:'u_staff',name:'Dairy Staff',email:'staff@durga.local',pin:'2222',role:'Staff',active:true}],currentUser:null,settings:{cowRate:72,buffaloRate:68,gheeBuyRate:1050,gheeSaleRate:0,pedaBuyRate:180,pedaSaleRate:0,salePrices:{milk82:82,milk72:72,buttermilk:30,ghee:1100,peda:400}},prices:[],sales:[],collections:[],milk:[],stockPurchases:[],stockUsage:[],expenses:[],customers:[],milkSlabs:[{id:'slab_0',name:'0%',percent:0},{id:'slab_15',name:'15%',percent:15},{id:'slab_25',name:'25%',percent:25}],vendors:[],vendorPayments:[],cashChecks:[],audit:[],customerSales:[],customerPayments:[],customerBills:[]};
let db=load();
function load(){try{const raw=localStorage.getItem(KEY);if(raw)return Object.assign(structuredClone?structuredClone(defaultDB):JSON.parse(JSON.stringify(defaultDB)),JSON.parse(raw));const fresh=structuredClone?structuredClone(defaultDB):JSON.parse(JSON.stringify(defaultDB));if(BUSINESS_ID==='akash'){fresh.users=fresh.users.filter(u=>u.id==='u_brother').map(u=>({...u,name:'Akash',email:'akash@durga.local'}));fresh.currentUser=null;fresh.businessId='akash'}else{fresh.businessId='hiren'}return fresh}catch(e){return structuredClone?structuredClone(defaultDB):JSON.parse(JSON.stringify(defaultDB))}}
function ensureSalesConfig(){db.settings=db.settings||{};db.settings.salePrices=Object.assign({milk:72,buttermilk:30,ghee:1100,peda:400},db.settings.salePrices||{}); if(isAkash()) db.settings.salePrices.milk= num(db.settings.salePrices.milk||76);if(db.settings.salePrices.milk==null)db.settings.salePrices.milk=72;db.sales=(db.sales||[]).map(x=>{if(x.saleKey==='milk82'||x.saleKey==='milk72'||x.product==='Milk'){x.saleKey='milk';x.product='Milk'}if(!x.rate&&x.qty)x.rate=num(x.amount)/num(x.qty);return x});db.customers=(db.customers||[]).map(x=>{if(!x.saleKey&&x.product)x.saleKey=String(x.product).toLowerCase()==='milk'?'milk':String(x.product).toLowerCase()==='buttermilk'?'buttermilk':String(x.product).toLowerCase()==='ghee'?'ghee':String(x.product).toLowerCase()==='peda'?'peda':'other';if(!x.priceHistory&&x.rate)x.priceHistory=[{date:x.createdAt?String(x.createdAt).slice(0,10):iso(),rate:num(x.rate)}];return x})}
ensureSalesConfig();
function saleProducts(){return [{key:'milk',name:'Milk',unit:'L'},{key:'buttermilk',name:'Buttermilk',unit:'L'},{key:'ghee',name:'Ghee',unit:'kg'},{key:'peda',name:'Peda',unit:'kg'},{key:'other',name:'Other',unit:'unit'}]}
function saleLabel(key){const p=saleProducts().find(x=>x.key===key);return p?p.name:key}
function getSaleRate(key){ensureSalesConfig();return num(db.settings.salePrices[key])}
function setSaleRate(key,rate){ensureSalesConfig();db.settings.salePrices[key]=num(rate);save()}
function customerRateFor(c,key,date){if(!c)return getSaleRate(key);const h=(c.priceHistory||[]).filter(x=>x.productKey===key||(!x.productKey&&c.saleKey===key)).sort((a,b)=>String(a.date).localeCompare(String(b.date)));let rate=num(c.rate);for(const x of h){if(String(x.date)<=String(date))rate=num(x.rate)}return rate||getSaleRate(key)}
function addCustomerPriceHistory(c,key,date,rate){c.priceHistory=c.priceHistory||[];c.priceHistory.push({id:uid(),productKey:key,date,rate:num(rate)});c.priceHistory.sort((a,b)=>String(a.date).localeCompare(String(b.date)))}
function save(){ensureSalesConfig();localStorage.setItem(KEY,JSON.stringify(db));scheduleCloudSync()}
function user(){return db.users.find(u=>u.id===db.currentUser)}
function audit(action,entity,recordId,before=null,after=null){db.audit.push({id:uid(),at:new Date().toISOString(),userId:user()?.id||'system',userName:user()?.name||'System',action,entity,recordId,before,after});save()}
function allowed(role,feature){if(role==='Owner'||role==='Full Access Member')return true;if(role==='Manager')return !['users','cashSettings'].includes(feature);if(role==='Family Member')return ['expenses'].includes(feature);if(role==='Staff')return ['sales'].includes(feature);return false}
async function init(){
  if(!BUSINESS_ID){portalChooser();return;}
  if(isZeroTwo()){
    // All is a direct read-only combined view. No login is required.
    await zeroTwoLoad();
    return;
  }
  if(!db.currentUser){login();return;}
  if(CLOUD_API){
    await cloudSync();
    render('dashboard');
    startCloudRealtimeSync();
  }else render('dashboard');
}
function login(){const options=db.users.filter(u=>u.active).map(u=>'<option value="'+u.id+'">'+esc(u.name)+' • '+esc(u.role)+'</option>').join('');document.getElementById('root').innerHTML='<div class="login"><div class="loginbox"><h1>Durga Dairy • '+businessName()+'</h1><p>Online Management System</p><div class="notice">Sign in with your own account. Every entry is recorded with the member name and time.</div><div class="field"><label>Login</label><select id="loginUser">'+options+'</select></div><div class="field"><label>Password / PIN</label><input id="loginPin" type="password" autocomplete="current-password" placeholder="Password"></div><button class="btn" style="width:100%;margin-top:16px" onclick="doLogin()">Login</button><button class="linkbtn" onclick="forgotPassword()">Forgot Password?</button><p class="small">First-run demo: Hiren 1234 • Brother 3333 • Family 1111 • Staff 2222</p></div></div>'}
function forgotPassword(){modal('Forgot Password','<p class="muted">Enter your account email. In production this will send a secure reset link.</p><div class="field"><label>Email</label><input id="resetEmail" type="email" placeholder="you@example.com"></div>',async()=>{const email=val('resetEmail');if(!email)return alert('Email required.');if(CLOUD_API){try{const r=await fetch(CLOUD_API.replace(/\/$/, '')+'/api/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});alert(r.ok?'If the account exists, a reset link has been sent.':'Reset request failed.')}catch(e){alert('Reset service unavailable.')}}else alert('Password reset is ready for cloud deployment; connect the online API to send the secure reset link.');closeModal()})}
async function doLogin(){const id=document.getElementById('loginUser').value,p=document.getElementById('loginPin').value,u=db.users.find(x=>x.id===id);if(!u||u.pin!==p)return alert('Wrong password.');if(CLOUD_API){try{const r=await fetch(CLOUD_API.replace(/\/$/, '')+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:u.email,password:p,workspaceId:'durga-dairy-'+BUSINESS_ID})});if(r.ok){const j=await r.json();localStorage.setItem('durga-token',j.token||'')}}catch(e){cloudState={status:'offline',error:e.message}}}db.currentUser=id;save();audit('LOGIN','session',id,null,{name:u.name});render('dashboard');cloudSync()}
function logout(){
  const oldUser=db.currentUser;
  db.currentUser=null;
  try{ if(!isZeroTwo()) localStorage.setItem(KEY,JSON.stringify(db)); }catch(e){}
  localStorage.removeItem('durga-token');
  cloudState={status:CLOUD_API?'connecting':'local',lastSync:null,error:null};
  closeSide();
  closeModal();
  sessionStorage.removeItem('durga-business');
  BUSINESS_ID='';KEY=BASE_KEY;
  portalChooser();
}
function navItems(){return [['dashboard','⌂ Dashboard'],['sales','▣ Daily Sale'],['collections','▤ Bill Collection'],['milk','🥛 Milk Purchase'],['stock','▦ Stock Purchase'],['expenses','₹ Expense'],['customers','♙ Customers'],['vendors','▤ Vendors'],['cash','◉ Cash Flow'],['reports','▥ Reports'],['audit','◌ Activity Log'],['backup','☁ Online Backup'],['users','♙ Members']].filter(([k])=>allowed(user()?.role,k)||k==='dashboard'||k==='audit')}
function applyDateFormat(){document.querySelectorAll('input[type="date"]').forEach(el=>{el.setAttribute('lang','en-GB');el.setAttribute('title','DD/MM/YYYY');});}
function shell(active,body,title){document.getElementById('root').innerHTML=`<div class="app"><div class="sideBackdrop" id="sideBackdrop" onclick="closeSide()"></div><aside class="sidebar" id="side"><div class="brand">🐄 Durga Dairy<small>Management System</small></div><div class="nav">${navItems().map(([k,t])=>`<button class="${active===k?'active':''}" onclick="render('${k}')">${t}</button>`).join('')}</div><div style="position:absolute;bottom:15px;left:12px;right:12px"><button class="nav" style="width:100%;border:0;background:#ffffff12;color:#fff;padding:10px;border-radius:8px" onclick="logout()">↪ Logout</button></div></aside><section class="main"><header class="topbar"><div style="display:flex;align-items:center;gap:10px"><button class="menuBtn" onclick="toggleSide()">☰</button><b>${title||'Dashboard'}</b></div><div class="right"><span class="pill green">● Cloud / Local</span><span class="workspace">Durga Dairy</span><span class="avatar">${esc((user()?.name||'?')[0])}</span><span class="small">${esc(user()?.name||'')}</span></div></header><main class="page">${body}<div class="footer">Durga Dairy Management • Online + Offline prototype • Logged in as ${esc(user()?.name||'')}</div></main></section></div>`;if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js?v=20261005-1445').catch(()=>{});applyDateFormat()}
function toggleSide(){const side=document.getElementById('side');side?.classList.toggle('open');document.getElementById('sideBackdrop')?.classList.toggle('open',!!side?.classList.contains('open'))}function closeSide(){document.getElementById('side')?.classList.remove('open');document.getElementById('sideBackdrop')?.classList.remove('open')}
function modal(title,body,saveFn){document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="modalbox"><div class="modalhead"><h3>${title}</h3><button class="x" onclick="closeModal()">×</button></div>${body}<div class="actions"><button class="btn gray" onclick="closeModal()">Cancel</button><button class="btn" id="modalSave">Save</button></div></div></div>`);document.getElementById('modalSave').onclick=saveFn;applyDateFormat()}
function closeModal(){document.getElementById('modal')?.remove()}
function metric(label,value,sub=''){return `<div class="card metric"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`}
function monthTotal(arr,m,key='amount'){return arr.filter(x=>ym(x.date)===m).reduce((a,x)=>a+num(x[key]),0)}
function dashboard(){const m=ym(iso());const sales=monthTotal(db.sales,m),collections=monthTotal(db.collections,m),expenses=monthTotal(db.expenses,m),milkCost=monthTotal(db.milk,m,'total'),stockCost=monthTotal(db.stockPurchases,m,'total');const cashIn=sales+collections, cashOut=expenses+db.milk.filter(x=>ym(x.date)===m).reduce((a,x)=>a+num(x.paid),0)+db.stockPurchases.filter(x=>ym(x.date)===m).reduce((a,x)=>a+num(x.paid),0);const lastCheck=[...db.cashChecks].sort((a,b)=>b.date.localeCompare(a.date))[0];const expected=(lastCheck?num(lastCheck.actual):0)+cashIn-cashOut;const actual=lastCheck?num(lastCheck.actual):0;const diff=actual?actual-expected:0;const products=productStats(m);shell('dashboard',`<div class="sectionhead"><div><h1 style="margin:0">Good morning, ${esc(user()?.name||'')}</h1><div class="muted">Today ${iso()} • ${esc(user()?.role||'')}</div></div><div class="toolbar"><button class="btn green" onclick="quick('sale')">+ Daily Sale</button><button class="btn" onclick="quick('expense')">+ Expense</button><button class="btn orange" onclick="quick('milk')">+ Milk Purchase</button><button class="btn gray" onclick="quick('stock')">+ Stock Purchase</button></div></div><div class="grid">${metric('Sales This Month',money(sales))}${metric('Customer Collection',money(collections))}${metric('Milk Purchase',money(milkCost))}${metric('Expenses',money(expenses))}</div><div class="grid" style="margin-top:14px">${metric('Stock Purchase',money(stockCost))}${metric('Expected Cash',money(expected),'Calculated')}${metric('Actual Cash',actual?money(actual):'Not checked','Manual cash check')}${metric('Cash Difference',actual?money(diff):'—',actual?(diff===0?'Matched':'Needs reconciliation'):'Enter month-end cash')}</div><div class="charts section"><div class="card"><div class="sectionhead"><h2>Sales by Product</h2><span class="muted">${m}</span></div>${productBars(products)}</div><div class="card"><div class="sectionhead"><h2>Profit by Product</h2></div>${profitBars(products)}</div><div class="card"><div class="sectionhead"><h2>Sales Mix</h2></div><div class="donut"></div><div class="legend">${products.map(p=>`<span><b>${esc(p.name)}</b><span>${p.salesPct.toFixed(1)}%</span></span>`).join('')}</div></div></div><div class="card section"><div class="sectionhead"><h2>Product Performance</h2><button class="btn sm gray" onclick="render('reports')">Full Report</button></div>${productTable(products)}</div>`)}
function productStats(m){const names=['Milk','Ghee','Peda','Buttermilk','Other'];return names.map(name=>{const sales=db.sales.filter(x=>ym(x.date)===m&&x.product===name);const saleAmt=sales.reduce((a,x)=>a+num(x.amount),0),qty=sales.reduce((a,x)=>a+num(x.qty),0);let cost=0;if(name==='Milk')cost=db.milk.filter(x=>ym(x.date)===m).reduce((a,x)=>a+num(x.total),0);if(name==='Ghee')cost=db.stockPurchases.filter(x=>ym(x.date)===m&&x.item==='Ghee').reduce((a,x)=>a+num(x.total),0);if(name==='Peda')cost=db.stockPurchases.filter(x=>ym(x.date)===m&&x.item==='Peda').reduce((a,x)=>a+num(x.total),0);if(name==='Buttermilk')cost=saleAmt*.29;const profit=saleAmt-cost;return{name,saleAmt,qty,cost,profit,margin:saleAmt?profit/saleAmt*100:0,salesPct:0}}).map((p,_,a)=>{const total=a.reduce((s,x)=>s+x.saleAmt,0);p.salesPct=total?p.saleAmt/total*100:0;return p})}
function productBars(ps){const max=Math.max(1,...ps.map(x=>x.saleAmt));return `<div class="chartbar">${ps.map(p=>`<div class="bar" style="height:${Math.max(8,p.saleAmt/max*140)}px;background:${p.name==='Ghee'?'#f2b84b':p.name==='Milk'?'#58a9e5':p.name==='Peda'?'#9a79dc':p.name==='Buttermilk'?'#52b98e':'#e67b7b'}"><span>${esc(p.name)}</span></div>`).join('')}</div>`}
function profitBars(ps){const max=Math.max(1,...ps.map(x=>Math.max(0,x.profit)));return '<div class="chartbar" style="align-items:flex-end;padding-bottom:42px;position:relative">'+ps.map(p=>'<div class="bar" style="height:'+Math.max(8,Math.max(0,p.profit)/max*120)+'px;background:'+(p.margin>=60?'#0f9d6e':'#79bce9')+';position:relative"><span style="pos --- TRUNCATED --- 152,195 chars