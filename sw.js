const CACHE='concert-lightstick-sync-v1';
const SHELL=['./','./index.html','./css/app.css','./js/app.js','./js/config.js','./js/db.js','./js/bluetooth.js','./js/fingerprint.js','./js/matcher.js','./js/recognizer.js','./js/sequences.js','./manifest.webmanifest','./examples/example-sequence.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match('./index.html'))));});
