const {test}=require('node:test');
const assert=require('node:assert/strict');
const Q=require('../quotes');
const TODAY=new Date().toISOString().slice(0,10);
const DOC='https://www.brvm.org/sites/default/files/sonatel-communique.pdf';
const PAGE='https://www.brvm.org/fr/emetteurs/type-annonces/communiques';

function payload() {
  return {schema:'brvm-public-watch-v1',checkedOn:TODAY,sources:[PAGE],
    items:[{type:'communique',issuer:'SONATEL',title:'Communiqué officiel de SONATEL',
      url:DOC,publishedOn:TODAY,eventOn:TODAY,sourcePage:PAGE}]};
}
function fetcher(value) {
  return async (url,options)=>{
    assert.equal(url,'./market/public-watch.json');
    assert.equal(options.credentials,'same-origin');
    assert.equal(options.method,'GET');
    const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify(value)));c.close();}});
    return {ok:true,body};
  };
}
test('WATCH01 : publication officielle acceptée sans envoyer de données privées',async()=>{
  const r=await Q.publicWatch(fetcher(payload()));
  assert.equal(r.items.length,1);
  assert.equal(r.items[0].url,DOC);
});
test('WATCH02 : refus d’un hôte imitant BRVM',async()=>{
  const d=payload();d.items[0].url='https://www.brvm.org.evil.example/doc.pdf';
  await assert.rejects(Q.publicWatch(fetcher(d)),/non vérifié/);
});
test('WATCH03 : refus des documents futurs et des champs inconnus',async()=>{
  const d=payload();d.items[0].publishedOn='2099-01-01';
  await assert.rejects(Q.publicWatch(fetcher(d)),/non vérifié/);
});
