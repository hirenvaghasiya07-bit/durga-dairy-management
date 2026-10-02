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

export default {
  async fetch(req, env) {
    const url=new URL(req.url);
    try {
      await ensureSeed(env);
      if(url.pathname==="/api/health") return json({ok:true,service:"Durga Dairy",cloudflare:true});
      if(url.pathname==="/api/login" && req.method==="POST"){
        const b=await readBody(req); const email=String(b.email||"").toLowerCase();
        const u=await env.DB.prepare("SELECT id,name,email,role,active,password_hash,password_salt FROM users WHERE lower(email)=? AND active=1").bind(email).first();
        if(!u || !(await verifyPassword(String(b.password||""),u.password_salt,u.password_hash))) return json({error:"Invalid login"},401);
        return json({token:await tokenFor(env,u.email),user:{id:u.id,name:u.name,email:u.email,role:u.role}});
      }
      if(url.pathname==="/api/forgot-password" && req.method==="POST") return json({ok:true,message:"Reset workflow accepted. Configure email delivery before production use."});
      if(url.pathname==="/api/sync" && req.method==="POST"){
        const u=await authUser(req,env); if(!u) return json({error:"Unauthorized"},401);
        const b=await readBody(req); const state=b.db||{};
        await env.DB.prepare("INSERT INTO workspace_state(workspace_id,state_json,updated_at) VALUES(?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at").bind("durga-dairy",JSON.stringify(state),new Date().toISOString()).run();
        return json({ok:true,db:state});
      }
      if(url.pathname==="/api/state" && req.method==="GET"){
        const u=await authUser(req,env); if(!u) return json({error:"Unauthorized"},401);
        const row=await env.DB.prepare("SELECT state_json FROM workspace_state WHERE workspace_id=?").bind("durga-dairy").first();
        return json({ok:true,db:row?JSON.parse(row.state_json):{version:4}});
      }
      // Serve the SPA and assets from Workers Static Assets.
      return env.ASSETS.fetch(req);
    } catch(e) {
      return json({error:e?.message||"Server error"},500);
    }
  }
};
