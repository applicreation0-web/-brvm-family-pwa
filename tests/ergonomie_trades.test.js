const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../finance');
const E=require('../engine');

function fixture(){
  const d=F.empty();d.asOf='2025-01-02';
  d.owners=[{id:'parent',label:'Famille test'}];
  d.portfolios=[{id:'parent-portfolio',ownerId:'parent',label:'Compte test',targets:{...E.targets}}];
  d.institutions=[{id:'fgi',label:'FGI'}];
  d.accounts=[{id:'account',portfolioId:'parent-portfolio',institutionId:'fgi',
    label:'Test',currency:'XOF',cash:10000,reserved:0,monthly:250000,brokerRate:.01,otherRate:.006}];
  d.positions=[{accountId:'account',symbol:'SNTS',qty:10,cost:2000}];
  d.quotes=Object.fromEntries(E.symbols.map((sym,i)=>[sym,
    {price:300+i*20,date:F.today(),basis:'official',source:'Recette fictive'}]));
  F.calculate(d);return d;
}
const account=d=>F.calculate(d).accounts[0];
const order=(d,side,qty,ref)=>F.createPlan(d,{portfolioId:'parent-portfolio',mode:'manuel',
  funding:{account:0},lines:[{side,accountId:'account',symbol:'SNTS',qty,price:300,estimateRate:.016,ref}]});

test('ERG01 : vendre sur avis, frais et plus-value réalisés, sans changement non confirmé',()=>{
  const before=fixture(),copy=structuredClone(before);
  const sold=F.record(before,{type:'SELL',accountId:'account',symbol:'SNTS',date:F.today(),
    brokerRef:'SELL-REAL-001',qty:2,price:300,broker:5,other:4,tax:1,actualTotal:590});
  assert.deepEqual(before,copy);
  assert.equal(account(sold).cash,10590);
  assert.equal(account(sold).positions.SNTS.qty,8);
  assert.equal(account(sold).positions.SNTS.cost,1600);
  assert.equal(account(sold).realized,190);
  assert.equal(account(sold).feesPaid,9);
  assert.equal(account(sold).taxes,1);
  assert.throws(()=>F.record(before,{type:'SELL',accountId:'account',symbol:'SNTS',date:F.today(),
    brokerRef:'SELL-TOO-MANY',qty:11,price:300,broker:0,other:0,tax:0,actualTotal:3300}),/Vente supérieure/);
});

test('ERG02 : courtage réel supérieur à 1 %, total d’avis strict, vente sans double comptage',()=>{
  const d=fixture();
  const base={type:'SELL',accountId:'account',symbol:'SNTS',date:F.today(),brokerRef:'SELL-002',
    qty:2,price:300,broker:7,other:0,tax:0,actualTotal:593};
  const above=F.record(d,base);
  assert.equal(account(above).cash,10593);
  assert.equal(account(above).feesPaid,7);
  assert.equal(account(above).positions.SNTS.qty,8);
  assert.equal(d.transactions.length,0);
  assert.throws(()=>F.record(d,{...base,actualTotal:594}),/Montant du justificatif/);
  assert.throws(()=>F.record(d,{...base,broker:5,actualTotal:600}),/Montant du justificatif/);
  const good=F.record(d,{...base,broker:5,actualTotal:595});
  assert.equal(account(good).cash,10595);
});

test('ERG03 : projet et transmission de vente ne touchent pas au cash, immobilisent les titres',()=>{
  const d=fixture(),created=order(d,'SELL',4,'S-01');
  assert.equal(account(created).positions.SNTS.qty,10);
  assert.equal(account(created).cash,10000);
  assert.equal(created.orders[0].side,'SELL');
  const transmitted=F.orderTransition(created,created.orders[0].id,'TRANSMIS','COURTIER-S01');
  assert.equal(account(transmitted).cash,10000);
  assert.equal(account(transmitted).positions.SNTS.qty,10);
  const duplicate=order(transmitted,'SELL',7,'S-02');
  assert.throws(()=>F.orderTransition(duplicate,duplicate.orders.at(-1).id,'TRANSMIS','COURTIER-S02'),/Ordres de vente supérieurs/);
  const executed=F.record(transmitted,{type:'SELL',accountId:'account',symbol:'SNTS',date:F.today(),
    brokerRef:'EXEC-S-01',qty:4,price:300,broker:10,other:5,tax:0,actualTotal:1185,
    orderId:transmitted.orders[0].id});
  assert.equal(executed.orders[0].status,'EXÉCUTÉ');
  assert.equal(account(executed).positions.SNTS.qty,6);
  assert.equal(account(executed).cash,11185);
});

test('ERG04 : achat ponctuel CORE utilise le cash réel et aucun versement mensuel',()=>{
  const d=fixture(),input={portfolioId:'parent-portfolio',accountIds:['account'],
    budget:5000,mode:'cibles',now:F.today()};
  const plan=F.propose(d,input);
  assert.equal(plan.planned,0);
  assert.equal(plan.funding.account,0);
  assert(plan.lines.every(line=>E.symbols.includes(line.symbol)&&line.qty>0));
  assert(plan.lines.reduce((n,x)=>n+x.total,0)<=5000.01);
  assert(plan.accounts[0].cashRemaining>=0);
  assert(Math.abs(plan.accounts[0].forecast-(account(d).total-plan.accounts[0].fees))<.001);
  assert(plan.deviation.after<=plan.deviation.before+1e-9);
  const blank=structuredClone(d);delete blank.quotes.SNTS;
  assert.throws(()=>F.propose(blank,input),/Cours manquant/);
});

test('ERG05 : dividende net enregistré une fois, titres inchangés',()=>{
  const d=fixture();
  const paid=F.record(d,{type:'DIVIDEND',accountId:'account',symbol:'SNTS',date:F.today(),
    brokerRef:'DIV-REAL-005',gross:1200,tax:120,other:20});
  assert.equal(account(paid).cash,11060);
  assert.equal(account(paid).positions.SNTS.qty,10);
  assert.equal(account(paid).dividends,1060);
  assert.equal(account(paid).grossDividends,1200);
});


test('ERG06 : versement ponctuel, retrait, frais de compte indépendants et aucun double débit',()=>{
  const d=fixture(); const original=structuredClone(d);
  const deposit=F.record(d,{type:'DEPOSIT',accountId:'account',date:F.today(),brokerRef:'DEP-ERG06',amount:20000});
  const withdraw=F.record(deposit,{type:'WITHDRAW',accountId:'account',date:F.today(),brokerRef:'RET-ERG06',amount:3000});
  const fee=F.record(withdraw,{type:'FEE',accountId:'account',date:F.today(),brokerRef:'FEE-ERG06',amount:450,
    feeCategory:'virement',note:'Frais effectivement débités et non déjà inclus dans le versement'});
  assert.deepEqual(d,original);
  assert.equal(account(fee).cash,10000+20000-3000-450);
  assert.equal(account(fee).feesPaid,450);
  assert.equal(account(fee).netContribution,17000);
  assert.equal(account(fee).positions.SNTS.qty,10);
  assert.equal(fee.transactions.length,3);
  assert.throws(()=>F.record(fee,{type:'WITHDRAW',accountId:'account',date:F.today(),
    brokerRef:'RET-TOO-MUCH',amount:1000000}),/Cash|espèces|insuffis/i);
});
test('ERG07 : courtage, autres frais et taxes réels sont conciliés exactement avec avis',()=>{
  const d=fixture();
  const buy=F.record(d,{type:'BUY',accountId:'account',date:F.today(),brokerRef:'BUY-ERG07',
    symbol:'SNTS',qty:2,price:300,broker:6,other:5,tax:3,actualTotal:614});
  assert.equal(account(buy).cash,10000-614);
  assert.equal(account(buy).positions.SNTS.cost,2000+614);
  assert.equal(account(buy).feesPaid,11);
  assert.equal(account(buy).taxes,3);
  assert.throws(()=>F.record(d,{type:'BUY',accountId:'account',date:F.today(),brokerRef:'BUY-NET-ERR',
    symbol:'SNTS',qty:2,price:300,broker:6,other:5,tax:3,actualTotal:613}),/justificatif/i);
  const sold=F.record(buy,{type:'SELL',accountId:'account',date:F.today(),brokerRef:'SELL-ERG07',
    symbol:'SNTS',qty:1,price:350,broker:3,other:2,tax:1,actualTotal:344});
  assert.equal(account(sold).cash,10000-614+344);
  assert.equal(account(sold).feesPaid,16);
  assert.equal(account(sold).taxes,4);
});
