const CACHE='concert-lightstick-sync-v2';
const SHELL=['./','./index.html','./css/app.css','./js/app.js','./js/config.js','./js/db.js','./js/bluetooth.js','./js/fingerprint.js','./js/matcher.js','./js/recognizer.js','./js/sequences.js','./js/repository-assets.js','./manifest.webmanifest','./assets-manifest.json'];

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(SHELL);
  try{
    const response=await fetch('./assets-manifest.json',{cache:'no-cache'});
    if(response.ok){
      const manifest=await response.json();
      const paths=[];
      for(const item of manifest.audio||[]) paths.push(resolveAsset(item,'audio'));
      for(const item of manifest.sequences||[]) paths.push(resolveAsset(item,'sequences'));
      if(paths.length) await cache.addAll([...new Set(paths)]);
    }
  }catch(error){
    console.warn('Optional repository assets were not fully cached.',error);
  }
  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match('./index.html'))));});

function resolveAsset(item,folder){
  const path=typeof item==='string'?item:item?.path;
  if(!path)return null;
  const clean=String(path).replace(/^\.\//,'');
  return clean.includes('/')?`./${clean}`:`./${folder}/${clean}`;
}