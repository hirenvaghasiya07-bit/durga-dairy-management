const BUILD_VERSION='2026-10-12-date-dropdown-v1';
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
const CLOUD_SYNC_SCHEMA='2026-10-05-v5';
let cloudState={status:CLOUD_API?'connecting':'local',lastSync:null,error:null};
const SYNC_ARRAYS=['users','prices','sales','collections','milk','stockPurchases','stockUsage','expenses','customers','vendors','vendorPayments','cashChecks','cashOpenings','audit','customerSales','customerPayments','customerBills','customerOpeningBalances','internalTransfers','milkPriceVarieties'];

function cloneCloud(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function recordTime(x){return x?.updatedAt||x?.updated_at||x?.createdAt||x?.created_at||''}
function newerRecord(a,b){
  const ta=recordTime(a),tb=recordTime(b);
  if(ta&&tb)return String(ta)>=String(tb)?a:b;
  if(tb&&!ta)return b;
  if(ta&&!tb)return a;
  return a;
}
function canonicalRecord(value){
  if(Array.isArray(value))return '['+value.map(canonicalRecord).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalRecord(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
function stableLegacyId(entity,record,occurrence=0){
  const raw=canonicalRecord(record);let hash=2166136261;
  for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return 'legacy_'+entity+'_'+(hash>>>0).toString(36)+'_'+occurrence;
}
function ensureStableRecordIds(state){
  const out=cloneCloud(state||{});
  for(const key of SYNC_ARRAYS){
    if(!Array.isArray(out[key]))continue;
    const seen=new Map();
    out[key]=out[key].map(record=>{
      if(!record||typeof record!=='object'||record.id!=null)return record;
      const signature=canonicalRecord(record),occurrence=seen.get(signature)||0;
      seen.set(signature,occurrence+1);
      return {...record,id:stableLegacyId(key,record,occurrence),legacyIdAssigned:true};
    });
  }
  const v2=out.settings?.akashV2;
  if(v2)for(const key of ['purchases','sales','collections','slabs','vendors','purchaseRates','expenses']){
    if(!Array.isArray(v2[key]))continue;
    const seen=new Map();
    v2[key]=v2[key].map(record=>{
      if(!record||typeof record!=='object'||record.id!=null)return record;
      const signature=canonicalRecord(record),occurrence=seen.get(signature)||0;
      seen.set(signature,occurrence+1);
      return {...record,id:stableLegacyId('akashV2_'+key,record,occurrence),legacyIdAssigned:true};
    });
  }
  return out;
}
function tombstoneStamp(v){return typeof v==='string'?v:(v?.deletedAt||v?.deleted_at||v?.at||'')}
function mergeTombstones(...sources){
  const out={};
  for(const src of sources){for(const [entity,records] of Object.entries(src||{})){
    out[entity]=out[entity]||{};
    for(const [id,value] of Object.entries(records||{})){
      const previous=out[entity][id];
      if(!previous||tombstoneStamp(value)>=tombstoneStamp(previous))out[entity][id]=cloneCloud(value);
    }
  }}
  return out;
}
function recordDeletion(entity,id,record){
  if(!entity||id==null)return;
  db.__tombstones=mergeTombstones(db.__tombstones);
  db.__tombstones[entity]=db.__tombstones[entity]||{};
  db.__tombstones[entity][String(id)]={recordId:String(id),businessId:BUSINESS_ID||db.businessId||(isAkash()?'akash':'hiren'),entityType:entity,deletedAt:new Date().toISOString(),deletedBy:user()?.id||'unknown',deletionVersion:6,recordDate:record?.date||null};
}
function pendingDeletionPayload(state=db){
  const out={};
  for(const [entity,records] of Object.entries(state.__tombstones||{})){const ids=Object.keys(records||{});if(ids.length)out[entity]=ids;}
  return out;
}
function mergeCloudDB(local,remote){
  const base=structuredClone?structuredClone(defaultDB):JSON.parse(JSON.stringify(defaultDB));
  const localSafe=ensureStableRecordIds(local||{}),remoteSafe=ensureStableRecordIds(remote||{});
  const out=Object.assign(base,remoteSafe,localSafe);
  out.settings={...(remoteSafe?.settings||{}),...(localSafe?.settings||{})};
  const remoteAkashV2=remoteSafe?.settings?.akashV2||{},localAkashV2=localSafe?.settings?.akashV2||{};
  if(Object.keys(remoteAkashV2).length||Object.keys(localAkashV2).length){
    const av={...remoteAkashV2,...localAkashV2},nestedTombs=mergeTombstones(remoteAkashV2.__tomb,localAkashV2.__tomb);
    for(const key of ['purchases','sales','collections','slabs','vendors','purchaseRates','expenses']){
      const map=new Map(),dead=nestedTombs[key]||{};
      for(const x of Array.isArray(remoteAkashV2[key])?remoteAkashV2[key]:[])if(x?.id!=null&&!dead[String(x.id)])map.set(String(x.id),x);
      for(const x of Array.isArray(localAkashV2[key])?localAkashV2[key]:[])if(x?.id!=null&&!dead[String(x.id)]){const id=String(x.id);map.set(id,map.has(id)?newerRecord(x,map.get(id)):x)}
      const noId=[...(Array.isArray(remoteAkashV2[key])?remoteAkashV2[key]:[]).filter(x=>x?.id==null),...(Array.isArray(localAkashV2[key])?localAkashV2[key]:[]).filter(x=>x?.id==null)];
      av[key]=[...map.values(),...noId];
    }
    av.__tomb=nestedTombs;out.settings.akashV2=av;
  }
  out.__tombstones=mergeTombstones(remoteSafe?.__tombstones,localSafe?.__tombstones);
  for(const key of SYNC_ARRAYS){
    const lm=Array.isArray(localSafe?.[key])?localSafe[key]:[];
    const rm=Array.isArray(remoteSafe?.[key])?remoteSafe[key]:[];
    const map=new Map();
    for(const x of rm)if(x?.id!=null)map.set(String(x.id),x);
    for(const x of lm)if(x?.id!=null){const id=String(x.id);map.set(id,map.has(id)?newerRecord(x,map.get(id)):x);}
    const noId=[...rm.filter(x=>x?.id==null),...lm.filter(x=>x?.id==null)];
    const dead=out.__tombstones[key]||{};
    out[key]=[...map.values(),...noId].filter(x=>x?.id==null||!Object.prototype.hasOwnProperty.call(dead,String(x.id)));
  }
  out.currentUser=local?.currentUser||remote?.currentUser||null;
  out.version=Math.max(num(local?.version),num(remote?.version),6);
  return out;
}
function cloudBusiness(remote){
  if(BUSINESS_ID==='akash')return remote?.settings?.__businesses?.akash||null;
  return remote||null;
}
function replaceFromCloud(remote){
  const currentUser=db.currentUser;
  const source=cloudBusiness(remote);
  if(source){
    const base=structuredClone?structuredClone(defaultDB):JSON.parse(JSON.stringify(defaultDB));
    const cloud=cloneCloud(source);
    if(Array.isArray(cloud.users))cloud.users=cloud.users.map(u=>({...((base.users||[]).find(x=>x.id===u.id)||{}),...u}));
    db=Object.assign(base,cloud);
  }
  db.currentUser=currentUser;
  db.businessId=BUSINESS_ID;
  window.__cloudSnapshot=cloneCloud(db);
  localStorage.setItem(KEY,JSON.stringify(db));lastPersistedSnapshot=cloneCloud(db);
}
function syncSchemaKey(){return KEY+'::cloud-schema'}
function pendingSyncKey(){return KEY+'::pending-sync'}
function cloudSchemaReady(){return localStorage.getItem(syncSchemaKey())===CLOUD_SYNC_SCHEMA}
function setCloudSchema(){localStorage.setItem(syncSchemaKey(),CLOUD_SYNC_SCHEMA)}
async function cloudStateFetch(base,token){
  const r=await fetch(base+'/api/state?ts='+Date.now()+'&business='+encodeURIComponent(BUSINESS_ID==='akash'?'akash':'hiren'),{method:'GET',headers:{'Authorization':'Bearer '+token,'Accept':'application/json','Cache-Control':'no-cache'},cache:'no-store'});
  if(r.status===401){localStorage.removeItem('durga-token');const e=new Error('Cloud session expired or invalid. Please log in again.');e.status=401;throw e;}if(!r.ok){const e=new Error('Cloud read failed ('+r.status+')');e.status=r.status;throw e;}
  return await r.json();
}
async function cloudSync(){
  if(!CLOUD_API||!db.currentUser||isZeroTwo())return;
  try{
    cloudState.status='syncing';
    const base=CLOUD_API.replace(/\/$/,'');
    const token=localStorage.getItem('durga-token')||'';
    const state=await cloudStateFetch(base,token);
    const remote=state.db||null;

    // First-run migration must preserve device-only records. Merge by stable ID,
    // keep the current session, then let the API perform an idempotent cloud merge.
    // Never replace a non-empty offline cache just because this device lacks a schema marker.
    if(!cloudSchemaReady()){
      const currentUser=db.currentUser;
      if(remote){
        const remoteBusiness=cloudBusiness(remote);
        if(remoteBusiness) db=mergeCloudDB(db,remoteBusiness);
        db.currentUser=currentUser;
        db.businessId=BUSINESS_ID;
        localStorage.setItem(KEY,JSON.stringify(db));
      }
      window.__durgaMigrationReviewRequired=true;
    }

    const currentUser=db.currentUser;
    if(remote){
      const remoteBusiness=cloudBusiness(remote);
      if(remoteBusiness)db=mergeCloudDB(db,remoteBusiness);
      db.currentUser=currentUser;
      localStorage.setItem(KEY,JSON.stringify(db));lastPersistedSnapshot=cloneCloud(db);
    }

    let pushDB=db;
    if(BUSINESS_ID==='akash'){
      const baseRemote=remote?cloneCloud(remote):{};
      baseRemote.settings=Object.assign({},baseRemote.settings||{});
      baseRemote.settings.__businesses=Object.assign({},baseRemote.settings.__businesses||{}, {akash:db});
      baseRemote.currentUser=null;
      pushDB=baseRemote;
    }

    const push=await fetch(base+'/api/sync',{
      method:'POST',
      headers:{...({'Content-Type':'application/json','Authorization':'Bearer '+token,'Accept':'application/json'})},
      body:JSON.stringify({workspaceId:'durga-dairy-'+BUSINESS_ID,db:pushDB,deleted:pendingDeletionPayload(db)})
    });
    if(!push.ok)throw new Error('Cloud write failed ('+push.status+')');
    const j=await push.json();
    if(j.db){
      const current=db.currentUser;
      const business=cloudBusiness(j.db);
      if(business)db=mergeCloudDB(db,business);
      db.currentUser=current;
      db.businessId=BUSINESS_ID;
      localStorage.setItem(KEY,JSON.stringify(db));lastPersistedSnapshot=cloneCloud(db);
      window.__cloudSnapshot=cloneCloud(db);
    }
    setCloudSchema();
    localStorage.removeItem(pendingSyncKey());
    cloudState={status:'online',lastSync:new Date().toISOString(),error:null};
  }catch(e){
    cloudState={status:'offline',lastSync:cloudState.lastSync,error:e.message};
    if(e.status===401){db.currentUser=null;localStorage.setItem(KEY,JSON.stringify(db));login();}
  }
}
async function cloudPull(){
  if(!CLOUD_API||!db.currentUser||isZeroTwo())return false;
  try{
    const base=CLOUD_API.replace(/\/$/,'');
    const token=localStorage.getItem('durga-token')||'';
    const j=await cloudStateFetch(base,token);
    if(j.db){
      const currentUser=db.currentUser;
      if(!cloudSchemaReady()){
        const business=cloudBusiness(j.db);
        if(business)db=mergeCloudDB(db,business);
        db.currentUser=currentUser;
        db.businessId=BUSINESS_ID;
        localStorage.setItem(KEY,JSON.stringify(db));
        localStorage.setItem(pendingSyncKey(),JSON.stringify({queuedAt:new Date().toISOString(),businessId:BUSINESS_ID,migration:true}));
        window.__durgaMigrationReviewRequired=true;
      }else{
        const business=cloudBusiness(j.db);
        if(business)db=mergeCloudDB(db,business);
        db.currentUser=currentUser;
        db.businessId=BUSINESS_ID;
        localStorage.setItem(KEY,JSON.stringify(db));lastPersistedSnapshot=cloneCloud(db);
        window.__cloudSnapshot=cloneCloud(db);
      }
      cloudState={status:'online',lastSync:new Date().toISOString(),error:null};
      if(localStorage.getItem(pendingSyncKey()))await cloudSync();
      return true;
    }
    return false;
  }catch(e){
    cloudState={status:'offline',lastSync:cloudState.lastSync,error:e.message};
    if(e.status===401){db.currentUser=null;localStorage.setItem(KEY,JSON.stringify(db));login();}
    return false;
  }
}
async function manualSync(){
  if(!CLOUD_API||!db.currentUser)return alert('Cloud API or active login is unavailable. Local data remains saved on this device.');
  const view=window.__durgaView||'dashboard';
  cloudState={...cloudState,status:'syncing',error:null};
  await cloudSync();
  if(cloudState.status==='online'){
    await cloudPull();
    if(cloudState.status==='online')alert('Cloud synchronization completed. The latest authoritative state has been pulled.');
    else alert('Cloud pull failed: '+(cloudState.error||'Unknown error')+'. Local data and pending operations are preserved.');
  }else alert('Cloud synchronization failed: '+(cloudState.error||'Unknown error')+'. Local data and pending operations are preserved.');
  if(document.getElementById('modal'))return;
  if(view==='customerLedger'&&window.__customerLedgerId)renderCustomerLedger(window.__customerLedgerId);
  else if(view==='customerEntries'&&window.__customerLedgerId)editCustomerEntries(window.__customerLedgerId);
  else if(view==='dailyMilk')renderCustomerDailyMilk(window.__customerDailyDate||iso());
  else if(['dashboard','sales','milkPrices','collections','milk','stock','expenses','customers','vendors','cash','reports','audit','backup','terms','transfers','users'].includes(view))render(view);
  else dashboard();
}
function scheduleCloudSync(){clearTimeout(window.__durgaSyncTimer);window.__durgaSyncTimer=setTimeout(cloudSync,500)}
function startCloudRealtimeSync(){
  clearInterval(window.__durgaRealtimeTimer);
  if(!CLOUD_API)return;
  window.__durgaRealtimeTimer=setInterval(async()=>{
    if(!db.currentUser||document.hidden||isZeroTwo())return;
    const changed=await cloudPull();
    if(!changed||!document.getElementById('root')?.querySelector('.app'))return;
    if(document.getElementById('modal'))return;
    try{
      const v=window.__durgaView||'dashboard';
      if(v==='customerLedger'&&window.__customerLedgerId)renderCustomerLedger(window.__customerLedgerId);
      else if(v==='customerEntries'&&window.__customerLedgerId)editCustomerEntries(window.__customerLedgerId);
      else if(v==='dailyMilk')renderCustomerDailyMilk(window.__customerDailyDate||iso());
      else render(v);
    }catch(e){}
  },15000);
}
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+Math.random();
const now=()=>new Date(); const iso=()=>now().toISOString().slice(0,10); const ym=d=>String(d||'').slice(0,7); const fmtDate=d=>{const [y,m,day]=String(d||'').slice(0,10).split('-'); return day&&m&&y?`${day}-${m}-${y}`:String(d||'')}; const filterDate=(d,mode='all',value='')=>{if(!value||mode==='all')return true; if(mode==='year')return String(d).slice(0,4)===value; if(mode==='month')return String(d).slice(0,7)===value; return String(d)===value};
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
const num=n=>Number(n||0); const esc=s=>String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
const defaultDB={version:6,__tombstones:{},customerOpeningBalances:[],internalTransfers:[],milkPriceVarieties:[],cashOpenings:[],users:[{id:'u_owner',name:'Hiren',email:'owner@durga.local',pin:'1234',role:'Owner',active:true},{id:'u_brother',name:'Brother',email:'brother@durga.local',pin:'3333',role:'Full Access Member',active:true},{id:'u_family',name:'Family Member',email:'family@durga.local',pin:'1111',role:'Family Member',active:true},{id:'u_staff',name:'Dairy Staff',email:'staff@durga.local',pin:'2222',role:'Staff',active:true}],currentUser:null,settings:{cowRate:72,buffaloRate:68,gheeBuyRate:1050,gheeSaleRate:0,pedaBuyRate:180,pedaSaleRate:0,salePrices:{milk82:82,milk72:72,buttermilk:30,ghee:1100,peda:400}},prices:[],sales:[],collections:[],milk:[],stockPurchases:[],stockUsage:[],expenses:[],customers:[],milkSlabs:[{id:'slab_0',name:'0%',percent:0},{id:'slab_15',name:'15%',percent:15},{id:'slab_25',name:'25%',percent:25}],vendors:[],vendorPayments:[],cashChecks:[],audit:[],customerSales:[],customerPayments:[],customerBills:[]};
let db=load();
function load(){try{const raw=localStorage.getItem(KEY);if(raw)return Object.assign(structuredClone?structuredClone(defaultDB):JSON.parse(JSON.stringify(defaultDB)),JSON.parse(raw));const fresh=structuredClone?structuredClone(defaultDB):JSON.parse(JSON.stringify(defaultDB));if(BUSINESS_ID==='akash'){fresh.users=fresh.users.filter(u=>u.id==='u_brother').map(u=>({...u,name:'Akash',email:'akash@durga.local'}));fresh.currentUser=null;fresh.businessId='akash'}else{fresh.businessId='hiren'}return fresh}catch(e){return structuredClone?structuredClone(defaultDB):JSON.parse(JSON.stringify(defaultDB))}}
function ensureSalesConfig(){db.settings=db.settings||{};db.settings.salePrices=Object.assign({milk:72,buttermilk:30,ghee:1100,peda:400},db.settings.salePrices||{}); if(isAkash()) db.settings.salePrices.milk= num(db.settings.salePrices.milk||76);if(db.settings.salePrices.milk==null)db.settings.salePrices.milk=72;db.sales=(db.sales||[]).map(x=>{if(x.saleKey==='milk82'||x.saleKey==='milk72'||x.product==='Milk'){x.saleKey='milk';x.product='Milk'}if(!x.rate&&x.qty)x.rate=num(x.amount)/num(x.qty);return x});db.customers=(db.customers||[]).map(x=>{if(!x.saleKey&&x.product)x.saleKey=String(x.product).toLowerCase()==='milk'?'milk':String(x.product).toLowerCase()==='buttermilk'?'buttermilk':String(x.product).toLowerCase()==='ghee'?'ghee':String(x.product).toLowerCase()==='peda'?'peda':'other';if(!x.priceHistory&&x.rate)x.priceHistory=[{date:x.createdAt?String(x.createdAt).slice(0,10):iso(),rate:num(x.rate)}];return x})}
ensureSalesConfig();
db=ensureStableRecordIds(db);
let lastPersistedSnapshot=cloneCloud(db);
function saleProducts(){return [{key:'milk',name:'Milk',unit:'L'},{key:'buttermilk',name:'Buttermilk',unit:'L'},{key:'ghee',name:'Ghee',unit:'kg'},{key:'peda',name:'Peda',unit:'kg'},{key:'other',name:'Other',unit:'unit'}]}
function saleLabel(key){const p=saleProducts().find(x=>x.key===key);return p?p.name:key}
function getSaleRate(key){ensureSalesConfig();return num(db.settings.salePrices[key])}
function setSaleRate(key,rate){ensureSalesConfig();db.settings.salePrices[key]=num(rate);save()}
function customerRateFor(c,key,date){if(!c)return getSaleRate(key);const h=(c.priceHistory||[]).filter(x=>x.productKey===key||(!x.productKey&&c.saleKey===key)).sort((a,b)=>String(a.date).localeCompare(String(b.date)));let rate=num(c.rate);for(const x of h){if(String(x.date)<=String(date))rate=num(x.rate)}return rate||getSaleRate(key)}
function addCustomerPriceHistory(c,key,date,rate){c.priceHistory=c.priceHistory||[];c.priceHistory.push({id:uid(),productKey:key,date,rate:num(rate)});c.priceHistory.sort((a,b)=>String(a.date).localeCompare(String(b.date)))}
function save(){
  ensureSalesConfig();db=ensureStableRecordIds(db);db.__tombstones=db.__tombstones||{};db.businessId=BUSINESS_ID||db.businessId||'hiren';
  const previous=lastPersistedSnapshot||{};
  const actor=recordActorId(),nowAt=new Date().toISOString();
  for(const key of SYNC_ARRAYS){
    if(key==='users')continue;
    if(isAkash()&&['internalTransfers','customerOpeningBalances'].includes(key))continue;
    if(!isAkash()&&key==='milkPriceVarieties')continue;
    for(const record of Array.isArray(db[key])?db[key]:[]){
      if(!record||record.id==null)continue;
      const prior=(Array.isArray(previous[key])?previous[key]:[]).find(x=>String(x?.id)===String(record.id));
      const changedBeforeMetadata=!!prior&&JSON.stringify(record)!==JSON.stringify(prior);
      if(!record.businessId)record.businessId=BUSINESS_ID==='akash'?'akash':'hiren';
      if(!prior){
        if(!record.userId)record.userId=actor;
        if(!record.createdBy)record.createdBy=actor;
        if(!record.createdAt)record.createdAt=record.at||nowAt;
        if(!record.updatedAt)record.updatedAt=record.at||nowAt;
        if(key==='expenses'&&!record.paidBy)record.paidBy=user()?.name||'Unknown';
      }else if(changedBeforeMetadata){
        if(!record.userId)record.userId=prior.userId||actor;
        if(!record.createdBy)record.createdBy=prior.createdBy||record.userId;
        if(!record.createdAt)record.createdAt=prior.createdAt||prior.at||nowAt;
        record.updatedAt=nowAt;record.updatedBy=actor;
        if(key==='expenses'&&!record.paidBy)record.paidBy=user()?.name||'Unknown';
      }
    }
  }
  const v2=db.settings?.akashV2,prevV2=previous.settings?.akashV2;
  if(isAkash()&&v2){
    for(const key of ['purchases','sales','collections','slabs','vendors','purchaseRates','expenses']){
      if(!Array.isArray(v2[key]))continue;
      for(const record of v2[key]){
        if(!record||record.id==null)continue;
        const prior=(Array.isArray(prevV2?.[key])?prevV2[key]:[]).find(x=>String(x?.id)===String(record.id));
        const changed=!!prior&&JSON.stringify(record)!==JSON.stringify(prior);
        if(!record.businessId)record.businessId='akash';
        if(!prior){
          if(!record.userId)record.userId=recordActorId();
          if(!record.createdBy)record.createdBy=recordActorId();
          if(!record.createdAt)record.createdAt=nowAt;
          if(!record.updatedAt)record.updatedAt=nowAt;
        }else if(changed){
          if(!record.userId)record.userId=prior.userId||recordActorId();
          if(!record.createdBy)record.createdBy=prior.createdBy||record.userId;
          if(!record.createdAt)record.createdAt=prior.createdAt||nowAt;
          record.updatedAt=nowAt;record.updatedBy=recordActorId();
        }
      }
    }
  }
  localStorage.setItem(KEY,JSON.stringify(db));lastPersistedSnapshot=cloneCloud(db);
  if(!isZeroTwo())localStorage.setItem(pendingSyncKey(),JSON.stringify({queuedAt:new Date().toISOString(),businessId:BUSINESS_ID}));
  scheduleCloudSync();
}
function user(){return db.users.find(u=>u.id===db.currentUser)}
function recordActorId(){return isAkash()?'u_akash':(user()?.id||'system')}
function audit(action,entity,recordId,before=null,after=null){const actor=user();db.audit.push({id:uid(),at:new Date().toISOString(),userId:recordActorId(),userName:actor?.name||'System',action,entity,recordId,before,after,businessId:BUSINESS_ID==='akash'?'akash':'hiren',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});save()}
function allowed(role,feature){if(role==='Owner'||role==='Full Access Member')return true;if(role==='Manager')return !['users','cashSettings'].includes(feature);if(role==='Family Member')return ['expenses'].includes(feature);if(role==='Staff')return ['sales'].includes(feature);return false}
async function init(){
  if(!BUSINESS_ID){portalChooser();return;}
  if(!db.currentUser){login();return;}
  if(isZeroTwo()){
    await zeroTwoLoad();
    return;
  }
  if(CLOUD_API){
    await cloudSync();
    render('dashboard');
    startCloudRealtimeSync();
  }else render('dashboard');
}
function login(){const options=db.users.filter(u=>u.active).map(u=>'<option value="'+u.id+'">'+esc(u.name)+' • '+esc(u.role)+'</option>').join('');document.getElementById('root').innerHTML='<div class="login"><div class="loginbox"><h1>Durga Dairy • '+businessName()+'</h1><p>Online Management System</p><div class="notice">Sign in with your own account. Every entry is recorded with the member name and time.</div><div class="field"><label>Login</label><select id="loginUser">'+options+'</select></div><div class="field"><label>Password / PIN</label><input id="loginPin" type="password" autocomplete="current-password" placeholder="Password"></div><button class="btn" style="width:100%;margin-top:16px" onclick="doLogin()">Login</button><button class="linkbtn" onclick="forgotPassword()">Forgot Password?</button><p class="small">First-run demo: Hiren 1234 • Brother 3333 • Family 1111 • Staff 2222</p></div></div>'}
function forgotPassword(){modal('Forgot Password','<p class="muted">Enter your account email. Reset email delivery must be configured before reset links can be sent.</p><div class="field"><label>Email</label><input id="resetEmail" type="email" placeholder="you@example.com"></div>',async()=>{const email=val('resetEmail');if(!email)return alert('Email required.');if(CLOUD_API){try{const r=await fetch(CLOUD_API.replace(/\/$/, '')+'/api/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const j=await r.json().catch(()=>({}));alert(r.ok?(j.message||'Request accepted.'):(j.error||'Reset request failed.'))}catch(e){alert('Reset service unavailable.')}}else alert('Password reset is ready for cloud deployment; connect the online API to send the secure reset link.');closeModal()})}
async function doLogin(){
  const id=document.getElementById('loginUser')?.value,p=document.getElementById('loginPin')?.value,u=db.users.find(x=>x.id===id);
  if(!u||u.pin!==p)return alert('Wrong password.');
  if(CLOUD_API){
    try{
      const r=await fetch(CLOUD_API.replace(/\/$/,'')+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:u.email,password:p,workspaceId:'durga-dairy-'+BUSINESS_ID})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok){
        if(r.status===401||r.status===403){cloudState={status:'offline',lastSync:cloudState.lastSync,error:j.error||'Cloud login rejected'};return alert('Cloud login failed: '+(j.error||('HTTP '+r.status))+'. Your local data has been preserved.');}
        cloudState={status:'offline',lastSync:cloudState.lastSync,error:j.error||('HTTP '+r.status)};
      }else if(j.token){localStorage.setItem('durga-token',j.token);cloudState={status:'connecting',lastSync:cloudState.lastSync,error:null};}
    }catch(e){cloudState={status:'offline',lastSync:cloudState.lastSync,error:e.message};}
  }
  db.currentUser=id;save();
  if(isZeroTwo()){zeroTwoLoad();return;}
  audit('LOGIN','session',id,null,{name:u.name});render('dashboard');cloudSync();
}
function logout(){
  const oldUser=db.currentUser;
  db.currentUser=null;
  try{ if(!isZeroTwo()) localStorage.setItem(KEY,JSON.stringify(db)); }catch(e){}
  const sessionToken=localStorage.getItem('durga-token')||'';
  if(CLOUD_API&&sessionToken)fetch(CLOUD_API.replace(/\/$/,'')+'/api/logout',{method:'POST',headers:{'Authorization':'Bearer '+sessionToken,'Accept':'application/json'}}).catch(()=>{});
  localStorage.removeItem('durga-token');
  cloudState={status:CLOUD_API?'connecting':'local',lastSync:null,error:null};
  closeSide();
  closeModal();
  sessionStorage.removeItem('durga-business');
  BUSINESS_ID='';KEY=BASE_KEY;
  portalChooser();
}
function navItems(){return [['dashboard','⌂ Dashboard'],['sales','▣ Daily Sale'],['collections','▤ Bill Collection'],['milk','🥛 Milk Purchase'],['stock','▦ Stock Purchase'],['expenses','₹ Expense'],['customers','♙ Customers'],['vendors','▤ Vendors'],['cash','◉ Cash Flow'],['reports','▥ Reports'],['audit','◌ Activity Log'],['backup','☁ Online Backup'],['terms','Customer Bill Terms'],['transfers','↔ Internal Milk Transfers'],['users','♙ Members']].filter(([k])=>!(isAkash()&&['customers','terms','transfers','users'].includes(k))&&(allowed(user()?.role,k)||k==='dashboard'||k==='audit'))}
function applyDateFormat(){document.querySelectorAll('input[type="date"]').forEach(el=>{el.setAttribute('lang','en-GB');el.setAttribute('title','DD/MM/YYYY');});}
function shell(active,body,title){document.getElementById('root').innerHTML=`<div class="app"><div class="sideBackdrop" id="sideBackdrop" onclick="closeSide()"></div><aside class="sidebar" id="side"><div class="brand">🐄 Durga Dairy<small>Management System</small></div><div class="nav">${navItems().map(([k,t])=>`<button class="${active===k?'active':''}" onclick="render('${k}')">${t}</button>`).join('')}</div><div style="position:absolute;bottom:15px;left:12px;right:12px"><button class="nav" style="width:100%;border:0;background:#ffffff12;color:#fff;padding:10px;border-radius:8px" onclick="logout()">↪ Logout</button></div></aside><section class="main"><header class="topbar"><div style="display:flex;align-items:center;gap:10px"><button class="menuBtn" onclick="toggleSide()">☰</button><b>${title||'Dashboard'}</b></div><div class="right"><span class="pill ${cloudState.status==='online'?'green':cloudState.status==='offline'?'red':'orange'}" title="${esc(cloudState.error||'')}">${cloudState.status==='online'?'● Cloud Synced':cloudState.status==='syncing'?'↻ Syncing':cloudState.status==='offline'?'⚠ Sync Failed':'● Local / Waiting'}</span><button class="btn sm gray" onclick="manualSync()">Sync Now</button><span class="workspace">${cloudState.lastSync?'Last sync '+new Date(cloudState.lastSync).toLocaleTimeString('en-IN'):'Durga Dairy'}</span><span class="avatar">${esc((user()?.name||'?')[0])}</span><span class="small">${esc(user()?.name||'')}</span></div></header><main class="page">${body}<div class="footer">Durga Dairy Management • Build ${BUILD_VERSION} • Logged in as ${esc(user()?.name||'')}</div></main></section></div>`;if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});applyDateFormat()}
function toggleSide(){const side=document.getElementById('side');side?.classList.toggle('open');document.getElementById('sideBackdrop')?.classList.toggle('open',!!side?.classList.contains('open'))}function closeSide(){document.getElementById('side')?.classList.remove('open');document.getElementById('sideBackdrop')?.classList.remove('open')}
function modal(title,body,saveFn){document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="modal"><div class="modalbox"><div class="modalhead"><h3>${title}</h3><button class="x" onclick="closeModal()">×</button></div>${body}<div class="actions"><button class="btn gray" onclick="closeModal()">Cancel</button><button class="btn" id="modalSave">Save</button></div></div></div>`);document.getElementById('modalSave').onclick=saveFn;applyDateFormat()}
function closeModal(){document.getElementById('modal')?.remove()}
function metric(label,value,sub=''){return `<div class="card metric"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`}
function monthTotal(arr,m,key='amount'){return arr.filter(x=>ym(x.date)===m).reduce((a,x)=>a+num(x[key]),0)}
function dashboard(){const m=ym(iso());const sales=monthTotal(db.sales,m),collections=monthTotal(db.collections,m),expenses=monthTotal(db.expenses,m),milkCost=monthTotal(db.milk,m,'total'),stockCost=monthTotal(db.stockPurchases,m,'total');const cashIn=sales+collections, cashOut=expenses+db.milk.filter(x=>ym(x.date)===m).reduce((a,x)=>a+num(x.paid),0)+db.stockPurchases.filter(x=>ym(x.date)===m).reduce((a,x)=>a+num(x.paid),0);const lastCheck=[...db.cashChecks].sort((a,b)=>b.date.localeCompare(a.date))[0];const expected=(lastCheck?num(lastCheck.actual):0)+cashIn-cashOut;const actual=lastCheck?num(lastCheck.actual):0;const diff=actual?actual-expected:0;const products=productStats(m);shell('dashboard',`<div class="sectionhead"><div><h1 style="margin:0">Good morning, ${esc(user()?.name||'')}</h1><div class="muted">Today ${iso()} • ${esc(user()?.role||'')}</div></div><div class="toolbar"><button class="btn green" onclick="quick('sale')">+ Daily Sale</button><button class="btn" onclick="quick('expense')">+ Expense</button><button class="btn orange" onclick="quick('milk')">+ Milk Purchase</button><button class="btn gray" onclick="quick('stock')">+ Stock Purchase</button></div></div><div class="grid">${metric('Sales This Month',money(sales))}${metric('Customer Collection',money(collections))}${metric('Milk Purchase',money(milkCost))}${metric('Expenses',money(expenses))}</div><div class="grid" style="margin-top:14px">${metric('Stock Purchase',money(stockCost))}${metric('Expected Cash',money(expected),'Calculated')}${metric('Actual Cash',actual?money(actual):'Not checked','Manual cash check')}${metric('Cash Difference',actual?money(diff):'—',actual?(diff===0?'Matched':'Needs reconciliation'):'Enter month-end cash')}</div><div class="charts section"><div class="card"><div class="sectionhead"><h2>Sales by Product</h2><span class="muted">${m}</span></div>${productBars(products)}</div><div class="card"><div class="sectionhead"><h2>Profit by Product</h2></div>${profitBars(products)}</div><div class="card"><div class="sectionhead"><h2>Sales Mix</h2></div><div class="donut"></div><div class="legend">${products.map(p=>`<span><b>${esc(p.name)}</b><span>${p.salesPct.toFixed(1)}%</span></span>`).join('')}</div></div></div><div class="card section"><div class="sectionhead"><h2>Product Performance</h2><button class="btn sm gray" onclick="render('reports')">Full Report</button></div>${productTable(products)}</div>`)}
function productStats(m){
 const names=['Milk','Ghee','Peda','Buttermilk','Other'];
 const monthSales=(db.sales||[]).filter(x=>ym(x.date)===m);
 const customerSales=(db.customerSales||[]).filter(x=>ym(x.date)===m);
 const records=names.map(name=>{
   let soldRows=[];
   if(name==='Milk'){
     soldRows=monthSales.filter(x=>x.product==='Milk'||x.saleGroup==='milk'||x.milkCategoryId||String(x.saleKey||'').startsWith('milkcat_')||x.saleKey==='milk'||/^\d+\s*વાળો$/.test(String(x.product||'').trim()));
     const dailyQty=soldRows.reduce((a,x)=>a+num(x.qty),0);
     const customerRows=customerSales.filter(x=>x.productKey==='milk'||x.product==='Milk'||x.productName==='Milk'||x.category==='Milk');
     const customerQty=customerRows.reduce((a,x)=>a+num(x.qty??x.quantity??x.morningQty??0),0);
     const dailyAmount=soldRows.reduce((a,x)=>a+num(x.amount),0);
     const customerAmount=customerRows.reduce((a,x)=>a+num(x.amount),0);
     const purchases=(db.milk||[]).filter(x=>ym(x.date)===m);
     const purchasedQty=purchases.reduce((a,x)=>a+num(x.cowLitres)+num(x.buffLitres),0);
     const purchaseCost=purchases.reduce((a,x)=>a+num(x.total),0);
     const qty=dailyQty+customerQty,saleAmt=dailyAmount+customerAmount;
     const avgCost=purchasedQty?purchaseCost/purchasedQty:0,cost=qty*avgCost,profit=saleAmt-cost;
     return {name,purchasedQty,qty,saleAmt,cost,profit,margin:saleAmt?profit/saleAmt*100:0,salesPct:0,unitMargin:qty?profit/qty:0,avgCost};
   }
   const matches=(x)=>x.product===name||x.productName===name||x.category===name||x.productKey===name.toLowerCase()||x.saleKey===name.toLowerCase();
   soldRows=monthSales.filter(matches);
   const custRows=customerSales.filter(matches);
   const qty=soldRows.reduce((a,x)=>a+num(x.qty??x.quantity),0)+custRows.reduce((a,x)=>a+num(x.qty??x.quantity),0);
   const saleAmt=soldRows.reduce((a,x)=>a+num(x.amount),0)+custRows.reduce((a,x)=>a+num(x.amount),0);
   const stock=(db.stockPurchases||[]).filter(x=>ym(x.date)===m&&String(x.item||'').toLowerCase()===name.toLowerCase());
   const purchasedQty=stock.reduce((a,x)=>a+num(x.qty),0),purchaseCost=stock.reduce((a,x)=>a+num(x.total||num(x.qty)*num(x.rate)),0);
   const soldCost=qty&&purchasedQty?qty*(purchaseCost/purchasedQty):0,profit=saleAmt-soldCost;
   return {name,purchasedQty,qty,saleAmt,cost:soldCost,purchaseCost,profit,margin:saleAmt?profit/saleAmt*100:0,salesPct:0,unitMargin:qty?profit/qty:0,avgCost:purchasedQty?purchaseCost/purchasedQty:0};
 });
 const total=records.reduce((a,x)=>a+x.saleAmt,0);records.forEach(p=>p.salesPct=total?p.saleAmt/total*100:0);return records;
}
function productBars(ps){const max=Math.max(1,...ps.map(x=>x.saleAmt));return `<div class="chartbar">${ps.map(p=>`<div class="bar" style="height:${Math.max(8,p.saleAmt/max*140)}px;background:${p.name==='Ghee'?'#f2b84b':p.name==='Milk'?'#58a9e5':p.name==='Peda'?'#9a79dc':p.name==='Buttermilk'?'#52b98e':'#e67b7b'}"><span>${esc(p.name)}</span></div>`).join('')}</div>`}
function profitBars(ps){const max=Math.max(1,...ps.map(x=>Math.max(0,x.profit)));return '<div class="chartbar" style="align-items:flex-end;padding-bottom:42px;position:relative">'+ps.map(p=>'<div class="bar" style="height:'+Math.max(8,Math.max(0,p.profit)/max*120)+'px;background:'+(p.margin>=60?'#0f9d6e':'#79bce9')+';position:relative"><span style="position:absolute;top:-20px;left:50%;transform:translateX(-50%);white-space:nowrap">'+p.margin.toFixed(0)+'%</span><small style="position:absolute;bottom:-34px;left:50%;transform:translateX(-50%);white-space:nowrap">'+esc(p.name)+'</small></div>').join('')+'</div><div class="muted" style="margin-top:8px">Bar height = profit contribution • top label = margin %</div>'}
function productTable(ps){return '<div class="tablewrap"><table class="table"><tr><th>Product</th><th>Qty Purchased</th><th>Qty Sold</th><th>Purchase Cost</th><th>Sales</th><th>Sold Cost</th><th>Profit</th><th>Margin %</th><th>Sales %</th></tr>'+ps.map(p=>'<tr><td><b>'+esc(p.name)+'</b>'+(p.name==='Milk'&&p.qty?'<div class="muted">Margin/L '+money(p.unitMargin)+'</div>':'')+'</td><td>'+num(p.purchasedQty).toFixed(2)+'</td><td>'+num(p.qty).toFixed(2)+'</td><td>'+money(p.purchaseCost??p.cost)+'</td><td>'+money(p.saleAmt)+'</td><td>'+money(p.cost)+'</td><td class="kpiGood"><b>'+money(p.profit)+'</b></td><td><span class="pill '+(p.margin>=30?'green':'orange')+'">'+p.margin.toFixed(1)+'%</span></td><td>'+p.salesPct.toFixed(1)+'%</td></tr>').join('')+'</table></div>'}
function quick(type){if(type==='sale')addSale();if(type==='expense')addExpense();if(type==='milk')addMilk();if(type==='stock')addStock()}
function renderMilkPrices(){
  const rows=(db.milkPriceVarieties||[]).slice().sort((a,b)=>String(a.effectiveDate||'').localeCompare(String(b.effectiveDate||'')));
  shell('milkPrices','<div class="sectionhead"><div><h1>Milk Price Varieties</h1><div class="muted">Effective-date prices. Historical sale records keep their saved rate.</div></div><button class="btn" onclick="addMilkPriceVariety()">+ Add Price Variety</button></div><div class="card section"><div class="tablewrap"><table class="table"><tr><th>Name</th><th>Rate ₹/L</th><th>Effective From</th><th>Status</th><th>Action</th></tr>'+rows.map(x=>'<tr><td>'+esc(x.name||'Milk')+'</td><td>'+money(x.rate)+'</td><td>'+fmtDate(x.effectiveDate)+'</td><td>'+(x.active===false?'<span class="pill red">Inactive</span>':'<span class="pill green">Active</span>')+'</td><td><button class="btn sm gray" onclick="editMilkPriceVariety(\''+x.id+'\')">Edit</button> <button class="btn sm orange" onclick="toggleMilkPriceVariety(\''+x.id+'\')">'+(x.active===false?'Activate':'Deactivate')+'</button></td></tr>').join('')||'<tr><td colspan="5" class="empty">No price varieties saved. Add the first price to begin.</td></tr>'+'</table></div></div>','Milk Price Varieties');
}
function addMilkPriceVariety(){
  db.milkPriceVarieties=db.milkPriceVarieties||[];
  modal('Add Milk Price Variety','<div class="formgrid"><div class="field span2"><label>Variety Name</label><input id="milkPriceName" placeholder="e.g. Regular Milk"></div><div class="field"><label>Rate ₹/L</label><input id="milkPriceRate" type="number" step="0.01"></div><div class="field"><label>Effective From</label><input id="milkPriceDate" type="date" value="'+iso()+'"></div></div>',()=>{
    const name=val('milkPriceName').trim(),rate=num(val('milkPriceRate')),effectiveDate=val('milkPriceDate')||iso();
    if(!name||rate<=0)return alert('Enter variety name and a positive rate.');
    if(db.milkPriceVarieties.some(x=>String(x.name).trim().toLowerCase()===name.toLowerCase()&&x.active!==false))return alert('An active variety with this name already exists.');
    const r={id:uid(),name,rate,effectiveDate,active:true,businessId:'akash',createdBy:user()?.id||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    db.milkPriceVarieties.push(r);audit('CREATE','Milk Price Variety',r.id,null,r);save();closeModal();renderMilkPrices();
  });
}
function editMilkPriceVariety(id){
  const x=(db.milkPriceVarieties||[]).find(v=>v.id===id);if(!x)return;const before={...x};
  modal('Edit Milk Price Variety','<div class="formgrid"><div class="field span2"><label>Variety Name</label><input id="milkPriceName" value="'+esc(x.name||'')+'"></div><div class="field"><label>Rate ₹/L</label><input id="milkPriceRate" type="number" step="0.01" value="'+num(x.rate)+'"></div><div class="field"><label>Effective From</label><input id="milkPriceDate" type="date" value="'+(x.effectiveDate||iso())+'"></div></div><div class="notice">This changes the price master only. Existing sale records retain their stored rate and amount.</div>',()=>{
    const name=val('milkPriceName').trim(),rate=num(val('milkPriceRate')),effectiveDate=val('milkPriceDate')||iso();if(!name||rate<=0)return alert('Enter a name and positive rate.');
    x.name=name;x.rate=rate;x.effectiveDate=effectiveDate;x.updatedAt=new Date().toISOString();audit('UPDATE','Milk Price Variety',id,before,x);save();closeModal();renderMilkPrices();
  });
}
function toggleMilkPriceVariety(id){
  const x=(db.milkPriceVarieties||[]).find(v=>v.id===id);if(!x)return;const before={...x};x.active=x.active===false;x.updatedAt=new Date().toISOString();audit('UPDATE','Milk Price Variety',id,before,x);save();renderMilkPrices();
}
function addAkashMilkSale(){
  db.milkPriceVarieties=db.milkPriceVarieties||[];
  const date=iso(),rates=db.milkPriceVarieties.filter(x=>x.active!==false&&String(x.effectiveDate||'0000-00-00')<=date).sort((a,b)=>String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
  if(!rates.length){if(confirm('No active milk price varieties are available. Open Milk Price Varieties now?'))renderMilkPrices();else alert('Add at least one active milk price variety before entering Akash milk sales.');return;}
  const batchId=uid();window.__akashMilkSaleRates=rates;
  const lines=rates.map((x,i)=>'<tr><td>'+esc(x.name)+'</td><td>'+money(x.rate)+'</td><td><input id="akashMilkQty_'+i+'" type="number" min="0" step="0.01" value="0" oninput="akashMilkSaleTotals()"></td><td><span id="akashMilkAmt_'+i+'">₹0</span></td></tr>').join('');
  modal('Akash • Multi-rate Milk Sale','<div class="formgrid"><div class="field"><label>Sale Date</label><input id="akashMilkDate" type="date" value="'+date+'"></div><div class="field"><label>Payment Mode</label><select id="akashMilkMode"><option>Cash</option><option>UPI</option><option>Bank</option><option>Credit</option><option>Mixed</option></select></div><div class="field span4"><div class="notice">Enter actual litres only. No water percentage or slab calculation is used. Each line keeps its own saved rate and stable record ID.</div></div></div><div class="tablewrap"><table class="table"><tr><th>Variety</th><th>Rate</th><th>Actual Quantity (L)</th><th>Line Amount</th></tr>'+lines+'</table></div><div class="grid" style="margin-top:12px"><div class="card metric"><div class="label">Total Quantity</div><div id="akashMilkTotalQty" class="value">0 L</div></div><div class="card metric"><div class="label">Total Sales</div><div id="akashMilkTotalAmt" class="value">₹0</div></div></div>',()=>{
    const selected=rates.map((x,i)=>({...x,qty:num(val('akashMilkQty_'+i))})).filter(x=>x.qty>0);
    if(!selected.length)return alert('Enter a positive quantity for at least one milk price variety.');
    const chosenDate=val('akashMilkDate')||date;if(db.sales.some(x=>x.batchId===batchId))return alert('This batch has already been saved.');
    if(selected.some(x=>String(x.effectiveDate||'0000-00-00')>chosenDate))return alert('One or more selected prices were not effective on this historical date. Add/use a rate effective on or before the sale date.');
    const totalQty=selected.reduce((a,x)=>a+x.qty,0),totalAmt=selected.reduce((a,x)=>a+x.qty*x.rate,0),mode=val('akashMilkMode'),createdAt=new Date().toISOString();
    for(const x of selected){const r={id:uid(),batchId,date:chosenDate,product:'Milk',saleKey:'milk',priceVarietyId:x.id,priceVarietyName:x.name,qty:x.qty,rate:num(x.rate),amount:x.qty*num(x.rate),paymentMode:mode,userId:user()?.id||'',businessId:'akash',createdAt,updatedAt:createdAt};db.sales.push(r);audit('CREATE','Daily Sale',r.id,null,r);}
    db.settings.lastAkashMilkSaleBatch={batchId,date:chosenDate,totalQty,totalAmt,createdAt};save();closeModal();render('sales');
  });
}
function akashMilkSaleTotals(){
  const rates=window.__akashMilkSaleRates||[];
  let qty=0,amount=0;rates.forEach((x,i)=>{const q=num(val('akashMilkQty_'+i)),a=q*num(x.rate);qty+=q;amount+=a;const el=document.getElementById('akashMilkAmt_'+i);if(el)el.textContent=money(a)});
  const q=document.getElementById('akashMilkTotalQty'),a=document.getElementById('akashMilkTotalAmt');if(q)q.textContent=qty.toFixed(2)+' L';if(a)a.textContent=money(amount);
}
function addSale(preKey=''){if(isAkash()&&preKey==='milk')return addAkashMilkSale();ensureSalesConfig();const products=saleProducts(),initial=products.find(p=>p.key===preKey)||products[0];modal('Daily Sale • Bulk Entry',`<div class="formgrid"><div class="field"><label>Date</label><input id="date" type="date" value="${presetDate}"></div><div class="field"><label>Product</label><select id="productKey" onchange="saleProductChanged()">${products.map(p=>`<option value="${p.key}" ${p.key===initial.key?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><div class="field"><label>Selling Rate ₹</label><input id="rate" type="number" step="0.01" value="${getSaleRate(initial.key)}" oninput="saleAmountChanged()"><div class="muted">Bulk Daily Sale rate.</div></div><div class="field"><label>Quantity</label><input id="qty" type="number" step="0.01" oninput="saleAmountChanged()"></div><div class="field"><label>Total Sale ₹</label><input id="amount" type="number" step="0.01" value="0"></div><div class="field"><label>Payment Mode</label><select id="pay"><option>Cash</option><option>UPI</option><option>Bank</option><option>Credit</option><option>Other</option></select></div><div class="field span2" id="saleDescWrap"><label>Description</label><input id="desc" placeholder="Description for Other sale"></div><div class="field span4"><div class="notice">Daily Saleમાં Customer Name રાખવામાં આવતું નથી. આ section માત્ર દિવસના bulk sales માટે છે.</div></div></div>`,()=>{const key=val('productKey'),p=products.find(x=>x.key===key)||initial,date=val('date'),r={id:uid(),date,product:p.name,saleKey:key,customerId:'',customerName:'',qty:num(val('qty')),rate:num(val('rate')),amount:num(val('amount')),paymentMode:val('pay'),description:val('desc')};if(!r.amount&&r.qty&&r.rate)r.amount=r.qty*r.rate;if(key==='other'&&!String(r.description||'').trim())return alert('Description is required when Product is Other.');if(!r.amount)return alert('Enter quantity/rate or total sale amount.');db.sales.push(r);audit('CREATE','Daily Sale',r.id,null,r);save();closeModal();render('sales')});saleProductChanged()}
function saleProductChanged(){const key=val('productKey'),r=document.getElementById('rate'),wrap=document.getElementById('saleDescWrap');if(r)r.value=getSaleRate(key);if(wrap)wrap.style.display=key==='other'?'block':'none';saleAmountChanged()}
function saleCustomerChanged(){const cid=val('customerId'),c=(db.customers||[]).find(x=>x.id===cid),key=val('productKey'),date=val('date')||iso(),r=document.getElementById('rate');if(r)r.value=c?customerRateFor(c,key,date):getSaleRate(key);saleAmountChanged()}
function saleAmountChanged(){const q=num(val('qty')),r=num(val('rate')),a=document.getElementById('amount');if(a&&q&&r)a.value=(q*r).toFixed(2)}

function addCollection(){
  const presetDate=window.__collectionPresetDate||iso();window.__collectionPresetDate='';
  const customers=[...(db.customers||[])].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const customerOptions=customers.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
  const collectionModeOptions=isAkash()?'<option>Bulk Collection</option>':'<option>Customer-wise</option><option>Bulk Collection</option>';
  modal('Bill Collection',`<div class="formgrid">
    <div class="field"><label>Date</label><input id="date" type="date" value="${iso()}"></div>
    <div class="field"><label>Mode</label><select id="mode" onchange="toggleCollectionCustomer()">${collectionModeOptions}</select></div>
    <div class="field"><label>Customer</label><select id="customerId" onchange="collectionCustomerChanged()"><option value="">Select Customer</option>${customerOptions}</select></div>
    <div class="field"><label id="nameLabel">Customer</label><input id="name" placeholder="Select customer"></div>
    <div class="field"><label>Amount ₹</label><input id="amount" type="number" oninput="collectionAmountChanged()"><div id="collectionBalance" class="muted" style="margin-top:6px"></div></div>
    <div class="field"><label>Payment Mode</label><select id="pay"><option>Cash</option><option>UPI</option><option>Bank</option><option>Other</option></select></div>
  </div>`,()=>{
    const mode=val('mode'),cid=val('customerId'),c=(db.customers||[]).find(x=>x.id===cid);
    const name=mode==='Customer-wise'?(c?.name||''):val('name');
    if(mode==='Customer-wise'&&!c)return alert('Please select a customer.');
    if(mode==='Bulk Collection'&&!name)return alert('Please enter description.');
    const r={id:uid(),date:val('date'),mode,name,customerId:mode==='Customer-wise'?cid:'',amount:num(val('amount')),paymentMode:val('pay')};
    if(!r.amount)return alert('Enter amount.');
    db.collections.push(r);audit('CREATE','Bill Collection',r.id,null,r);save();closeModal();render('collections')
  });
  toggleCollectionCustomer();
}
function toggleCollectionCustomer(){
  const mode=document.getElementById('mode')?.value,sel=document.getElementById('customerId'),name=document.getElementById('name');
  if(!sel||!name)return;
  const isCustomer=mode==='Customer-wise';
  sel.disabled=!isCustomer;name.disabled=isCustomer;
  const label=document.getElementById('nameLabel');
  if(label)label.textContent=isCustomer?'Customer':'Description / Note';
  if(isCustomer){name.placeholder='Select customer from dropdown';name.value='';collectionCustomerChanged()}else{sel.value='';name.value='';name.placeholder='e.g. Bulk milk collection'}
}
function getCustomerOutstanding(customerId){const c=(db.customers||[]).find(x=>x.id===customerId);return c?num(customerAging(c).outstanding):0}
function collectionCustomerChanged(){const sel=document.getElementById('customerId'),name=document.getElementById('name');if(!sel||!name)return;const c=(db.customers||[]).find(x=>x.id===sel.value);if(c){name.value=c.name;collectionAmountChanged()}else{const b=document.getElementById('collectionBalance');if(b)b.textContent=''}}
function collectionAmountChanged(){const box=document.getElementById('collectionBalance');if(!box)return;const cid=val('customerId');if(val('mode')!=='Customer-wise'||!cid){box.textContent='';return}const due=getCustomerOutstanding(cid),amt=num(val('amount'));box.innerHTML='<b>Current Outstanding: '+money(due)+'</b> • After payment: <b>'+money(Math.max(0,due-amt))+'</b>'}

function expenseCategories(){const base=['Home','Fixed / Utility','EMI','Hospital','Car','Bike','Grocery','Fuel','Dairy Expense','Other'];return [...new Set([...base,...(db.settings?.expenseCategories||[]),...(db.expenses||[]).map(x=>String(x.category||'').trim()).filter(Boolean)])].sort((a,b)=>a.localeCompare(b))}
function toggleExpenseCategory(){const wrap=document.getElementById('newExpenseCategoryWrap');if(wrap)wrap.style.display=val('cat')==='__new__'?'block':'none'}
function addExpense(){modal('Add Expense',`<div class="formgrid"><div class="field"><label>Date</label><input id="date" type="date" value="${iso()}"></div><div class="field"><label>Category</label><select id="cat" onchange="toggleExpenseCategory()">${expenseCategories().map(x=>'<option>'+esc(x)+'</option>').join('')}<option value="__new__">+ Add New Category</option></select><div id="newExpenseCategoryWrap" style="display:none;margin-top:8px"><input id="newExpenseCategory" placeholder="New category name"></div></div><div class="field"><label>Amount ₹</label><input id="amount" type="number"></div><div class="field"><label>Payment Mode</label><select id="pay"><option>Cash</option><option>UPI</option><option>Bank</option><option>Other</option></select></div><div class="field span4"><label>Description ${val('cat')==='Home'?'(mandatory)':''}</label><textarea id="desc" placeholder="Where / what was the expense?"></textarea></div></div>`,()=>{let category=val('cat');if(category==='__new__'){category=val('newExpenseCategory').trim();if(!category)return alert('Enter a new category name.');db.settings.expenseCategories=Array.isArray(db.settings.expenseCategories)?db.settings.expenseCategories:[];if(!db.settings.expenseCategories.includes(category))db.settings.expenseCategories.push(category);}const r={id:uid(),date:val('date'),category,amount:num(val('amount')),paymentMode:val('pay'),description:val('desc'),businessId:isAkash()?'akash':'hiren',userId:user()?.id||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};if(!r.amount||!r.description&&r.category==='Home')return alert('Amount and Home description are required.');db.expenses.push(r);audit('CREATE','Expense',r.id,null,r);save();closeModal();render('expenses')})}
function addMilk(){
  if(isAkash()){
    const vendors=(db.vendors||[]).filter(v=>v.active!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    modal('Akash • Milk Purchase',`<div class="formgrid">
      <div class="field"><label>Date</label><input id="date" type="date" value="${iso()}"></div>
      <div class="field"><label>Main Vendor</label><select id="vendor">${vendors.map(v=>'<option value="'+esc(v.name)+'">'+esc(v.name)+'</option>').join('')}</select></div>
      <div class="field"><label>Main Vendor Morning (L)</label><input id="mainMorning" type="number" min="0" step="0.01" value="0"></div>
      <div class="field"><label>Main Vendor Evening (L)</label><input id="mainEvening" type="number" min="0" step="0.01" value="0"></div>
      <div class="field"><label>Akash Morning (L)</label><input id="akashMorning" type="number" min="0" step="0.01" value="0"></div>
      <div class="field"><label>Akash Evening (L)</label><input id="akashEvening" type="number" min="0" step="0.01" value="0"></div>
      <div class="field"><label>Purchase Rate ₹/L</label><input id="purchaseRate" type="number" min="0" step="0.01"></div>
      <div class="field"><label>Paid Now ₹</label><input id="paid" type="number" min="0" step="0.01" value="0"></div>
      <div class="field span4"><label>Note</label><input id="milkNote" placeholder="Vendor purchase / morning-evening split"></div>
      <div class="field span4"><div class="notice">The vendor purchase cost is calculated from Main Vendor Morning + Evening quantities. Akash Morning/Evening quantities are stored separately for reconciliation and do not create a second purchase.</div></div>
    </div>`,()=>{
      if(!vendors.length)return alert('Add a vendor in Vendor Master first.');
      const mainMorning=num(val('mainMorning')),mainEvening=num(val('mainEvening')),akashMorning=num(val('akashMorning')),akashEvening=num(val('akashEvening')),purchaseRate=num(val('purchaseRate')),paid=num(val('paid'));
      const mainTotal=mainMorning+mainEvening,akashTotal=akashMorning+akashEvening;
      if(mainTotal<=0||purchaseRate<=0)return alert('Enter positive main vendor quantity and purchase rate.');
      if([mainMorning,mainEvening,akashMorning,akashEvening,paid].some(x=>x<0))return alert('Quantities and payment cannot be negative.');
      const total=mainTotal*purchaseRate;if(paid>total)return alert('Paid amount cannot exceed purchase total.');
      const nowAt=new Date().toISOString(),r={id:uid(),date:val('date')||iso(),vendor:val('vendor'),mainVendorMorning:mainMorning,mainVendorEvening:mainEvening,akashMorning,akashEvening,mainVendorTotal:mainTotal,akashRecordedTotal:akashTotal,milkLitres:mainTotal,cowLitres:mainTotal,cowRate:purchaseRate,buffLitres:0,buffRate:0,purchaseRate,total,paid,balance:total-paid,note:val('milkNote'),businessId:'akash',userId:user()?.id||'',createdAt:nowAt,updatedAt:nowAt};
      db.milk.push(r);audit('CREATE','Milk Purchase',r.id,null,r);save();closeModal();render('milk');
    });
    return;
  }
  modal('Daily Milk Purchase • Cow + Buffalo',`<div class="formgrid"><div class="field"><label>Date</label><input id="date" type="date" value="${iso()}"></div><div class="field"><label>Vendor</label><select id="vendor"><option value="">Select Vendor</option>${(db.vendors||[]).filter(v=>v.active!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(v=>'<option value="'+esc(v.name)+'">'+esc(v.name)+'</option>').join('')}</select><div class="muted">Select a vendor from Vendor Master. Use Vendors to add a new name.</div></div><div class="field"><label>Cow Litres</label><input id="cow" type="number" step="0.01"></div><div class="field"><label>Cow Rate ₹/L</label><input id="cowRate" type="number" step="0.01" value="${db.settings.cowRate}"></div><div class="field"><label>Buffalo Litres</label><input id="buff" type="number" step="0.01"></div><div class="field"><label>Buffalo Rate ₹/L</label><input id="buffRate" type="number" step="0.01" value="${db.settings.buffaloRate}"></div><div class="field"><label>Paid Now ₹</label><input id="paid" type="number" value="0"></div><div class="field"><label>Effective Rate Change?</label><select id="change"><option value="no">No, use current</option><option value="yes">Yes, save this rate from this date</option></select></div><div class="field span4"><div class="notice">Rates are date-based. Changing a rate here never rewrites older purchases. If you enter a new rate for a date, that rate applies from that date forward until another rate change is entered.</div></div></div>`,()=>{const r={id:uid(),date:val('date'),vendor:val('vendor'),cowLitres:num(val('cow')),cowRate:num(val('cowRate')),buffLitres:num(val('buff')),buffRate:num(val('buffRate')),paid:num(val('paid'))};r.total=r.cowLitres*r.cowRate+r.buffLitres*r.buffRate;r.balance=r.total-r.paid;if(!r.vendor)return alert('Select a vendor from Vendor Master.');if(!r.cowLitres&&!r.buffLitres)return alert('Enter cow or buffalo litres.');if(val('change')==='yes'){db.settings.cowRate=r.cowRate;db.settings.buffaloRate=r.buffRate;db.prices.push({id:uid(),date:r.date,cowRate:r.cowRate,buffaloRate:r.buffRate,createdBy:user().name})}db.milk.push(r);audit('CREATE','Milk Purchase',r.id,null,r);save();closeModal();render('milk')})}
function stockPurchaseCategories(){
 db.settings=db.settings||{};
 let cats=Array.isArray(db.settings.stockPurchaseCategories)?db.settings.stockPurchaseCategories.slice():['Ghee','Peda','Other'];
 (db.stockPurchases||[]).forEach(x=>{if(x.item&&!cats.includes(x.item))cats.push(x.item)});
 ['Ghee','Peda','Other'].forEach(x=>{if(!cats.includes(x))cats.push(x)});
 db.settings.stockPurchaseCategories=cats;return cats;
}
function stockPurchaseItemOptions(selected){
 const cats=stockPurchaseCategories();if(selected&&!cats.includes(selected))cats.unshift(selected);
 return cats.map(x=>'<option value="'+esc(x)+'" '+(x===selected?'selected':'')+'>'+esc(x)+'</option>').join('');
}
function stockVendorOptions(selected){
 const vendors=(db.vendors||[]).filter(v=>v.active!==false).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 let names=vendors.map(v=>v.name).filter(Boolean);if(selected&&!names.includes(selected))names.unshift(selected);
 return '<option value="">Select vendor</option>'+names.map(n=>'<option value="'+esc(n)+'" '+(n===selected?'selected':'')+'>'+esc(n)+'</option>').join('');
}
function addStockCategory(){
 modal('Add Stock Purchase Category','<div class="field"><label>Category Name</label><input id="stockNewCategory" placeholder="e.g. Butter, Oil, Packing Material"></div><div class="notice">The category will be available in the Stock Purchase item dropdown.</div>',()=>{
  const name=String(val('stockNewCategory')||'').trim();if(!name)return alert('Enter a category name.');
  const cats=stockPurchaseCategories();if(cats.some(x=>x.toLowerCase()===name.toLowerCase()))return alert('This category already exists.');
  cats.push(name);db.settings.stockPurchaseCategories=cats;save();closeModal();addStock();
 });
}
function addStock(){
 const cats=stockPurchaseCategories();
 const body='<div class="formgrid"><div class="field"><label>Date</label><input id="date" type="date" value="'+iso()+'"></div><div class="field"><label>Item / Category</label><select id="item">'+stockPurchaseItemOptions(cats[0])+'</select></div><div class="field"><label>Quantity</label><input id="qty" type="number" min="0" step="0.01"></div><div class="field"><label>Unit</label><select id="unit"><option>kg</option><option>litre</option><option>piece</option><option>packet</option><option>box</option><option>unit</option></select></div><div class="field"><label>Purchase Rate ₹</label><input id="rate" type="number" min="0" step="0.01" value="'+num(db.settings.gheeBuyRate)+'"></div><div class="field"><label>Paid Now ₹</label><input id="paid" type="number" min="0" step="0.01" value="0"></div><div class="field"><label>Stock Until (optional)</label><input id="until" type="date"></div><div class="field"><label>Vendor</label><select id="vendor">'+stockVendorOptions('')+'</select></div><div class="field span4"><div class="notice">Total and pending balance are calculated automatically. Add any new item using Add Category.</div></div></div><div class="toolbar"><button type="button" class="btn gray" onclick="addStockCategory()">+ Add Category</button><button type="button" class="btn gray" onclick="closeModal();render(\'vendors\')">Manage Vendors</button></div>';
 modal('Stock Purchase • Add Purchase',body,()=>{
  const r={id:uid(),date:val('date'),item:val('item'),qty:num(val('qty')),unit:val('unit'),rate:num(val('rate')),paid:num(val('paid')),stockUntil:val('until'),vendor:val('vendor')};
  if(!r.date)return alert('Select purchase date.');if(!r.item)return alert('Select a category.');
  if(r.qty<=0||r.rate<0)return alert('Enter a valid quantity and purchase rate.');if(r.paid<0)return alert('Paid amount cannot be negative.');
  r.total=r.qty*r.rate;r.balance=Math.max(0,r.total-r.paid);db.stockPurchases.push(r);
  if(r.item==='Ghee')db.settings.gheeBuyRate=r.rate;if(r.item==='Peda')db.settings.pedaBuyRate=r.rate;
  audit('CREATE','Stock Purchase',r.id,null,r);save();closeModal();render('stock');
 });
}
function addUsage(){modal('Stock Usage / Sale Adjustment',`<div class="formgrid"><div class="field"><label>Date</label><input id="date" type="date" value="${iso()}"></div><div class="field"><label>Item</label><select id="item"><option>Ghee</option><option>Peda</option><option>Other</option></select></div><div class="field"><label>Quantity Used / Sold</label><input id="qty" type="number" step="0.01"></div><div class="field span2"><label>Description</label><input id="desc" placeholder="Stock used/sold"></div></div>`,()=>{const r={id:uid(),date:val('date'),item:val('item'),qty:num(val('qty')),description:val('desc')};if(!r.qty)return alert('Enter quantity.');db.stockUsage.push(r);audit('CREATE','Stock Usage',r.id,null,r);save();closeModal();render('stock')})}
function akashMilkSlabs(){db.milkSlabs=Array.isArray(db.milkSlabs)?db.milkSlabs:[];return db.milkSlabs;}
function addMilkSlab(){const slabs=akashMilkSlabs();modal('Akash • Add Milk Selling Slab',`<div class="formgrid"><div class="field span2"><label>Slab Name</label><input id="name" placeholder="e.g. 25%"></div><div class="field"><label>Slab %</label><input id="percent" type="number" step="0.01" placeholder="25"></div><div class="field span4"><div class="notice">આ % માત્ર Slab classification માટે છે. Customerનું actual Selling Price અલગથી રાખી શકાશે.</div></div></div>`,()=>{const percent=num(val('percent')),name=val('name').trim()||((percent%1===0?percent:percent.toFixed(2))+'%');if(percent<0)return alert('Slab % cannot be negative.');if(slabs.some(x=>String(x.name).toLowerCase()===name.toLowerCase()))return alert('This slab already exists.');const r={id:uid(),name,percent};slabs.push(r);audit('CREATE','Milk Selling Slab',r.id,null,r);save();closeModal();render('customers')});}
function renderMilkSlabs(){if(!isAkash())return render('customers');const slabs=akashMilkSlabs().slice().sort((a,b)=>num(a.percent)-num(b.percent));const rows=slabs.map(x=>'<tr><td><b>'+esc(x.name)+'</b></td><td>'+num(x.percent).toFixed(2)+'%</td><td>'+((db.customers||[]).filter(c=>c.slabId===x.id&&c.active!==false).length)+'</td></tr>').join('')||'<tr><td colspan="3" class="empty">No slabs.</td></tr>';shell('customers','<div class="sectionhead"><div><h1>Milk Selling Slabs</h1><div class="muted">Manual slab master. Add any slabs you need, such as 0%, 15%, 25%, 30%.</div></div><div class="toolbar"><button class="btn" onclick="addMilkSlab()">+ Add Slab</button><button class="btn gray" onclick="render(\'customers\')">Back to Customers</button></div></div><div class="card section"><div class="tablewrap"><table class="table"><tr><th>Slab</th><th>Percentage</th><th>Active Customers</th></tr>'+rows+'</table></div></div>','Milk Selling Slabs');}

function akashSlabOptions(selected=''){
  return akashMilkSlabs().slice().sort((a,b)=>num(a.percent)-num(b.percent))
    .map(x=>'<option value="'+x.id+'" '+(x.id===selected?'selected':'')+'>'+esc(x.name)+'</option>').join('');
}
function addCustomer(){
  if(isAkash()){
    const slabOpts=akashSlabOptions();
    modal('Akash • New Milk Customer',`<div class="formgrid">
      <div class="field span2"><label>Customer Name</label><input id="name"></div>
      <div class="field"><label>Mobile Number</label><input id="mobile"></div>
      <div class="field span4"><label>Address</label><input id="address"></div>
      <div class="field"><label>Effective From</label><input id="effectiveDate" type="date" value="${iso()}"></div>
      <div class="field"><label>Status</label><select id="active"><option value="true">Active</option><option value="false">Inactive</option></select></div>
      <div class="field span4"><div class="notice"><b>Milk Schedule</b><br>દરેક Morning / Evening entry માટે Quantity, Slab અને Rate અલગથી રાખવામાં આવશે. આ જ schedule Daily Milk Entryમાં automatic આવશે.</div></div>
      <div class="field span4"><div class="card" style="margin:0;padding:12px;border-left:4px solid #2e9d57"><h3 style="margin:0">🐄 Cow Milk</h3></div></div>
      <div class="field"><label>Cow • Morning Quantity (L)</label><input id="cowMorningQty" type="number" step="0.01" value="0"></div>
      
      <div class="field"><label>Cow • Morning Rate ₹/L</label><input id="cowMorningRate" type="number" step="0.01" placeholder="e.g. 76"></div>
      <div class="field"><label>Cow • Evening Quantity (L)</label><input id="cowEveningQty" type="number" step="0.01" value="0"></div>
      
      <div class="field"><label>Cow • Evening Rate ₹/L</label><input id="cowEveningRate" type="number" step="0.01" placeholder="e.g. 76"></div>
      <div class="field span4"><div class="card" style="margin:0;padding:12px;border-left:4px solid #2e9d57"><h3 style="margin:0">🐃 Buffalo Milk</h3></div></div>
      <div class="field"><label>Buffalo • Morning Quantity (L)</label><input id="buffMorningQty" type="number" step="0.01" value="0"></div>
      
      <div class="field"><label>Buffalo • Morning Rate ₹/L</label><input id="buffMorningRate" type="number" step="0.01" placeholder="e.g. 80"></div>
      <div class="field"><label>Buffalo • Evening Quantity (L)</label><input id="buffEveningQty" type="number" step="0.01" value="0"></div>
      
      <div class="field"><label>Buffalo • Evening Rate ₹/L</label><input id="buffEveningRate" type="number" step="0.01" placeholder="e.g. 80"></div>
    </div>`,()=>{
      const name=val('name').trim();
      if(!name)return alert('Enter customer name.');
      if((db.customers||[]).some(x=>String(x.name).trim().toLowerCase()===name.toLowerCase()))return alert('Customer name already exists.');
      const date=val('effectiveDate')||iso();
      const cm={qty:num(val('cowMorningQty')),slabId:val('cowMorningSlab'),rate:num(val('cowMorningRate'))};
      const ce={qty:num(val('cowEveningQty')),slabId:val('cowEveningSlab'),rate:num(val('cowEveningRate'))};
      const bm={qty:num(val('buffMorningQty')),slabId:val('buffMorningSlab'),rate:num(val('buffMorningRate'))};
      const be={qty:num(val('buffEveningQty')),slabId:val('buffEveningSlab'),rate:num(val('buffEveningRate'))};
      const r={id:uid(),name,mobile:val('mobile'),address:val('address'),product:'Milk',saleKey:'milk',
        slabId:cm.slabId||ce.slabId||bm.slabId||be.slabId||'',active:val('active')!=='false',
        cowRate:cm.rate||ce.rate,cowMorning:cm.qty,cowEvening:ce.qty,buffRate:bm.rate||be.rate,buffMorning:bm.qty,buffEvening:be.qty,
        milkSchedule:{cow:{morning:cm,evening:ce,rate:cm.rate||ce.rate},buffalo:{morning:bm,evening:be,rate:bm.rate||be.rate}},
        priceHistory:[],createdAt:new Date().toISOString()};
      const defaultRate=r.cowRate||r.buffRate||0;if(defaultRate)r.priceHistory.push({id:uid(),productKey:'milk',date,rate:defaultRate});
      db.customers.push(r);audit('CREATE','Customer',r.id,null,r);save();closeModal();render('customers');
    });
    return;
  }
  modal('Add Customer',`<div class="formgrid"><div class="field span2"><label>Customer Name</label><input id="name"></div><div class="field"><label>Mobile Number</label><input id="mobile"></div><div class="field span2"><label>Address</label><input id="address"></div><div class="field"><label>Product</label><select id="productKey"><option value="milk">Milk</option><option value="buttermilk">Buttermilk</option><option value="ghee">Ghee</option><option value="peda">Peda</option></select></div><div class="field"><label>Selling Price ₹</label><input id="rate" type="number" step="0.01"></div><div class="field"><label>Effective From</label><input id="effectiveDate" type="date" value="${iso()}"></div><div class="field"><label>Status</label><select id="active"><option value="true">Active</option><option value="false">Inactive</option></select></div></div>`,()=>{const name=val('name').trim();if(!name)return alert('Enter customer name.');if((db.customers||[]).some(x=>String(x.name).trim().toLowerCase()===name.toLowerCase()))return alert('Customer name already exists.');const key=val('productKey'),date=val('effectiveDate')||iso(),rate=num(val('rate'));const r={id:uid(),name,mobile:val('mobile'),address:val('address'),product:saleProducts().find(x=>x.key===key)?.name||'Milk',saleKey:key,active:val('active')!=='false',priceHistory:[{id:uid(),productKey:key,date,rate}],createdAt:new Date().toISOString()};db.customers.push(r);audit('CREATE','Customer',r.id,null,r);save();closeModal();render('customers')})}
function editCustomer(id){
  const c=(db.customers||[]).find(x=>x.id===id);if(!c)return;
  if(isAkash()){
    const s=customerMilkSchedule(c);
    const totalFixed=num(c.fixedDailyQty ?? (s.cow.morning+s.cow.evening+s.buffalo.morning+s.buffalo.evening));
    const fixedRate=num(c.fixedRate ?? (s.cow.rate||s.buffalo.rate));
    const html='<div class="formgrid">'+
      '<div class="field span2"><label>Customer Name</label><input id="name" value="'+esc(c.name||'')+'"></div>'+
      '<div class="field"><label>Mobile Number</label><input id="mobile" value="'+esc(c.mobile||'')+'"></div>'+
      '<div class="field span4"><label>Address</label><input id="address" value="'+esc(c.address||'')+'"></div>'+
      '<div class="field"><label>Milk Status</label><select id="active"><option value="true" '+(c.active!==false?'selected':'')+'>Milk Taken</option><option value="false" '+(c.active===false?'selected':'')+'>Milk Not Taken</option></select></div>'+
      '<div class="field"><label>Daily Fixed Milk (L)</label><input id="fixedDailyQty" type="number" step="0.01" value="'+totalFixed+'"></div>'+
      '<div class="field"><label>Fixed Milk Rate ₹/L</label><input id="fixedRate" type="number" step="0.01" value="'+fixedRate+'"></div>'+
      '<div class="field span4"><div class="notice">Customer Editમાં Slab નથી. અહીં ફક્ત Daily Fixed Milk અને Fixed Rate બદલાશે. Name / Mobile / Address પણ અહીંથી સુધારી શકાય છે.</div></div>'+
      '</div>';
    modal('Akash • Edit Milk Customer',html,()=>{
      const name=val('name').trim(),qty=num(val('fixedDailyQty')),rate=num(val('fixedRate'));
      if(!name)return alert('Enter customer name.');
      if((db.customers||[]).some(x=>x.id!==c.id&&String(x.name).trim().toLowerCase()===name.toLowerCase()))return alert('Customer name already exists.');
      if(qty<0||rate<0)return alert('Quantity and rate cannot be negative.');
      c.name=name;c.mobile=val('mobile');c.address=val('address');c.active=val('active')!=='false';c.fixedDailyQty=qty;c.fixedRate=rate;
      const oldTotal=s.cow.morning+s.cow.evening+s.buffalo.morning+s.buffalo.evening;
      let cm=0,ce=0,bm=0,be=0;
      if(qty>0){
        if(oldTotal>0){const scale=qty/oldTotal;cm=s.cow.morning*scale;ce=s.cow.evening*scale;bm=s.buffalo.morning*scale;be=s.buffalo.evening*scale;}
        else cm=qty;
      }
      c.cowMorning=cm;c.cowEvening=ce;c.buffMorning=bm;c.buffEvening=be;c.cowRate=rate;c.buffRate=rate;
      c.milkSchedule={cow:{morning:{qty:cm,slabId:s.cow.morningSlabId,rate},evening:{qty:ce,slabId:s.cow.eveningSlabId,rate},rate},
        buffalo:{morning:{qty:bm,slabId:s.buffalo.morningSlabId,rate},evening:{qty:be,slabId:s.buffalo.eveningSlabId,rate},rate}};
      const date=iso();if(rate)addCustomerPriceHistory(c,'milk',date,rate);
      audit('UPDATE','Customer',c.id,null,c);save();closeModal();render('customers');
    });
    return;
  }
  const key=c.saleKey||'milk',rate=customerRateFor(c,key,iso());modal('Edit Customer',`<div class="formgrid"><div class="field span2"><label>Customer Name</label><input value="${esc(c.name||'')}" readonly></div><div class="field"><label>Mobile Number</label><input id="mobile" value="${esc(c.mobile||'')}"></div><div class="field span2"><label>Address</label><input id="address" value="${esc(c.address||'')}"></div><div class="field"><label>Product</label><select id="productKey">${saleProducts().filter(p=>p.key!=='other').map(p=>'<option value="'+p.key+'" '+(p.key===key?'selected':'')+'>'+esc(p.name)+'</option>').join('')}</select></div><div class="field"><label>New Selling Price ₹</label><input id="rate" type="number" step="0.01" value="${rate}"></div><div class="field"><label>Effective From</label><input id="effectiveDate" type="date" value="${iso()}"></div><div class="field"><label>Status</label><select id="active"><option value="true" ${c.active!==false?'selected':''}>Active</option><option value="false" ${c.active===false?'selected':''}>Inactive</option></select></div></div>`,()=>{c.mobile=val('mobile');c.address=val('address');const nk=val('productKey'),nd=val('effectiveDate')||iso(),nr=num(val('rate'));c.saleKey=nk;c.product=saleProducts().find(x=>x.key===nk)?.name||c.product;c.active=val('active')!=='false';addCustomerPriceHistory(c,nk,nd,nr);audit('UPDATE','Customer',c.id,null,c);save();closeModal();render('customers')})}
function addVendor(){
  if(isAkash()){
    modal('Akash • Milk Vendor',`<div class="formgrid"><div class="field span2"><label>Vendor Name</label><input id="name"></div><div class="field"><label>Phone</label><input id="phone"></div><div class="field span4"><div class="notice">Akash portalમાં Vendor માત્ર Milk purchase માટે રહેશે.</div></div></div>`,()=>{const r={id:uid(),name:val('name'),type:'Milk',phone:val('phone')};if(!r.name)return alert('Enter vendor name.');db.vendors.push(r);audit('CREATE','Vendor',r.id,null,r);save();closeModal();render('vendors')});
    return;
  }
  modal('Vendor',`<div class="formgrid"><div class="field span2"><label>Name</label><input id="name"></div><div class="field"><label>Type</label><select id="type"><option>Milk</option><option>Ghee</option><option>Peda</option><option>Other</option></select></div><div class="field"><label>Phone</label><input id="phone"></div></div>`,()=>{const r={id:uid(),name:val('name'),type:val('type'),phone:val('phone')};if(!r.name)return alert('Enter vendor name.');db.vendors.push(r);audit('CREATE','Vendor',r.id,null,r);save();closeModal();render('vendors')})}
function addCashCheck(){modal('Manual Cash Check',`<div class="formgrid"><div class="field"><label>Date</label><input id="date" type="date" value="${iso()}"></div><div class="field"><label>Actual Cash ₹</label><input id="actual" type="number"></div><div class="field span2"><label>Note</label><input id="note" placeholder="Physical cash count"></div></div>`,()=>{const r={id:uid(),date:val('date'),actual:num(val('actual')),note:val('note')};if(!r.actual)return alert('Enter actual cash.');db.cashChecks.push(r);audit('CREATE','Cash Check',r.id,null,r);save();closeModal();render('cash')})}
function val(id){const e=document.getElementById(id);if(!e)return '';return e.dataset.isoDate||e.value||''}
function formatDateDMY(isoDate){const s=String(isoDate||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const [y,m,d]=s.split('-');return d+'-'+m+'-'+y.slice(-2)}
function parseDateDMY(v){const s=String(v||'').trim();let m=s.match(/^(\d{2})-(\d{2})-(\d{2})$/);if(m){const y=Number(m[3])+(Number(m[3])>=70?1900:2000),d=Number(m[1]),mo=Number(m[2]),dt=new Date(y,mo-1,d);if(dt.getFullYear()===y&&dt.getMonth()===mo-1&&dt.getDate()===d)return String(y).padStart(4,'0')+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0')}m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(m){const d=Number(m[1]),mo=Number(m[2]),y=Number(m[3]),dt=new Date(y,mo-1,d);if(dt.getFullYear()===y&&dt.getMonth()===mo-1&&dt.getDate()===d)return String(y).padStart(4,'0')+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0')}if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;return ''}
function updateDateDropdown(id){const hidden=document.getElementById(id),d=document.getElementById(id+'__dd'),m=document.getElementById(id+'__mm'),y=document.getElementById(id+'__yy');if(!hidden||!d||!m||!y)return;let value='';if(d.value&&m.value&&y.value){const yy=Number(y.value),mm=Number(m.value),max=new Date(yy,mm,0).getDate();if(Number(d.value)>max)d.value=String(max).padStart(2,'0');const day=Number(d.value),dt=new Date(yy,mm-1,day);if(dt.getFullYear()===yy&&dt.getMonth()===mm-1&&dt.getDate()===day)value=String(yy).padStart(4,'0')+'-'+String(mm).padStart(2,'0')+'-'+String(day).padStart(2,'0')}hidden.value=value;}
function updateMonthDropdown(id){const hidden=document.getElementById(id),m=document.getElementById(id+'__mm'),y=document.getElementById(id+'__yy');if(!hidden||!m||!y)return;hidden.value=m.value&&y.value?y.value+'-'+m.value:'';}
function clearDateDropdown(id){const hidden=document.getElementById(id);if(!hidden)return;['__dd','__mm','__yy'].forEach(s=>{const e=document.getElementById(id+s);if(e)e.value=''});hidden.value='';hidden.dispatchEvent(new Event('change',{bubbles:true}));}
function applyDateFormat(){document.querySelectorAll('input[type="date"],input[type="month"]').forEach(el=>{if(el.dataset.dropdownized==='1')return;const type=el.type,id=el.id;if(!id)return;const value=el.value||'',onchange=el.getAttribute('onchange')||'',disabled=el.disabled?' disabled':'';let controls='',hidden='';if(type==='date'){const parts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value),yy=parts?parts[1]:'',mm=parts?parts[2]:'',dd=parts?parts[3]:'';const days='<option value="">DD</option>'+Array.from({length:31},(_,i)=>{const v=String(i+1).padStart(2,'0');return '<option value="'+v+'" '+(v===dd?'selected':'')+'>'+v+'</option>'}).join(''),months='<option value="">MM</option>'+Array.from({length:12},(_,i)=>{const v=String(i+1).padStart(2,'0');return '<option value="'+v+'" '+(v===mm?'selected':'')+'>'+v+'</option>'}).join(''),years='<option value="">YY</option>'+Array.from({length:111},(_,i)=>{const v=String(1990+i);return '<option value="'+v+'" '+(v===yy?'selected':'')+'>'+v.slice(-2)+'</option>'}).join('');controls='<select id="'+id+'__dd" aria-label="Day"'+disabled+'>'+days+'</select><span style="align-self:center">-</span><select id="'+id+'__mm" aria-label="Month"'+disabled+'>'+months+'</select><span style="align-self:center">-</span><select id="'+id+'__yy" aria-label="Year"'+disabled+'>'+years+'</select>';hidden='<input type="hidden" id="'+id+'" value="'+value.replace(/"/g,'&quot;')+'"'+(onchange?' onchange="'+onchange.replace(/"/g,'&quot;')+'"':'')+' data-date-dropdown="date">';}else{const parts=/^(\d{4})-(\d{2})$/.exec(value),yy=parts?parts[1]:'',mm=parts?parts[2]:'';const months='<option value="">MM</option>'+Array.from({length:12},(_,i)=>{const v=String(i+1).padStart(2,'0');return '<option value="'+v+'" '+(v===mm?'selected':'')+'>'+v+'</option>'}).join(''),years='<option value="">YY</option>'+Array.from({length:111},(_,i)=>{const v=String(1990+i);return '<option value="'+v+'" '+(v===yy?'selected':'')+'>'+v.slice(-2)+'</option>'}).join('');controls='<select id="'+id+'__mm" aria-label="Month"'+disabled+'>'+months+'</select><span style="align-self:center">-</span><select id="'+id+'__yy" aria-label="Year"'+disabled+'>'+years+'</select>';hidden='<input type="hidden" id="'+id+'" value="'+value.replace(/"/g,'&quot;')+'"'+(onchange?' onchange="'+onchange.replace(/"/g,'&quot;')+'"':'')+' data-date-dropdown="month">';}const wrap=document.createElement('div');wrap.className='dateDropdown';wrap.style.cssText='display:inline-flex;align-items:center;gap:4px;max-width:100%;';wrap.innerHTML=controls+hidden;wrap.querySelectorAll('select').forEach(sel=>{sel.style.cssText='min-width:58px;max-width:76px;padding:8px 4px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--text);';sel.addEventListener('change',()=>type==='date'?updateDateDropdown(id):updateMonthDropdown(id));});if(onchange){const apply=document.createElement('button');apply.type='button';apply.className='btn sm gray';apply.textContent='Apply';apply.style.cssText='padding:8px 10px;white-space:nowrap;';apply.addEventListener('click',()=>{const h=document.getElementById(id);if(h)h.dispatchEvent(new Event('change',{bubbles:true}));});wrap.appendChild(apply);}el.replaceWith(wrap);});}
function tableRows(rows,cols,actions=true){return `<div class="tablewrap"><table class="table"><tr>${cols.map(c=>`<th>${c[0]}</th>`).join('')}${actions?'<th>Action</th>':''}</tr>${rows.map(r=>`<tr>${cols.map(c=>`<td>${c[1](r)}</td>`).join('')}${actions?`<td><button class="btn sm gray" onclick="editGeneric('${r._entity}','${r.id}')">Edit</button> <button class="btn sm red" onclick="deleteGeneric('${r._entity}','${r.id}')">Delete</button></td>`:''}</tr>`).join('')||`<tr><td colspan="${cols.length+(actions?1:0)}" class="empty">No entries.</td></tr>`}</table></div>`}
function listWithEntity(arr,entity){return arr.map(x=>Object.assign({_entity:entity},x))}
function dateFilters(prefix,section){const modes=window.__dateFilterModes||{},values=window.__dateFilterValues||{},mode=modes[prefix]||'all',date=values[prefix]===undefined?iso():values[prefix];return "<div class='card' style='margin-bottom:12px'><div class='toolbar'><select id='"+prefix+"Mode' onchange=\"applySectionFilter('"+section+"','"+prefix+"')\"><option value='all' "+(mode==='all'?'selected':'')+">All Dates</option><option value='month' "+(mode==='month'?'selected':'')+">Month</option><option value='year' "+(mode==='year'?'selected':'')+">Year</option><option value='date' "+(mode==='date'?'selected':'')+">Specific Date</option></select><input id='"+prefix+"Value' type='date' value='"+date+"' onchange=\"applySectionFilter('"+section+"','"+prefix+"')\"><button class='btn sm gray' onclick=\"document.getElementById('"+prefix+"Mode').value='all';clearDateDropdown('"+prefix+"Value');applySectionFilter('"+section+"','"+prefix+"')\">Clear</button></div></div>"}
function applySectionFilter(section,prefix){const mode=document.getElementById(prefix+'Mode')?.value||'all',el=document.getElementById(prefix+'Value'),date=el?.value||'';window.__dateFilterModes=window.__dateFilterModes||{};window.__dateFilterValues=window.__dateFilterValues||{};window.__dateFilterModes[prefix]=mode;window.__dateFilterValues[prefix]=date;const value=mode==='month'?date.slice(0,7):mode==='year'?date.slice(0,4):mode==='date'?date:'';window['render'+section[0].toUpperCase()+section.slice(1)](mode,value)}
function milkMarginReportHTML(salesRows,mode='all',value=''){const rows=salesRows.filter(x=>x.saleKey==='milk');const buys=(db.milk||[]).filter(x=>filterDate(x.date,mode,value));const buyLit=buys.reduce((a,x)=>a+num(x.cow)+num(x.buff),0),buyCost=buys.reduce((a,x)=>a+num(x.cow)*num(x.cowRate)+num(x.buff)*num(x.buffRate),0),avgBuy=buyLit?buyCost/buyLit:0;const groups=[...new Set(rows.map(x=>num(x.rate).toFixed(2)))].map(rate=>{const rr=rows.filter(x=>num(x.rate).toFixed(2)===rate),qty=rr.reduce((a,x)=>a+num(x.qty),0),sales=rr.reduce((a,x)=>a+num(x.amount),0),cost=qty*avgBuy,margin=sales-cost;return{rate:num(rate),qty,sales,cost,margin,marginPerL:qty?margin/qty:0}});return '<div class="card section"><div class="sectionhead"><div><h2 style="margin:0">Milk Selling Price Margin Report</h2><div class="muted">દરેક Selling Price એક અલગ category છે. Purchase cost માટે selected periodનું weighted average Milk Purchase rate વપરાય છે.</div></div></div><table><thead><tr><th>Milk Category</th><th>Purchase/L</th><th>Sell/L</th><th>Qty</th><th>Sales</th><th>Cost</th><th>Margin</th><th>Margin/L</th></tr></thead><tbody>'+(groups.map(g=>'<tr><td><b>₹'+g.rate.toFixed(2)+'/L</b></td><td>'+money(avgBuy)+'</td><td>'+money(g.rate)+'</td><td>'+g.qty.toFixed(2)+' L</td><td>'+money(g.sales)+'</td><td>'+money(g.cost)+'</td><td><b>'+money(g.margin)+'</b></td><td>'+money(g.marginPerL)+'</td></tr>').join('')||'<tr><td colspan="10" class="muted">No Milk sales for this period.</td></tr>')+'</tbody></table></div>'}function renderSales(mode='all',value=''){ensureSalesConfig();const rows=listWithEntity([...db.sales].filter(x=>filterDate(x.date,mode,value)).sort((a,b)=>a.date.localeCompare(b.date)),'sales');const filtered=db.sales.filter(x=>filterDate(x.date,mode,value));const fixedFiltered=(db.customerSales||[]).filter(x=>filterDate(x.date,mode,value));const fixedTotal=fixedFiltered.reduce((a,x)=>a+num(x.amount),0);const summaries=saleProducts().map(p=>{const rr=filtered.filter(x=>(x.saleKey===p.key)||(p.key==='milk'&&!x.saleKey&&x.product==='Milk'));return {...p,qty:rr.reduce((a,x)=>a+num(x.qty),0),amt:rr.reduce((a,x)=>a+num(x.amount),0)}});const bulkGrand=summaries.reduce((a,x)=>a+x.amt,0),grand=bulkGrand+fixedTotal;const cards=summaries.map(p=>`<div class="card"><div class="sectionhead"><div><h3 style="margin:0">${esc(saleLabel(p.key))}</h3><div class="muted">${p.qty.toFixed(2)} ${p.unit} • ${money(p.amt)} sold</div></div><span class="pill green">Bulk Daily Sale</span></div><div class="toolbar"><button class="btn sm green" onclick="addSale('${p.key}')">+ Sale</button></div></div>`).join('');const report=milkMarginReportHTML(filtered,mode,value)+`<div class="card section"><div class="sectionhead"><div><h2 style="margin:0">Sales Report</h2><div class="muted">Selected ${mode==='all'?'all dates':mode==='date'?fmtDate(value):value}</div></div><span class="pill green">Grand Total ${money(grand)}</span></div><table><thead><tr><th>Product</th><th>Quantity</th><th>Sales Amount</th></tr></thead><tbody>${summaries.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${p.qty.toFixed(2)} ${p.unit}</td><td>${money(p.amt)}</td></tr>`).join('')}<tr><td><b>Bulk Sales Total</b></td><td>—</td><td><b>${money(bulkGrand)}</b></td></tr><tr><td><b>Fixed Customer Sales</b></td><td>—</td><td><b>${money(fixedTotal)}</b></td></tr><tr><td><b>GRAND TOTAL SALES</b></td><td>—</td><td><b>${money(grand)}</b></td></tr></tbody></table></div>`;shell('sales',`${dateFilters('salesFilter','sales')}<div class="sectionhead"><div><h1>Daily Sale</h1><div class="muted">Daily bulk sales only. Customer name is not part of Daily Sale.</div></div><div class="toolbar">${isAkash()?'<button class="btn orange" onclick="renderMilkPrices()">Manage Milk Prices</button>':''}<button class="btn green" onclick="addSale()">+ Add Daily Sale</button></div></div><div class="grid">${cards}</div>${report}<div class="card section"><div class="sectionhead"><h2>Daily Sale Entries</h2></div>${tableRows(rows,[['Date',r=>fmtDate(r.date)],['Product',r=>`<span class="pill">${esc(r.product||'')}</span>`],['Qty',r=>r.qty||'—'],['Rate',r=>r.rate?money(r.rate):'—'],['Amount',r=>money(r.amount)],['Description',r=>esc(r.description||'')]])}</div>`,'Daily Sale')}function renderCollections(mode='all',value=''){
 const rows=listWithEntity([...db.collections].filter(x=>filterDate(x.date,mode,value)).sort((a,b)=>String(b.date).localeCompare(String(a.date))),'collections');
 const total=rows.reduce((a,r)=>a+num(r.amount),0),customerTotal=rows.filter(x=>x.mode==='Customer-wise').reduce((a,x)=>a+num(x.amount),0),bulkTotal=rows.filter(x=>x.mode==='Bulk Collection').reduce((a,x)=>a+num(x.amount),0);
 const dates={};rows.forEach(x=>{if(x.date)(dates[x.date]=dates[x.date]||[]).push(x);});
 window.__collectionOpenDates=window.__collectionOpenDates||{};
 const keys=Object.keys(dates).sort((a,b)=>b.localeCompare(a));
 const grouped=keys.map(date=>{
   const list=dates[date],dayTotal=list.reduce((a,x)=>a+num(x.amount),0),dayCustomer=list.filter(x=>x.mode==='Customer-wise').reduce((a,x)=>a+num(x.amount),0),dayBulk=list.filter(x=>x.mode==='Bulk Collection').reduce((a,x)=>a+num(x.amount),0),open=!!window.__collectionOpenDates[date];
   const detail=list.map(x=>'<tr><td>'+esc(x.mode||'Customer-wise')+'</td><td>'+esc(x.name||'')+'</td><td>'+money(x.amount)+'</td><td>'+esc(x.paymentMode||'')+'</td><td><button class="btn sm gray" data-id="'+x.id+'" onclick="editGeneric(&quot;collections&quot;,this.dataset.id)">Edit</button> <button class="btn sm red" data-id="'+x.id+'" onclick="deleteGeneric(&quot;collections&quot;,this.dataset.id)">Delete</button></td></tr>').join('');
   return '<div class="card section" style="padding:0;overflow:hidden"><div style="display:flex;gap:8px;align-items:center;padding:10px"><button type="button" data-date="'+date+'" onclick="toggleCollectionDate(this.dataset.date)" style="flex:1;display:flex;justify-content:space-between;align-items:center;text-align:left;border:0;background:#fff;padding:8px;cursor:pointer"><span><b>'+fmtDate(date)+'</b><span class="muted" style="display:block">'+list.length+' collection entries • Customer-wise '+money(dayCustomer)+' • Bulk '+money(dayBulk)+'</span></span><span style="text-align:right"><b>'+money(dayTotal)+'</b><span class="muted" style="display:block">'+(open?'Hide details':'View details')+'</span></span></button><button class="btn sm green" data-date="'+date+'" onclick="addCollectionForDate(this.dataset.date)">+ Add</button></div><div style="display:'+(open?'block':'none')+';padding:12px;border-top:1px solid var(--line)"><div class="sectionhead"><h3>Collection Details • '+fmtDate(date)+'</h3><button class="btn sm green" data-date="'+date+'" onclick="addCollectionForDate(this.dataset.date)">+ Add Collection</button></div><div class="tablewrap"><table class="table"><thead><tr><th>Mode</th><th>Customer / Note</th><th>Amount</th><th>Payment</th><th>Actions</th></tr></thead><tbody>'+detail+'</tbody><tfoot><tr><th colspan="2">Date Total</th><th>'+money(dayTotal)+'</th><th colspan="2">Customer-wise '+money(dayCustomer)+' • Bulk '+money(dayBulk)+'</th></tr></tfoot></table></div></div></div>';
 }).join('');
 shell('collections',dateFilters('collectionFilter','collections')+'<div class="sectionhead"><div><h1>Bill Collection</h1><div class="muted">Date-wise summary • click a date to view and manage individual collections</div></div><button class="btn" onclick="addCollection()">+ Add Collection</button></div><div class="grid">'+metric('Total Recorded',money(total))+metric('Customer-wise',money(customerTotal))+metric('Bulk',money(bulkTotal))+metric('Entries',rows.length)+'</div><div class="section"><h2>Bill Collection • Date-wise</h2>'+grouped+(keys.length?'':'<div class="empty">No collection entries for this period.</div>')+'</div>','Bill Collection');
}
window.toggleCollectionDate=function(date){window.__collectionOpenDates=window.__collectionOpenDates||{};window.__collectionOpenDates[date]=!window.__collectionOpenDates[date];renderCollections(window.__dateFilterModes?.collectionFilter||'all',window.__dateFilterModes?.collectionFilter==='month'?(window.__dateFilterValues?.collectionFilter||'').slice(0,7):window.__dateFilterModes?.collectionFilter==='year'?(window.__dateFilterValues?.collectionFilter||'').slice(0,4):window.__dateFilterModes?.collectionFilter==='date'?(window.__dateFilterValues?.collectionFilter||''):'');};
window.addCollectionForDate=function(date){window.__collectionPresetDate=date;addCollection();};
function akashMilkPeriodRows(mode='all',value=''){
  return [...(db.milk||[])].filter(x=>filterDate(x.date,mode,value)).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
function akashMilkProfitReportHTML(mode='all',value=''){
  const buys=akashMilkPeriodRows(mode,value),sales=(db.sales||[]).filter(x=>filterDate(x.date,mode,value)&&(x.saleKey==='milk'||String(x.product||'').toLowerCase()==='milk'));
  const purchaseQty=buys.reduce((a,x)=>a+num(x.mainVendorTotal||x.milkLitres||x.cowLitres)+num(x.buffLitres),0),purchaseCost=buys.reduce((a,x)=>a+num(x.total),0),avgCost=purchaseQty>0?purchaseCost/purchaseQty:null;
  const groups=new Map();
  for(const x of sales){const key=String(x.priceVarietyId||x.rate||'unassigned'),label=String(x.priceVarietyName||('₹'+num(x.rate).toFixed(2)+'/L'));if(!groups.has(key))groups.set(key,{label,qty:0,sales:0});const g=groups.get(key);g.qty+=num(x.qty);g.sales+=num(x.amount)}
  const rows=[...groups.values()].map(g=>({...g,cost:avgCost===null?null:g.qty*avgCost,profit:avgCost===null?null:g.sales-g.qty*avgCost,margin:avgCost===null||!g.sales?null:(g.sales-g.qty*avgCost)/g.sales*100}));
  const totalQty=rows.reduce((a,x)=>a+x.qty,0),totalSales=rows.reduce((a,x)=>a+x.sales,0),totalCost=avgCost===null?null:totalQty*avgCost,totalProfit=totalCost===null?null:totalSales-totalCost;
  const moneyOrMissing=v=>v===null?'Cost data incomplete':money(v);
  return '<div class="card section"><div class="sectionhead"><div><h2 style="margin:0">Akash • Actual Milk Cost & Rate-wise Sales</h2><div class="muted">Uses actual milk purchase quantities only. Internal transfers are tracked separately. No water or slab calculations.</div></div></div><div class="grid">'+metric('Actual Purchased Milk',purchaseQty.toFixed(2)+' L')+metric('Purchase Cost',money(purchaseCost))+metric('Weighted Cost / L',avgCost===null?'Missing purchase data':money(avgCost))+metric('Milk Sold',totalQty.toFixed(2)+' L')+metric('Milk Sales',money(totalSales))+metric('Estimated Profit',moneyOrMissing(totalProfit))+'</div><div class="tablewrap" style="margin-top:14px"><table class="table"><tr><th>Price Variety</th><th>Actual Quantity</th><th>Sales</th><th>Allocated Cost</th><th>Profit</th><th>Margin</th></tr>'+rows.map(x=>'<tr><td>'+esc(x.label)+'</td><td>'+x.qty.toFixed(2)+' L</td><td>'+money(x.sales)+'</td><td>'+moneyOrMissing(x.cost)+'</td><td>'+moneyOrMissing(x.profit)+'</td><td>'+(x.margin===null?'—':x.margin.toFixed(2)+'%')+'</td></tr>').join('')||'<tr><td colspan="6" class="empty">No bulk milk sales in this period.</td></tr>'+'</table></div></div>';
}
function renderMilk(mode='all',value=''){
  if(isAkash()){
    const rows=akashMilkPeriodRows(mode,value);
    const selectedTotal=rows.reduce((a,x)=>a+num(x.total),0),selectedPaid=rows.reduce((a,x)=>a+num(x.paid),0),selectedBalance=rows.reduce((a,x)=>a+num(x.balance),0),allPayable=(db.milk||[]).reduce((a,x)=>a+Math.max(0,num(x.total)-num(x.paid)),0);
    shell('milk',dateFilters('milkFilter','milk')+'<div class="sectionhead"><div><h1>Akash • Milk Purchase</h1><div class="muted">Main vendor purchase and Akash morning/evening quantities are recorded separately. No water-added quantity is calculated.</div></div><button class="btn orange" onclick="addMilk()">+ Add Milk Purchase</button></div><div class="grid">'+metric('Main Vendor Quantity',rows.reduce((a,x)=>a+num(x.mainVendorTotal||x.milkLitres||x.cowLitres),0).toFixed(2)+' L')+metric('Akash Morning / Evening',rows.reduce((a,x)=>a+num(x.akashMorning),0).toFixed(2)+' / '+rows.reduce((a,x)=>a+num(x.akashEvening),0).toFixed(2)+' L')+metric('Purchase Cost',money(selectedTotal))+metric('Paid',money(selectedPaid))+metric('Balance',money(selectedBalance))+'</div>'+akashMilkProfitReportHTML(mode,value)+'<div class="card section"><h2>Milk Purchase History</h2>'+tableRows(listWithEntity(rows,'milk'),[['Date',r=>fmtDate(r.date)],['Vendor',r=>esc(r.vendor||'')],['Main Vendor AM',r=>num(r.mainVendorMorning).toFixed(2)+' L'],['Main Vendor PM',r=>num(r.mainVendorEvening).toFixed(2)+' L'],['Akash AM',r=>num(r.akashMorning).toFixed(2)+' L'],['Akash PM',r=>num(r.akashEvening).toFixed(2)+' L'],['Rate',r=>money(r.purchaseRate||r.cowRate)],['Total',r=>money(r.total)],['Paid',r=>money(r.paid)],['Balance',r=>money(r.balance)]])+'</div><div class="card section"><b>Total Vendor Payable: '+money(allPayable)+'</b></div>','Milk Purchase');
    return;
  }
  const rows=listWithEntity([...(db.milk||[])].filter(x=>filterDate(x.date,mode,value)).sort((a,b)=>a.date.localeCompare(b.date)),'milk');const selectedTotal=rows.reduce((a,x)=>a+num(x.total),0),selectedPaid=rows.reduce((a,x)=>a+num(x.paid),0),selectedBalance=rows.reduce((a,x)=>a+num(x.balance),0),allPayable=(db.milk||[]).reduce((a,x)=>a+Math.max(0,num(x.total)-num(x.paid)),0);shell('milk',dateFilters('milkFilter','milk')+'<div class="sectionhead"><div><h1>Daily Milk Purchase</h1><div class="muted">Purchase history is daily. Unpaid vendor bills roll forward automatically month to month.</div></div><button class="btn orange" onclick="addMilk()">+ Add Milk Purchase</button></div><div class="grid">'+metric('Selected Purchase',money(selectedTotal))+metric('Selected Paid',money(selectedPaid))+metric('Selected Balance',money(selectedBalance))+metric('Total Vendor Payable',money(allPayable))+'</div><div class="card section" style="border-left:5px solid #e0a800"><b>🟡 Vendor Payable / ચૂકવવાનું બાકી: '+money(allPayable)+'</b><div class="muted">Unpaid milk purchase balance automatically remains payable in the next month.</div></div><div class="sectionhead"><h2>Purchase History</h2></div>'+tableRows(rows,[['Date',r=>fmtDate(r.date)],['Vendor',r=>esc(r.vendor||'')],['Cow',r=>r.cowLitres+' L × '+money(r.cowRate)],['Buffalo',r=>r.buffLitres+' L × '+money(r.buffRate)],['Total',r=>money(r.total)],['Paid',r=>money(r.paid)],['Balance',r=>money(r.balance)]])+ '<div class="card section"><b>Selected Period Total: '+money(selectedTotal)+'</b><br><b>Selected Period Balance: '+money(selectedBalance)+'</b></div>','Milk Purchase')}
function stockTotals(item){return db.stockPurchases.filter(x=>x.item===item).reduce((a,x)=>a+x.qty,0)-db.stockUsage.filter(x=>x.item===item).reduce((a,x)=>a+x.qty,0)}
window.__stockOpenDates=window.__stockOpenDates||{};
function toggleStockPurchaseDate(date){window.__stockOpenDates[date]=!window.__stockOpenDates[date];renderStock(window.__dateFilterModes?.stockFilter||'all',window.__dateFilterValues?.stockFilter||'');}
function renderStock(mode='all',value=''){
 const rows=listWithEntity([...(db.stockPurchases||[])].filter(x=>filterDate(x.date,mode,value)).sort((a,b)=>String(b.date).localeCompare(String(a.date))),'stockPurchases');
 const qtyBy={};rows.forEach(x=>qtyBy[x.item]=(qtyBy[x.item]||0)+num(x.qty));
 const total=rows.reduce((a,x)=>a+num(x.total),0),paid=rows.reduce((a,x)=>a+num(x.paid),0),balance=rows.reduce((a,x)=>a+Math.max(0,num(x.total)-num(x.paid)),0),allPayable=(db.stockPurchases||[]).reduce((a,x)=>a+Math.max(0,num(x.total)-num(x.paid)),0);
 const dates={};rows.forEach(x=>{if(x.date)(dates[x.date]=dates[x.date]||[]).push(x);});
 const dateKeys=Object.keys(dates).sort((a,b)=>b.localeCompare(a));
 const grouped=dateKeys.map(date=>{
  const list=dates[date],dayTotal=list.reduce((a,x)=>a+num(x.total),0),dayPaid=list.reduce((a,x)=>a+num(x.paid),0),dayBalance=list.reduce((a,x)=>a+Math.max(0,num(x.total)-num(x.paid)),0),open=!!window.__stockOpenDates[date];
  const details=list.map(x=>'<tr><td>'+esc(x.item||'Other')+'</td><td>'+num(x.qty)+' '+esc(x.unit||'unit')+'</td><td>'+money(x.rate)+'</td><td>'+money(x.total)+'</td><td>'+money(x.paid)+'</td><td><b>'+money(Math.max(0,num(x.total)-num(x.paid)))+'</b></td><td>'+esc(x.vendor||'')+'</td><td><button class="btn sm gray" data-id="'+x.id+'" onclick="editGeneric(&quot;stockPurchases&quot;,this.dataset.id)">Edit</button> <button class="btn sm red" data-id="'+x.id+'" onclick="deleteGeneric(&quot;stockPurchases&quot;,this.dataset.id)">Delete</button></td></tr>').join('');
  const safeDate=date.replace(/"/g,'&quot;');
  return '<div class="card section" style="padding:0;overflow:hidden"><div style="display:flex;align-items:center;gap:8px;padding:10px"><button type="button" data-date="'+safeDate+'" onclick="toggleStockPurchaseDate(this.dataset.date)" style="display:flex;flex:1;min-width:0;align-items:center;justify-content:space-between;text-align:left;border:0;background:#fff;padding:8px;cursor:pointer"><span><b>'+fmtDate(date)+'</b><span class="muted" style="display:block">'+list.length+' purchase entr'+(list.length===1?'y':'ies')+' • Paid '+money(dayPaid)+'</span></span><span style="text-align:right"><b>Total '+money(dayTotal)+'</b><span style="display:block;color:'+(dayBalance>0?'#b45309':'#087a56')+'">Pending '+money(dayBalance)+' • '+(open?'Hide':'View')+' details</span></span></button></div><div style="display:'+(open?'block':'none')+';padding:12px;border-top:1px solid var(--line)"><div class="tablewrap"><table class="table"><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th><th>Paid</th><th>Pending</th><th>Vendor</th><th>Actions</th></tr></thead><tbody>'+details+'</tbody><tfoot><tr><th colspan="3">Date Total</th><th>'+money(dayTotal)+'</th><th>'+money(dayPaid)+'</th><th>'+money(dayBalance)+'</th><th colspan="2"></th></tr></tfoot></table></div></div></div>';
 }).join('');
 const categoryStockCards=stockPurchaseCategories().map(item=>{const itemRows=(db.stockPurchases||[]).filter(x=>x.item===item);const units=[...new Set(itemRows.map(x=>x.unit||'unit'))];const unit=units.length===1?units[0]:units.length>1?'mixed units':(['Ghee','Peda'].includes(item)?'kg':'unit');return metric(item+' Stock',stockTotals(item).toFixed(2)+' '+unit)}).join('');
 shell('stock',dateFilters('stockFilter','stock')+'<div class="sectionhead"><div><h1>Stock Purchase & Stock</h1><div class="muted">Same-date purchases are grouped together. Tap a date to view, edit or delete each purchase.</div></div><div class="toolbar"><button class="btn gray" onclick="addStockCategory()">+ Add Category</button><button class="btn" onclick="addStock()">+ Stock Purchase</button><button class="btn gray" onclick="addUsage()">+ Stock Usage / Sale</button></div></div><div class="grid">'+categoryStockCards+metric('Selected Purchase',money(total))+metric('Selected Paid',money(paid))+metric('Selected Balance',money(balance))+metric('Total Stock Payable',money(allPayable))+'</div><div class="card section" style="border-left:5px solid #e0a800"><b>🟡 Total Stock Payable / ચૂકવવાનું બાકી: '+money(allPayable)+'</b><div class="muted">Unpaid vendor stock bills remain payable in future months.</div></div><div class="card section"><h2>Stock Purchase • Date-wise</h2>'+grouped+(dateKeys.length?'':'<div class="empty">No stock purchases for this period.</div>')+'</div><div class="card section"><b>Selected Period Total: '+money(total)+'</b><br><b>Selected Period Balance: '+money(balance)+'</b></div>','Stock Purchase');
}
function expenseSafeId(v){return String(v).replace(/[^a-zA-Z0-9_-]/g,'_')}
window.editExpenseDate=function(date){
 const ids=(window.__expenseVisibleIdsByDate||{})[date]||[],rows=ids.map(id=>(db.expenses||[]).find(x=>x.id===id)).filter(Boolean);if(!rows.length)return alert('No visible expense entries for this date.');
 const cats=expenseCategories(),pays=['Cash','UPI','Bank','Other'];
 const body='<div class="field"><label>Apply date to these entries</label><input type="date" id="expenseGroupDate" value="'+date+'"></div>'+rows.map(function(x){var id=expenseSafeId(x.id);return '<div class="card" style="margin:8px 0;padding:10px"><b>'+esc(x.category||'Expense')+' • '+money(x.amount)+'</b><div class="formgrid"><div class="field"><label>Category</label><select id="egc_'+id+'">'+[...new Set(cats.concat(x.category||[]))].filter(Boolean).map(c=>'<option value="'+esc(c)+'" '+(c===x.category?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div><div class="field"><label>Amount ₹</label><input id="ega_'+id+'" type="number" step="0.01" value="'+num(x.amount)+'"></div><div class="field"><label>Payment</label><select id="egp_'+id+'">'+pays.map(p=>'<option '+(p===(x.paymentMode||'Cash')?'selected':'')+'>'+p+'</option>').join('')+'</select></div><div class="field span2"><label>Description</label><textarea id="egd_'+id+'">'+esc(x.description||'')+'</textarea></div></div></div>';}).join('');
 modal('Edit Expense Entries • '+fmtDate(date),body,function(){var newDate=val('expenseGroupDate');if(!newDate)return alert('Select a valid date.');for(const x of rows){var id=expenseSafeId(x.id),amount=num(val('ega_'+id)),category=val('egc_'+id),description=val('egd_'+id);if(amount<=0)return alert('Every expense amount must be greater than zero.');if(category==='Home'&&!description.trim())return alert('Home expense description is required.');}rows.forEach(function(x){var id=expenseSafeId(x.id),before=JSON.parse(JSON.stringify(x));Object.assign(x,{date:newDate,category:val('egc_'+id),amount:num(val('ega_'+id)),paymentMode:val('egp_'+id),description:val('egd_'+id),updatedAt:new Date().toISOString()});audit('UPDATE','Expense',x.id,before,x);});save();closeModal();render('expenses');});
};
window.deleteExpenseDate=function(date){var ids=(window.__expenseVisibleIdsByDate||{})[date]||[],rows=ids.map(id=>(db.expenses||[]).find(x=>x.id===id)).filter(Boolean);if(!rows.length)return alert('No visible expense entries for this date.');if(!confirm('Delete '+rows.length+' visible expense entries dated '+fmtDate(date)+'? This cannot be undone from this screen.'))return;rows.forEach(function(x){var i=db.expenses.findIndex(y=>y.id===x.id);if(i>=0){var old=db.expenses[i];db.expenses.splice(i,1);recordDeletion('expenses',old.id,old);audit('DELETE','expenses',old.id,old,null);}});save();render('expenses');};
function toggleExpenseDate(date){window.__expenseOpenDates=window.__expenseOpenDates||{};window.__expenseOpenDates[date]=!window.__expenseOpenDates[date];renderExpenses(window.__expenseMode||'all',window.__expenseValue||'')}
function renderExpenses(mode='all',value=''){
 window.__expenseMode=mode;window.__expenseValue=value;
 const cat=document.getElementById('expenseCategory')?.value||'all';
 let rows=[...(db.expenses||[])].filter(x=>filterDate(x.date,mode,value)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 if(cat!=='all')rows=rows.filter(x=>x.category===cat);
 const total=rows.reduce((a,x)=>a+num(x.amount),0),cats=expenseCategories();
 const opts=cats.map(x=>'<option value="'+esc(x)+'" '+(x===cat?'selected':'')+'>'+esc(x)+'</option>').join('');
 const byDate={};rows.forEach(x=>{if(x.date)(byDate[x.date]=byDate[x.date]||[]).push(x)});
 const dates=Object.keys(byDate).sort((a,b)=>b.localeCompare(a));
 const grouped=dates.map(date=>{
   const list=byDate[date],dayTotal=list.reduce((a,x)=>a+num(x.amount),0),open=!!window.__expenseOpenDates?.[date],byCat={};
   list.forEach(x=>{const c=x.category||'Uncategorized';byCat[c]=(byCat[c]||0)+num(x.amount)});
   const breakdown=Object.keys(byCat).sort().map(c=>'<tr><td>'+esc(c)+'</td><td>'+money(byCat[c])+'</td></tr>').join('');
   const details=list.map(x=>'<tr><td>'+esc(x.category||'')+'</td><td>'+money(x.amount)+'</td><td>'+esc(x.description||'')+'</td><td>'+esc(x.paymentMode||'')+'</td><td><button class="btn sm gray" data-id="'+x.id+'" onclick="editGeneric(&quot;expenses&quot;,this.dataset.id)">Edit</button> <button class="btn sm red" data-id="'+x.id+'" onclick="deleteGeneric(&quot;expenses&quot;,this.dataset.id)">Delete</button></td></tr>').join('');
   window.__expenseVisibleIdsByDate=window.__expenseVisibleIdsByDate||{};window.__expenseVisibleIdsByDate[date]=list.map(x=>x.id);
   return '<div class="card section" style="padding:0;overflow:hidden"><div style="display:flex;gap:8px;align-items:center;padding:6px 10px"><button type="button" data-date="'+date+'" onclick="toggleExpenseDate(this.dataset.date)" style="flex:1;min-width:0;display:flex;justify-content:space-between;align-items:center;text-align:left;border:0;background:transparent;padding:8px;cursor:pointer"><span><b>'+fmtDate(date)+'</b><span class="muted" style="display:block">'+list.length+' expense entries</span></span><span style="text-align:right"><b>'+money(dayTotal)+'</b><span class="muted" style="display:block">'+(open?'Hide details':'View details')+'</span></span></button><div class="toolbar"><button class="btn sm gray" data-date="'+date+'" onclick="editExpenseDate(this.dataset.date)">Edit Entries</button><button class="btn sm red" data-date="'+date+'" onclick="deleteExpenseDate(this.dataset.date)">Delete Entries</button></div></div><div style="display:'+(open?'block':'none')+';padding:12px;border-top:1px solid var(--line)"><h3>Expense history • '+fmtDate(date)+'</h3><div class="tablewrap"><table class="table"><thead><tr><th>Category</th><th>Category Total</th></tr></thead><tbody>'+breakdown+'<tr><td><b>Day Total</b></td><td><b>'+money(dayTotal)+'</b></td></tr></tbody></table></div><div class="tablewrap"><table class="table"><thead><tr><th>Category</th><th>Amount</th><th>Description</th><th>Payment</th><th>Actions</th></tr></thead><tbody>'+details+'</tbody></table></div><div style="text-align:right"><b>Date Total: '+money(dayTotal)+'</b></div></div></div>';
 }).join('');
 shell('expenses',dateFilters('expenseFilter','expenses')+'<div class="sectionhead"><div><h1>Expenses</h1><div class="muted">Date-wise totals. Click a date to view, edit or delete individual expenses.</div></div><button class="btn red" onclick="addExpense()">+ Add Expense</button></div><div class="card section"><div class="toolbar"><label>Category</label><select id="expenseCategory" onchange="renderExpenses()"><option value="all" '+(cat==='all'?'selected':'')+'>All Categories</option>'+opts+'</select><span class="pill green">Total: '+money(total)+'</span></div></div><div class="card section"><h2>Expense Entries • Date-wise</h2>'+grouped+(dates.length?'':'<div class="empty">No expenses for this period.</div>')+'</div><div class="card" style="margin-top:12px;text-align:right"><b>TOTAL: '+money(total)+'</b></div>','Expenses');
}
function customerMonths(id){const ms=new Set();(db.customerSales||[]).filter(x=>x.customerId===id).forEach(x=>ms.add(ym(x.date)));(db.customerPayments||[]).filter(x=>x.customerId===id).forEach(x=>ms.add(x.month));(db.customerOpeningBalances||[]).filter(x=>x.customerId===id&&x.effectiveDate).forEach(x=>ms.add(ym(x.effectiveDate)));return [...ms].filter(Boolean).sort().reverse()}
function customerMonthSummary(id,month){const sales=(db.customerSales||[]).filter(x=>x.customerId===id&&ym(x.date)===month),bill=sales.reduce((a,x)=>a+num(x.amount),0),qty=sales.reduce((a,x)=>a+num(x.qty),0),pay=(db.customerPayments||[]).filter(x=>x.customerId===id&&x.month===month),paid=pay.reduce((a,x)=>a+num(x.amount),0),adjust=pay.reduce((a,x)=>a+num(x.adjustment),0),opening=customerBalanceBefore(id,month),balance=Math.max(0,opening+bill-paid-adjust);return{month,qty,bill,paid,adjust,opening,balance,status:balance<=0?'Paid':'Pending'}}
function customerBalanceBefore(id,month){let bill=0,paid=0,adjust=0,opening=0;(db.customerOpeningBalances||[]).filter(x=>x.customerId===id&&String(x.effectiveDate||'0000-00-00').slice(0,7)<=month).forEach(x=>opening+=num(x.amount));(db.customerSales||[]).filter(x=>x.customerId===id&&ym(x.date)<month).forEach(x=>bill+=num(x.amount));(db.customerPayments||[]).filter(x=>x.customerId===id&&x.month<month).forEach(x=>{paid+=num(x.amount);adjust+=num(x.adjustment)});return opening+bill-paid-adjust}
function customerAging(c){const sums=customerMonths(c.id).map(m=>customerMonthSummary(c.id,m)),unpaid=sums.filter(x=>x.bill>0&&x.balance>0),opening=(db.customerOpeningBalances||[]).filter(x=>x.customerId===c.id&&String(x.effectiveDate||'0000-00-00')<=iso()).reduce((a,x)=>a+num(x.amount),0),charges=(db.customerSales||[]).filter(x=>x.customerId===c.id&&String(x.date||'')<=iso()).reduce((a,x)=>a+num(x.amount),0),payments=(db.customerPayments||[]).filter(x=>x.customerId===c.id&&String(x.month||'')<=ym(iso())).reduce((a,x)=>a+num(x.amount)+num(x.adjustment),0);return{unpaidCount:unpaid.length,outstanding:Math.max(0,opening+charges-payments),current:sums.find(x=>x.month===ym(iso()))||{bill:0,paid:0,adjust:0,balance:0}}}
function editCustomerOpeningBalance(id){
  const c=(db.customers||[]).find(x=>x.id===id);if(!c)return;
  db.customerOpeningBalances=db.customerOpeningBalances||[];
  const old=db.customerOpeningBalances.find(x=>x.customerId===id);
  modal('Opening Balance • '+esc(c.name),'<div class="formgrid"><div class="field"><label>Opening Outstanding ₹</label><input id="openingAmount" type="number" step="0.01" value="'+num(old?.amount)+'"></div><div class="field"><label>Effective Date</label><input id="openingDate" type="date" value="'+(old?.effectiveDate||iso())+'"></div><div class="field span4"><label>Reference / Note</label><input id="openingNote" value="'+esc(old?.note||'')+'" placeholder="Previous ledger reference"></div><div class="field span4"><div class="notice">This is an auditable opening balance. It carries forward into later months and does not create a sale or payment.</div></div></div>',()=>{
    const amount=num(val('openingAmount')),effectiveDate=val('openingDate')||iso(),note=val('openingNote');
    if(old){const before={...old};old.amount=amount;old.effectiveDate=effectiveDate;old.note=note;old.updatedAt=new Date().toISOString();audit('UPDATE','Customer Opening Balance',old.id,before,old);}
    else{const r={id:uid(),customerId:id,amount,effectiveDate,note,businessId:'hiren',createdBy:user()?.id||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};db.customerOpeningBalances.push(r);audit('CREATE','Customer Opening Balance',r.id,null,r);}
    save();closeModal();renderCustomerLedger(id);
  });
}
function customerDailyExisting(customerId,date){return (db.customerSales||[]).find(x=>x.customerId===customerId&&x.date===date&&x.productKey==='milk')}

function customerMilkSchedule(c){
  const old=c?.milkSchedule||{},defaultSlab=c?.slabId||'';
  const make=(raw,qtyFallback,rateFallback,slabFallback)=>{
    if(raw&&typeof raw==='object'&&!Array.isArray(raw))return {qty:num(raw.qty),rate:num(raw.rate||rateFallback),slabId:raw.slabId||slabFallback||defaultSlab};
    return {qty:num(raw),rate:num(rateFallback),slabId:slabFallback||defaultSlab};
  };
  const cm=make(old.cow?.morning,c?.cowMorning,old.cow?.rate||c?.cowRate,old.cow?.morningSlabId||defaultSlab);
  const ce=make(old.cow?.evening,c?.cowEvening,old.cow?.rate||c?.cowRate,old.cow?.eveningSlabId||defaultSlab);
  const bm=make(old.buffalo?.morning,c?.buffMorning,old.buffalo?.rate||c?.buffRate,old.buffalo?.morningSlabId||defaultSlab);
  const be=make(old.buffalo?.evening,c?.buffEvening,old.buffalo?.rate||c?.buffRate,old.buffalo?.eveningSlabId||defaultSlab);
  return {cow:{morning:cm.qty,evening:ce.qty,rate:cm.rate||ce.rate,morningRate:cm.rate,eveningRate:ce.rate,morningSlabId:cm.slabId,eveningSlabId:ce.slabId},
    buffalo:{morning:bm.qty,evening:be.qty,rate:bm.rate||be.rate,morningRate:bm.rate,eveningRate:be.rate,morningSlabId:bm.slabId,eveningSlabId:be.slabId}};
}
function dailyMilkValues(c,date){
  const s=customerMilkSchedule(c),x=customerDailyExisting(c.id,date);if(x)return x;
  const cm=s.cow.morning,ce=s.cow.evening,bm=s.buffalo.morning,be=s.buffalo.evening,qty=cm+ce+bm+be;
  const amount=cm*s.cow.morningRate+ce*s.cow.eveningRate+bm*s.buffalo.morningRate+be*s.buffalo.eveningRate;
  return {morningQty:cm+bm,eveningQty:ce+be,cowMorningQty:cm,cowEveningQty:ce,buffMorningQty:bm,buffEveningQty:be,
    cowRate:s.cow.rate,buffRate:s.buffalo.rate,cowMorningRate:s.cow.morningRate,cowEveningRate:s.cow.eveningRate,buffMorningRate:s.buffalo.morningRate,buffEveningRate:s.buffalo.eveningRate,
    cowMorningSlabId:s.cow.morningSlabId,cowEveningSlabId:s.cow.eveningSlabId,buffMorningSlabId:s.buffalo.morningSlabId,buffEveningSlabId:s.buffalo.eveningSlabId,qty,amount,auto:true};
}
function saveCustomerDailyInline(customerId,date,el){
  const c=(db.customers||[]).find(x=>x.id===customerId);if(!c)return;
  const cm=num(document.getElementById('cmq_'+customerId)?.value),ce=num(document.getElementById('ceq_'+customerId)?.value),bm=num(document.getElementById('bmq_'+customerId)?.value),be=num(document.getElementById('beq_'+customerId)?.value);
  const s=customerMilkSchedule(c),qty=cm+ce+bm+be,amount=cm*s.cow.morningRate+ce*s.cow.eveningRate+bm*s.buffalo.morningRate+be*s.buffalo.eveningRate;let r=customerDailyExisting(customerId,date);
  if(!qty){
    if(r){db.customerSales=db.customerSales.filter(x=>x.id!==r.id);recordDeletion('customerSales',r.id,r);audit('DELETE','Customer Daily Sale',r.id,r,null);save();}
    if(el){el.value='0';}
    return;
  }
  const blendedRate=qty?amount/qty:0;
  if(r){
    r.cowMorningQty=cm;r.cowEveningQty=ce;r.buffMorningQty=bm;r.buffEveningQty=be;r.morningQty=cm+bm;r.eveningQty=ce+be;r.qty=qty;r.cowRate=s.cow.rate;r.buffRate=s.buffalo.rate;
    r.cowMorningRate=s.cow.morningRate;r.cowEveningRate=s.cow.eveningRate;r.buffMorningRate=s.buffalo.morningRate;r.buffEveningRate=s.buffalo.eveningRate;
    r.cowMorningSlabId=s.cow.morningSlabId;r.cowEveningSlabId=s.cow.eveningSlabId;r.buffMorningSlabId=s.buffalo.morningSlabId;r.buffEveningSlabId=s.buffalo.eveningSlabId;r.rate=blendedRate;r.amount=amount;audit('UPDATE','Customer Daily Sale',r.id,null,r);
  }else{
    r={id:uid(),customerId,date,productKey:'milk',product:'Milk',cowMorningQty:cm,cowEveningQty:ce,buffMorningQty:bm,buffEveningQty:be,morningQty:cm+bm,eveningQty:ce+be,qty,cowRate:s.cow.rate,buffRate:s.buffalo.rate,
      cowMorningRate:s.cow.morningRate,cowEveningRate:s.cow.eveningRate,buffMorningRate:s.buffalo.morningRate,buffEveningRate:s.buffalo.eveningRate,cowMorningSlabId:s.cow.morningSlabId,cowEveningSlabId:s.cow.eveningSlabId,buffMorningSlabId:s.buffalo.morningSlabId,buffEveningSlabId:s.buffalo.eveningSlabId,rate:blendedRate,amount,note:''};
    db.customerSales.push(r);audit('CREATE','Customer Daily Sale',r.id,null,r);
  }
  save();
  if(el){el.value=String(el.value||0);el.dataset.savedValue=el.value;}
}
function editCustomerDailyMilk(id){
  const r=(db.customerSales||[]).find(x=>x.id===id);if(!r)return;const cust=(db.customers||[]).find(x=>x.id===r.customerId),s=customerMilkSchedule(cust);
  modal('Edit Date-wise Milk Entry','<div class="formgrid"><div class="field span2"><label>Customer</label><input value="'+esc(cust?.name||r.customerName||'')+'" readonly></div><div class="field"><label>Date</label><input id="editMilkDate" type="date" value="'+r.date+'"></div>'+
    '<div class="field"><label>Cow Morning Rate ₹/L</label><input id="editCowMorningRate" type="number" step="0.01" value="'+num(r.cowMorningRate??s.cow.morningRate)+'"></div><div class="field"><label>Cow Morning (L)</label><input id="editCowMorning" type="number" step="0.01" value="'+num(r.cowMorningQty)+'"></div>'+
    '<div class="field"><label>Cow Evening Rate ₹/L</label><input id="editCowEveningRate" type="number" step="0.01" value="'+num(r.cowEveningRate??s.cow.eveningRate)+'"></div><div class="field"><label>Cow Evening (L)</label><input id="editCowEvening" type="number" step="0.01" value="'+num(r.cowEveningQty)+'"></div>'+
    '<div class="field"><label>Buffalo Morning Rate ₹/L</label><input id="editBuffMorningRate" type="number" step="0.01" value="'+num(r.buffMorningRate??s.buffalo.morningRate)+'"></div><div class="field"><label>Buffalo Morning (L)</label><input id="editBuffMorning" type="number" step="0.01" value="'+num(r.buffMorningQty)+'"></div>'+
    '<div class="field"><label>Buffalo Evening Rate ₹/L</label><input id="editBuffEveningRate" type="number" step="0.01" value="'+num(r.buffEveningRate??s.buffalo.eveningRate)+'"></div><div class="field"><label>Buffalo Evening (L)</label><input id="editBuffEvening" type="number" step="0.01" value="'+num(r.buffEveningQty)+'"></div>'+
    '<div class="field span2"><label>Total</label><input value="'+num(r.qty).toFixed(2)+' L" readonly></div></div>',()=>{
      const date=val('editMilkDate'),cr1=num(val('editCowMorningRate')),cr2=num(val('editCowEveningRate')),br1=num(val('editBuffMorningRate')),br2=num(val('editBuffEveningRate')),cm=num(val('editCowMorning')),ce=num(val('editCowEvening')),bm=num(val('editBuffMorning')),be=num(val('editBuffEvening')),qty=cm+ce+bm+be,amount=cm*cr1+ce*cr2+bm*br1+be*br2;
      if(!date)return alert('Date required.');if(!qty){if(!confirm('All quantities are zero. Delete this entry?'))return;db.customerSales=db.customerSales.filter(x=>x.id!==id);recordDeletion('customerSales',id,r);audit('DELETE','Customer Daily Sale',id,r,null);save();closeModal();editCustomerEntries(r.customerId);return}
      const duplicate=customerDailyExisting(r.customerId,date);if(duplicate&&duplicate.id!==id)return alert('An entry already exists for this customer on '+fmtDate(date)+'. Edit that entry instead.');
      r.date=date;r.cowMorningQty=cm;r.cowEveningQty=ce;r.buffMorningQty=bm;r.buffEveningQty=be;r.morningQty=cm+bm;r.eveningQty=ce+be;r.qty=qty;r.cowMorningRate=cr1;r.cowEveningRate=cr2;r.buffMorningRate=br1;r.buffEveningRate=br2;r.cowRate=cr1||cr2;r.buffRate=br1||br2;
      r.cowMorningSlabId=val('editCowMorningSlab');r.cowEveningSlabId=val('editCowEveningSlab');r.buffMorningSlabId=val('editBuffMorningSlab');r.buffEveningSlabId=val('editBuffEveningSlab');r.rate=amount/qty;r.amount=amount;
      audit('UPDATE','Customer Daily Sale',r.id,null,r);save();closeModal();editCustomerEntries(r.customerId);
    });
}
function deleteCustomerDailyMilk(id){
  const r=(db.customerSales||[]).find(x=>x.id===id);if(!r)return;
  if(!confirm('Delete milk entry for '+fmtDate(r.date)+'?'))return;
  db.customerSales=db.customerSales.filter(x=>x.id!==id);recordDeletion('customerSales',id,r);audit('DELETE','Customer Daily Sale',id,r,null);save();editCustomerEntries(r.customerId);
}

function renderCustomerDailyMilk(date=iso()){
  const d=date||iso();window.__durgaView='dailyMilk';window.__customerDailyDate=d;
  const customers=[...(db.customers||[])].filter(c=>c.active!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const rows=customers.map(c=>{
    const x=dailyMilkValues(c,d),saved=!!customerDailyExisting(c.id,d);
    return '<tr><td><button class="linkbtn" style="margin:0;text-align:left" onclick="renderCustomerLedger(\''+c.id+'\')"><b>'+esc(c.name)+'</b></button></td>'+
      '<td><small>Cow AM '+money(x.cowMorningRate||0)+' • PM '+money(x.cowEveningRate||0)+'<br>Buffalo AM '+money(x.buffMorningRate||0)+' • PM '+money(x.buffEveningRate||0)+'</small></td>'+
      '<td><input id="cmq_'+c.id+'" class="inlineQty" type="number" step="0.01" value="'+num(x.cowMorningQty)+'" onfocus="this.select()" onblur="saveCustomerDailyInline(\''+c.id+'\',\''+d+'\')"></td>'+
      '<td><input id="ceq_'+c.id+'" class="inlineQty" type="number" step="0.01" value="'+num(x.cowEveningQty)+'" onfocus="this.select()" onblur="saveCustomerDailyInline(\''+c.id+'\',\''+d+'\')"></td>'+
      '<td><input id="bmq_'+c.id+'" class="inlineQty" type="number" step="0.01" value="'+num(x.buffMorningQty)+'" onfocus="this.select()" onblur="saveCustomerDailyInline(\''+c.id+'\',\''+d+'\')"></td>'+
      '<td><input id="beq_'+c.id+'" class="inlineQty" type="number" step="0.01" value="'+num(x.buffEveningQty)+'" onfocus="this.select()" onblur="saveCustomerDailyInline(\''+c.id+'\',\''+d+'\')"></td>'+
      '<td><b>'+num(x.qty).toFixed(2)+' L</b></td><td>'+money(x.amount||0)+'</td>'+
      '<td>'+(saved?'<button class="btn sm gray" onclick="editCustomerDailyMilk(\''+x.id+'\')">Edit</button> <button class="btn sm red" onclick="deleteCustomerDailyMilk(\''+x.id+'\')">Delete</button>':'<span class="pill green">Auto</span>')+'</td></tr>';
  }).join('')||'<tr><td colspan="9" class="empty">No active customers.</td></tr>';
  shell('customers','<div class="sectionhead"><div><h1>Daily Milk Entry</h1><div class="muted">Selected date: '+fmtDate(d)+'. Customer default schedule is auto-filled. Holiday = set that customer quantity to 0.</div></div><div class="toolbar"><input id="dailyMilkDate" type="date" value="'+d+'" onchange="renderCustomerDailyMilk(this.value)"><button class="btn gray" onclick="render(\'customers\')">Back to Customers</button></div></div><div class="card section"><div class="sectionhead"><h2>Daily Milk Schedule</h2><div class="muted">Cow/Buffalo Morning/Evening quantities are pre-filled from Customer Master. Rates and Slabs are stored separately for each slot.</div></div><div class="tablewrap"><table class="table"><tr><th>Customer</th><th>Rates</th><th>Cow AM</th><th>Cow PM</th><th>Buffalo AM</th><th>Buffalo PM</th><th>Total</th><th>Amount</th><th>Action</th></tr>'+rows+'</table></div></div>','Daily Milk Entry');
}
function customerDailyProductChanged(){const c=(db.customers||[]).find(x=>x.id===window.__customerLedgerId),key=val('productKey'),r=document.getElementById('rate');if(c&&r)r.value=customerRateFor(c,key,val('date')||iso());customerDailyAmountChanged()}
function customerDailyAmountChanged(){const q=num(val('morningQty'))+num(val('eveningQty')),r=num(val('rate'));if(document.getElementById('qty'))document.getElementById('qty').value=q.toFixed(2);if(document.getElementById('amount'))document.getElementById('amount').value=(q*r).toFixed(2)}

function pdfEscape(s){return String(s??'').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[^\x20-\x7E]/g,'?')}
function makeSimplePDF(lines,title){const W=595,H=842,parts=['BT','/F1 11 Tf','45 800 Td'];let first=true;for(const line of [title,...lines]){if(!first)parts.push('0 -18 Td');parts.push('('+pdfEscape(line)+') Tj');first=false}parts.push('ET');const stream=parts.join('\n'),objs=[];objs.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');objs.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');objs.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj');objs.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');objs.push('5 0 obj\n<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream\nendobj');let pdf='%PDF-1.4\n',offs=[0];for(const o of objs){offs.push(pdf.length);pdf+=o+'\n'}const xref=pdf.length;pdf+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n';for(let i=1;i<offs.length;i++)pdf+=String(offs[i]).padStart(10,'0')+' 00000 n \n';pdf+='trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return new Blob([pdf],{type:'application/pdf'})}
function pdfMoney(n){return 'Rs.'+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}
function wrapPdfText(value,width=92){
  const words=String(value??'').replace(/\r/g,'').split(/\s+/);const lines=[];let line='';
  for(const word of words){if(!word)continue;if((line+' '+word).trim().length>width){if(line)lines.push(line);line=word}else line=(line+' '+word).trim()}
  if(line)lines.push(line);return lines.length?lines:[''];
}
function makeTextPDFPages(lines){
  const pages=[];for(let i=0;i<lines.length;i+=45)pages.push(lines.slice(i,i+45));if(!pages.length)pages.push(['']);
  const objects=[];const pageIds=pages.map((_,i)=>5+i*2),contentIds=pages.map((_,i)=>6+i*2);
  objects[1]='1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj';
  objects[2]='2 0 obj\n<< /Type /Pages /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] /Count '+pages.length+' >>\nendobj';
  objects[3]='3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj';
  objects[4]='4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj';
  pages.forEach((page,i)=>{
    const content=['BT','/F2 14 Tf','45 805 Td','(Durga Dairy Customer Bill) Tj','/F1 9 Tf','0 -22 Td'];
    page.forEach((line,j)=>{if(j)content.push('0 -16 Td');content.push('('+pdfEscape(line)+') Tj')});
    content.push('ET');const stream=content.join('\n'),pid=pageIds[i],cid=contentIds[i];
    objects[pid]=''+pid+' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+cid+' 0 R >>\nendobj';
    objects[cid]=cid+' 0 obj\n<< /Length '+new TextEncoder().encode(stream).length+' >>\nstream\n'+stream+'\nendstream\nendobj';
  });
  let pdf='%PDF-1.4\n';const offsets=[0];for(let i=1;i<objects.length;i++){offsets[i]=new TextEncoder().encode(pdf).length;pdf+=objects[i]+'\n'}
  const xref=new TextEncoder().encode(pdf).length;pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
  for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  return new Blob([new TextEncoder().encode(pdf)],{type:'application/pdf'});
}
function makeCustomerBillPDF(d){
  const c=d.c,entries=(db.customerSales||[]).filter(x=>x.customerId===c.id&&ym(x.date)===d.month).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const payments=(db.customerPayments||[]).filter(x=>x.customerId===c.id&&x.month===d.month);
  const policies=billPolicyList(),terms=policies.length?policies.join(' | '):String(db.settings?.customerBillTerms||'').trim();
  const parts=[],W=595,H=842;
  const blue=[0.12,0.46,0.78],light=[0.89,0.94,0.98],dark=[0.10,0.15,0.20],muted=[0.35,0.40,0.46];
  function color(c){return c.map(v=>v.toFixed(3)).join(' ');}
  function rect(x,top,w,h,fill,stroke){const y=H-top-h;if(fill)parts.push(color(fill)+' rg '+x+' '+y+' '+w+' '+h+' re f');if(stroke)parts.push(color(stroke)+' RG '+x+' '+y+' '+w+' '+h+' re S');}
  function line(x1,top1,x2,top2,col=light,width=.6){parts.push(color(col)+' RG '+width+' w '+x1+' '+(H-top1)+' m '+x2+' '+(H-top2)+' l S');}
  function txt(value,x,top,size=9,bold=false,col=dark){const t=pdfEscape(String(value??''));parts.push(color(col)+' rg BT '+(bold?'/F2':'/F1')+' '+size+' Tf 1 0 0 1 '+x+' '+(H-top-size)+' Tm ('+t+') Tj ET');}
  function moneyPdf(v){return 'Rs. '+num(v).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function fit(s,n){s=String(s??'');return s.length>n?s.slice(0,Math.max(0,n-1))+'…':s;}
  function section(title,top){rect(0,top,W,27,blue);txt(title,18,top+7,13,true,[1,1,1]);return top+27;}
  function tableHead(cols,top,height=25){rect(0,top,W,height,blue);cols.forEach(c=>txt(c.label,c.x,top+7,c.size||9,true,[1,1,1]));return top+height;}
  function cellRow(cols,values,top,height,idx){rect(0,top,W,height,idx%2===0?light:[1,1,1]);line(0,top+height,W,top+height,[0.80,0.84,0.88],.45);cols.forEach((c,i)=>txt(fit(values[i],c.max||24),c.x,top+6,c.size||9,i===0,dark));return top+height;}
  txt('DURGA DAIRY',18,16,21,true,blue);txt('CUSTOMER MONTHLY BILL',18,42,12,true,dark);txt('Bill Month: '+d.month,405,21,10,true,dark);txt('Bill Date: '+fmtDate(iso()),405,39,9,false,muted);
  line(18,62,577,62,blue,1.5);
  txt('Customer: '+fit(c.name||'',42),18,72,11,true,dark);txt('Mobile: '+fit(c.mobile||'-',25),18,89,9,false,muted);txt('Address: '+fit(c.address||'-',65),18,104,9,false,muted);
  let top=127;top=section('Cow Milk',top);
  const dayCols=[{label:'Date',x:14,max:6},{label:'Morning (L)',x:66,max:11},{label:'Evening (L)',x:129,max:11},{label:'Date',x:300,max:6},{label:'Morning (L)',x:352,max:11},{label:'Evening (L)',x:415,max:11}];
  top=tableHead(dayCols,top,23);
  const byDay={};entries.forEach(x=>{if(x.productKey==='milk'||x.cowMorningQty!==undefined||x.cowEveningQty!==undefined||x.buffMorningQty!==undefined||x.buffEveningQty!==undefined)byDay[Number(String(x.date).slice(8,10))]=x;});
  const year=Number(d.month.slice(0,4)),month=Number(d.month.slice(5,7)),days=new Date(year,month,0).getDate();
  for(let r=0;r<16;r++){const day1=r+1,day2=r+17,x1=byDay[day1],x2=byDay[day2];const vals=[String(day1).padStart(2,'0'),x1?num(x1.cowMorningQty??x1.morningQty).toFixed(1):'-',x1?num(x1.cowEveningQty??x1.eveningQty).toFixed(1):'-',day2<=days?String(day2).padStart(2,'0'):'',day2<=days?(x2?num(x2.cowMorningQty??x2.morningQty).toFixed(1):'-'):'',day2<=days?(x2?num(x2.cowEveningQty??x2.eveningQty).toFixed(1):'-'):'' ];top=cellRow(dayCols,vals,top,17,r);if(r===15)break;}
  const milkEntries=entries.filter(x=>x.productKey==='milk'||x.cowMorningQty!==undefined||x.cowEveningQty!==undefined||x.buffMorningQty!==undefined||x.buffEveningQty!==undefined);
  const other=entries.filter(x=>!milkEntries.includes(x));
  top+=8;top=section('Additional Product',top);
  const pcols=[{label:'Date',x:14,max:10},{label:'Product',x:94,max:27},{label:'Price',x:310,max:13},{label:'Qty',x:405,max:9},{label:'Total',x:478,max:14}];
  top=tableHead(pcols,top,24);
  if(other.length){other.slice(0,4).forEach((x,i)=>{top=cellRow(pcols,[fmtDate(x.date),x.product||x.description||'Other',moneyPdf(x.rate),num(x.qty).toFixed(2),moneyPdf(x.amount)],top,19,i);});}
  else top=cellRow(pcols,['-','No additional products','-','-','-'],top,22,0);
  top+=10;top=section('Summary',top);
  const totalMilk=milkEntries.reduce((a,x)=>a+num(x.amount),0),milkQty=milkEntries.reduce((a,x)=>a+num(x.qty),0);
  const otherTotals={};other.forEach(x=>{const name=x.product||x.description||'Other';otherTotals[name]=(otherTotals[name]||0)+num(x.amount);});
  Object.keys(otherTotals).slice(0,2).forEach(name=>{txt(name+':',18,top+7,10,true,dark);txt(moneyPdf(otherTotals[name]),405,top+7,10,true,dark);top+=25;line(18,top,577,top,[0.65,0.80,0.90],.7);});
  txt('Cow Milk:',18,top+7,10,true,dark);txt(milkQty.toFixed(2)+' L × '+moneyPdf(milkQty?totalMilk/milkQty:0)+' = '+moneyPdf(totalMilk),290,top+7,10,true,dark);top+=25;line(18,top,577,top,[0.65,0.80,0.90],.7);
  const summary=[['Prev Month:',moneyPdf(d.opening)],['Curr Month:',moneyPdf(d.cur.bill)],['Received:',moneyPdf(d.paid)],['Total Due:',moneyPdf(d.balance)]];
  for(let i=0;i<summary.length;i+=2){rect(0,top,W,25,i===0?light:[1,1,1]);txt(summary[i][0],14,top+7,9,true,dark);txt(summary[i][1],86,top+7,9,true,dark);txt(summary[i+1][0],300,top+7,9,true,dark);txt(summary[i+1][1],380,top+7,9,true,i===1?[0.82,0.12,0.12]:dark);top+=25;}
  if(terms){top+=9;txt('Terms & Policies:',18,top,9,true,blue);top+=14;const policyLines=(policies.length?policies:[terms]).flatMap((p,i)=>wrapPdfText((i+1)+'. '+p,88));policyLines.slice(0,8).forEach(t=>{txt(t,18,top,8,false,muted);top+=10;});const payment=String(db.settings?.customerBillPaymentInstructions||'').trim();if(payment&&top<795){top+=3;txt('Payment: '+wrapPdfText(payment,88).join(' ').slice(0,125),18,top,7,false,muted);}}
  txt('Thank you for your business · Durga Dairy',175,824,9,true,blue);
  const stream=parts.join('\n'),objects=[];
  objects[1]='1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj';
  objects[2]='2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj';
  objects[3]='3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj';
  objects[4]='4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj';
  objects[5]='5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj';
  objects[6]='6 0 obj\n<< /Length '+new TextEncoder().encode(stream).length+' >>\nstream\n'+stream+'\nendstream\nendobj';
  let pdf='%PDF-1.4\n';const offsets=[0];for(let i=1;i<objects.length;i++){offsets[i]=new TextEncoder().encode(pdf).length;pdf+=objects[i]+'\n';}
  const xref=new TextEncoder().encode(pdf).length;pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  return new Blob([new TextEncoder().encode(pdf)],{type:'application/pdf'});
}
function customerBillData(id,month){const c=(db.customers||[]).find(x=>x.id===id);if(!c)return null;const prev=prevMonth(month),cur=customerMonthSummary(id,month),pr=customerMonthSummary(id,prev),opening=customerBalanceBefore(id,month),pay=(db.customerPayments||[]).filter(x=>x.customerId===id&&x.month===month),paid=pay.reduce((a,x)=>a+num(x.amount),0),adj=pay.reduce((a,x)=>a+num(x.adjustment),0),total=opening+cur.bill,balance=Math.max(0,total-paid-adj);return{c,month,prev,cur,pr,opening,paid,adj,total,balance}}
function customerBillPreviewMarkup(d){
 const entries=(db.customerSales||[]).filter(x=>x.customerId===d.c.id&&ym(x.date)===d.month).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 const rows=entries.map(x=>'<tr><td>'+esc(fmtDate(x.date))+'</td><td>'+esc(x.product||'Milk')+(x.description?' · '+esc(x.description):'')+'</td><td class="num">'+num(x.qty).toFixed(2)+'</td><td class="num">'+money(x.rate)+'</td><td class="num">'+money(x.amount)+'</td></tr>').join('');
 const payments=(db.customerPayments||[]).filter(x=>x.customerId===d.c.id&&x.month===d.month).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
 const policies=billPolicyList(),terms=policies.length?policies.join('\n'):String(db.settings?.customerBillTerms||'').trim(),paymentInstructions=String(db.settings?.customerBillPaymentInstructions||'').trim();
 return '<div style="background:#fff;color:#17212b;border:1px solid #dfe6ee;border-radius:10px;padding:18px;font-family:Arial,sans-serif;font-size:12px"><div style="text-align:center;border-bottom:2px solid #0b4a6f;padding-bottom:12px;margin-bottom:12px"><div style="font-size:23px;font-weight:800;letter-spacing:1px">DURGA DAIRY</div><div style="font-size:15px;font-weight:700;margin-top:3px">CUSTOMER BILL / LEDGER</div></div><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><b>Customer:</b> '+esc(d.c.name)+'<br><b>Mobile:</b> '+esc(d.c.mobile||'-')+'<br><b>Address:</b> '+esc(d.c.address||'-')+'</div><div style="text-align:right"><b>Bill Month:</b> '+esc(d.month)+'<br><b>Bill Date:</b> '+esc(fmtDate(iso()))+'<br><b>Bill No:</b> DD-'+esc(d.c.id)+'-'+esc(d.month)+'</div></div><h3 style="margin:16px 0 6px">Date-wise Itemized Entries</h3><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#eaf3fb"><th style="border:1px solid #ccd7e2;padding:7px;text-align:left">Date</th><th style="border:1px solid #ccd7e2;padding:7px;text-align:left">Product / Category</th><th style="border:1px solid #ccd7e2;padding:7px;text-align:right">Qty</th><th style="border:1px solid #ccd7e2;padding:7px;text-align:right">Rate</th><th style="border:1px solid #ccd7e2;padding:7px;text-align:right">Amount</th></tr></thead><tbody>'+(rows||'<tr><td colspan="5" style="padding:12px;text-align:center;border:1px solid #ccd7e2">No itemized entries for this month.</td></tr>')+'</tbody></table><div style="margin-top:14px;max-width:440px;margin-left:auto"><div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #ddd"><span>Previous Month Outstanding</span><b>'+money(d.opening)+'</b></div><div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #ddd"><span>Current Month Bill</span><b>'+money(d.cur.bill)+'</b></div><div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #ddd"><span>Total Due</span><b>'+money(d.total)+'</b></div><div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #ddd"><span>Payment Received</span><b>- '+money(d.paid)+'</b></div><div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #ddd"><span>Adjustment / Credit</span><b>- '+money(d.adj)+'</b></div><div style="display:flex;justify-content:space-between;padding:9px;background:#eaf3fb;margin-top:4px;font-size:14px"><b>BALANCE PAYABLE</b><b>'+money(d.balance)+'</b></div></div><h3 style="margin:16px 0 5px">Payment History</h3>'+(payments.length?payments.map(p=>'<div style="padding:4px 0;border-bottom:1px solid #eee">'+esc(fmtDate(p.date||p.month))+' · Paid '+money(p.amount)+' · Adjustment '+money(p.adjustment)+' · '+esc(p.mode||p.paymentMode||'')+' '+esc(p.note||'')+'</div>').join(''):'<div>No payments recorded this month.</div>')+'<h3 style="margin:16px 0 5px">Terms &amp; Policies</h3><ol style="padding-left:22px;line-height:1.45">'+((policies.length?policies:String(terms||'Thank you for your business. Please contact Durga Dairy if any entry needs correction.').split(/\r?\n/)).map(x=>'<li style="margin-bottom:4px">'+esc(x)+'</li>').join(''))+'</ol>'+(paymentInstructions?'<div style="margin-top:8px"><b>Payment Instructions:</b><div style="white-space:pre-wrap">'+esc(paymentInstructions)+'</div></div>':'')+'<div style="text-align:center;font-weight:700;margin-top:18px;padding-top:10px;border-top:1px solid #ccd7e2">Thank you for your trust! · Durga Dairy</div></div>';
}
async function shareCustomerBill(id,month){
 const d=customerBillData(id,month||ym(iso()));if(!d)return;
 const file=new File([makeCustomerBillPDF(d)],String(d.c.name||'Customer').replace(/[^a-z0-9]+/gi,'_')+'_'+d.month+'_Bill.pdf',{type:'application/pdf'});
 const url=URL.createObjectURL(file),phone=String(d.c.mobile||'').replace(/\D/g,'');
 const body='<div class="notice">Preview the complete itemized bill before sharing. The preview below shows the bill contents directly, not a blank PDF-open screen.</div><div id="customerBillPreviewContent" style="max-height:60vh;overflow:auto;background:#e9eef4;border-radius:10px;padding:10px">'+customerBillPreviewMarkup(d)+'</div><div class="toolbar" style="margin-top:12px"><button type="button" class="btn green" id="customerBillShare">Share PDF / WhatsApp</button><button type="button" class="btn gray" id="customerBillDownload">Download PDF</button><button type="button" class="btn gray" id="customerBillOpen">Open PDF</button></div>';
 document.getElementById('customerBillPreviewModal')?.remove();
 document.body.insertAdjacentHTML('beforeend','<div class="modal" id="customerBillPreviewModal"><div class="modalbox" style="width:min(760px,100%);max-height:94vh;overflow:auto"><div class="modalhead"><h3>Bill Preview · '+esc(d.c.name)+'</h3><button class="x" onclick="closeCustomerBillPreview()">×</button></div>'+body+'<div class="actions"><button class="btn gray" onclick="closeCustomerBillPreview()">Cancel</button></div></div></div>');
 window.__customerBillPreviewURL=url;
 window.closeCustomerBillPreview=function(){document.getElementById('customerBillPreviewModal')?.remove();if(window.__customerBillPreviewURL){URL.revokeObjectURL(window.__customerBillPreviewURL);window.__customerBillPreviewURL='';}};
 document.getElementById('customerBillDownload').onclick=()=>{downloadCustomerBill(file);};
 document.getElementById('customerBillOpen').onclick=()=>{const w=window.open(url,'_blank');if(!w)alert('Allow pop-ups to open the PDF.');};
 document.getElementById('customerBillShare').onclick=()=>{
   const text='નમસ્તે '+d.c.name+' 🙏\n\nઆપનું '+d.month+' નું Milk Bill તૈયાર છે.\nCurrent Month Bill: '+money(d.cur.bill)+'\nPrevious Balance: '+money(d.opening)+'\nTotal Due: '+money(d.total)+'\nPaid: '+money(d.paid)+'\nBalance Payable: '+money(d.balance)+'\n\nવિગતવાર બિલની PDF પણ આ મેસેજ સાથે મોકલી રહ્યો છું. સમયસર ચુકવણી અને આપના વિશ્વાસ માટે દિલથી આભાર. 🙏\nDurga Dairy';
   const customerPhone=normalizePhone(d.c.mobile);
   if(!customerPhone||customerPhone.length<10){alert('આ customerનો mobile number સાચો નથી. પહેલાં Customer Editમાં mobile number ઉમેરો.');return;}
   const waURL='https://wa.me/'+customerPhone+'?text='+encodeURIComponent(text);
   // Open the selected customer's WhatsApp chat directly; the PDF downloads for manual attachment.
   const waWindow=window.open(waURL,'_blank');
   if(!waWindow){alert('WhatsApp ખોલવા માટે pop-ups allow કરો. PDF download કરી ફરી Share કરો.');return;}
   downloadCustomerBill(file);
 };
}
function downloadCustomerBill(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);alert('PDF bill downloaded. The Gujarati thank-you message is ready to send on WhatsApp.')}
function customerBillPrint(id,month){const d=customerBillData(id,month||ym(iso()));if(!d)return;const w=window.open('','_blank');if(!w)return alert('Allow pop-ups to open the bill.');w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Monthly Bill - '+esc(d.c.name)+'</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#111}.box{border:1px solid #222;padding:24px;max-width:700px;margin:auto}h1{text-align:center;margin:0 0 4px}h2{text-align:center;margin:0 0 20px}.row{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:9px 0}.total{font-size:18px;font-weight:700;border-top:2px solid #111}.thanks{text-align:center;margin-top:28px;font-size:14px}.terms{margin:24px auto;max-width:700px;overflow-wrap:anywhere;page-break-inside:auto}.terms p{white-space:pre-wrap}</style></head><body><div class="box"><h1>DURGA DAIRY</h1><h2>Monthly Milk Bill</h2><div class="row"><b>Customer</b><span>'+esc(d.c.name)+'</span></div><div class="row"><b>Bill Month</b><span>'+d.month+'</span></div><div class="row"><b>Milk Quantity</b><span>'+d.cur.qty.toFixed(2)+' L</span></div><div class="row"><b>Current Month Bill</b><span>'+money(d.cur.bill)+'</span></div><div class="row"><b>Previous Balance</b><span>'+money(d.opening)+'</span></div><div class="row"><b>Total Due</b><span>'+money(d.total)+'</span></div><div class="row"><b>Paid</b><span>'+money(d.paid)+'</span></div><div class="row"><b>Adjustment</b><span>'+money(d.adj)+'</span></div><div class="row total"><span>Balance Payable</span><span>'+money(d.balance)+'</span></div><div class="thanks">Thank you, '+esc(d.c.name)+', for your continued business.</div></div><section class=\"terms\"><h3>Terms &amp; Conditions</h3><p>'+esc(db.settings?.customerBillTerms||'No terms have been saved.').replace(/\n/g,'<br>')+'</p><h3>Payment Instructions</h3><p>'+esc(db.settings?.customerBillPaymentInstructions||'Contact Durga Dairy for payment details.')+'</p></section><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>');w.document.close()}
function addCustomerPayment(customerId,month){const c=(db.customers||[]).find(x=>x.id===customerId);if(!c)return;const sum=customerMonthSummary(customerId,month);modal('Customer Payment / Payment Received','<div class="formgrid"><div class="field span2"><label>Customer</label><input value="'+esc(c.name)+'" readonly></div><div class="field"><label>Bill Month</label><input value="'+month+'" readonly></div><div class="field"><label>Payment Date</label><input id="date" type="date" value="'+iso()+'"></div><div class="field"><label>Bill Amount ₹</label><input value="'+sum.bill.toFixed(2)+'" readonly></div><div class="field"><label>Payment Received ₹</label><input id="amount" type="number" step="0.01"></div><div class="field"><label>Adjustment / Khadh ₹</label><input id="adjustment" type="number" step="0.01" value="0"></div><div class="field span2"><label>Note</label><input id="note" placeholder="Cash / UPI / Bank / short payment"></div></div>',()=>{const amount=num(val('amount')),adjustment=num(val('adjustment')),date=val('date');if(!amount&&!adjustment)return alert('Enter payment or adjustment.');const r={id:uid(),customerId:c.id,month,date,amount,adjustment,note:val('note')};db.customerPayments.push(r);audit('CREATE','Customer Payment',r.id,null,r);save();closeModal();renderCustomerLedger(c.id);const msg='Dear '+c.name+', thank you. We have received ₹'+(amount+adjustment).toFixed(2)+' on '+fmtDate(date)+' against your '+month+' bill. Your payment has been recorded successfully.';if(c.mobile){const phone=String(c.mobile).replace(/\D/g,'');if(phone.length>=10)setTimeout(()=>{if(confirm('Payment saved. Send Thank You message to '+c.name+' on WhatsApp?'))window.open('https://wa.me/91'+phone+'?text='+encodeURIComponent(msg),'_blank')},150)}else if(navigator.share)setTimeout(()=>navigator.share({title:'Payment Received',text:msg}).catch(()=>{}),150)})}function prevMonth(month){const a=String(month||ym(iso())).split('-').map(Number),d=new Date(a[0],a[1]-2,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function downloadCustomerMasterPDF(month){
  month=month||window.__customerReportMonth||ym(iso());const prev=prevMonth(month);
  const prepared=(db.customers||[]).map(c=>{const cur=customerMonthSummary(c.id,month),pr=customerMonthSummary(c.id,prev),pay=(db.customerPayments||[]).filter(x=>x.customerId===c.id&&x.month===month),paid=pay.reduce((a,x)=>a+num(x.amount),0),adj=pay.reduce((a,x)=>a+num(x.adjustment),0),opening=customerBalanceBefore(c.id,month),total=opening+cur.bill,calculated=Math.max(0,total-paid-adj),aging=customerAging(c),net=Math.max(calculated,aging.outstanding);return{c,cur,opening,paid,adj,net,total}}).filter(x=>x.c.active!==false||x.net>0).sort((a,b)=>b.net-a.net||String(a.c.name).localeCompare(String(b.c.name)));
  const W=842,H=595,cmd=[];const T=(x,y,s,t,b=false)=>cmd.push('BT',b?'/F2 '+s+' Tf':'/F1 '+s+' Tf',x+' '+y+' Td','('+pdfEscape(t)+') Tj','ET');const L=(x1,y1,x2,y2)=>cmd.push('0.4 G',x1+' '+y1+' m',x2+' '+y2+' l','S','0 G');
  T(24,565,16,'DURGA DAIRY - CUSTOMER MASTER',true);T(24,548,9,'Month: '+month+'   Previous: '+prev);T(650,565,8,'Generated: '+fmtDate(iso()));
  let y=525;const heads=['#','Customer','Milk','Current Bill','Previous','Paid','Adjustment','Net Balance','Status'];const xs=[24,48,205,275,350,425,485,555,650];heads.forEach((h,i)=>T(xs[i],y,7,h,true));L(24,y-8,818,y-8);y-=24;
  prepared.forEach((x,i)=>{T(xs[0],y,7,String(i+1));T(xs[1],y,7,String(x.c.name).slice(0,26));T(xs[2],y,7,x.cur.qty.toFixed(2)+' L');T(xs[3],y,7,pdfMoney(x.cur.bill));T(xs[4],y,7,pdfMoney(x.opening));T(xs[5],y,7,pdfMoney(x.paid));T(xs[6],y,7,pdfMoney(x.adj));T(xs[7],y,7,pdfMoney(x.net),true);T(xs[8],y,7,x.c.active!==false?'Active':'Inactive');y-=18;if(y<45){y=525;cmd.push('');}});
  const sums=k=>prepared.reduce((a,x)=>a+num(x[k]),0);T(48,30,9,'TOTAL',true);T(205,30,8,prepared.reduce((a,x)=>a+x.cur.qty,0).toFixed(2)+' L',true);T(275,30,8,pdfMoney(prepared.reduce((a,x)=>a+x.cur.bill,0)),true);T(350,30,8,pdfMoney(sums('opening')),true);T(425,30,8,pdfMoney(sums('paid')),true);T(555,30,8,pdfMoney(sums('net')),true);
  const stream=cmd.join('\n'),objs=['1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj','2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj','3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj','4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj','5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj','6 0 obj\n<< /Length '+new TextEncoder().encode(stream).length+' >>\nstream\n'+stream+'\nendstream\nendobj'];let pdf='%PDF-1.4\n';const offsets=[0];for(const o of objs){offsets.push(new TextEncoder().encode(pdf).length);pdf+=o+'\n'}const xref=new TextEncoder().encode(pdf).length;pdf+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n';for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';pdf+='trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';const file=new File([new TextEncoder().encode(pdf)],'Durga_Dairy_Customer_Master_'+month+'.pdf',{type:'application/pdf'});downloadCustomerBill(file);
}
function customerMasterPrint(month){
  month=month||window.__customerReportMonth||ym(iso());
  const prev=prevMonth(month);
  const prepared=(db.customers||[]).map(c=>{
    const cur=customerMonthSummary(c.id,month),pr=customerMonthSummary(c.id,prev),pay=(db.customerPayments||[]).filter(x=>x.customerId===c.id&&x.month===month);
    const paid=pay.reduce((a,x)=>a+num(x.amount),0),adj=pay.reduce((a,x)=>a+num(x.adjustment),0),opening=pr.balance,totalDue=opening+cur.bill,calculatedBalance=Math.max(0,totalDue-paid-adj),aging=customerAging(c),net=Math.max(calculatedBalance,aging.outstanding);
    return {c,cur,pr,paid,adj,opening,totalDue,net};
  }).filter(x=>x.c.active!==false||x.net>0).sort((a,b)=>b.net-a.net||((b.c.active!==false)-(a.c.active!==false))||String(a.c.name).localeCompare(String(b.c.name)));
  const sum=k=>prepared.reduce((a,x)=>a+num(k.split('.').reduce((v,p)=>v[p],x)),0);
  const body=prepared.map((x,i)=>'<tr><td>'+(i+1)+'</td><td class="name '+(x.net>0?'danger':'')+'">'+esc(x.c.name)+'</td><td>'+x.cur.qty.toFixed(2)+' L</td><td>'+money(x.cur.bill)+'</td><td>'+money(x.opening)+'</td><td>'+money(x.paid)+'</td><td>'+money(x.adj)+'</td><td class="'+(x.net>0?'danger':'')+'">'+money(x.net)+'</td><td>'+(x.c.active!==false?'Active':'Inactive')+'</td></tr>').join('');
  const html='<!doctype html><html><head><meta charset="utf-8"><title>Customer Master Report - '+month+'</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Arial,sans-serif;color:#111;font-size:10px}h1{margin:0 0 3px;font-size:18px}p{margin:2px 0 8px;color:#555}.meta{display:flex;justify-content:space-between;margin-bottom:8px}.danger{color:#d00;font-weight:700}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:4px 3px;text-align:center;white-space:nowrap}th{background:#eee}td.name{text-align:left;font-weight:700}.tot td{font-weight:700;background:#eee}.printnote{margin-top:6px;font-size:9px}</style></head><body><div class="meta"><div><h1>Durga Dairy - Customer Master Report</h1><p>Month: <b>'+month+'</b> | Previous Month: <b>'+prev+'</b></p></div><div>Printed: '+new Date().toLocaleString('en-IN')+'</div></div><table><thead><tr><th>#</th><th>Customer</th><th>This Month Qty</th><th>This Month Bill</th><th>Previous Balance</th><th>Paid</th><th>Adjustment / Khadh</th><th>Net Balance</th><th>Status</th></tr></thead><tbody>'+body+'<tr class="tot"><td colspan="2">TOTAL</td><td>'+sum('cur.qty').toFixed(2)+' L</td><td>'+money(sum('cur.bill'))+'</td><td>'+money(sum('opening'))+'</td><td>'+money(sum('paid'))+'</td><td>'+money(sum('adj'))+'</td><td>'+money(sum('net'))+'</td><td></td></tr></tbody></table><div class="printnote">Only Active customers and Inactive customers with outstanding balance are included. Customers with no balance and no active status are excluded.</div><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>';
  const w=window.open('','_blank');if(!w)return alert('Print window blocked. Please allow pop-ups for this site.');w.document.open();w.document.write(html);w.document.close();
}

function shareCustomerCard(id){const c=(db.customers||[]).find(x=>x.id===id);if(!c)return;const a=customerAging(c),cur=a.current,text="Durga Dairy\nCustomer: "+c.name+"\nCurrent Month Bill: "+money(cur.bill)+"\nPaid: "+money(cur.paid+cur.adjust)+"\nBalance: "+money(cur.balance)+"\nTotal Outstanding: "+money(a.outstanding);if(navigator.share)navigator.share({title:"Customer Card - "+c.name,text}).catch(()=>{});else if(navigator.clipboard)navigator.clipboard.writeText(text).then(()=>alert("Customer card copied."))}
function editCustomerEntries(id){const c=(db.customers||[]).find(x=>x.id===id);if(!c)return;window.__durgaView='customerEntries';window.__customerLedgerId=id;const rows=(db.customerSales||[]).filter(x=>x.customerId===id).sort((a,b)=>b.date.localeCompare(a.date));const body=rows.map(x=>"<tr><td>"+fmtDate(x.date)+"</td><td>"+x.morningQty+"</td><td>"+x.eveningQty+"</td><td><b>"+x.qty+"</b></td><td>"+money(x.rate)+"</td><td>"+money(x.amount)+"</td><td><button class='btn sm gray' onclick=\"editCustomerDailyMilk('"+x.id+"')\">Edit</button> <button class='btn sm red' onclick=\"deleteCustomerDailyMilk('"+x.id+"')\">Delete</button></td></tr>").join("")||"<tr><td colspan='7' class='empty'>No daily milk entries.</td></tr>";shell("customers","<div class='sectionhead'><div><h1>Edit Entries - "+esc(c.name)+"</h1><div class='muted'>All date-wise milk entries</div></div><div class='toolbar'><button class='btn gray' onclick=\"renderCustomerLedger('"+id+"')\">← Back</button></div></div><div class='card section'><div class='tablewrap'><table class='table'><tr><th>Date</th><th>Morning</th><th>Evening</th><th>Total</th><th>Rate</th><th>Amount</th><th>Action</th></tr>"+body+"</table></div></div>","Edit Customer Entries")}
function renderCustomerLedger(id){
 const c=(db.customers||[]).find(x=>x.id===id);if(!c)return;
 window.__durgaView='customerLedger';window.__customerLedgerId=id;
 const month=window.__customerReportMonth||ym(iso()),months=customerMonths(id),aging=customerAging(c),cur=aging.current,rows=(db.customerSales||[]).filter(x=>x.customerId===id).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
 let monthRows=months.map(m=>{const x=customerMonthSummary(id,m);return "<tr><td><b>"+m+"</b></td><td>"+x.qty.toFixed(2)+"</td><td>"+money(x.bill)+"</td><td>"+money(x.paid+x.adjust)+"</td><td><b>"+money(x.balance)+"</b></td><td><span class='pill "+(x.status==="Paid"?"green":"orange")+"'>"+x.status+"</span></td><td><button class='btn sm green' onclick=\"addCustomerPayment('"+id+"','"+m+"')\">+ Payment</button> <button class='btn sm' onclick=\"shareCustomerBill('"+id+"','"+m+"')\">PDF Bill</button></td></tr>"}).join("");
 if(!monthRows)monthRows="<tr><td colspan='7' class='empty'>No monthly billing yet.</td></tr>";
 let salesRows=rows.map(x=>{const isMilk=(x.productKey||'milk')==='milk'&&(x.product||'Milk').toLowerCase()==='milk';return "<tr><td>"+fmtDate(x.date)+"</td><td>"+esc(x.product||'Milk')+"</td><td>"+num(x.qty).toFixed(2)+"</td><td>"+money(x.rate)+"</td><td><b>"+money(x.amount)+"</b></td><td>"+esc(x.description||x.note||'')+"</td><td>"+(isMilk?"<button class='btn sm gray' onclick=\"editCustomerDailyMilk('"+x.id+"')\">Edit</button>":"<button class='btn sm gray' onclick=\"editCustomerProductEntry('"+x.id+"')\">Edit</button>")+" <button class='btn sm red' onclick=\"deleteCustomerLedgerEntry('"+x.id+"')\">Delete</button></td></tr>"}).join("")||"<tr><td colspan='7' class='empty'>No daily entries.</td></tr>";
 const html="<div class='sectionhead'><div><button class='btn gray' onclick=\"render('customers')\">← Back</button><div class='customerCard card'><h1 style='margin:8px 0 2px'>"+esc(c.name)+"</h1><div class='muted'>"+esc(c.mobile||"")+" • "+esc(c.address||"")+"</div><div class='customerCardStats'><span>Current Month Bill <b>"+money(cur.bill)+"</b></span><span>Paid <b>"+money(cur.paid+cur.adjust)+"</b></span><span>Remaining Balance <b>"+money(cur.balance)+"</b></span><span>Total Due <b>"+money(aging.outstanding)+"</b></span></div></div></div><div class='toolbar'><button class='btn' onclick=\"shareCustomerBill('"+id+"','"+month+"')\">📄 Preview / Share PDF</button><button class='btn gray' onclick=\"customerBillPrint('"+id+"','"+month+"')\">🖨 Print / Save PDF</button><button class='btn gray' onclick=\"manageCustomerPrices('"+id+"')\">Customer Prices</button><button class='btn green' onclick=\"addCustomerOtherProductEntry('"+id+"')\">+ Other Product Entry</button><button class='btn gray' onclick=\"editCustomerEntries('"+id+"')\">Edit Milk Entries</button><button class='btn orange' onclick=\"editCustomerOpeningBalance('"+id+"')\">Opening Balance</button><button class='btn gray' onclick=\"render('terms')\">Terms & Policies</button></div></div><div class='card section'><div class='sectionhead'><h2>Monthly Billing</h2><div class='muted'>Previous outstanding + current month bill − payments = remaining balance</div></div><div class='tablewrap'><table class='table'><tr><th>Month</th><th>Total Qty</th><th>Bill</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr>"+monthRows+"</table></div></div><div class='card section'><div class='sectionhead'><h2>Date-wise Customer Entries</h2><div class='muted'>Milk and other product entries in one ledger.</div></div><div class='tablewrap'><table class='table'><tr><th>Date</th><th>Product / Category</th><th>Qty</th><th>Rate</th><th>Amount</th><th>Note</th><th>Actions</th></tr>"+salesRows+"</table></div></div><div class='card section'><div class='sectionhead'><div><h2>Bulk Date-wise Milk Entry</h2><div class='muted'>Choose a date range. Saved customer milk prices fill automatically.</div></div><button class='btn green' onclick=\"openCustomerBulkMilkEntry('"+id+"')\">+ Bulk Entry</button></div></div>";
 shell("customers",html,"Customer Ledger");
}
function editCustomerProductEntry(id){
 const x=(db.customerSales||[]).find(r=>r.id===id);if(!x)return;
 const c=(db.customers||[]).find(r=>r.id===x.customerId),products=saleProducts();
 const options=products.map(p=>"<option value='"+esc(p.key)+"' "+(p.key===(x.productKey||'other')?'selected':'')+">"+esc(p.name)+"</option>").join("");
 modal('Edit Customer Product Entry',"<div class='formgrid'><div class='field'><label>Date</label><input id='cpEditDate' type='date' value='"+esc(x.date||iso())+"'></div><div class='field'><label>Category</label><select id='cpEditKey'>"+options+"<option value='__custom' "+(!products.some(p=>p.key===(x.productKey||''))?'selected':'')+">Custom Product</option></select></div><div class='field'><label>Product Name (if custom)</label><input id='cpEditName' value='"+esc(x.product||'')+"'></div><div class='field'><label>Quantity</label><input id='cpEditQty' type='number' min='0.01' step='0.01' value='"+num(x.qty)+"'></div><div class='field'><label>Rate ₹</label><input id='cpEditRate' type='number' min='0' step='0.01' value='"+num(x.rate)+"'></div><div class='field span2'><label>Note</label><input id='cpEditNote' value='"+esc(x.description||x.note||'')+"'></div></div>",()=>{
  const date=val('cpEditDate'),key=val('cpEditKey'),qty=num(val('cpEditQty')),rate=num(val('cpEditRate')),custom=key==='__custom',product=custom?String(val('cpEditName')||'').trim():(products.find(p=>p.key===key)?.name||'');
  if(!date||!product||qty<=0||rate<0)return alert('Enter valid product entry details.');
  const before=JSON.parse(JSON.stringify(x));Object.assign(x,{date,productKey:custom?'other':key,product,qty,rate,amount:qty*rate,morningQty:qty,eveningQty:0,description:String(val('cpEditNote')||''),updatedAt:new Date().toISOString()});audit('UPDATE','Customer Daily Sale',x.id,before,x);save();closeModal();renderCustomerLedger(x.customerId);
 });
}
function deleteCustomerLedgerEntry(id){
 const x=(db.customerSales||[]).find(r=>r.id===id);if(!x)return;
 if(!confirm('Delete '+(x.product||'Milk')+' entry for '+fmtDate(x.date)+'?'))return;
 db.customerSales=db.customerSales.filter(r=>r.id!==id);recordDeletion('customerSales',id,x);audit('DELETE','Customer Daily Sale',id,x,null);save();renderCustomerLedger(x.customerId);
}

function openCustomerBulkMilkEntry(customerId){
 const c=(db.customers||[]).find(x=>x.id===customerId);if(!c)return;
 const start=iso(),end=iso();
 const body='<div class="formgrid"><div class="field"><label>Start Date</label><input id="custBulkStart" type="date" value="'+start+'"></div><div class="field"><label>End Date</label><input id="custBulkEnd" type="date" value="'+end+'"></div></div><div class="notice">Rates are taken from '+esc(c.name)+' saved customer prices. Each date can have different quantities. Existing dates in the range will be updated.</div><div id="custBulkMilkRows" class="tablewrap" style="max-height:52vh;overflow:auto"><div class="muted">Select dates, then tap Load Dates.</div></div><button type="button" class="btn gray" style="margin-top:10px" onclick="buildCustomerBulkMilkRows()">Load Dates</button><div id="custBulkTotal" class="notice" style="margin-top:10px">Total: ₹0</div>';
 modal('Bulk Milk Entry • '+esc(c.name),body,()=>{
  const from=val('custBulkStart'),to=val('custBulkEnd');if(!from||!to||from>to)return alert('Select a valid date range.');
  const days=Math.round((new Date(to+'T12:00:00')-new Date(from+'T12:00:00'))/86400000)+1;if(days>62)return alert('Select a maximum of 62 days at a time.');
  const host=document.getElementById('custBulkMilkRows');if(!host||!host.querySelector('[data-bulk-date]'))return alert('Tap Load Dates first.');
  const schedule=customerMilkSchedule(c),updates=[];
  for(let i=0;i<days;i++){
   const date=nextISODate(from,i),key=date.replace(/-/g,''),existing=customerDailyExisting(customerId,date);
   const cm=num(val('cbcm_'+key)),ce=num(val('cbce_'+key)),bm=num(val('cbbm_'+key)),be=num(val('cbbe_'+key));
   const cr1=num(val('cbcr1_'+key))||schedule.cow.morningRate,cr2=num(val('cbcr2_'+key))||schedule.cow.eveningRate,br1=num(val('cbbr1_'+key))||schedule.buffalo.morningRate,br2=num(val('cbbr2_'+key))||schedule.buffalo.eveningRate;
   const qty=cm+ce+bm+be,amount=cm*cr1+ce*cr2+bm*br1+be*br2;
   if(!qty){if(existing)updates.push({type:'delete',row:existing});continue;}
   const row=existing||{id:uid(),customerId,date,productKey:'milk',product:'Milk',note:''};
   Object.assign(row,{date,productKey:'milk',product:'Milk',cowMorningQty:cm,cowEveningQty:ce,buffMorningQty:bm,buffEveningQty:be,morningQty:cm+bm,eveningQty:ce+be,qty,cowRate:cr1||cr2,buffRate:br1||br2,cowMorningRate:cr1,cowEveningRate:cr2,buffMorningRate:br1,buffEveningRate:br2,rate:amount/qty,amount});
   updates.push({type:existing?'update':'create',row});
  }
  if(!updates.length)return alert('No quantities entered in this date range.');
  const deleting=updates.filter(x=>x.type==='delete').length;if(deleting&&!confirm(deleting+' zero-quantity dates will remove their existing milk entries. Continue?'))return;
  updates.forEach(x=>{if(x.type==='delete'){db.customerSales=db.customerSales.filter(r=>r.id!==x.row.id);recordDeletion('customerSales',x.row.id,x.row);audit('DELETE','Customer Daily Sale',x.row.id,x.row,null);}else if(x.type==='create'){db.customerSales.push(x.row);audit('CREATE','Customer Daily Sale',x.row.id,null,x.row);}else audit('UPDATE','Customer Daily Sale',x.row.id,null,x.row);});
  save();closeModal();renderCustomerLedger(customerId);
 });
 window.buildCustomerBulkMilkRows=function(){
  const from=val('custBulkStart'),to=val('custBulkEnd');if(!from||!to||from>to)return alert('Select a valid date range.');
  const days=Math.round((new Date(to+'T12:00:00')-new Date(from+'T12:00:00'))/86400000)+1;if(days>62)return alert('Select a maximum of 62 days at a time.');
  const schedule=customerMilkSchedule(c);let html='<table class="table"><thead><tr><th>Date</th><th>Cow AM L</th><th>Cow PM L</th><th>Buffalo AM L</th><th>Buffalo PM L</th><th>Total ₹</th></tr></thead><tbody>';
  for(let i=0;i<days;i++){const date=nextISODate(from,i),key=date.replace(/-/g,''),r=customerDailyExisting(customerId,date),cm=num(r?.cowMorningQty),ce=num(r?.cowEveningQty),bm=num(r?.buffMorningQty),be=num(r?.buffEveningQty);
   html+='<tr data-bulk-date="'+date+'"><td>'+esc(fmtDate(date))+'</td><td><input id="cbcm_'+key+'" type="number" min="0" step=".01" value="'+cm+'" style="width:78px"></td><td><input id="cbce_'+key+'" type="number" min="0" step=".01" value="'+ce+'" style="width:78px"></td><td><input id="cbbm_'+key+'" type="number" min="0" step=".01" value="'+bm+'" style="width:78px"></td><td><input id="cbbe_'+key+'" type="number" min="0" step=".01" value="'+be+'" style="width:78px"></td><td><span id="cbtotal_'+key+'">₹0</span><input type="hidden" id="cbcr1_'+key+'" value="'+num(r?.cowMorningRate??schedule.cow.morningRate)+'"><input type="hidden" id="cbcr2_'+key+'" value="'+num(r?.cowEveningRate??schedule.cow.eveningRate)+'"><input type="hidden" id="cbbr1_'+key+'" value="'+num(r?.buffMorningRate??schedule.buffalo.morningRate)+'"><input type="hidden" id="cbbr2_'+key+'" value="'+num(r?.buffEveningRate??schedule.buffalo.eveningRate)+'"></td></tr>';
  }
  html+='</tbody></table>';const host=document.getElementById('custBulkMilkRows');if(host)host.innerHTML=html;
  for(let i=0;i<days;i++){const key=nextISODate(from,i).replace(/-/g,'');['cbcm_','cbce_','cbbm_','cbbe_'].forEach(prefix=>document.getElementById(prefix+key)?.addEventListener('input',()=>{const amount=num(val('cbcm_'+key))*num(val('cbcr1_'+key))+num(val('cbce_'+key))*num(val('cbcr2_'+key))+num(val('cbbm_'+key))*num(val('cbbr1_'+key))+num(val('cbbe_'+key))*num(val('cbbr2_'+key));const el=document.getElementById('cbtotal_'+key);if(el)el.textContent=money(amount);let total=0;for(let j=0;j<days;j++){const d=nextISODate(from,j).replace(/-/g,'');total+=num(val('cbcm_'+d))*num(val('cbcr1_'+d))+num(val('cbce_'+d))*num(val('cbcr2_'+d))+num(val('cbbm_'+d))*num(val('cbbr1_'+d))+num(val('cbbe_'+d))*num(val('cbbr2_'+d));}const t=document.getElementById('custBulkTotal');if(t)t.textContent='Total: '+money(total);}));
  }
  let total=0;for(let i=0;i<days;i++){const d=nextISODate(from,i).replace(/-/g,'');const amount=num(val('cbcm_'+d))*num(val('cbcr1_'+d))+num(val('cbce_'+d))*num(val('cbcr2_'+d))+num(val('cbbm_'+d))*num(val('cbbr1_'+d))+num(val('cbbe_'+d))*num(val('cbbr2_'+d));const el=document.getElementById('cbtotal_'+d);if(el)el.textContent=money(amount);total+=amount;}const t=document.getElementById('custBulkTotal');if(t)t.textContent='Total: '+money(total);
 };
}

function setCustomerActive(id,value){
  const c=(db.customers||[]).find(x=>x.id===id);
  if(!c)return;
  const before={...c};
  c.active=String(value)!=='false';
  audit('UPDATE','Customer',id,before,c);
  localStorage.setItem(KEY,JSON.stringify(db));
  scheduleCloudSync();
  renderCustomers();
}
function nextISODate(date,delta=1){const [y,m,d]=String(date).split('-').map(Number);const x=new Date(y,m-1,d+delta,12,0,0);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
function customerSaleFingerprint(x){return [x.customerId,String(x.date||''),String(x.productKey||x.saleKey||x.product||'').toLowerCase(),num(x.qty).toFixed(3),num(x.rate).toFixed(3),num(x.amount).toFixed(2)].join('|')}
function historicalRateFor(c,key,date,fallback,useHistory){
  if(useHistory){const h=(c.priceHistory||[]).filter(x=>(x.productKey===key||(!x.productKey&&c.saleKey===key))&&String(x.date||'')<=date).sort((a,b)=>String(a.date).localeCompare(String(b.date)));if(h.length&&num(h[h.length-1].rate)>0)return num(h[h.length-1].rate)}
  return num(fallback);
}
function customerBulkHistoricalEntry(){
  const customers=(db.customers||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  if(!customers.length)return alert('Add a customer before creating historical entries.');
  const products=saleProducts();
  modal('Bulk Historical Customer Entry','<div class="formgrid"><div class="field span2"><label>Customer</label><select id="bulkCustomerId">'+customers.map(x=>'<option value="'+x.id+'">'+esc(x.name)+(x.active===false?' • Inactive':'')+'</option>').join('')+'</select></div><div class="field"><label>Start Date</label><input id="bulkStartDate" type="date" value="'+iso()+'"></div><div class="field"><label>End Date</label><input id="bulkEndDate" type="date" value="'+iso()+'"></div><div class="field"><label>Product</label><select id="bulkProductKey" onchange="bulkProductChanged()">'+products.map(p=>'<option value="'+p.key+'">'+esc(p.name)+'</option>').join('')+'</select></div><div class="field"><label>Quantity per Day</label><input id="bulkQty" type="number" min="0.01" step="0.01" value="1"></div><div class="field"><label>Fallback / Manual Rate ₹</label><input id="bulkRate" type="number" min="0.01" step="0.01" value="'+getSaleRate('milk')+'"></div><div class="field"><label>Use Historical Rate History</label><select id="bulkUseHistory"><option value="true" selected>Yes, use effective-dated rates</option><option value="false">No, use entered rate</option></select></div><div class="field span2" id="bulkDescWrap" style="display:none"><label>Description (required for Other)</label><input id="bulkDesc"></div><div class="field"><label>Payment Date (optional)</label><input id="bulkPaymentDate" type="date" value="'+iso()+'"></div><div class="field"><label>Total Payment ₹ (optional)</label><input id="bulkPaymentAmount" type="number" min="0" step="0.01" value="0"></div><div class="field"><label>Payment Mode</label><select id="bulkPaymentMode"><option>Cash</option><option>UPI</option><option>Bank</option><option>Credit</option><option>Other</option></select></div><div class="field span4"><label>Notes</label><input id="bulkNote" placeholder="Historical entry reference"></div><div class="field span4"><div class="notice">This creates one identifiable customer sale per calendar date, inclusive of both selected dates. Existing matching records are detected and skipped. Historical rate changes are respected when available.</div></div></div>',()=>{
    const customerId=val('bulkCustomerId'),customer=customers.find(x=>x.id===customerId),start=val('bulkStartDate'),end=val('bulkEndDate'),productKey=val('bulkProductKey'),product=saleProducts().find(x=>x.key===productKey),qty=num(val('bulkQty')),fallback=num(val('bulkRate')),useHistory=val('bulkUseHistory')==='true',description=val('bulkDesc').trim(),paymentAmount=num(val('bulkPaymentAmount')),paymentDate=val('bulkPaymentDate')||iso(),paymentMode=val('bulkPaymentMode'),note=val('bulkNote');
    if(!customer||!start||!end||end<start||qty<=0||fallback<=0)return alert('Check customer, date range, quantity, and rate.');
    if(customer.active===false&&end>iso())return alert('An inactive customer can only receive historical entries dated today or earlier.');
    if(productKey==='other'&&!description)return alert('Description is required when Product is Other.');
    if(paymentAmount<0)return alert('Payment amount cannot be negative.');
    const count=Math.floor((new Date(end+'T12:00:00')-new Date(start+'T12:00:00'))/86400000)+1;
    if(count>366)return alert('Bulk entry is limited to 366 dates per batch. Split the range into smaller batches.');
    const batchId=uid(),rows=[];let date=start;
    for(let n=0;n<count;n++){
      const rate=historicalRateFor(customer,productKey,date,fallback,useHistory),amount=qty*rate;
      rows.push({id:uid(),batchId,customerId,date,product:product?.name||productKey,productKey,qty,rate,amount,description,note,businessId:'hiren',userId:user()?.id||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
      date=nextISODate(date,1);
    }
    const fingerprints=new Set((db.customerSales||[]).map(customerSaleFingerprint));
    const duplicates=rows.filter(x=>fingerprints.has(customerSaleFingerprint(x))),missing=rows.filter(x=>!fingerprints.has(customerSaleFingerprint(x)));
    const preview=missing.slice(0,40).map(x=>'<tr><td>'+fmtDate(x.date)+'</td><td>'+esc(x.product)+'</td><td>'+x.qty.toFixed(2)+'</td><td>'+money(x.rate)+'</td><td>'+money(x.amount)+'</td></tr>').join('');
    const paymentDuplicate=paymentAmount>0&&(db.customerPayments||[]).some(x=>x.customerId===customerId&&String(x.date||'')===paymentDate&&num(x.amount)===paymentAmount&&String(x.mode||x.paymentMode||'')===paymentMode&&String(x.note||'')===note);
    closeModal();
    modal('Review Bulk Entry • '+esc(customer.name),'<div class="grid">'+metric('Dates in Range',rows.length)+metric('New Records',missing.length)+metric('Duplicates to Skip',duplicates.length)+metric('Total Charges',money(missing.reduce((a,x)=>a+x.amount,0)))+'</div><div class="tablewrap section"><table class="table"><tr><th>Date</th><th>Product</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>'+preview+(missing.length>40?'<tr><td colspan="5">Plus '+(missing.length-40)+' more dates. All will be saved.</td></tr>':'')+'</table></div><p class="muted">Payment: '+money(paymentAmount)+' on '+fmtDate(paymentDate)+(paymentDuplicate?' • matching payment already exists and will be skipped.':'')+'</p><div class="notice">No records have been saved yet. Review the preview before confirming.</div>',()=>{
      const current=new Set((db.customerSales||[]).map(customerSaleFingerprint)),nowAt=new Date().toISOString();let added=0,skipped=0;
      for(const x of rows){if(current.has(customerSaleFingerprint(x))){skipped++;continue}x.createdAt=nowAt;x.updatedAt=nowAt;db.customerSales.push(x);current.add(customerSaleFingerprint(x));audit('CREATE','Customer Daily Sale',x.id,null,x);added++}
      let paymentAdded=false;
      if(paymentAmount>0&&!paymentDuplicate){
        const p={id:uid(),customerId,month:ym(paymentDate),date:paymentDate,amount:paymentAmount,adjustment:0,mode:paymentMode,note,businessId:'hiren',userId:user()?.id||'',createdAt:nowAt,updatedAt:nowAt,batchId};
        db.customerPayments.push(p);audit('CREATE','Customer Payment',p.id,null,p);paymentAdded=true;
      }
      save();closeModal();alert('Bulk historical entry saved. New sales: '+added+'. Duplicate sales skipped: '+skipped+'. Payment added: '+(paymentAdded?'Yes':'No')+'.');renderCustomerLedger(customerId);
    });
  });
}
function bulkProductChanged(){const key=val('bulkProductKey'),wrap=document.getElementById('bulkDescWrap');if(wrap)wrap.style.display=key==='other'?'block':'none';const rate=document.getElementById('bulkRate');if(rate)rate.value=getSaleRate(key)}

function manageCustomerPrices(customerId){
 const c=(db.customers||[]).find(x=>x.id===customerId);if(!c)return;
 const products=saleProducts(),today=iso();
 const rows=products.map((p,i)=>{const rate=customerRateFor(c,p.key,today);return '<div class="formgrid customer-price-row" style="grid-template-columns:minmax(0,1.2fr) minmax(95px,.8fr) minmax(145px,1fr);gap:8px;align-items:end;margin:8px 0"><div><b>'+esc(p.name)+'</b><div class="muted">Customer-specific selling price</div></div><div class="field"><label>Price ₹</label><input id="cpRate_'+i+'" type="number" min="0" step=".01" value="'+(rate||'')+'"></div><div class="field"><label>Applicable From</label><input id="cpDate_'+i+'" type="date" value="'+today+'"></div><input type="hidden" id="cpKey_'+i+'" value="'+esc(p.key)+'"></div>';}).join('');
 modal('Customer Prices • '+esc(c.name),'<div class="notice">Set each product price once. Daily entries will fill this customer price automatically. If a price changes, choose its effective date so older dated entries keep the previous price.</div>'+rows,()=>{
  const before=JSON.parse(JSON.stringify(c.priceHistory||[]));c.priceHistory=Array.isArray(c.priceHistory)?c.priceHistory:[];
  products.forEach((p,i)=>{const raw=val('cpRate_'+i),date=val('cpDate_'+i);if(raw===''||!date)return;const rate=num(raw),old=c.priceHistory.filter(x=>x.productKey===p.key&&String(x.date)<=date).sort((x,y)=>String(x.date).localeCompare(String(y.date))).pop();if(old&&String(old.date)===date&&num(old.rate)===rate)return;const at=c.priceHistory.findIndex(x=>x.productKey===p.key&&String(x.date)===date);const entry={id:at>=0?(c.priceHistory[at].id||uid()):uid(),productKey:p.key,date,rate};if(at>=0)c.priceHistory[at]=entry;else c.priceHistory.push(entry);});
  c.priceHistory.sort((x,y)=>String(x.date).localeCompare(String(y.date)));audit('UPDATE','Customer Prices',c.id,before,c.priceHistory);save();closeModal();renderCustomerLedger(customerId);
 });
}
function addCustomerOtherProductEntry(customerId){
 window.__customerProductEntryId=customerId;
 const c=(db.customers||[]).find(x=>x.id===customerId);if(!c)return;
 const products=saleProducts(),date=iso(),opts=products.map(p=>'<option value="'+esc(p.key)+'">'+esc(p.name)+'</option>').join('');
 const body='<div class="formgrid"><div class="field"><label>Date</label><input id="otherCustDate" type="date" value="'+date+'"></div><div class="field"><label>Product / Category</label><select id="otherCustKey" onchange="customerOtherRateChanged()">'+opts+'<option value="__custom">Custom Product</option></select></div><div class="field" id="otherCustNameWrap" style="display:none"><label>Custom Product Name</label><input id="otherCustName"></div><div class="field"><label>Quantity</label><input id="otherCustQty" type="number" min="0.01" step="0.01" value="1"></div><div class="field"><label>Rate ₹</label><input id="otherCustRate" type="number" min="0" step="0.01"></div><div class="field span2"><label>Note</label><input id="otherCustNote" placeholder="Optional details"></div></div><div class="notice">The customer-specific price fills automatically. If you need a new or changed price, set it in Customer Prices first.</div>';
 modal('Other Product Entry • '+esc(c.name),body,()=>{
  const date=val('otherCustDate'),key=val('otherCustKey'),qty=num(val('otherCustQty')),rate=num(val('otherCustRate')),custom=key==='__custom',name=custom?String(val('otherCustName')||'').trim():(products.find(p=>p.key===key)?.name||'');
  if(!date||!name||qty<=0||rate<0)return alert('Enter a valid date, product, quantity and price.');
  const row={id:uid(),customerId,customerName:c.name,date,productKey:custom?'other':key,product:name,description:String(val('otherCustNote')||''),qty,rate,amount:qty*rate,morningQty:qty,eveningQty:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),businessId:'hiren'};
  db.customerSales=db.customerSales||[];db.customerSales.push(row);audit('CREATE','Customer Daily Sale',row.id,null,row);save();closeModal();renderCustomerLedger(customerId);
 });
 customerOtherRateChanged(customerId);
}
function customerOtherRateChanged(customerId){
 customerId=customerId||window.__customerProductEntryId;
 const c=(db.customers||[]).find(x=>x.id===customerId),key=val('otherCustKey'),date=val('otherCustDate')||iso(),wrap=document.getElementById('otherCustNameWrap'),rate=document.getElementById('otherCustRate');
 if(wrap)wrap.style.display=key==='__custom'?'block':'none';
 if(rate&&c&&key!=='__custom')rate.value=customerRateFor(c,key,date);
}
function renderCustomers(){
  ensureSalesConfig();
  const month=window.__customerReportMonth||ym(iso());
  const prepared=(db.customers||[]).map(r=>{
    const cur=customerMonthSummary(r.id,month),pr=customerMonthSummary(r.id,prevMonth(month));
    const pay=(db.customerPayments||[]).filter(x=>x.customerId===r.id&&x.month===month);
    const paid=pay.reduce((z,x)=>z+num(x.amount),0),adj=pay.reduce((z,x)=>z+num(x.adjustment),0);
    const opening=customerBalanceBefore(r.id,month),total=opening+cur.bill,calculatedBalance=Math.max(0,total-paid-adj),aging=customerAging(r),balance=Math.max(calculatedBalance,aging.outstanding);
    return {r,cur,opening,total,paid,adj,balance};
  });
  const statusFilter=window.__customerStatusFilter||'all';
  const rows=prepared.filter(x=>statusFilter==='all'||(statusFilter==='active'?x.r.active!==false:x.r.active===false)).sort((a,b)=>b.balance-a.balance||((b.r.active!==false)-(a.r.active!==false))||String(a.r.name).localeCompare(String(b.r.name)));
  const customerTotals={current:rows.reduce((z,x)=>z+num(x.cur.bill),0),due:rows.reduce((z,x)=>z+num(x.total),0),paid:rows.reduce((z,x)=>z+num(x.paid),0),balance:rows.reduce((z,x)=>z+num(x.balance),0)};
  const body=rows.map(x=>{
    const r=x.r,a=customerAging(r),pay=(db.customerPayments||[]).filter(p=>p.customerId===r.id&&p.month===month),status=a.unpaidCount>=2?'2+ Months Pending':(x.balance>0?'Pending':'Clear');
    return '<tr><td><button class="linkbtn" style="margin:0;text-align:left;color:'+(x.opening>0?'#d33':'#0b78c8')+'" onclick="renderCustomerLedger(\''+r.id+'\')"><b>'+esc(r.name)+'</b></button></td><td>'+x.cur.qty.toFixed(2)+' L</td><td>'+money(x.opening)+'</td><td>'+money(x.cur.bill)+'</td><td><b>'+money(x.total)+'</b></td><td>'+money(x.paid)+'</td><td>'+((pay.map(p=>p.date).filter(Boolean).sort().pop())||'-')+'</td><td><b class="'+(x.balance>0?'danger':'')+'">'+money(x.balance)+'</b></td><td><select class="statusSelect '+(r.active!==false?'active':'inactive')+'" onchange="setCustomerActive(\''+r.id+'\',this.value)"><option value="true" '+(r.active!==false?'selected':'')+'>Active</option><option value="false" '+(r.active===false?'selected':'')+'>Inactive</option></select></td><td><button class="btn sm gray" onclick="editCustomer(\''+r.id+'\')">Edit</button></td></tr>';
  }).join('')||'<tr><td colspan="10" class="empty">No customers with current activity or outstanding balance.</td></tr>';
  shell('customers','<div class="sectionhead"><div><h1>Customer Master - Monthly Bill</h1><div class="muted">All customers remain visible. Choose All, Active, or Inactive to filter the directory.</div></div><div class="toolbar"><button class="btn" onclick="addCustomer()">+ Add Customer</button><button class="btn orange" onclick="renderMilkSlabs()">% Milk Slabs</button><button class="btn green" onclick="renderCustomerDailyMilk()">🥛 Daily Milk Entry</button><button class="btn orange" onclick="customerBulkHistoricalEntry()">Bulk Historical Entry</button></div></div><div class="card section"><div class="sectionhead"><div><h2 style="margin:0">Monthly Customer Bill</h2><div class="muted">Inactive customers remain available with their full historical ledger.</div></div><div class="toolbar"><select id="customerStatusFilter" onchange="window.__customerStatusFilter=this.value;renderCustomers()"><option value="all" '+(statusFilter==='all'?'selected':'')+'>All Customers</option><option value="active" '+(statusFilter==='active'?'selected':'')+'>Active Customers</option><option value="inactive" '+(statusFilter==='inactive'?'selected':'')+'>Inactive Customers</option></select><input id="customerReportMonth" type="month" value="'+month+'" onchange="window.__customerReportMonth=this.value;renderCustomers()"><button class="btn" onclick="customerMasterPrint(document.getElementById(\'customerReportMonth\').value)">🖨 Master Print</button></div></div><div class="tablewrap"><table class="table"><tr><th>Name</th><th>Total Milk</th><th>Previous Due</th><th>Current Bill</th><th>Total Due</th><th>Paid</th><th>Payment Date</th><th>Balance</th><th>Active Status</th><th>Edit</th></tr>'+body+'</table></div><div class="grid" style="margin-top:14px">'+metric('Current Month Bill',money(customerTotals.current))+metric('Total Due / Receivable',money(customerTotals.due))+metric('Paid',money(customerTotals.paid))+metric('Balance / Receivable',money(customerTotals.balance))+'</div><div class="customerReceivable card" style="margin-top:14px;padding:16px;display:flex;justify-content:space-between;align-items:center;gap:12px"><div><div class="muted">Total Receivable / લેવાનું બાકી</div><b style="font-size:24px">'+money(rows.reduce((z,x)=>z+x.balance,0))+'</b></div><div class="muted">આ મહિના માટે હાલ ગ્રાહકો પાસેથી કુલ લેવાનું બાકી</div></div></div>','Customers');
}
function vendorPurchaseRows(vendor){
  const name=String(vendor?.name||'').trim().toLowerCase();
  const rows=[];
  for(const x of (db.milk||[])){
    if(String(x.vendor||'').trim().toLowerCase()===name && String(x.date||'')<=iso())
      rows.push({...x,_source:'milk',_remaining:Math.max(0,num(x.total)-num(x.paid))});
  }
  for(const x of (db.stockPurchases||[])){
    if(String(x.vendor||'').trim().toLowerCase()===name && String(x.date||'')<=iso())
      rows.push({...x,_source:'stock',_remaining:Math.max(0,num(x.total)-num(x.paid))});
  }
  return rows.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
function vendorOutstanding(vendor){
  return vendorPurchaseRows(vendor).reduce((s,x)=>s+x._remaining,0);
}
function vendorLastPayment(vendor){
  return [...(db.vendorPayments||[])].filter(x=>x.vendorId===vendor?.id).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]||null;
}
function vendorPaymentFromDate(vendor){
  const last=vendorLastPayment(vendor);
  if(last?.date){
    const d=new Date(last.date+'T00:00:00'); d.setDate(d.getDate()+1);
    return d.toISOString().slice(0,10);
  }
  const rows=vendorPurchaseRows(vendor).filter(x=>x._remaining>0);
  return rows[0]?.date||iso();
}
function normalizePhone(phone){
  const digits=String(phone||'').replace(/\D/g,'');
  if(!digits)return '';
  return digits.length===10?'91'+digits:digits;
}
function vendorWhatsApp(vendor,amount,date,fromDate){
  const phone=normalizePhone(vendor?.phone);
  if(!phone)return '';
  const msg='Durga Dairy Payment Confirmation%0A%0AVendor: '+encodeURIComponent(vendor.name||'')+'%0APayment: '+encodeURIComponent(money(amount))+'%0APeriod: '+encodeURIComponent(fmtDate(fromDate)+' to '+fmtDate(date))+'%0APayment Date: '+encodeURIComponent(fmtDate(date))+'%0A%0AThank you for your business with Durga Dairy.';
  return 'https://wa.me/'+phone+'?text='+msg;
}
function payVendor(id){
  const vendor=(db.vendors||[]).find(x=>x.id===id); if(!vendor)return;
  const outstanding=vendorOutstanding(vendor);
  if(outstanding<=0)return alert('આ vendorનું હાલમાં કોઈ payment pending નથી.');
  const fromDate=vendorPaymentFromDate(vendor), today=iso(), last=vendorLastPayment(vendor);
  modal('Vendor Payment • '+esc(vendor.name),`<div class="notice"><b>Pending Payable: ${money(outstanding)}</b><br>Period: ${fmtDate(fromDate)} to ${fmtDate(today)}${last?' • Last Payment: '+fmtDate(last.date):''}</div><div class="formgrid" style="margin-top:12px"><div class="field"><label>Payment Date</label><input id="vendorPayDate" type="date" value="${today}"></div><div class="field"><label>Amount ₹</label><input id="vendorPayAmount" type="number" step="0.01" value="${outstanding}"></div><div class="field"><label>Payment Mode</label><select id="vendorPayMode"><option>Cash</option><option>UPI</option><option>Bank</option><option>Other</option></select></div><div class="field"><label>Note</label><input id="vendorPayNote" placeholder="Vendor settlement"></div></div>`,()=>{
    const date=val('vendorPayDate')||today, amount=num(val('vendorPayAmount')), mode=val('vendorPayMode'), note=val('vendorPayNote');
    if(!amount||amount<=0)return alert('Payment amount required.');
    if(amount>vendorOutstanding(vendor)+0.01)return alert('Payment cannot be more than pending payable.');
    let remaining=amount;
    const purchases=vendorPurchaseRows(vendor).filter(x=>x._remaining>0);
    for(const p of purchases){
      if(remaining<=0)break;
      const take=Math.min(remaining,p._remaining);
      const target=(p._source==='milk'?db.milk:db.stockPurchases).find(x=>x.id===p.id);
      if(target){
        target.paid=num(target.paid)+take;
        target.balance=Math.max(0,num(target.total)-target.paid);
      }
      remaining-=take;
    }
    const from=vendorPaymentFromDate(vendor);
    const payment={id:uid(),vendorId:vendor.id,vendorName:vendor.name,date,amount,mode,note,fromDate:from,toDate:date,createdAt:new Date().toISOString()};
    db.vendorPayments=db.vendorPayments||[]; db.vendorPayments.push(payment);
    audit('CREATE','Vendor Payment',payment.id,null,payment);
    save(); closeModal(); render('vendors');
    const wa=vendorWhatsApp(vendor,amount,date,from);
    if(wa && confirm('Payment saved. Vendorને WhatsApp confirmation મોકલવું છે?')) window.open(wa,'_blank');
  });
}
function renderVendors(){
  const rows=(db.vendors||[]).map(v=>({...v,_entity:'vendors',outstanding:vendorOutstanding(v),lastPayment:vendorLastPayment(v),fromDate:vendorPaymentFromDate(v)}));
  const total=rows.reduce((s,v)=>s+v.outstanding,0);
  shell('vendors',`<div class="sectionhead"><div><h1>Vendors</h1><div class="muted">Vendor-wise outstanding is calculated automatically from the last settlement to today. Every Pay creates a payment history entry.</div></div><button class="btn" onclick="addVendor()">+ Add Vendor</button></div><div class="grid">${metric('Total Vendor Payable',money(total))}${metric('Vendors Pending',rows.filter(v=>v.outstanding>0).length)}${metric('Vendors',rows.length)}${metric('Today',fmtDate(iso()))}</div><div class="card section"><div class="tablewrap"><table class="table"><tr><th>Vendor</th><th>Type</th><th>Phone</th><th>Last Payment</th><th>Payable Since</th><th>Total Payable</th><th>Action</th></tr>${rows.map(v=>`<tr><td><b>${esc(v.name)}</b></td><td>${esc(v.type||'')}</td><td>${esc(v.phone||'')}</td><td>${v.lastPayment?fmtDate(v.lastPayment.date):'—'}</td><td>${v.outstanding>0?fmtDate(v.fromDate):'—'}</td><td><b>${money(v.outstanding)}</b></td><td>${v.outstanding>0?`<button class="btn sm green" onclick="payVendor('${v.id}')">Pay ${money(v.outstanding)}</button>`:'<span class="pill green">Paid</span>'}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">No vendors.</td></tr>'}</table></div></div><div class="card section"><div class="sectionhead"><h2>Payment History</h2><span class="muted">Vendor settlements</span></div>${tableRows([...(db.vendorPayments||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(x=>({...x,_entity:'vendorPayments'})),[['Date',r=>fmtDate(r.date)],['Vendor',r=>esc(r.vendorName||'')],['Period',r=>fmtDate(r.fromDate)+' → '+fmtDate(r.toDate)],['Amount',r=>money(r.amount)],['Mode',r=>esc(r.mode||'')],['Note',r=>esc(r.note||'')]],false)}</div>`,'Vendors');
}
function renderCash(){const last=[...(db.cashChecks||[])].sort((a,b)=>b.date.localeCompare(a.date))[0];const m=ym(iso());const salesIn=monthTotal(db.sales,m),collectionIn=monthTotal(db.collections,m),cashIn=salesIn+collectionIn;const expenseOut=monthTotal(db.expenses,m),milkPaid=db.milk.filter(x=>ym(x.date)===m).reduce((a,x)=>a+num(x.paid),0),stockPaid=db.stockPurchases.filter(x=>ym(x.date)===m).reduce((a,x)=>a+num(x.paid),0),cashOut=expenseOut+milkPaid+stockPaid;const opening=last?num(last.actual):0,expected=opening+cashIn-cashOut,actual=last?num(last.actual):0,diff=actual-expected;const receivable=(db.customers||[]).reduce((a,x)=>a+num(customerAging(x).outstanding),0),milkPayable=(db.milk||[]).reduce((a,x)=>a+Math.max(0,num(x.total)-num(x.paid)),0),stockPayable=(db.stockPurchases||[]).reduce((a,x)=>a+Math.max(0,num(x.total)-num(x.paid)),0),payable=milkPayable+stockPayable;shell('cash',`<div class="sectionhead"><div><h1>Cash Flow & Reconciliation</h1><div class="muted">Daily Sales + Bill Collection increase cash. Expenses + purchases reduce cash.</div></div><button class="btn" onclick="addCashCheck()">+ Enter Actual Cash</button></div><div class="grid">${metric('Daily Sale In',money(salesIn))}${metric('Bill Collection In',money(collectionIn))}${metric('Total Cash In',money(cashIn))}${metric('Expenses Out',money(expenseOut))}${metric('Purchase Paid',money(milkPaid+stockPaid))}${metric('Total Cash Out',money(cashOut))}${metric('Remaining Cash',money(expected))}${metric('Actual Cash',last?money(actual):'Not checked')}</div><div class="card section" style="border-left:5px solid #e0a800"><h2 style="margin-top:0">Pending Balances</h2><div class="grid">${metric('Customer Receivable',money(receivable))}${metric('Milk Payable',money(milkPayable))}${metric('Stock Payable',money(stockPayable))}${metric('Total Payable',money(payable))}</div><div class="notice" style="background:#fff3cd">🟡 Total Payable: ${money(payable)} હજુ ચૂકવવાનું બાકી છે.</div></div><div class="grid">${metric('Expected Cash',money(expected))}${metric('Difference',last?money(diff):'—',last?(diff===0?'Matched':'Missing / unexplained'):'')}${metric('Last Check',last?last.date:'—')}</div><div class="section"><div class="card"><h2 style="margin-top:0">Monthly Reconciliation History</h2>${tableRows(listWithEntity([...(db.cashChecks||[])].sort((a,b)=>a.date.localeCompare(b.date)),'cashChecks'),[['Date',r=>fmtDate(r.date)],['Actual Cash',r=>money(r.actual)],['Note',r=>esc(r.note||'')]])}</div></div>`,'Cash Flow')}
function reportData(m){const sales=monthTotal(db.sales,m),collection=monthTotal(db.collections,m),milkPurchase=monthTotal(db.milk,m,'total'),stockPurchase=monthTotal(db.stockPurchases,m,'total'),purchase=milkPurchase+stockPurchase,milkPaid=db.milk.filter(x=>ym(x.date)===m).reduce((a,x)=>a+num(x.paid),0),stockPaid=db.stockPurchases.filter(x=>ym(x.date)===m).reduce((a,x)=>a+num(x.paid),0),purchasePaid=milkPaid+stockPaid,purchasePending=Math.max(0,purchase-purchasePaid),expense=monthTotal(db.expenses,m),totalOut=purchasePaid+expense,customers=(db.customers||[]).reduce((a,c)=>{const cur=customerMonthSummary(c.id,m),opening=customerBalanceBefore(c.id,m),pay=(db.customerPayments||[]).filter(x=>x.customerId===c.id&&x.month===m),paid=pay.reduce((z,x)=>z+num(x.amount),0),adj=pay.reduce((z,x)=>z+num(x.adjustment),0);return a+Math.max(0,opening+cur.bill-paid-adj)},0),products=productStats(m),gross=products.reduce((a,p)=>a+p.profit,0),net=gross-expense;return{sales,collection,milkPurchase,stockPurchase,purchase,milkPaid,stockPaid,purchasePaid,purchasePending,expense,totalOut,customers,gross,net,products}}
function renderReports(){const m=ym(iso()),r=reportData(m);shell('reports',`<div class="sectionhead"><div><h1>Reports & Monthly Closing</h1><div class="muted">Choose any month. Export CSV workbook-style files for Excel.</div></div><div class="toolbar"><input id="reportMonth" type="month" value="${m}" onchange="changeReport(this.value)"><button class="btn green" onclick="exportCSVReport()">Export Excel CSV Pack</button></div></div><div id="reportBody">${reportHTML(m,r)}</div>`,'Reports')}
function reportHTML(m,r){return `<div class="grid">${metric('Total Sales',money(r.sales))}${metric('Bill Collection',money(r.collection))}${metric('Total Purchase',money(r.purchase))}${metric('Purchase Paid',money(r.purchasePaid),'Milk '+money(r.milkPaid)+' • Stock '+money(r.stockPaid))}${metric('Payable Pending',money(r.purchasePending),'આટલું ચૂકવવાનું બાકી છે')}${metric('Total Expenses',money(r.expense))}${metric('Total Cash Out',money(r.totalOut),'Purchase Paid + Expenses')}${metric('Customer Receivable',money(r.customers),'આટલું ગ્રાહકો પાસેથી લેવાનું બાકી')}${metric('Gross Profit',money(r.gross),r.sales?`Margin ${(r.gross/r.sales*100).toFixed(1)}%`:'')}${metric('Net Profit / Loss',money(r.net),r.net>=0?'Profit':'Loss')}</div><div class="card section" style="border-left:5px solid #e0a800;background:#fffdf5"><div class="sectionhead"><div><h2 style="margin:0">Pending Payment Summary</h2><div class="muted">Report ખોલતા જ ખબર પડશે: કેટલું purchase થયું, કેટલું paid થયું અને કેટલું હજુ ચૂકવવાનું બાકી છે.</div></div><span class="pill orange">${money(r.purchasePending)} Pending</span></div><div class="grid" style="margin-top:12px">${metric('Total Purchase',money(r.purchase))}${metric('Paid',money(r.purchasePaid))}${metric('ચૂકવવાનું બાકી',money(r.purchasePending))}${metric('ખર્ચા',money(r.expense))}</div><div class="notice" style="background:#fff3cd;margin-top:12px"><b>ચૂકવવાનું બાકી: ${money(r.purchasePending)}</b> • Purchase માંથી ${money(r.purchasePaid)} paid થઈ ગયું છે. કુલ cash outflow ${money(r.totalOut)} છે.</div></div><div class="charts section"><div class="card"><h2>Sales Contribution</h2>${productBars(r.products)}</div><div class="card"><h2>Profit Contribution</h2>${profitBars(r.products)}</div><div class="card"><h2>Mix</h2><div class="donut"></div>${r.products.map(p=>`<div class="legend"><span><b>${p.name}</b><span>${p.salesPct.toFixed(1)}% sales • ${p.margin.toFixed(1)}% margin</span></span></div>`).join('')}</div></div><div class="card section"><div class="sectionhead"><h2>Product Profitability</h2><span class="muted">High margin does not mean high sales volume</span></div>${productTable(r.products)}</div><div class="two section"><div class="card"><h2>Purchasing</h2><p class="muted">Milk: ${money(monthTotal(db.milk,m,'total'))}</p><p class="muted">Ghee/Peda/Other: ${money(monthTotal(db.stockPurchases,m,'total'))}</p><p><b>Total: ${money(r.purchase)}</b></p></div><div class="card"><h2>Expense Breakdown</h2>${['Home','Fixed / Utility','EMI','Hospital','Car','Bike','Grocery','Fuel','Dairy Expense','Other'].map(c=>`<p class="muted" style="display:flex;justify-content:space-between"><span>${c}</span><b>${money(monthTotal(db.expenses.filter(x=>x.category===c),m))}</b></p>`).join('')}</div></div><div class="card section"><h2>Management View</h2><p class="muted">Use <b>Sales %</b> to see which products move more money, and <b>Margin %</b> to see which products generate more profit per rupee of sales. The system does not rank products as “best”; it shows both measures side by side.</p></div>`}
function changeReport(m){document.getElementById('reportBody').innerHTML=reportHTML(m,reportData(m))}
function exportCSVReport(){const m=document.getElementById('reportMonth')?.value||ym(iso()),r=reportData(m);const files={Summary:[['Metric','Amount'],['Total Sales',r.sales],['Bill Collection',r.collection],['Total Purchase',r.purchase],['Expenses',r.expense],['Gross Profit',r.gross],['Net Profit/Loss',r.net]],Product_Analysis:[['Product','Qty Sold','Sales','Cost','Profit','Margin %','Sales %'],...r.products.map(p=>[p.name,p.qty,p.saleAmt,p.cost,p.profit,p.margin.toFixed(2),p.salesPct.toFixed(2)])],Daily_Sales:[['Date','Product','Qty','Amount','Description'],...db.sales.filter(x=>ym(x.date)===m).map(x=>[x.date,x.product,x.qty,x.amount,x.description])],Milk_Purchase:[['Date','Vendor','Cow L','Cow Rate','Buffalo L','Buffalo Rate','Total','Paid','Balance'],...db.milk.filter(x=>ym(x.date)===m).map(x=>[x.date,x.vendor,x.cowLitres,x.cowRate,x.buffLitres,x.buffRate,x.total,x.paid,x.balance])],Expenses:[['Date','Category','Amount','Payment','Description'],...db.expenses.filter(x=>ym(x.date)===m).map(x=>[x.date,x.category,x.amount,x.paymentMode,x.description])],Stock_Purchase:[['Date','Item','Qty','Unit','Rate','Total','Paid','Balance','Vendor'],...db.stockPurchases.filter(x=>ym(x.date)===m).map(x=>[x.date,x.item,x.qty,x.unit,x.rate,x.total,x.paid,x.balance,x.vendor])],Collections:[['Date','Mode','Customer/Note','Amount','Payment'],...db.collections.filter(x=>ym(x.date)===m).map(x=>[x.date,x.mode,x.name,x.amount,x.paymentMode])]};Object.entries(files).forEach(([name,rows])=>{const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');download(csv,`Durga-Dairy-${m}-${name}.csv`,'text/csv')});alert('Report CSV pack exported. Excel can open these files directly.')}
function download(data,name,type){const b=new Blob([data],{type}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function renderTransfers(from=iso().slice(0,7)+'-01',to=iso()){
  if(isAkash())return render('dashboard');
  db.internalTransfers=db.internalTransfers||[];
  const rows=db.internalTransfers.filter(x=>String(x.date||'')>=from&&String(x.date||'')<=to).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const total=rows.reduce((a,x)=>a+num(x.amount),0),paid=rows.reduce((a,x)=>a+num(x.paid),0),balance=rows.reduce((a,x)=>a+Math.max(0,num(x.amount)-num(x.paid)),0);
  shell('transfers','<div class="sectionhead"><div><h1>Internal Milk Transfers</h1><div class="muted">Hiren takes actual milk from Akash. This is tracked separately and excluded from combined external sales/purchases to prevent double-counting.</div></div><button class="btn" onclick="addInternalTransfer()">+ Record Transfer</button></div><div class="card"><div class="formgrid"><div class="field"><label>From Date</label><input id="transferFrom" type="date" value="'+from+'"></div><div class="field"><label>To Date</label><input id="transferTo" type="date" value="'+to+'"></div><div class="field" style="align-self:end"><button class="btn gray" onclick="renderTransfers(val(\'transferFrom\'),val(\'transferTo\'))">Apply Filter</button></div></div></div><div class="grid section">'+metric('Transferred Milk',rows.reduce((a,x)=>a+num(x.quantity),0).toFixed(2)+' L')+metric('Transfer Value',money(total))+metric('Settled',money(paid))+metric('Balance Due to Akash',money(balance))+'</div><div class="card section"><div class="tablewrap"><table class="table"><tr><th>Date</th><th>Milk Qty</th><th>Rate</th><th>Value</th><th>Paid</th><th>Balance</th><th>Note</th><th>Action</th></tr>'+rows.map(x=>'<tr><td>'+fmtDate(x.date)+'</td><td>'+num(x.quantity).toFixed(2)+' L</td><td>'+money(x.rate)+'</td><td>'+money(x.amount)+'</td><td>'+money(x.paid)+'</td><td><b>'+money(Math.max(0,num(x.amount)-num(x.paid)))+'</b></td><td>'+esc(x.note||'')+'</td><td>'+(num(x.amount)>num(x.paid)?'<button class="btn sm green" onclick="settleInternalTransfer(\''+x.id+'\')">Settle</button>':'<span class="pill green">Settled</span>')+'</td></tr>').join('')||'<tr><td colspan="8" class="empty">No internal transfers in this period.</td></tr>'+'</table></div></div>','Internal Milk Transfers');
}
function addInternalTransfer(){
  modal('Record Akash → Hiren Milk Transfer','<div class="formgrid"><div class="field"><label>Date</label><input id="transferDate" type="date" value="'+iso()+'"></div><div class="field"><label>Actual Milk Quantity (L)</label><input id="transferQty" type="number" min="0.01" step="0.01"></div><div class="field"><label>Agreed Rate ₹/L</label><input id="transferRate" type="number" min="0.01" step="0.01"></div><div class="field"><label>Initial Payment ₹</label><input id="transferPaid" type="number" min="0" step="0.01" value="0"></div><div class="field span4"><label>Note / Reference</label><input id="transferNote" placeholder="Milk taken from Akash"></div></div><div class="notice">This record is an internal transfer, not an external purchase or sale. It remains separately visible in All reports.</div>',()=>{
    const date=val('transferDate')||iso(),quantity=num(val('transferQty')),rate=num(val('transferRate')),paid=num(val('transferPaid')),note=val('transferNote');
    if(quantity<=0||rate<=0)return alert('Enter a positive quantity and agreed rate.');
    const amount=quantity*rate;if(paid<0||paid>amount)return alert('Initial payment must be between ₹0 and the transfer value.');
    const nowAt=new Date().toISOString(),r={id:uid(),transactionType:'INTERNAL_TRANSFER',fromBusiness:'akash',toBusiness:'hiren',businessId:'hiren',date,quantity,rate,amount,paid,balance:amount-paid,note,userId:user()?.id||'',createdAt:nowAt,updatedAt:nowAt,settlements:paid?[{id:uid(),date,amount:paid,mode:'Initial Payment',userId:user()?.id||'',createdAt:nowAt}]:[]};
    db.internalTransfers=db.internalTransfers||[];db.internalTransfers.push(r);audit('CREATE','Internal Milk Transfer',r.id,null,r);save();closeModal();renderTransfers();
  });
}
function settleInternalTransfer(id){
  const r=(db.internalTransfers||[]).find(x=>x.id===id);if(!r)return;
  const balance=Math.max(0,num(r.amount)-num(r.paid));if(!balance)return alert('This transfer is already settled.');
  modal('Settle Transfer • '+fmtDate(r.date),'<div class="notice">Balance due to Akash: <b>'+money(balance)+'</b><br>Transfer quantity: '+num(r.quantity).toFixed(2)+' L • Value: '+money(r.amount)+'</div><div class="formgrid" style="margin-top:12px"><div class="field"><label>Settlement Date</label><input id="settleDate" type="date" value="'+iso()+'"></div><div class="field"><label>Amount ₹</label><input id="settleAmount" type="number" min="0.01" step="0.01" value="'+balance+'"></div><div class="field"><label>Mode</label><select id="settleMode"><option>Cash</option><option>UPI</option><option>Bank</option><option>Other</option></select></div></div>',()=>{
    const amount=num(val('settleAmount'));if(amount<=0||amount>balance)return alert('Settlement must be positive and cannot exceed the remaining balance.');
    const before=JSON.parse(JSON.stringify(r)),nowAt=new Date().toISOString();r.paid=num(r.paid)+amount;r.balance=Math.max(0,num(r.amount)-r.paid);r.settlements=Array.isArray(r.settlements)?r.settlements:[];r.settlements.push({id:uid(),date:val('settleDate')||iso(),amount,mode:val('settleMode'),userId:user()?.id||'',createdAt:nowAt});r.updatedAt=nowAt;audit('UPDATE','Internal Milk Transfer',r.id,before,r);save();closeModal();renderTransfers();
  });
}
function billPolicyList(){
  const saved=db.settings?.customerBillPolicies;
  if(Array.isArray(saved))return saved.map(x=>String(x||'').trim()).filter(Boolean);
  return String(db.settings?.customerBillTerms||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
}
function renderBillTerms(){
  const policies=billPolicyList(),instructions=String(db.settings?.customerBillPaymentInstructions||'');
  const rows=(policies.length?policies:['']).map((p,i)=>'<div class="formgrid bill-policy-row" style="grid-template-columns:1fr auto;gap:8px;align-items:start;margin:8px 0"><div class="field"><label>Policy '+(i+1)+'</label><textarea class="billPolicyInput" rows="2" placeholder="Enter a term or policy">'+esc(p)+'</textarea></div><button type="button" class="btn red sm" style="margin-top:24px" onclick="removeBillPolicyRow(this)">Remove</button></div>').join('');
  shell('terms',`<div class="sectionhead"><div><h1>Customer Bill Terms & Policies</h1><div class="muted">Add as many policies as needed. Saved policies appear at the end of every customer bill.</div></div></div><div class="card"><div id="billPolicyRows">${rows}</div><div class="toolbar"><button class="btn gray" type="button" onclick="addBillPolicyRow()">+ Add Policy</button></div><div class="field" style="margin-top:16px"><label>Payment Instructions (optional)</label><textarea id="billPaymentInstructions" rows="3" placeholder="Enter payment instructions shown on new bills.">${esc(instructions)}</textarea></div><div class="toolbar" style="margin-top:14px"><button class="btn" onclick="saveBillTerms()">Save Terms & Policies</button><button class="btn gray" onclick="previewBillTerms()">Preview</button><button class="btn orange" onclick="restoreBillTerms()">Restore Previous Version</button></div><p class="muted">New PDF bills use the latest saved policies. Saving terms does not change transactions or customer balances.</p></div>`,'Customer Bill Terms');
}
function addBillPolicyRow(value=''){
  const host=document.getElementById('billPolicyRows');if(!host)return;
  const n=host.querySelectorAll('.billPolicyInput').length+1,div=document.createElement('div');div.className='formgrid bill-policy-row';div.style.cssText='grid-template-columns:1fr auto;gap:8px;align-items:start;margin:8px 0';
  div.innerHTML='<div class="field"><label>Policy '+n+'</label><textarea class="billPolicyInput" rows="2" placeholder="Enter a term or policy"></textarea></div><button type="button" class="btn red sm" style="margin-top:24px" onclick="removeBillPolicyRow(this)">Remove</button>';
  div.querySelector('textarea').value=String(value||'');host.appendChild(div);
}
function removeBillPolicyRow(button){const host=document.getElementById('billPolicyRows');button.closest('.bill-policy-row')?.remove();if(host&&!host.querySelector('.billPolicyInput'))addBillPolicyRow();if(host)host.querySelectorAll('.bill-policy-row label').forEach((x,i)=>x.textContent='Policy '+(i+1));}
function saveBillTerms(){
  const policies=[...document.querySelectorAll('#billPolicyRows .billPolicyInput')].map(x=>String(x.value||'').trim()).filter(Boolean),next=policies.join('\\n'),payment=String(val('billPaymentInstructions')||''),previous=String(db.settings?.customerBillTerms||'');
  if(next!==previous){db.settings.customerBillTermsHistory=Array.isArray(db.settings.customerBillTermsHistory)?db.settings.customerBillTermsHistory:[];db.settings.customerBillTermsHistory.push({id:uid(),terms:previous,policies:billPolicyList(),updatedAt:new Date().toISOString(),updatedBy:user()?.id||''});db.settings.customerBillTermsHistory=db.settings.customerBillTermsHistory.slice(-20);}
  db.settings.customerBillPolicies=policies;db.settings.customerBillTerms=next;db.settings.customerBillPaymentInstructions=payment;db.settings.customerBillTermsUpdatedAt=new Date().toISOString();audit('UPDATE','Customer Bill Terms','global',previous,policies);save();alert('Customer bill policies saved and queued for cloud synchronization.');
}
function previewBillTerms(){
  const policies=[...document.querySelectorAll('#billPolicyRows .billPolicyInput')].map(x=>String(x.value||'').trim()).filter(Boolean),fallback=billPolicyList(),items=policies.length?policies:fallback;
  modal('Terms & Policies Preview','<ol style="padding-left:22px;line-height:1.7">'+(items.map(x=>'<li style="margin-bottom:8px">'+esc(x)+'</li>').join('')||'<li>No policies entered yet.</li>')+'</ol>',closeModal);document.getElementById('modalSave').style.display='none';
}
function restoreBillTerms(){
  const history=db.settings?.customerBillTermsHistory||[];if(!history.length)return alert('No previous saved version is available.');
  const last=history[history.length-1];if(!confirm('Restore the previous saved terms?'))return;
  db.settings.customerBillTerms=last.terms||'';db.settings.customerBillTermsHistory=history.slice(0,-1);audit('UPDATE','Customer Bill Terms','global','current',last.terms||'');save();renderBillTerms();
}
function renderAudit(){const rows=[...db.audit].sort((a,b)=>b.at.localeCompare(a.at));shell('audit',`<div class="sectionhead"><div><h1>Activity / Audit Log</h1><div class="muted">Who created, updated, deleted or logged in.</div></div></div>${tableRows(rows.map(x=>({...x,_entity:'audit'})),[['Time',r=>new Date(r.at).toLocaleString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})],['User',r=>`<b>${esc(r.userName)}</b>`],['Action',r=>r.action],['Section',r=>r.entity],['Record',r=>r.recordId],['Change',r=>r.before||r.after?`<button class="btn sm gray" onclick='showAudit(${JSON.stringify(r.id)})'>View</button>`:'—']],false)}`,'Activity Log')}
function showAudit(id){const a=db.audit.find(x=>x.id===id);if(!a)return;modal('Audit Detail',`<div class="notice"><b>${esc(a.userName)}</b> • ${a.action} • ${a.entity}<br>${new Date(a.at).toLocaleString('en-IN')}</div><div class="two" style="margin-top:12px"><div class="card"><b>Before</b><pre style="white-space:pre-wrap;font-size:11px">${esc(JSON.stringify(a.before,null,2)||'—')}</pre></div><div class="card"><b>After</b><pre style="white-space:pre-wrap;font-size:11px">${esc(JSON.stringify(a.after,null,2)||'—')}</pre></div></div>`,closeModal);document.getElementById('modalSave').style.display='none'}
function renderBackup(){shell('backup',`<div class="sectionhead"><div><h1>Online Sync & Backup</h1><div class="muted">Cloud sync + monthly Excel backup architecture.</div></div><span class="pill ${CLOUD_API?'green':'orange'}">${CLOUD_API?'Cloud API configured':'Cloud API not configured'}</span></div><div class="two"><div class="card"><h2>Cloud Sync</h2><p class="muted">All devices use the same central data when the production API is connected.</p><div class="notice">Status: <b>${esc(cloudState.status)}</b><br>Last sync: ${cloudState.lastSync?new Date(cloudState.lastSync).toLocaleString('en-IN'):'Not yet'}</div><button class="btn green" onclick="cloudSync().then(()=>render('backup'))">Sync Now</button></div><div class="card"><h2>Google Drive</h2><div class="notice"><b>Google Drive / Dairy Farm / YEAR / MONTH / Month.xlsx</b><br>Monthly Excel with Dashboard, Sales, Purchase, Expenses, Cash Flow, Profit & Loss and graphs.</div><p class="muted">Direct Drive upload requires Google OAuth/API credentials on the deployed server. This build keeps the integration point ready.</p><button class="btn green" onclick="exportDrivePack()">Prepare Monthly Backup</button></div></div>`,'Online Sync & Backup')}
function exportDrivePack(){exportCSVReport();alert('Monthly backup pack prepared. It can be uploaded to Durga Dairy / Year / Month in Google Drive.') }

function renderUsers(){if(user()?.role!=='Owner')return render('dashboard');shell('users',`<div class="sectionhead"><div><h1>Members & Login</h1><div class="muted">Every member has a unique login name. Changes are automatically attributed.</div></div><button class="btn" onclick="addUser()">+ Add Member</button></div>${tableRows(db.users.map(x=>({...x,_entity:'users'})),[['Name',r=>`<b>${esc(r.name)}</b>`],['Email',r=>esc(r.email)],['Role',r=>`<span class="pill">${r.role}</span>`],['Status',r=>r.active?'Active':'Disabled']],false)}<div class="section"><div class="card"><h3>Role guide</h3><p class="muted"><b>Owner:</b> everything • <b>Full Access Member:</b> all operational sections • <b>Family Member:</b> home/expense/sales/collection/reports • <b>Staff:</b> sales/collections/milk/stock/customers</p></div></div>`,'Members')}
function addUser(){modal('Add Member • Set Access',`<div class="formgrid"><div class="field"><label>Name</label><input id="name"></div><div class="field"><label>Email</label><input id="email" type="email"></div><div class="field"><label>PIN</label><input id="pin" type="password" inputmode="numeric"></div><div class="field"><label>Role</label><select id="role"><option>Full Access Member</option><option>Family Member</option><option>Dairy Staff</option><option>Manager</option></select></div></div>`,()=>{const r={id:uid(),name:val('name'),email:val('email'),pin:val('pin'),role:val('role')==='Dairy Staff'?'Staff':val('role'),active:true};if(!r.name||!r.pin)return alert('Name and PIN required.');db.users.push(r);audit('CREATE','User',r.id,null,{...r,pin:'••••'});save();closeModal();render('users')})}
function editGeneric(entity,id){if(entity==='vendorPayments')return alert('Vendor payment history cannot be edited. Create a correction entry instead.');const item=(db[entity]||[]).find(x=>x.id===id);if(!item)return;const old=JSON.parse(JSON.stringify(item));let body='';
if(entity==='sales') body=`<div class="formgrid"><div class="field"><label>Date</label><input id="date" type="date" value="${item.date}"></div><div class="field"><label>Product</label><select id="product">${['Milk','Ghee','Peda','Buttermilk','Other'].map(x=>`<option ${x===item.product?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Quantity</label><input id="qty" type="number" value="${item.qty||0}"></div><div class="field"><label>Amount ₹</label><input id="amount" type="number" value="${item.amount||0}"></div><div class="field span2"><label>Description</label><input id="desc" value="${esc(item.description||'')}"></div></div>`;
else if(entity==='collections') body=`<div class="formgrid"><div class="field"><label>Date</label><input id="date" type="date" value="${item.date}"></div><div class="field"><label>Mode</label><select id="mode"><option ${item.mode==='Customer-wise'?'selected':''}>Customer-wise</option><option ${item.mode==='Bulk Collection'?'selected':''}>Bulk Collection</option></select></div><div class="field span2"><label>Customer / Note</label><input id="name" value="${esc(item.name||'')}"></div><div class="field"><label>Amount ₹</label><input id="amount" type="number" value="${item.amount||0}"></div><div class="field"><label>Payment</label><select id="pay">${['Cash','UPI','Bank','Other'].map(x=>`<option ${x===item.paymentMode?'selected':''}>${x}</option>`).join('')}</select></div></div>`;
else if(entity==='expenses') body=`<div class="formgrid"><div class="field"><label>Date</label><input id="date" type="date" value="${item.date}"></div><div class="field"><label>Category</label><select id="cat">${[...new Set([...expenseCategories(),item.category].filter(Boolean))].map(x=>`<option ${x===item.category?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Amount ₹</label><input id="amount" type="number" value="${item.amount||0}"></div><div class="field"><label>Payment</label><select id="pay">${['Cash','UPI','Bank','Other'].map(x=>`<option ${x===item.paymentMode?'selected':''}>${x}</option>`).join('')}</select></div><div class="field span4"><label>Description</label><textarea id="desc">${esc(item.description||'')}</textarea></div></div>`;
else if(entity==='milk') body=`<div class="formgrid"><div class="field"><label>Date</label><input id="date" type="date" value="${item.date}"></div><div class="field"><label>Vendor</label><input id="vendor" value="${esc(item.vendor||'')}"></div><div class="field"><label>Cow Litres</label><input id="cow" type="number" value="${item.cowLitres||0}"></div><div class="field"><label>Cow Rate</label><input id="cowRate" type="number" value="${item.cowRate||0}"></div><div class="field"><label>Buffalo Litres</label><input id="buff" type="number" value="${item.buffLitres||0}"></div><div class="field"><label>Buffalo Rate</label><input id="buffRate" type="number" value="${item.buffRate||0}"></div><div class="field"><label>Paid</label><input id="paid" type="number" value="${item.paid||0}"></div></div>`;
else if(entity==='stockPurchases') body='<div class="formgrid"><div class="field"><label>Date</label><input id="date" type="date" value="'+item.date+'"></div><div class="field"><label>Item / Category</label><select id="item">'+stockPurchaseItemOptions(item.item)+'</select></div><div class="field"><label>Quantity</label><input id="qty" type="number" min="0" step="0.01" value="'+(item.qty||0)+'"></div><div class="field"><label>Unit</label><select id="unit">'+['kg','litre','piece','packet','box','unit'].map(x=>'<option '+(x===(item.unit||'kg')?'selected':'')+'>'+x+'</option>').join('')+'</select></div><div class="field"><label>Rate ₹</label><input id="rate" type="number" min="0" step="0.01" value="'+(item.rate||0)+'"></div><div class="field"><label>Paid ₹</label><input id="paid" type="number" min="0" step="0.01" value="'+(item.paid||0)+'"></div><div class="field"><label>Stock Until</label><input id="until" type="date" value="'+(item.stockUntil||'')+'"></div><div class="field"><label>Vendor</label><select id="vendor">'+stockVendorOptions(item.vendor||'')+'</select></div><div class="field span4"><div class="notice">Pending balance is recalculated when quantity, rate or paid amount changes.</div></div></div>'
else return alert('This record type is not editable in this prototype.');
modal('Edit '+entity,body,()=>{let next={...item}; if(entity==='sales'){next.date=val('date');next.product=val('product');next.qty=num(val('qty'));next.amount=num(val('amount'));next.description=val('desc')} if(entity==='collections'){next.date=val('date');next.mode=val('mode');next.name=val('name');next.amount=num(val('amount'));next.paymentMode=val('pay')} if(entity==='expenses'){next.date=val('date');next.category=val('cat');next.amount=num(val('amount'));next.paymentMode=val('pay');next.description=val('desc')} if(entity==='milk'){next.date=val('date');next.vendor=val('vendor');next.cowLitres=num(val('cow'));next.cowRate=num(val('cowRate'));next.buffLitres=num(val('buff'));next.buffRate=num(val('buffRate'));next.paid=num(val('paid'));next.total=next.cowLitres*next.cowRate+next.buffLitres*next.buffRate;next.balance=next.total-next.paid} if(entity==='stockPurchases'){next.date=val('date');next.item=val('item');next.qty=num(val('qty'));next.unit=val('unit')||item.unit||'kg';next.rate=num(val('rate'));next.paid=num(val('paid'));next.stockUntil=val('until');next.vendor=val('vendor');if(!next.date||!next.item||next.qty<=0||next.rate<0||next.paid<0)return alert('Enter a valid date, category, quantity, rate and paid amount.');next.total=next.qty*next.rate;next.balance=Math.max(0,next.total-next.paid)} Object.assign(item,next);audit('UPDATE',entity,item.id,old,item);save();closeModal();render(entity==='stockPurchases'?'stock':entity==='expenses'?'expenses':entity==='sales'?'sales':entity==='collections'?'collections':'milk')})}

function deleteGeneric(entity,id){if(entity==='vendorPayments')return alert('Vendor payment history cannot be deleted from this screen.');if(!confirm('Delete this record? The action will be logged.'))return;const arr=db[entity]||[];const i=arr.findIndex(x=>x.id===id);if(i<0)return;const old=arr[i];arr.splice(i,1);recordDeletion(entity,id,old);audit('DELETE',entity,id,old,null);save();render(entity==='sales'?'sales':entity==='collections'?'collections':entity==='milk'?'milk':entity==='stockPurchases'||entity==='stockUsage'?'stock':entity==='expenses'?'expenses':entity==='customers'?'customers':'vendors')}
function render(k){window.__durgaView=k;if(isAkash()&&['customers','terms','transfers','users'].includes(k))return dashboard();if(k==='dashboard')dashboard();else if(k==='sales')renderSales();else if(k==='milkPrices')renderMilkPrices();else if(k==='collections')renderCollections();else if(k==='milk')renderMilk();else if(k==='stock')renderStock();else if(k==='expenses')renderExpenses();else if(k==='customers')renderCustomers();else if(k==='vendors')renderVendors();else if(k==='cash')renderCash();else if(k==='reports')renderReports();else if(k==='audit')renderAudit();else if(k==='backup')renderBackup();else if(k==='terms')renderBillTerms();else if(k==='transfers')renderTransfers();else if(k==='users')renderUsers()}
function zeroTwoLogin(){ portalChooser(); }
async function doZeroTwoLogin(){
  await zeroTwoLoad();
}
async function zeroTwoLoad(){
  try{
    // All is served from the frontend Worker. Use its same-origin proxy so
    // browser CORS, stale config.js, and cross-origin Service Worker issues
    // cannot turn the JSON response into cached HTML.
    if(!CLOUD_API)throw new Error('Cloud API is not configured for combined reporting.');
    const url=CLOUD_API.replace(/\/$/,'')+'/api/zero-two-state?ts='+Date.now();
    const token=localStorage.getItem('durga-token')||'';
    const r=await fetch(url,{method:'GET',headers:{'Accept':'application/json','Cache-Control':'no-cache','Authorization':'Bearer '+token},cache:'no-store'});
    const text=await r.text();
    let j=null;
    try{j=JSON.parse(text)}catch(e){
      const ct=r.headers.get('content-type')||'';
      throw new Error('API returned '+r.status+' '+(ct||'non-JSON')+' instead of JSON');
    }
    if(r.status===401){localStorage.removeItem('durga-token');db.currentUser=null;localStorage.setItem(KEY,JSON.stringify(db));login();return;}
    if(!r.ok||!j.hiren||!j.akash)throw new Error(j?.error||'Combined data not available');
    window.__zeroTwoData={hiren:j.hiren,akash:j.akash,updatedAt:j.updatedAt||null};
    renderZeroTwo();
  }catch(e){
    document.getElementById('root').innerHTML='<div class="login"><div class="loginbox"><h1>Durga Dairy • All</h1><div class="notice">All data load failed: '+esc(e.message)+'</div><button class="btn orange" onclick="zeroTwoLoad()">Try Again</button><button class="linkbtn" onclick="portalChooser()">Back</button></div></div>'
  }
}
function zeroTwoNum(v){return Number(v||0)}
function zeroTwoSum(arr,key){return (arr||[]).reduce((a,x)=>a+zeroTwoNum(x?.[key]),0)}
function zeroTwoSourceData(source){const z=window.__zeroTwoData||{};return source==='hiren'?z.hiren:source==='akash'?z.akash:{}}
function zeroTwoInRange(x,from,to){let d=String(x?.date||'').slice(0,10);if(!d&&x?.month)d=String(x.month).slice(0,7)+'-01';else if(d.length===7)d+='-01';return (!from||d>=from)&&(!to||d<=to)}
function zeroTwoStats(source,from='',to=''){
  const d=zeroTwoSourceData(source),salesAll=(d.sales||[]),customerSalesAll=source==='akash'?[]:(d.customerSales||[]),milkAll=(d.milk||[]),stockAll=(d.stockPurchases||[]),expensesAll=(d.expenses||[]),collectionsAll=(d.collections||[]),customerPaymentsAll=source==='akash'?[]:(d.customerPayments||[]),customers=source==='akash'?[]:(d.customers||[]);
  const sales=salesAll.filter(x=>zeroTwoInRange(x,from,to)),customerSales=customerSalesAll.filter(x=>zeroTwoInRange(x,from,to)),milk=milkAll.filter(x=>zeroTwoInRange(x,from,to)),stock=stockAll.filter(x=>zeroTwoInRange(x,from,to)),expenses=expensesAll.filter(x=>zeroTwoInRange(x,from,to)),collections=collectionsAll.filter(x=>zeroTwoInRange(x,from,to)),customerPayments=customerPaymentsAll.filter(x=>zeroTwoInRange(x,from,to));
  const normalSales=zeroTwoSum(sales,'amount'),customerMilkSales=zeroTwoSum(customerSales,'amount'),salesTotal=normalSales+customerMilkSales;
  const milkSold=customerSales.reduce((a,x)=>a+zeroTwoNum(x.qty),0)+sales.filter(x=>String(x.product||'').toLowerCase()==='milk').reduce((a,x)=>a+zeroTwoNum(x.qty),0);
  const purchaseTotal=zeroTwoSum(milk,'total')+zeroTwoSum(stock,'total'),purchasePaid=zeroTwoSum(milk,'paid')+zeroTwoSum(stock,'paid');
  const payable=milkAll.reduce((a,x)=>a+Math.max(0,zeroTwoNum(x.balance||zeroTwoNum(x.total)-zeroTwoNum(x.paid))),0)+stockAll.reduce((a,x)=>a+Math.max(0,zeroTwoNum(x.balance||zeroTwoNum(x.total)-zeroTwoNum(x.paid))),0);
  const expenseTotal=zeroTwoSum(expenses,'amount'),collectionTotal=zeroTwoSum(collections,'amount')+zeroTwoSum(customerPayments,'amount');
  const customerReceivable=customers.reduce((a,c)=>{
    const opening=(d.customerOpeningBalances||[]).filter(x=>x.customerId===c.id&&String(x.effectiveDate||'0000-00-00')<=iso()).reduce((z,x)=>z+zeroTwoNum(x.amount),0);
    const billed=customerSalesAll.filter(x=>x.customerId===c.id&&String(x.date||'')<=iso()).reduce((z,x)=>z+zeroTwoNum(x.amount),0);
    const payments=customerPaymentsAll.filter(x=>x.customerId===c.id&&String(x.date||x.month||'')<=iso()).reduce((z,x)=>z+zeroTwoNum(x.amount)+zeroTwoNum(x.adjustment),0);
    return a+Math.max(0,opening+billed-payments);
  },0);
  const cashIn=sales.filter(x=>String(x.paymentMode||'').toLowerCase()!=='credit').reduce((a,x)=>a+zeroTwoNum(x.amount),0)+collectionTotal;
  const cashOut=zeroTwoSum(expenses,'amount')+purchasePaid,cashAvailable=cashIn-cashOut,profit=salesTotal-purchaseTotal-expenseTotal;
  const expenseBy={};expenses.forEach(x=>{const k=x.category||'Other';expenseBy[k]=(expenseBy[k]||0)+zeroTwoNum(x.amount)});
  return {salesTotal,milkSold,purchaseTotal,purchasePaid,payable,expenseTotal,collectionTotal,customerReceivable,cashAvailable,profit,expenseBy,dailyCount:customerSales.length+sales.length,sales,customerSales,milk,stock,expenses,collections,customerPayments};
}
function zeroTwoMergedStats(from='',to=''){const h=zeroTwoStats('hiren',from,to),a=zeroTwoStats('akash',from,to);return {salesTotal:h.salesTotal+a.salesTotal,milkSold:h.milkSold+a.milkSold,purchaseTotal:h.purchaseTotal+a.purchaseTotal,purchasePaid:h.purchasePaid+a.purchasePaid,payable:h.payable+a.payable,expenseTotal:h.expenseTotal+a.expenseTotal,collectionTotal:h.collectionTotal+a.collectionTotal,customerReceivable:h.customerReceivable+a.customerReceivable,cashAvailable:h.cashAvailable+a.cashAvailable,profit:h.profit+a.profit,dailyCount:h.dailyCount+a.dailyCount,expenseBy:Object.fromEntries([...new Set([...Object.keys(h.expenseBy),...Object.keys(a.expenseBy)])].map(k=>[k,zeroTwoNum(h.expenseBy[k])+zeroTwoNum(a.expenseBy[k])]))};}
function zeroTwoReportModal(){
  const body='<div class="formgrid"><div class="field span4"><label>Report Source</label><select id="zeroSource"><option value="all">All • Hiren + Akash</option><option value="hiren">Hiren</option><option value="akash">Akash</option></select></div><div class="field"><label>From Date (optional)</label><input id="zeroFrom" type="date" value="'+esc(window.__zeroFrom||'')+'"></div><div class="field"><label>To Date (optional)</label><input id="zeroTo" type="date" value="'+esc(window.__zeroTo||'')+'"></div></div><div class="notice">Leave both dates empty for all history. All is read-only. Internal transfers are shown separately and are not counted as extra sales or purchases.</div>';
  modal('Combined Report • Filters',body,()=>{const source=val('zeroSource')||'all',from=val('zeroFrom'),to=val('zeroTo');if(from&&to&&to<from)return alert('To Date cannot be earlier than From Date.');window.__zeroFrom=from;window.__zeroTo=to;closeModal();renderZeroTwo(source,from,to)})
}
function zeroTwoHistoryRows(source,from='',to=''){
  const z=zeroTwoSourceData(source),sales=(z.sales||[]).filter(x=>zeroTwoInRange(x,from,to)).map(x=>({date:x.date,kind:'Sale',description:x.product||'Sale',qty:zeroTwoNum(x.qty),amount:zeroTwoNum(x.amount)}));
  const cust=(source==='akash'?[]:(z.customerSales||[])).filter(x=>zeroTwoInRange(x,from,to)).map(x=>({date:x.date,kind:'Customer Milk',description:x.customerId||'Customer',qty:zeroTwoNum(x.qty),amount:zeroTwoNum(x.amount)}));
  const exp=(z.expenses||[]).filter(x=>zeroTwoInRange(x,from,to)).map(x=>({date:x.date,kind:'Expense',description:x.category||x.description||'Expense',qty:0,amount:-zeroTwoNum(x.amount)}));
  const transfers=(source==='akash'?[]:(z.internalTransfers||[])).filter(x=>zeroTwoInRange(x,from,to)).map(x=>({date:x.date,kind:'Internal Transfer',description:'Akash → Hiren • '+zeroTwoNum(x.quantity).toFixed(2)+' L (tracked separately)',qty:zeroTwoNum(x.quantity),amount:0}));
  return [...sales,...cust,...exp,...transfers].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,80);
}
function zeroTwoSourceName(source){return source==='hiren'?'Hiren':source==='akash'?'Akash':'All'}
function zeroTwoDuesRows(source){
  if(source==='akash')return [];
  const d=zeroTwoSourceData(source),month=ym(iso()),rows=[];
  for(const c of (d.customers||[])){
    const allSales=(d.customerSales||[]).filter(x=>x.customerId===c.id&&String(x.date||'')<=iso()),sales=allSales.filter(x=>ym(x.date)===month),bill=sales.reduce((a,x)=>a+zeroTwoNum(x.amount),0),qty=sales.reduce((a,x)=>a+zeroTwoNum(x.qty),0);
    const allPays=(d.customerPayments||[]).filter(x=>x.customerId===c.id&&String(x.date||x.month||'')<=iso()),pays=allPays.filter(x=>x.month===month),paid=pays.reduce((a,x)=>a+zeroTwoNum(x.amount),0),adjust=pays.reduce((a,x)=>a+zeroTwoNum(x.adjustment),0);
    const opening=(d.customerOpeningBalances||[]).filter(x=>x.customerId===c.id&&String(x.effectiveDate||'0000-00-00')<=iso()).reduce((a,x)=>a+zeroTwoNum(x.amount),0),totalPaid=allPays.reduce((a,x)=>a+zeroTwoNum(x.amount)+zeroTwoNum(x.adjustment),0),balance=Math.max(0,opening+allSales.reduce((a,x)=>a+zeroTwoNum(x.amount),0)-totalPaid);
    if(balance>0||bill>0)rows.push({source:zeroTwoSourceName(source),customer:c.name||'Customer',qty,bill,paid,adjust,balance});
  }
  return rows.sort((a,b)=>b.balance-a.balance);
}
function zeroTwoReportModal(){
  const body='<div class="formgrid"><div class="field span4"><label>Report Source</label><select id="zeroSource"><option value="all">All • Hiren + Akash</option><option value="hiren">Hiren</option><option value="akash">Akash</option></select></div><div class="field span4"><label>Report Period</label><select id="zeroPeriod"><option value="all">All History</option><option value="month">This Month</option></select></div></div><div class="notice">Hiren પસંદ કરશો તો માત્ર Hiren history. Akash પસંદ કરશો તો માત્ર Akash history. All પસંદ કરશો તો બંનેનું merged report.</div>';
  modal('Profit & Loss • Filter',body,()=>{const source=val('zeroSource')||'all';closeModal();renderZeroTwo(source)})
}
function zeroTwoHistoryRows(source){const z=zeroTwoSourceData(source);const sales=(z.sales||[]).map(x=>({date:x.date,kind:'Sale',description:x.product||'Sale',qty:zeroTwoNum(x.qty),amount:zeroTwoNum(x.amount)}));const cust=(source==='akash'?[]:(z.customerSales||[])).map(x=>({date:x.date,kind:'Customer Milk',description:x.customerId||'Customer',qty:zeroTwoNum(x.qty),amount:zeroTwoNum(x.amount)}));const exp=(z.expenses||[]).map(x=>({date:x.date,kind:'Expense',description:x.category||x.description||'Expense',qty:0,amount:-zeroTwoNum(x.amount)}));const transfers=(source==='akash'?[]:(z.internalTransfers||[])).map(x=>({date:x.date,kind:'Internal Transfer',description:'Akash → Hiren • '+zeroTwoNum(x.quantity).toFixed(2)+' L (tracked separately)',qty:zeroTwoNum(x.quantity),amount:0}));return [...sales,...cust,...exp,...transfers].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,80)}
function zeroTwoSourceName(source){return source==='hiren'?'Hiren':source==='akash'?'Akash':'All'}
function zeroTwoDuesRows(source){
  if(source==='akash')return [];
  const d=zeroTwoSourceData(source),month=ym(iso()),rows=[];
  for(const c of (d.customers||[])){
    const sales=(d.customerSales||[]).filter(x=>x.customerId===c.id&&ym(x.date)===month);
    const bill=sales.reduce((a,x)=>a+zeroTwoNum(x.amount),0);
    const qty=sales.reduce((a,x)=>a+zeroTwoNum(x.qty),0);
    const pays=(d.customerPayments||[]).filter(x=>x.customerId===c.id&&x.month===month);
    const paid=pays.reduce((a,x)=>a+zeroTwoNum(x.amount),0);
    const adjust=pays.reduce((a,x)=>a+zeroTwoNum(x.adjustment),0);
    const balance=Math.max(0,bill-paid-adjust);
    if(balance>0||bill>0)rows.push({source:zeroTwoSourceName(source),customer:c.name||'Customer',qty,bill,paid,adjust,balance});
  }
  return rows;
}
function zeroTwoReport(source='all',from=window.__zeroFrom||'',to=window.__zeroTo||''){
  const h=zeroTwoStats('hiren',from,to),a=zeroTwoStats('akash',from,to),r=source==='hiren'?h:source==='akash'?a:zeroTwoMergedStats(from,to),label=zeroTwoSourceName(source);
  const rows=source==='all'?[...zeroTwoHistoryRows('hiren',from,to).map(x=>({...x,source:'Hiren'})),...zeroTwoHistoryRows('akash',from,to).map(x=>({...x,source:'Akash'}))].sort((x,y)=>String(y.date).localeCompare(String(x.date))).slice(0,80):zeroTwoHistoryRows(source,from,to);
  const exp=Object.entries(r.expenseBy||{}).sort((x,y)=>y[1]-x[1]);
  const categories=[...new Set([...Object.keys(h.expenseBy||{}),...Object.keys(a.expenseBy||{})])].sort();
  const expenseComparison='<div class="card section"><div class="sectionhead"><h2>All Expense Comparison</h2><span class="muted">Selected date range</span></div><div class="tablewrap"><table class="table"><tr><th>Category</th><th>Hiren</th><th>Akash</th><th>Combined</th></tr>'+categories.map(k=>'<tr><td>'+esc(k)+'</td><td>'+money(zeroTwoNum(h.expenseBy[k]))+'</td><td>'+money(zeroTwoNum(a.expenseBy[k]))+'</td><td><b>'+money(zeroTwoNum(h.expenseBy[k])+zeroTwoNum(a.expenseBy[k]))+'</b></td></tr>').join('')+'<tr><th>Total Expenses</th><th>'+money(h.expenseTotal)+'</th><th>'+money(a.expenseTotal)+'</th><th>'+money(h.expenseTotal+a.expenseTotal)+'</th></tr></table></div></div>';
  const dues=source==='all'?[...zeroTwoDuesRows('hiren')]:source==='akash'?[]:zeroTwoDuesRows(source),duesTotal=dues.reduce((a,x)=>a+x.balance,0);
  const duesTable=tableRows(dues.map((x,i)=>({...x,id:String(i),_entity:'zeroTwoDues'})),[['Source',x=>x.source],['Customer',x=>esc(x.customer)],['Milk Qty',x=>x.qty.toFixed(2)+' L'],['Current Month Bill',x=>money(x.bill)],['Current Month Paid',x=>money(x.paid)],['Adjustment',x=>money(x.adjust)],['Total Outstanding',x=>'<b>'+money(x.balance)+'</b>']],false);
  const period=from||to?'Period: '+(from?fmtDate(from):'Earliest')+' to '+(to?fmtDate(to):'Latest'):'Period: All History';
  const transferTotal=(window.__zeroTwoData?.hiren?.internalTransfers||[]).filter(x=>zeroTwoInRange(x,from,to)&&x.transactionType==='INTERNAL_TRANSFER').reduce((sum,x)=>sum+zeroTwoNum(x.amount),0);
  return '<div class="sectionhead"><div><h1>Zero Two • '+label+' Report</h1><div class="muted">Read-only combined reporting • '+period+' • Original business partitions remain separate.</div></div><div class="toolbar"><button class="btn orange" onclick="zeroTwoReportModal()">Filter</button><button class="btn gray" onclick="logout()">Logout</button></div></div><div class="grid">'+metric('Total Sales',zeroTwoMoney(r.salesTotal))+metric('Milk Sold',r.milkSold.toFixed(2)+' L')+metric('Daily Entry Count',r.dailyCount)+metric('Customer Receivable',zeroTwoMoney(r.customerReceivable))+metric('Purchase Payable',zeroTwoMoney(r.payable))+metric('Total Expenses',zeroTwoMoney(r.expenseTotal))+metric('Estimated Profit / Loss',zeroTwoMoney(r.profit),r.profit>=0?'Profit':'Loss')+metric('Cash Movement Estimate',zeroTwoMoney(r.cashAvailable))+metric('Internal Transfers',zeroTwoMoney(transferTotal),'Separate ledger, not added to sales or profit')+'</div><div class="two section"><div class="card"><h2>Business-wise Breakdown</h2>'+[['Hiren',h],['Akash',a]].map(([n,x])=>'<div class="notice" style="margin-bottom:8px"><b>'+n+'</b><br>Sales: '+money(x.salesTotal)+' • Milk: '+x.milkSold.toFixed(2)+' L • Payable: '+money(x.payable)+' • Expenses: '+money(x.expenseTotal)+' • Estimated P/L: '+money(x.profit)+' • Cash movement: '+money(x.cashAvailable)+'</div>').join('')+'</div><div class="card"><h2>Expense by Category</h2>'+(exp.map(([k,v])=>'<p style="display:flex;justify-content:space-between;margin:8px 0"><span>'+esc(k)+'</span><b>'+money(v)+'</b></p>').join('')||'<p class="muted">No expenses in this period</p>')+'</div></div>'+expenseComparison+'<div class="card section"><div class="sectionhead"><h2>Customer Outstanding</h2><span class="muted">As of today • Total Due: '+money(duesTotal)+'</span></div>'+duesTable+'</div><div class="card section"><div class="sectionhead"><h2>History</h2><span class="muted">Latest 80 records in selected range</span></div>'+tableRows(rows.map((x,i)=>({...x,id:String(i),_entity:'zeroTwo'})),[['Date',x=>fmtDate(x.date)],['Source',x=>x.source||label],['Type',x=>esc(x.kind)],['Description',x=>esc(x.description)],['Qty',x=>x.qty?x.qty.toFixed(2):'—'],['Amount',x=>money(x.amount)]],false)+'</div>';
}
function renderZeroTwo(source='all',from=window.__zeroFrom||'',to=window.__zeroTo||''){if(!isZeroTwo())return portalChooser();window.__zeroSource=source;document.getElementById('root').innerHTML='<div class="app"><section class="main" style="width:100%"><header class="topbar"><div><b>Durga Dairy • Zero Two</b></div><div class="right"><span class="pill orange">Full Access</span><span class="workspace">All Data</span><span class="avatar">'+esc((user()?.name||'?')[0])+'</span><span class="small">'+esc(user()?.name||'')+'</span></div></header><main class="page">'+zeroTwoReport(source,from,to)+'<div class="footer">Zero Two • Read-only combined reporting • Build '+BUILD_VERSION+' • Hiren + Akash</div></main></section></div>'}

init();

if(typeof window!=='undefined'&&!window.__durgaSyncListeners){
  window.__durgaSyncListeners=true;
  window.addEventListener('online',()=>{if(db.currentUser&&!isZeroTwo())cloudSync()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&db.currentUser&&!isZeroTwo())cloudSync()});
  window.addEventListener('focus',()=>{if(db.currentUser&&!isZeroTwo())cloudSync()});
}
