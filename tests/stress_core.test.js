'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../finance');
const E=require('../engine');

function fixture(){
  const d=F.empty();
  d.owners.push({id:'owner-alpha',label:'Compte A fictif',kind:'adult'},
    {id:'owner-beta',label:'Compte B fictif',kind:'adult'});
  d.portfolios.push({id:'portfolio-a',ownerId:'owner-alpha',label:'CORE A',targets:{...E.targets}},
    {id:'portfolio-b',ownerId:'owner-beta',label:'CORE B',targets:{...E.targets}});
  d.institutions.push({id:'sgi-1',label:'SGI test 1'}, {id:'sgi-2',label:'SGI test 2'});
  d.accounts.push({id:'account-a1',portfolioId:'portfolio-a',institutionId:'sgi-1',
    label:'Fictif A1',currency:'XOF',cash:150000,reserved:0,monthly:0,brokerRate:.01,otherRate:0},
    {id:'account-a2',portfolioId:'portfolio-a',institutionId:'sgi-2',
      label:'Fictif A2',currency:'XOF',cash:80000,reserved:0,monthly:0,brokerRate:.005,otherRate:0},
    {id:'account-b1',portfolioId:'portfolio-b',institutionId:'sgi-2',
      label:'Fictif B1',currency:'XOF',cash:75000,reserved:0,monthly:0,brokerRate:.01,otherRate:0});
  d.positions.push({accountId:'account-a1',symbol:'SNTS',qty:4,cost:40000},
    {accountId:'account-a2',symbol:'ORAC',qty:5,cost:25000},
    {accountId:'account-b1',symbol:'NTLC',qty:2,cost:17000});
  return d;
}
const lockedSnapshot=d=>JSON.stringify({
  accounts:d.accounts,owners:d.owners,positions:d.positions,transactions:d.transactions,
  orders:d.orders,events:d.events,observations:d.observations,attachments:d.attachments,
  history:d.history,quotes:d.quotes,quoteHistory:d.quoteHistory,
  otherPortfolio:d.portfolios.find(p=>p.id==='portfolio-b')
});
function sequence(seed){
  let x=seed>>>0;
  return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x;};
}
function allocations(n,rand) {
  const weights=Array(n).fill(1);
  let rest=10000-n;
  for(let j=0;j<n-1;j++){
    const extra=rand()%(rest+1);
    weights[j]+=extra;rest-=extra;
  }
  weights[n-1]+=rest;
  return weights;
}
test('STRESS01 : 1 200 cycles sur 1 à 12 actions, aucune création d’ordre ni mutation de compte',()=>{
  const initial=fixture(), expected=lockedSnapshot(initial);
  const second=JSON.stringify(initial.portfolios[1]);
  let current=initial;
  const rand=sequence(0x53a17842);
  for(let n=0;n<1200;n++){
    const size=1+(n%12), weights=allocations(size,rand);
    const rows=weights.map((bp,i)=>({symbol:'T'+String(i+1).padStart(2,'0'),
      weightPct:(bp/100).toFixed(2)}));
    if(rows.length<13) rows.push({symbol:'',weightPct:''});
    const before=JSON.stringify(current);
    const newer=F.updateCoreTargets(current,'portfolio-a',rows);
    assert.equal(JSON.stringify(current),before,'Original changed cycle '+n);
    assert.equal(lockedSnapshot(newer),expected,'Private ledger changed cycle '+n);
    assert.equal(JSON.stringify(newer.portfolios[1]),second,'Other owner changed cycle '+n);
    const expectedKeys=rows.filter(r=>r.symbol).map(r=>r.symbol);
    assert.deepEqual(Object.keys(newer.portfolios[0].targets),expectedKeys);
    assert.equal(Math.round(Object.values(newer.portfolios[0].targets)
      .reduce((a,b)=>a+b,0)*10000),10000);
    assert.doesNotThrow(()=>F.calculate(JSON.parse(JSON.stringify(newer))));
    current=newer;
  }
  assert.equal(initial.portfolios[0].targets.SNTS,.30,'Fixture rewritten by stress runner');
});
test('STRESS02 : arrondis au centième de point, 100 % exact et canonicalisation TTLC/TOCI',()=>{
  const d=fixture();
  const rows=Array.from({length:7},(_,i)=>({symbol:['SNTS','ORAC','CIEC','TTLC','SMBC','NTLC','PALC'][i],
    weightPct:i===6?'14.26':'14.29'}));
  const out=F.updateCoreTargets(d,'portfolio-a',rows);
  assert.equal(out.portfolios[0].targets.TOCI,.1429);
  assert.equal(Object.hasOwn(out.portfolios[0].targets,'TTLC'),false);
  assert.equal(Object.values(out.portfolios[0].targets).reduce((a,b)=>a+Math.round(b*10000),0),10000);
  assert.equal(d.portfolios[0].targets.TOCI,.12);
});
test('STRESS03 : saisies hostile / totaux faux / banques / double alias refusés sans changement',()=>{
  const d=fixture();
  const orig=JSON.stringify(d);
  const cases=[
    [['SNTS','99.99']], [['SNTS','100.01']], [['SNTS','-1']],
    [['SNTS','1e2']], [['SNTS','NaN']], [['SNTS','Infinity']],
    [['SNTS','100.001']], [['SNTS','0']], [['SNTS','']],
    [['','100']], [['SGBC','100']], [['CBIBF','100']], [['ECOC','100']],
    [['SIBC','100']], [['STBC','100']], [['FCPTEST','100']],
    [['BANQUE_TEST','100']], [['X<script>','100']],
    [['TTLC','50'],['TOCI','50']],
    [['SNTS','50'],['SNTS','50']],
    Array.from({length:13},(_,i)=>['T'+String(i+1).padStart(2,'0'),(100/13).toString()]),
  ];
  d.instruments.FCPTEST={kind:'FCP',label:'FCP fictif'};
  d.instruments.BANQUE_TEST={kind:'ACTION',label:'Banque test'};
  const unchanged=JSON.stringify(d);
  for(const rows of cases){
    assert.throws(()=>F.updateCoreTargets(d,'portfolio-a',
      rows.map(([symbol,weightPct])=>({symbol,weightPct}))),undefined,JSON.stringify(rows));
    assert.equal(JSON.stringify(d),unchanged,'Rejected input mutated the vault');
  }
  assert.throws(()=>F.updateCoreTargets(d,'missing',[{symbol:'SNTS',weightPct:'100'}]),/introuvable/);
  assert.equal(JSON.stringify(d),unchanged);
  assert.notEqual(orig,unchanged,'Test instruments were not inserted');
});
test('STRESS04 : portefeuille incomplet ou instruments interdits n’entrent pas dans le CORE',()=>{
  const d=fixture();
  d.instruments.TEST={kind:'ACTION',label:'Titre fictif',screen:'Exclu'};
  assert.throws(()=>F.updateCoreTargets(d,'portfolio-a',[{symbol:'TEST',weightPct:'100'}]),/exclue/);
  d.instruments.TEST.screen='À vérifier';
  const valid=F.updateCoreTargets(d,'portfolio-a',[{symbol:'TEST',weightPct:'100'}]);
  assert.equal(valid.portfolios[0].targets.TEST,1);
  assert.equal(F.calculate(valid).accounts.length,3);
  assert.equal(valid.positions.length,3);
});
test('STRESS05 : import ancien reste lisible même avec une exclusion arrivée ensuite',()=>{
  const d=fixture();
  d.portfolios[0].targets={ECOC:1};
  assert.doesNotThrow(()=>F.calculate(d));
  const before=JSON.stringify(d);
  assert.throws(()=>F.updateCoreTargets(d,'portfolio-a',[{symbol:'ECOC',weightPct:'100'}]),/exclue/);
  assert.equal(JSON.stringify(d),before);
});
test('STRESS06 : limite des entrées et objets malformés, pas de crash ni modification',()=>{
  const d=fixture(), baseline=JSON.stringify(d);
  const good=[{symbol:'SNTS',weightPct:'100'}];
  const bad=[null,undefined,{},[],Object.create(null),true,'test'];
  for(const input of bad) assert.throws(()=>F.updateCoreTargets(d,'portfolio-a',input));
  for(const input of [null,42,{},false]) assert.throws(()=>F.updateCoreTargets(d,'portfolio-a',[input]));
  assert.throws(()=>F.updateCoreTargets(d,'portfolio-a',Array(14).fill(good[0])));
  assert.equal(JSON.stringify(d),baseline);
});
