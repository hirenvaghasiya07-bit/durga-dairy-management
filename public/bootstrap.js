(function(){
  function fail(title,msg){
    const r=document.getElementById('root');
    if(!r)return;
    r.innerHTML='<div class="login"><div class="loginbox"><h1></h1><div class="notice"></div><button class="btn" id="startupReload">Reload</button></div></div>';
    const h=r.querySelector('h1');
    const n=r.querySelector('.notice');
    if(h)h.textContent=String(title||'Startup Error');
    if(n)n.textContent=String(msg||'Unknown startup error');
    const b=r.querySelector('#startupReload');
    if(b)b.onclick=()=>location.reload();
  }
  window.addEventListener('error',e=>{
    if(!document.querySelector('.app'))fail('Durga Dairy — Startup Error',e?.error?.message||e?.message||'JavaScript error');
  });
  window.addEventListener('unhandledrejection',e=>{
    if(!document.querySelector('.app'))fail('Durga Dairy — Startup Error',e?.reason?.message||String(e?.reason||'Promise error'));
  });
  window.addEventListener('DOMContentLoaded',()=>{
    Promise.resolve().then(()=>{
      if(typeof init!=='function')throw new Error('Application core did not load.');
      return init();
    }).catch(e=>fail('Durga Dairy — Startup Error',e?.message||String(e)));
  });
})();