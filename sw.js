const CACHE='durga-dairy-v20';
self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll([
    './','./index.html','./app.js?v=20261005-2300','./config.js?v=20261005-2300','./manifest.json','./akash-v2.js?v=20261005-2300','./akash-v2-fix.js?v=20261005-2300','./all-v2.js?v=20261005-2300','./bootstrap.js?v=20261005-2300'
  ])));
});
self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);

  // Never turn a failed API/cross-origin request into cached index.html.
  // That was the direct cause of the misleading "200 instead of JSON" error.
  if(u.origin!==self.location.origin || u.pathname.startsWith('/api/')){
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(r=>{
        const copy=r.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy));
        return r;
      })
      .catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))
  );
});
