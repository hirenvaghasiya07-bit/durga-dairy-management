import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const PORT=process.env.PORT||8080, ROOT=path.resolve('.'), DATA=process.env.DURGA_DATA||path.join(ROOT,'data');
fs.mkdirSync(DATA,{recursive:true}); const dbFile=path.join(DATA,'workspace.json');
const hash=(s,salt=crypto.randomBytes(16).toString('hex'))=>({salt,hash:crypto.scryptSync(s,salt,64).toString('hex')});
const verify=(s,x)=>crypto.timingSafeEqual(Buffer.from(x.hash,'hex'),crypto.scryptSync(s,x.salt,64));
function read(){try{return JSON.parse(fs.readFileSync(dbFile,'utf8'))}catch{return {version:4,workspaceId:'durga-dairy',users:[],data:{}}}}
function write(x){fs.writeFileSync(dbFile,JSON.stringify(x,null,2))}
let state=read();
function tokenFor(email){return crypto.createHmac('sha256',process.env.DURGA_SESSION_SECRET||'change-me').update(email+':durga-dairy').digest('hex')}
function send(res,code,obj,headers={}){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(obj))}
async function body(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}})})}
function userByEmail(email){return state.users.find(u=>u.email.toLowerCase()===String(email).toLowerCase()&&u.active!==false)}
function seed(){if(state.users.length)return; const mk=(id,name,email,pw,role)=>({id,name,email,role,active:true,password:hash(pw)}); state.users=[mk('u_owner','Hiren','owner@durga.local','1234','Owner'),mk('u_brother','Brother','brother@durga.local','3333','Full Access Member')]; state.data={};write(state)} seed();
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'); if(u.pathname==='/api/health')return send(res,200,{ok:true,service:'Durga Dairy'}); if(u.pathname==='/api/login'&&req.method==='POST'){const b=await body(req),user=userByEmail(b.email); if(!user||!verify(String(b.password),user.password))return send(res,401,{error:'Invalid login'}); return send(res,200,{token:tokenFor(user.email),user:{id:user.id,name:user.name,email:user.email,role:user.role}})} if(u.pathname==='/api/forgot-password'&&req.method==='POST'){return send(res,200,{ok:true,message:'Reset workflow accepted. Configure email delivery in production.'})} if(u.pathname==='/api/sync'&&req.method==='POST'){const auth=(req.headers.authorization||'').replace(/^Bearer /,''); const owner=state.users.find(x=>tokenFor(x.email)===auth); if(!owner)return send(res,401,{error:'Unauthorized'}); const b=await body(req); state.data=b.db||{}; write(state); return send(res,200,{ok:true,db:state.data})} const file=u.pathname==='/'?'/index.html':u.pathname; const fp=path.join(ROOT,file); if(fp.startsWith(ROOT)&&fs.existsSync(fp)&&fs.statSync(fp).isFile()){const ext=path.extname(fp);res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':'no-store'});return fs.createReadStream(fp).pipe(res)} send(res,404,{error:'Not found'});}catch(e){send(res,500,{error:e.message})}}).listen(PORT,()=>console.log(`Durga Dairy server on http://localhost:${PORT}`));
