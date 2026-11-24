const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../finance');

function fixture(){
  const d=F.empty();
  d.owners=[{id:'owner',label:'Dossier fictif'}];
  d.portfolios=[{id:'portfolio',ownerId:'owner',label:'CORE fictif',targets:{SNTS:.60,ORAC:.40}}];
  d.institutions=[{id:'fgi',label:'FGI fictive'},{id:'cgf',label:'CGF fictive'}];
  d.accounts=[
    {id:'a-fgi',portfolioId:'portfolio',institutionId:'fgi',label:'Compte FGI fictif',
     currency:'XOF',cash:120000,reserved:0,monthly:0,brokerRate:.01,otherRate:.005},
    {id:'a-cgf',portfolioId:'portfolio',institutionId:'cgf',label:'Compte CGF fictif',
     currency:'XOF',cash:85000,reserved:0,monthly:0,brokerRate:.008,otherRate:.005}
  ];
  d.quotes={
    SNTS:{price:5000,date:'2026-11-24',basis:'official',source:'Source fictive'},
    ORAC:{price:3500,date:'2026-11-24',basis:'official',source:'Source fictive'}
  };
  F.calculate(d);
  return d;
}
function choose(d,accountId='a-fgi',budget=90000){
  return F.purchaseScenarios(d,{portfolioId:'portfolio',accountId,budget,now:'2026-11-24'});
}
test('Trois scénarios: limite totale y compris frais, reliquat en espèces, quantité entière, aucune mutation',()=>{
  const d=fixture(),before=JSON.stringify(d),result=choose(d);
  assert.equal(result.scenarios.length,3);
  assert.deepEqual(result.scenarios.map(s=>s.cap),[45000,67500,90000]);
  assert.equal(result.available,120000);
  for(const sc of result.scenarios){
    assert(sc.spent<=sc.cap);
    assert(sc.cashAfter>=result.available-sc.cap-0.0001);
    assert(sc.availableRemainder>=0);
    assert(sc.lines.every(x=>Number.isInteger(x.qty)&&x.qty>0&&x.accountId==='a-fgi'));
    assert(Math.abs(sc.fees-sc.lines.reduce((n,l)=>n+l.broker+l.other,0))<0.01);
  }
  assert.equal(JSON.stringify(d),before);
  assert.equal(d.transactions.length,0);
  assert.equal(d.orders.length,0);
});
test('Séparation stricte des SGI et rejet budget dépassant la trésorerie',()=>{
  const d=fixture();
  const cgf=choose(d,'a-cgf',80000);
  assert(cgf.scenarios.every(s=>s.lines.every(l=>l.accountId==='a-cgf')));
  assert.throws(()=>choose(d,'a-cgf',90000),/budget|espèces/);
  assert.throws(()=>choose(d,'a-fgi',0),/budget/);
  assert.throws(()=>F.purchaseScenarios(d,{portfolioId:'invalide',accountId:'a-fgi',budget:1000}),/compte/);
});
test('Achat réel partiel : recalcul sur cash et positions recalculés, sans crédit fantôme',()=>{
  const d=fixture(),initial=choose(d),first=initial.scenarios[2].lines[0];
  assert(first.qty>0);
  const spent=5000+50+25;
  const next=F.record(d,{type:'BUY',date:'2026-11-24',accountId:'a-fgi',
    brokerRef:'AVIS-FICTIF-001',symbol:'SNTS',qty:1,price:5000,
    broker:50,other:25,tax:0,actualTotal:spent});
  const cash=F.calculate(next).accounts.find(a=>a.id==='a-fgi').available;
  assert.equal(cash,120000-spent);
  const after=choose(next,'a-fgi',90000);
  assert.equal(after.available,cash);
  assert(after.scenarios[2].cashAfter>=cash-90000-0.001);
  assert.equal(F.calculate(d).accounts.find(a=>a.id==='a-fgi').available,120000);
  const preview=after.scenarios[1];
  if(preview.lines.length){
    const project=F.createPlan(next,preview.plan);
    assert.equal(F.calculate(project).accounts.find(a=>a.id==='a-fgi').cash,cash);
    assert(project.orders.every(o=>o.status==='PROJET'&&o.accountId==='a-fgi'));
  }
});
test('Cours du 20 novembre inutilisables le 24 : pas de recommandation sur prix ancien',()=>{
  const d=fixture();
  d.quotes.SNTS.date='2026-11-20';
  d.quotes.ORAC.date='2026-11-20';
  const r=choose(d);
  assert.deepEqual(r.outOfDate.sort(),['ORAC','SNTS']);
  assert(r.scenarios.every(s=>s.lines.length===0&&s.spent===0&&s.cashAfter===120000));
});
test('Cours manquants et dépense entière impossible : ne jamais inventer de montant',()=>{
  const d=fixture();
  delete d.quotes.SNTS;delete d.quotes.ORAC;
  const r=choose(d,'a-fgi',1000);
  assert(r.scenarios.every(s=>s.lines.length===0 && s.spent===0));
  assert.deepEqual(r.outOfDate.sort(),['ORAC','SNTS']);
});
