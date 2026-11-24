const PREFIX='brvm-family-shell:'+self.registration.scope+'|';
const CACHE=PREFIX+'v3.6.3-import-five-zip-20261124';
const SHELL=['index.html','style.css','engine.js','finance.js','vault.js','quotes.js','analysis.js','review.js','app.js',
  'manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
const urls=new Set(SHELL.map(p=>new URL(p,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll([...urls].map(u=>new Request(u,{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>
  Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const address=new URL(request.url);
  if(address.search || address.origin!==self.location.origin) return;
  if(request.mode==='navigate' && (address.href===self.registration.scope || address.href===new URL('index.html',self.registration.scope).href)) {
    // L’ancienne session et son shell restent cohérents tant que le worker de mise à jour attend.
    event.respondWith(caches.open(CACHE).then(c=>c.match(new URL('index.html',self.registration.scope).href)).then(r=>r||fetch(request)));
  } else if(urls.has(address.href)) {
    event.respondWith(caches.open(CACHE).then(c=>c.match(request)).then(r=>r||fetch(request)));
  }
});
