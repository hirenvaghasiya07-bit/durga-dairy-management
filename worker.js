const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function unb64(s) {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
  return out;
}
async function hashPassword(password, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2", salt, iterations:120000, hash:"SHA-256"}, key, 256);
  return {salt:b64(salt), hash:b64(bits)};
}
async function verifyPassword(password, saltB64, expected) {
  const x = await hashPassword(password, saltB64);
  return x.hash === expected;
}
async function sha256(text) {
  return b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}
async function readBody(req){ try{return await req.json()}catch{return {}} }
async function tokenFor(env, email) {
  const secret = env.SESSION_SECRET || "CHANGE_THIS_IN_CLOUDFLARE";
  return sha256(secret + ":" + String(email).toLowerCase() + ":durga-dairy");
}
async function authUser(req, env) {
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token) return null;
  const users=await env.DB.prepare("SELECT id,name,email,role,active,password_hash,password_salt FROM users WHERE active=1").all();
  for(const u of users.results||[]){ if(await tokenFor(env,u.email)===token) return u; }
  return null;
}
async function ensureSeed(env){
  const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  if(Number(r?.n||0)>0) return;
  const defaults=[
    ["u_owner","Hiren","owner@durga.local","Owner","1234"],
    ["u_brother","Brother","brother@durga.local","Full Access Member","3333"],
  ];
  for(const [id,name,email,role,pw] of defaults){
    const h=await hashPassword(pw);
    await env.DB.prepare("INSERT INTO users(id,name,email,role,active,password_hash,password_salt) VALUES(?,?,?,?,1,?,?)").bind(id,name,email,role,h.hash,h.salt).run();
  }
  await env.DB.prepare("INSERT OR IGNORE INTO workspace_state(workspace_id,state_json,updated_at) VALUES(?,?,?)").bind("durga-dairy",JSON.stringify({version:4}),new Date().toISOString()).run();
}

const ARRAY_KEYS=["sales","collections","milk","stockPurchases","stockUsage","expenses","customers","vendors","vendorPayments","cashChecks","cashOpenings","audit","prices"];

function clone(v){
  return v==null ? v : JSON.parse(JSON.stringify(v));
}

function mergeArrayById(remote, incoming){
  const map=new Map();
  for(const x of Array.isArray(remote)?remote:[]) if(x && x.id) map.set(String(x.id),x);
  for(const x of Array.isArray(incoming)?incoming:[]) if(x && x.id) map.set(String(x.id),x);
  return Array.from(map.values());
}

/*
  IMPORTANT:
  The browser can be offline or can contain records created on another device.
  Never replace the whole cloud workspace with one device's local snapshot.
  /api/sync first reads the current primary D1 state and then performs a
  record-level union by id. This prevents one phone/desktop from deleting
  records created by another device.
*/
function mergeWorkspace(remote,incoming){
  const out=clone(remote||{});
  for(const key of ARRAY_KEYS) out[key]=mergeArrayById(remote?.[key],incoming?.[key]);
  const remoteUsers=Array.isArray(remote?.users)?remote.users:[];
  const incomingUsers=Array.isArray(incoming?.users)?incoming.users:[];
  out.users=mergeArrayById(remoteUsers,incomingUsers);
  out.settings=Object.assign({},remote?.settings||{},incoming?.settings||{});
  out.version=Math.max(Number(remote?.version||0),Number(incoming?.version||0),4);
  out.currentUser=null;
  return out;
}

async function saveBackup(env,state){
  if(!env.BACKUP_KV) return;
  const payload=JSON.stringify({saved_at:new Date().toISOString(),db:state});
  await env.BACKUP_KV.put("latest",payload);
  await env.BACKUP_KV.put("backup:"+new Date().toISOString().slice(0,10),payload);
}

export default {
  async fetch(req, env) {
    const url=new URL(req.url);
    try {
      await ensureSeed(env);

      if(url.pathname==="/api/health")
        return json({ok:true,service:"Durga Dairy",cloudflare:true});

      if(url.pathname==="/api/login" && req.method==="POST"){
        const b=await readBody(req);
        const email=String(b.email||"").toLowerCase();
        const u=await env.DB.prepare("SELECT id,name,email,role,active,password_hash,password_salt FROM users WHERE lower(email)=? AND active=1").bind(email).first();
        if(!u || !(await verifyPassword(String(b.password||""),u.password_salt,u.password_hash)))
          return json({error:"Invalid login"},401);
        return json({token:await tokenFor(env,u.email),user:{id:u.id,name:u.name,email:u.email,role:u.role}});
      }

      if(url.pathname==="/api/forgot-password" && req.method==="POST")
        return json({ok:true,message:"Reset workflow accepted. Configure email delivery before production use."});

      if(url.pathname==="/api/state" && req.method==="GET"){
        const u=await authUser(req,env);
        if(!u) return json({error:"Unauthorized"},401);
        const session=env.DB.withSession("first-primary");
        const row=await session.prepare("SELECT state_json,updated_at FROM workspace_state WHERE workspace_id=?").bind("durga-dairy").first();
        const db=row?.state_json?JSON.parse(row.state_json):{version:4};
        return json({ok:true,db,updatedAt:row?.updated_at||null});
      }

      if(url.pathname==="/api/sync" && req.method==="POST"){
        const u=await authUser(req,env);
        if(!u) return json({error:"Unauthorized"},401);

        const b=await readBody(req);
        const incoming=b.db&&typeof b.db==="object"?b.db:{};

        // Always read the latest cloud state from the D1 primary before merging.
        const session=env.DB.withSession("first-primary");
        const row=await session.prepare("SELECT state_json FROM workspace_state WHERE workspace_id=?").bind("durga-dairy").first();
        const remote=row?.state_json?JSON.parse(row.state_json):{version:4};

        const merged=mergeWorkspace(remote,incoming);
        const updatedAt=new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO workspace_state(workspace_id,state_json,updated_at) VALUES(?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at"
        ).bind("durga-dairy",JSON.stringify(merged),updatedAt).run();

        await saveBackup(env,merged);
        return json({ok:true,db:merged,updatedAt});
      }

      if(url.pathname==="/api/zero-two-state" && req.method==="GET"){
        const u=await authUser(req,env);
        if(!u || !["Owner","Full Access Member"].includes(u.role)) return json({error:"Zero Two requires Full Access access"},403);
        const session=env.DB.withSession("first-primary");
        const row=await session.prepare("SELECT state_json,updated_at FROM workspace_state WHERE workspace_id=?").bind("durga-dairy").first();
        const db=row?.state_json?JSON.parse(row.state_json):{version:4};
        const akash=db?.settings?.__businesses?.akash||{version:4};
        return json({ok:true,hiren:db,akash,updatedAt:row?.updated_at||null});
      }

      if(url.pathname==="/api/backup" && req.method==="GET"){
        const u=await authUser(req,env);
        if(!u) return json({error:"Unauthorized"},401);
        if(!env.BACKUP_KV) return json({error:"Backup storage unavailable"},503);
        const latest=await env.BACKUP_KV.get("latest");
        return json({ok:true,backup:latest?JSON.parse(latest):null});
      }

      return env.ASSETS.fetch(req);
    } catch(e) {
      return json({error:e?.message||"Server error"},500);
    }
  }
};