const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../review');
const F=require('../finance');
const E=require('../engine');

const NOW='2026-11-23';
function evidence(){
  const sourceKeys=['screening','financial','valuation','dividends','liquidity','prices','governance'];
  const sources=Object.fromEntries(sourceKeys.map(k=>[k,{url:'https://www.brvm.org/fr/'+k,date:'2026-11-20'}]));
  return {
    sources,prohibitedActivity:false,conventionalFinance:false,
    interestDebtAssets:.12,interestAssets:.05,nonPermissibleRevenue:.01,
    netProfits3Y:[300,350,410],revenues3Y:[1400,1500,1700],netDebtEbitda:1.3,
    per:11,sectorMedianPer:14,evEbitda:5,sectorMedianEvEbitda:7,
    dividendsPaidYears3Y:3,netYieldPct:4.5,payoutRatio:.45,
    tradedSessionShare60:.85,medianDailyTurnoverXof:8000000,
    sixMonthPriceReturn:.11,benchmarkSixMonthReturn:.08,
    annualReportDate:'2026-06-01',audited:true,governanceClear:true,suspended:false
  };
}
test('SEL01 : 100 points, 6 critères explicites, candidat vérifiable',()=>{
  const r=R.evaluateSelection({selection:evidence()},NOW);
  assert.equal(r.status,'CANDIDAT / CONSERVER');
  assert.equal(r.score,100);
  assert.deepEqual(r.parts,{solidity:30,valuation:20,dividends:15,liquidity:15,trend:10,transparency:10});
  assert.equal(Object.values(R.SELECTION_WEIGHTS).reduce((a,b)=>a+b,0),100);
});
test('SEL02 : exclusions sectorielles et ratios charia ont priorité sur le score',()=>{
  for(const field of ['prohibitedActivity','conventionalFinance']){
    const e=evidence();e[field]=true;
    const r=R.evaluateSelection({selection:e},NOW);
    assert.equal(r.score,null);assert.match(r.status,/EXCLU/);
  }
  for(const [field,value] of [['interestDebtAssets',.35],['interestAssets',.34],['nonPermissibleRevenue',.05]]){
    const e=evidence();e[field]=value;
    const r=R.evaluateSelection({selection:e},NOW);
    assert.equal(r.score,null);assert(r.blocked.length>0);
  }
});
test('SEL03 : refus des sources, comptes ou valeurs manquants et documents périmés',()=>{
  const absent=R.evaluateSelection({},NOW);
  assert.equal(absent.score,null);
  const cases=[
    e=>delete e.sources.prices,
    e=>e.sources.dividends.url='',
    e=>e.sources.financial.date='2026-11-24',
    e=>e.sources.prices.date='2026-07-15',
    e=>e.audited=false,
    e=>delete e.interestAssets,
    e=>delete e.revenues3Y,
    e=>e.annualReportDate='2024-01-01',
    e=>e.tradedSessionShare60=null,
    e=>e.governanceClear=null
  ];
  for(const mutate of cases) {
    const e=evidence(); mutate(e);
    const r=R.evaluateSelection({selection:e},NOW);
    assert.equal(r.score,null,JSON.stringify(e));
    assert.match(r.status,/INSUFFISANTES/);
  }
});
test('SEL04 : score faible, surveillance et classement sans renverser les exclusions',()=>{
  const low=evidence();low.netProfits3Y=[-1,-2,1];low.revenues3Y=[3,2,1];
  low.netDebtEbitda=5;low.per=33;low.evEbitda=40;
  low.dividendsPaidYears3Y=0;low.netYieldPct=0;low.payoutRatio=.99;
  low.tradedSessionShare60=.2;low.medianDailyTurnoverXof=50000;
  low.sixMonthPriceReturn=-.4;low.governanceClear=true;
  assert.equal(R.evaluateSelection({selection:low},NOW).status,'RÉEXAMINER');
  const watch=evidence();
  assert.equal(R.evaluateSelection({selection:watch},NOW).status,'CANDIDAT / CONSERVER');
  // Les seuils sont fondés sur le total, pas sur un unique indicateur.
  watch.per=40;watch.evEbitda=50;watch.dividendsPaidYears3Y=0;
  assert.equal(R.evaluateSelection({selection:watch},NOW).status,'SURVEILLER');
});
test('SEL06 : score supérieur à 75 insuffisant sans bénéfices réguliers et liquidité',()=>{
  const noProfit=evidence();noProfit.netProfits3Y=[-10,-5,100];
  const s=R.evaluateSelection({selection:noProfit},NOW);
  assert(s.score>=75);
  assert.equal(s.candidateReady,false);
  assert.equal(s.status,'SURVEILLER');
  const noLiquidity=evidence();noLiquidity.tradedSessionShare60=.4;
  const s2=R.evaluateSelection({selection:noLiquidity},NOW);
  assert(s2.score>=75);
  assert.equal(s2.candidateReady,false);
  const d=F.empty();
  d.instruments.TEST={kind:'ACTION',label:'Hypothétique',selection:noLiquidity};
  assert.equal(R.selectUniverse(d,NOW).alternatives.length,0);
});
test('SEL05 : recherche sur toute la cote connue, recommandation non transactionnelle',()=>{
  const d=F.empty();
  d.instruments.SNTS={kind:'ACTION',label:'Sonatel fictif',selection:evidence()};
  const weaker=evidence();weaker.netProfits3Y=[-1,-2,3];weaker.revenues3Y=[9,8,7];
  weaker.per=50;weaker.evEbitda=50;weaker.dividendsPaidYears3Y=0;
  d.instruments.SNTS.selection=weaker;
  d.instruments.TEST={kind:'ACTION',label:'Candidate fictive',selection:evidence()};
  const before=JSON.stringify(d),scan=R.selectUniverse(d,NOW);
  assert.deepEqual(scan.alternatives.map(x=>x.symbol),['TEST']);
  assert(scan.replacements.some(x=>x.from==='SNTS'&&x.to==='TEST'&&x.requiresUserDecision));
  assert.equal(scan.core.length,E.symbols.length);
  assert.equal(scan.core.filter(x=>x.score===null).length,6);
  assert.equal(JSON.stringify(d),before);
  assert.equal(d.transactions.length,0);
});
