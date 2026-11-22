const {test}=require('node:test');
const assert=require('node:assert/strict');
const Q=require('../quotes');
const F=require('../finance');
const E=require('../engine');

function mockConfig(policy,status=200) {
  return async (url,options)=>{
    assert.equal(url,'./market/feed.json');
    assert.equal(options.credentials,'same-origin');
    assert.equal(options.method,'GET');
    return new Response(JSON.stringify(policy),{status});
  };
}

test('MARKET01 : absence de licence ou flux désactivé = aucun rafraîchissement automatique',async()=>{
  assert.equal(await Q.feedEnabled(mockConfig({enabled:false})),false);
  assert.equal(await Q.feedEnabled(mockConfig({enabled:true,source:'Fictif'})),false);
  assert.equal(await Q.feedEnabled(mockConfig({enabled:true,authorization:'fictive'})),false);
  assert.equal(await Q.feedEnabled(mockConfig({},404)),false);
  assert.equal(await Q.feedEnabled(async()=>{throw Error('hors ligne');}),false);
});

test('MARKET02 : une source autorisée est explicitement déclarée avant toute tentative automatique',async()=>{
  const p={enabled:true,source:'Flux fictif avec autorisation',authorization:'test-local-no-distribution'};
  assert.equal(await Q.feedEnabled(mockConfig(p)),true);
  assert.deepEqual(E.targets,{SNTS:.30,ORAC:.15,CIEC:.10,TOCI:.12,SMBC:.09,NTLC:.15,PALC:.09});
  assert.equal(Object.values(E.targets).reduce((a,b)=>a+b,0).toFixed(8),'1.00000000');
});

test('MARKET03 : les importations de cotations ne modifient ni cash, ni titres ni cibles',()=>{
  const d=F.empty();
  d.owners=[{id:'person',label:'Identité fictive'}];
  d.portfolios=[{id:'portfolio',ownerId:'person',label:'Test',targets:{...E.targets}}];
  d.institutions=[{id:'fgi',label:'FGI'}];
  d.accounts=[{id:'a',portfolioId:'portfolio',institutionId:'fgi',currency:'XOF',label:'Fictif',
    cash:999,reserved:0,monthly:0,brokerRate:.01,otherRate:0}];
  d.positions=[{accountId:'a',symbol:'SNTS',qty:3,cost:100}];
  const original=structuredClone(d);
  const q={SNTS:{price:2500,date:F.today(),source:'Source de test',basis:'manual',kind:'ACTION',status:'active'}};
  const result=F.quoteUpdates(d,q);
  assert.equal(result.count,1);
  assert.deepEqual(result.next.accounts,original.accounts);
  assert.deepEqual(result.next.positions,original.positions);
  assert.deepEqual(result.next.portfolios,original.portfolios);
  assert.equal(F.calculate(result.next).accounts[0].positions.SNTS.market,7500);
  assert.deepEqual(d,original);
});
