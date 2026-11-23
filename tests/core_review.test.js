const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../finance'),E=require('../engine'),R=require('../review'),V=require('../vault');

function fixture() {
  const d=F.empty();
  d.asOf='2026-05-01';
  d.owners=[{id:'owner',label:'Personne fictive'}];
  d.portfolios=[{id:'main',ownerId:'owner',label:'CORE fictif',targets:{...E.targets}}];
  d.institutions=[{id:'sgi',label:'SGI fictive'}];
  d.accounts=[{id:'account',portfolioId:'main',institutionId:'sgi',label:'Compte fictif',currency:'XOF',
    cash:3000,reserved:0,monthly:0,brokerRate:.01,otherRate:.006}];
  d.positions=[{accountId:'account',symbol:'SNTS',qty:10,cost:950}];
  for(const [symbol,i] of E.symbols.map((s,i)=>[s,i]))
    d.quotes[symbol]={price:100+i*5,date:'2026-11-20',basis:'official',source:'Bulletin fictif de recette'};
  d.quoteHistory.SNTS=[{price:80,date:'2026-05-20',basis:'official',source:'Bulletin fictif antérieur'},
    {price:100,date:'2026-11-20',basis:'official',source:'Bulletin fictif de recette'}];
  F.calculate(d);return d;
}
test('CORE01 : revue semestrielle basée sur mois civils, calendrier et cibles 30/15/10/12/9/15/9',()=>{
  assert.equal(R.addMonths('2026-11-23',6),'2027-05-23');
  assert.equal(R.addMonths('2027-08-31',6),'2028-02-29');
  assert.equal(E.targets.SNTS,.30);
  const d=fixture(),before=JSON.stringify(d);
  const report=R.assess(d,'main','2026-11-23');
  assert.equal(report.due,false);
  assert.equal(report.dueOn,'2027-05-23');
  assert.equal(report.rows.length,7);
  assert(report.rows.some(x=>x.symbol==='SNTS' && x.quantity===10 && x.gap>.02));
  assert.equal(JSON.stringify(d),before,'la veille ne change aucune position');
  assert.equal(R.assess(d,'main','2027-05-23').due,true);
});
test('CORE02 : variation de cours sur six mois, sans dividende, distincte du PRU frais compris',()=>{
  const d=fixture(),r=R.assess(d,'main','2026-11-23');
  const s=r.rows.find(x=>x.symbol==='SNTS');
  assert.equal(s.change.from,'2026-05-20');
  assert(Math.abs(s.change.change-.25)<1e-12);
  assert.equal(s.change.dividendsIncluded,false);
  assert(Math.abs(s.sincePurchase-(1000/950-1))<1e-12);
  const noHistory=structuredClone(d);delete noHistory.quoteHistory.SNTS;
  assert.equal(R.assess(noHistory,'main','2026-11-23').rows.find(x=>x.symbol==='SNTS').change,null,
    'ne jamais fabriquer une performance semestrielle à partir du PRU');
});
test('CORE03 : cotations locales successives archivées, dédoublonnées et validées',()=>{
  const d=fixture();delete d.quoteHistory.SNTS;
  d.quotes.SNTS={price:99,date:'2026-11-19',basis:'manual',source:'Exemple fictif'};
  const original=structuredClone(d);
  const next=F.quoteUpdates(d,{SNTS:{price:100,date:'2026-11-20',basis:'official',source:'Bulletin fictif'}},'2026-11-23').next;
  assert.deepEqual(d,original);
  assert.deepEqual(next.quoteHistory.SNTS.map(q=>q.date),['2026-11-19','2026-11-20']);
  const repeated=F.quoteUpdates(next,{SNTS:next.quotes.SNTS},'2026-11-23');
  assert.equal(repeated.count,0);
  assert.deepEqual(repeated.next.quoteHistory.SNTS,next.quoteHistory.SNTS);
  const bad=structuredClone(next);
  bad.quoteHistory.SNTS[1].date='2026-11-19';
  assert.throws(()=>F.calculate(bad),/Historique de cotations incohérent/);
});
test('CORE04 : fractionnement documenté : comparer les cours ajustés, pas un effondrement fictif',()=>{
  const d=fixture();
  d.quoteHistory.SNTS[0].price=200;
  d.quotes.SNTS.price=30;d.quoteHistory.SNTS[1].price=30;
  const after=F.record(d,{type:'SPLIT',accountId:'account',symbol:'SNTS',
    date:'2026-09-01',brokerRef:'SPLIT-CORE04',ratioFrom:1,ratioTo:10,source:'Avis fictif'});
  const p=R.sixMonthReturn(after,'SNTS','2026-11-23');
  assert(Math.abs(p.change-.5)<1e-12);
  assert.equal(p.splitAdjusted,true);
  const row=R.assess(after,'main','2026-11-23').rows.find(x=>x.symbol==='SNTS');
  assert.equal(row.quantity,100);
});
test('CORE05 : l’examen explicite n’exécute aucune opération, statut privé non exporté par compte',()=>{
  const d=fixture();
  const reviewed=R.acknowledge(d,'main','2026-11-23');
  assert.equal(reviewed.settings.coreReviews.main.reviewedOn,'2026-11-23');
  assert.deepEqual(reviewed.transactions,d.transactions);
  assert.deepEqual(reviewed.positions,d.positions);
  assert.deepEqual(reviewed.portfolios,d.portfolios);
  assert.equal(R.assess(reviewed,'main','2027-05-23').due,true);
  const child=V.accountSnapshot(reviewed,'account');
  assert.equal(child.settings.coreReviews,undefined);
  assert.equal(child.quoteHistory.SNTS[0].date,'2026-05-20');
  assert.equal(F.calculate(child).accounts[0].positions.SNTS.qty,10);
  assert.throws(()=>R.acknowledge(reviewed,'main','2026-11-22'),/Date d’examen invalide|reculer/);
});
test('CORE06 : sources insuffisantes ou cours anciens = pas de performance semestrielle prétendue',()=>{
  const d=fixture();
  const stale=R.assess(d,'main','2027-05-23');
  assert.equal(stale.due,true);
  assert.equal(stale.rows.find(x=>x.symbol==='SNTS').change,null);
  assert(stale.rows.find(x=>x.symbol==='SNTS').warnings.some(w=>w.includes('ancien')));
});

test('CORE07 : une revue tardive ne décale pas le calendrier fixe de mai/novembre',()=>{
  assert.equal(R.nextCoreReview(null),'2027-05-23');
  assert.equal(R.nextCoreReview('2027-07-01'),'2027-11-23');
  assert.equal(R.nextCoreReview('2027-11-24'),'2028-05-23');
});
