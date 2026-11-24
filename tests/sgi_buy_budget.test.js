'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../finance');
const E=require('../engine');

function specimen(fgiCash=45000,cgfCash=250000,fgiReserved=12000,cgfReserved=20000) {
  const d=F.empty(),day=F.today();
  d.owners.push({id:'parent',label:'Propriétaire fictif'});
  d.portfolios.push({id:'core',ownerId:'parent',label:'CORE fictif',targets:{...E.targets}});
  d.institutions.push({id:'fgi',label:'FGI FICTIVE'},{id:'cgf',label:'CGF FICTIVE'});
  for(const [id,sgi,cash,reserved] of [
    ['fgi-account','fgi',fgiCash,fgiReserved],['cgf-account','cgf',cgfCash,cgfReserved]]) {
    d.accounts.push({id,portfolioId:'core',institutionId:sgi,
      label:'Compte '+sgi,currency:'XOF',cash,reserved,monthly:0,brokerRate:.01,otherRate:.005});
  }
  let i=0;
  for(const sym of Object.keys(E.targets)) d.quotes[sym]={
    date:day,price:4000+i++*250,source:'Cours synthétique de recette',basis:'manual',status:'active'
  };
  F.calculate(d);return d;
}
function assertSafe(plan,cashBy) {
  const used=Object.create(null);
  let total=0;
  for(const l of plan.lines) {
    assert(Number.isSafeInteger(l.qty)&&l.qty>0);
    assert(l.broker>=0 && l.other>=0 && l.total>0);
    used[l.accountId]=(used[l.accountId]||0)+l.total;
    total+=l.total;
  }
  assert(total<=plan.budget+.001,'Le coût dépasse le budget total');
  for(const [id,available] of Object.entries(cashBy)) {
    assert((used[id]||0)<=available+.001,id+' dépasse ses espèces disponibles');
    assert((used[id]||0)<=(plan.accountBudgets?.[id]??available)+.001,
      id+' dépasse son plafond affecté');
  }
}
test('SGI01 : FGI ne peut pas dépenser les espèces de CGF, même avec un budget global',()=>{
  const d=specimen(),immutable=JSON.stringify(d);
  const p=F.propose(d,{portfolioId:'core',accountIds:['fgi-account','cgf-account'],
    mode:'cibles',budget:200000,exceptional:true});
  assert.equal(p.accountBudgets['fgi-account'],33000);
  assert.equal(p.accountBudgets['cgf-account'],167000);
  assertSafe(p,{'fgi-account':33000,'cgf-account':230000});
  assert(p.debitBy['fgi-account']<=33000);
  assert(p.debitBy['cgf-account']<=167000);
  assert.equal(JSON.stringify(d),immutable,'La simulation ne doit rien écrire');
  assert.equal(d.transactions.length,0);assert.equal(d.orders.length,0);
});
test('SGI02 : plafond total supérieur au cash sélectionné rejeté au lieu de simuler un versement',()=>{
  const d=specimen();
  assert.throws(()=>F.propose(d,{portfolioId:'core',accountIds:['fgi-account'],
    mode:'cibles',budget:33001,exceptional:true}),/Budget supérieur/);
  assert.throws(()=>F.propose(d,{portfolioId:'core',accountIds:['fgi-account','cgf-account'],
    mode:'cibles',budget:263001,exceptional:true}),/Budget supérieur/);
});
test('SGI03 : bouton Acheter, budget individuel, aucun achat réel et aucune fuite inter-comptes',()=>{
  const d=specimen(),snapshot=JSON.stringify(d);
  const p=F.proposeBuyBudget(d,{accountId:'fgi-account',budget:29000});
  assert(p.lines.length>0);
  assert.equal(p.accountId,'fgi-account');
  assert(p.lines.every(l=>l.accountId==='fgi-account'&&l.orderType==='LIMIT'));
  assert(p.spent<=29000 && p.spent<=33000);
  const saved=F.createPlan(d,p);
  assert(saved.orders.every(o=>o.accountId==='fgi-account'));
  assert(saved.orders.every(o=>o.orderType==='LIMIT'));
  assert.equal(saved.transactions.length,0);
  assert.deepEqual(saved.accounts,d.accounts);
  assert.equal(JSON.stringify(d),snapshot);
});
test('SGI04 : quantités et cours limites modifiables, refus immédiat du dépassement frais compris',()=>{
  const d=specimen();
  const p=F.proposeBuyBudget(d,{accountId:'cgf-account',budget:40000});
  const base=F.priceBuyBudget(d,{accountId:'cgf-account',budget:40000,
    lines:p.lines.map(l=>({symbol:l.symbol,qty:l.qty,orderType:'LIMIT',limitPrice:l.price}))});
  assert(base.spent<=40000);
  assert.throws(()=>F.priceBuyBudget(d,{accountId:'cgf-account',budget:40000,
    lines:[{symbol:'SNTS',qty:1000,orderType:'LIMIT',limitPrice:10000}]}),/supérieur au budget/);
  assert.throws(()=>F.priceBuyBudget(d,{accountId:'fgi-account',budget:50000,
    lines:[{symbol:'SNTS',qty:1,orderType:'LIMIT',limitPrice:10000}]}),/Montant supérieur/);
});
test('SGI05 : au marché ne prétend jamais garantir le budget d’exécution',()=>{
  const d=specimen();
  const p=F.priceBuyBudget(d,{accountId:'cgf-account',budget:35000,
    lines:[{symbol:'SNTS',qty:4,orderType:'MARKET',limitPrice:0}]});
  assert.equal(p.guaranteed,false);
  assert.equal(p.lines[0].referencePrice,d.quotes.SNTS.price);
  const next=F.createPlan(d,p);
  assert.equal(next.orders.at(-1).orderType,'MARKET');
  assert.equal(next.orders.at(-1).referencePrice,d.quotes.SNTS.price);
  assert.equal(next.transactions.length,0);
});
test('SGI06 : cours suspendus, anciens et instruments exclus ne sont pas des suggestions',()=>{
  const d=specimen();
  d.quotes.SNTS.status='suspended';
  assert.throws(()=>F.priceBuyBudget(d,{accountId:'cgf-account',budget:20000,
    lines:[{symbol:'SNTS',qty:1,orderType:'LIMIT',limitPrice:5000}]}),/Cours manquant, périmé ou suspendu/);
  d.quotes.SNTS.status='active';
  d.instruments.SNTS={kind:'ACTION',screen:'Exclu',label:'Fictif'};
  assert.throws(()=>F.priceBuyBudget(d,{accountId:'cgf-account',budget:20000,
    lines:[{symbol:'SNTS',qty:1,orderType:'LIMIT',limitPrice:5000}]}),/non admissible/);
});
test('SGI07 : stress 250 budgets et réserves — pas de dépassement FGI, CGF, ni total',()=>{
  for(let i=0;i<250;i++) {
    const fgi=10000+i*650,cgf=60000+i*1200,blocked=i%7*1000;
    const d=specimen(fgi,cgf,blocked,0);
    const a=fgi-blocked,b=cgf;
    const budget=Math.max(1000,Math.floor((a+b)*(i%17+1)/18));
    const p=F.propose(d,{portfolioId:'core',accountIds:['fgi-account','cgf-account'],
      mode:'cibles',budget,exceptional:true});
    assertSafe(p,{'fgi-account':a,'cgf-account':b});
  }
});
