const FRONTEND_ORIGIN = "https://durga-dairy-live.hiren-vaghasiya07.workers.dev";

function corsHeaders(req){
  const origin = req.headers.get("Origin");
  const allowOrigin = origin === FRONTEND_ORIGIN ? origin : FRONTEND_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Cache-Control",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status = 200, req = null){
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(req ? corsHeaders(req) : {})
  };
  return new Response(JSON.stringify(data), {status, headers});
}

function options(req){
  return new Response(null,{status:204,headers:corsHeaders(req)});
}

function b64(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function unb64(s){
  const bin=atob(s); const out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
  return out;
}
async function hashPassword(password,saltB64){
  const salt=saltB64?unb64(saltB64):crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:120000,hash:"SHA-256"},key,256);
  return {salt:b64(salt),hash:b64(bits)};
}
async function verifyPassword(password,saltB64,expected){
  return (await hashPassword(password,saltB64)).hash===expected;
}
async function sha256(text){
  return b64(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)));
}
async function readBody(req){try{return await req.json()}catch{return {}}}
async function issueSession(env,u){
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  const token=b64(bytes).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const tokenHash=await sha256(token),createdAt=new Date(),expiresAt=new Date(createdAt.getTime()+30*24*60*60*1000).toISOString();
  await env.DB.prepare("INSERT INTO session_tokens(token_hash,user_id,created_at,expires_at,revoked_at) VALUES(?,?,?,?,NULL)").bind(tokenHash,u.id,createdAt.toISOString(),expiresAt).run();
  return token;
}
async function authUser(req,env){
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return null;
  const tokenHash=await sha256(token),now=new Date().toISOString();
  return await env.DB.prepare("SELECT u.id,u.name,u.email,u.role FROM session_tokens s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.active=1").bind(tokenHash,now).first();
}

function emptyState(){
  return {
    version:5,
    users:[],
    currentUser:null,
    settings:{},
    prices:[],sales:[],collections:[],milk:[],stockPurchases:[],stockUsage:[],
    expenses:[],customers:[],vendors:[],vendorPayments:[],cashChecks:[],cashOpenings:[],
    audit:[],customerSales:[],customerPayments:[],customerBills:[],customerOpeningBalances:[],internalTransfers:[],milkPriceVarieties:[],__tombstones:{}
  };
}
async function ensureSeed(env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS session_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,revoked_at TEXT)").run();
  const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  if(Number(r?.n||0)>0)return;
  const defaults=[
    ["u_owner","Hiren","owner@durga.local","Owner","1234"],
    ["u_brother","Brother","brother@durga.local","Full Access Member","3333"],
    ["u_family","Family Member","family@durga.local","Family Member","1111"],
    ["u_staff","Dairy Staff","staff@durga.local","Staff","2222"]
  ];
  for(const [id,name,email,role,pw] of defaults){
    const h=await hashPassword(pw);
    await env.DB.prepare("INSERT INTO users(id,name,email,role,active,password_hash,password_salt) VALUES(?,?,?,?,1,?,?)")
      .bind(id,name,email,role,h.hash,h.salt).run();
  }
  const clean=emptyState();
  clean.users=defaults.map(([id,name,email,role])=>({id,name,email,role,active:true}));
  await env.DB.prepare("INSERT OR IGNORE INTO workspace_state(workspace_id,state_json,updated_at) VALUES(?,?,?)")
    .bind("durga-dairy",JSON.stringify(clean),new Date().toISOString()).run();
}

const ARRAY_KEYS=[
  "sales","collections","milk","stockPurchases","stockUsage","expenses","customers",
  "vendors","vendorPayments","cashChecks","cashOpenings","audit","prices",
  "customerSales","customerPayments","customerBills","customerOpeningBalances","internalTransfers","milkPriceVarieties"
];

function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}

function tombstoneTime(value){
  if(typeof value==="string")return value;
  return value?.deletedAt||value?.deleted_at||value?.at||"";
}
function mergeTombstones(...sources){
  const out={};
  for(const source of sources){
    for(const [entity,records] of Object.entries(source||{})){
      out[entity]=out[entity]||{};
      for(const [id,value] of Object.entries(records||{})){
        const prev=out[entity][id];
        const nextTime=tombstoneTime(value),prevTime=tombstoneTime(prev);
        if(!prev||nextTime>=prevTime)out[entity][id]=clone(value);
      }
    }
  }
  return out;
}
function addDeletionTombstones(tombstones,deleted,business,actor){
  const out=mergeTombstones(tombstones);
  for(const [entity,ids] of Object.entries(deleted||{})){
    if(!Array.isArray(ids))continue;
    out[entity]=out[entity]||{};
    for(const rawId of ids){
      const id=String(rawId||"");
      if(!id)continue;
      const previous=out[entity][id];
      out[entity][id]={recordId:id,businessId:business,entityType:entity,deletedAt:tombstoneTime(previous)||new Date().toISOString(),deletedBy:actor||"authorized-user",deletionVersion:6};
    }
  }
  return out;
}
function mergeArrayById(remote,incoming,tombstones={},entity=""){
  const map=new Map();
  for(const x of Array.isArray(remote)?remote:[]) if(x&&x.id!=null) map.set(String(x.id),x);
  for(const x of Array.isArray(incoming)?incoming:[]) if(x&&x.id!=null) map.set(String(x.id),x);
  const dead=tombstones?.[entity]||{};
  return Array.from(map.values()).filter(x=>!Object.prototype.hasOwnProperty.call(dead,String(x.id)));
}
function mergeBusiness(remote,incoming,deleted={},business="hiren",actor="authorized-user"){
  const out=clone(remote||emptyState());
  const tombstones=addDeletionTombstones(mergeTombstones(remote?.__tombstones,incoming?.__tombstones),deleted,business,actor);
  out.__tombstones=tombstones;
  for(const key of ARRAY_KEYS) out[key]=mergeArrayById(remote?.[key],incoming?.[key],tombstones,key);
  out.users=mergeArrayById(remote?.users,incoming?.users,tombstones,"users");
  out.settings={...(remote?.settings||{}),...(incoming?.settings||{})};
  out.currentUser=null;
  out.version=Math.max(Number(remote?.version||0),Number(incoming?.version||0),6);
  return out;
}

/*
  Business isolation:
  - Hiren writes only the Hiren/root partition.
  - Akash writes only settings.__businesses.akash.
  - A stale Akash snapshot can never overwrite Hiren.
  - A stale Hiren snapshot can never overwrite Akash.
*/
function mergeWorkspace(remote,incoming,business,deleted={},actor="authorized-user"){
  const base=clone(remote||emptyState());
  if(business==="akash"){
    const remoteAkash=base?.settings?.__businesses?.akash||emptyState();
    const incomingAkash=incoming?.settings?.__businesses?.akash||incoming||emptyState();
    const mergedAkash=mergeBusiness(remoteAkash,incomingAkash,deleted,"akash",actor);
    base.settings={...(base.settings||{}),__businesses:{...(base.settings?.__businesses||{}),akash:mergedAkash}};
    base.version=Math.max(Number(base.version||0),Number(mergedAkash.version||0),5);
    base.currentUser=null;
    return base;
  }

  const incomingHiren=clone(incoming||{});
  const preservedBusinesses=clone(base?.settings?.__businesses||{});
  delete incomingHiren?.settings?.__businesses;
  const merged=mergeBusiness(base,incomingHiren,deleted,"hiren",actor);
  merged.settings={...(merged.settings||{}),__businesses:preservedBusinesses};
  merged.currentUser=null;
  return merged;
}

async function saveBackup(env,state){
  if(!env.BACKUP_KV)return;
  const payload=JSON.stringify({saved_at:new Date().toISOString(),db:state});
  await env.BACKUP_KV.put("latest",payload);
  await env.BACKUP_KV.put("backup:"+new Date().toISOString().slice(0,10),payload);
}

export default {
  async fetch(req,env){
    const url=new URL(req.url);
    try{
      if(req.method==="OPTIONS")return options(req);
      await ensureSeed(env);

      if(url.pathname==="/api/health")
        return json({ok:true,service:"Durga Dairy",cloudflare:true,syncVersion:6},200,req);

      if(url.pathname==="/api/login"&&req.method==="POST"){
        const b=await readBody(req);
        const email=String(b.email||"").toLowerCase();
        const u=await env.DB.prepare("SELECT id,name,email,role,active,password_hash,password_salt FROM users WHERE lower(email)=? AND active=1").bind(email).first();
        if(!u||!(await verifyPassword(String(b.password||""),u.password_salt,u.password_hash)))
          return json({error:"Invalid login"},401,req);
        const token=await issueSession(env,u);
        return json({token,user:{id:u.id,name:u.name,email:u.email,role:u.role}},200,req);
      }

      if(url.pathname==="/api/forgot-password"&&req.method==="POST")
        return json({ok:true,message:"Reset workflow accepted. Configure email delivery before production use."},200,req);

      if(url.pathname==="/api/state"&&req.method==="GET"){
        const u=await authUser(req,env);
        if(!u)return json({error:"Unauthorized"},401,req);
        const session=env.DB.withSession("first-primary");
        const row=await session.prepare("SELECT state_json,updated_at FROM workspace_state WHERE workspace_id=?").bind("durga-dairy").first();
        const full=row?.state_json?JSON.parse(row.state_json):emptyState();
        const requested=String(url.searchParams.get("business")||"hiren").toLowerCase();
        const business=requested==="akash"?"akash":"hiren";
        if((u.id==="u_akash"&&business!=="akash")||(u.id!=="u_akash"&&business!=="hiren"))return json({error:"Business access denied"},403,req);
        let db;
        if(business==="akash"){
          const akash=full?.settings?.__businesses?.akash||emptyState();
          db={...emptyState(),settings:{__businesses:{akash}}};
        }else{
          db=clone(full);db.settings={...(db.settings||{})};delete db.settings.__businesses;
        }
        return json({ok:true,db,updatedAt:row?.updated_at||null,syncVersion:6,business},200,req);
      }

      if(url.pathname==="/api/sync"&&req.method==="POST"){
        const u=await authUser(req,env);
        if(!u)return json({error:"Unauthorized"},401,req);

        const b=await readBody(req);
        const workspaceId=String(b.workspaceId||"");
        const business=workspaceId.endsWith("-akash")?"akash":"hiren";
        const incoming=b.db&&typeof b.db==="object"?b.db:{};

        const session=env.DB.withSession("first-primary");
        const row=await session.prepare("SELECT state_json FROM workspace_state WHERE workspace_id=?").bind("durga-dairy").first();
        const remote=row?.state_json?JSON.parse(row.state_json):emptyState();

        const deleted=b.deleted&&typeof b.deleted==="object"?b.deleted:{};
        if((u.id==="u_akash"&&business!=="akash")||(u.id!=="u_akash"&&business!=="hiren"))return json({error:"Business access denied"},403,req);
        const merged=mergeWorkspace(remote,incoming,business,deleted,u.name||u.email);
        const updatedAt=new Date().toISOString();
        await env.DB.prepare(
          "INSERT INTO workspace_state(workspace_id,state_json,updated_at) VALUES(?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at"
        ).bind("durga-dairy",JSON.stringify(merged),updatedAt).run();

        await saveBackup(env,merged);
        let responseDb;
        if(business==="akash"){
          const akash=merged?.settings?.__businesses?.akash||emptyState();
          responseDb={...emptyState(),settings:{__businesses:{akash}}};
        }else{
          responseDb=clone(merged);responseDb.settings={...(responseDb.settings||{})};delete responseDb.settings.__businesses;
        }
        return json({ok:true,db:responseDb,updatedAt,business,syncVersion:6},200,req);
      }

      if(url.pathname==="/api/zero-two-state"&&req.method==="GET"){
        const u=await authUser(req,env);
        if(!u)return json({error:"Unauthorized"},401,req);
        if(!["Owner","Full Access Member"].includes(u.role))return json({error:"Full access required"},403,req);
        const session=env.DB.withSession("first-primary");
        const row=await session.prepare("SELECT state_json,updated_at FROM workspace_state WHERE workspace_id=?").bind("durga-dairy").first();
        const db=row?.state_json?JSON.parse(row.state_json):emptyState();
        const akash=db?.settings?.__businesses?.akash||emptyState();
        return json({ok:true,hiren:db,akash,updatedAt:row?.updated_at||null,syncVersion:6},200,req);
      }

      if(url.pathname==="/api/backup"&&req.method==="GET"){
        const u=await authUser(req,env);
        if(!u)return json({error:"Unauthorized"},401,req);
        if(!env.BACKUP_KV)return json({error:"Backup storage unavailable"},503,req);
        const latest=await env.BACKUP_KV.get("latest");
        return json({ok:true,backup:latest?JSON.parse(latest):null},200,req);
      }

      return env.ASSETS.fetch(req);
    }catch(e){
      return json({error:e?.message||"Server error"},500,req);
    }
  }
};
