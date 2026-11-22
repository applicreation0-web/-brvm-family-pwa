const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');

test('ARC01 PRIV-08 · service worker hors réseau simulé et mise à jour limitée au dossier',async()=>{
  const scope='https://example.test/brvm/', sibling='https://example.test/autre/';
  const cached=new Map(), handlers=new Map(), deleted=[];
  let network=0;
  vm.runInNewContext(readFileSync(require.resolve('../sw.js'),'utf8'),{
    URL,Request,
    self:{registration:{scope},location:{origin:new URL(scope).origin},addEventListener:(name,handler)=>handlers.set(name,handler)},
    caches:{
      open:async()=>({addAll:async requests=>requests.forEach(request=>cached.set(request.url,request.url)),
        match:async request=>cached.get(request.url||request)}),
      keys:async()=>['brvm-family-shell:'+scope+'|ancien','brvm-family-shell:'+sibling+'|ancien'],
      delete:async key=>deleted.push(key),
    },
    fetch:()=>{network++;throw Error('Réseau coupé dans le banc de test.');}
  });
  const lifecycle=name=>new Promise(resolve=>handlers.get(name)({waitUntil:resolve}));
  await lifecycle('install');
  await lifecycle('activate');
  assert.deepEqual(deleted,['brvm-family-shell:'+scope+'|ancien']);
  const response=(url,mode='navigate',method='GET')=>{
    let result;
    handlers.get('fetch')({request:{url,mode,method},respondWith:value=>{result=value;}});
    return result;
  };
  assert.equal(await response(scope),scope+'index.html');
  assert.equal(await response(scope+'app.js','same-origin'),scope+'app.js');
  assert.equal(response(scope+'market/feed.json','same-origin'),undefined);
  assert.equal(response(scope+'market/latest.csv','same-origin'),undefined);
  assert.equal(response(scope+'?ref=local'),undefined);
  assert.equal(response(sibling),undefined);
  assert.equal(response(scope,'navigate','POST'),undefined);
  assert.equal(network,0);
});
