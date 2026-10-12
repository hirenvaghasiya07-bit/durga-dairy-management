const CACHE='durga-dairy-v9';
const BUILD_VERSION='2026-10-12-sync-safety';
self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['./','./index.html','./app.js','./config.js','./manifest.json'])));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('durga-dairy-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  // API and cross-origin requests are never cached and never fall back to index.html.
  if(url.pathname.startsWith('/api/')||url.origin!==self.location.origin){
    event.respondWith(fetch(request));
    return;
  }
  event.respondWith(fetch(request).then(response=>{
    if(response.ok&&response.type==='basic'){
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));
    }
    return response;
  }).catch(async()=>{
    const cached=await caches.match(request);
    if(cached)return cached;
    if(request.mode==='navigate')return (await caches.match('./index.html'))||Response.error();
    return Response.error();
  }));
});
