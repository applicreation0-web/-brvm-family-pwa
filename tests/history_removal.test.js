const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../finance');
const E=require('../engine');
function sample() {
  const d=F.empty();
  d.owners=[{id:'owner-test',label:'Propriétaire fictif'}];
  d.portfolios=[{id:'portfolio-test',ownerId:'owner-test',label:'Portefeuille fictif',targets:{...E.targets}}];
  d.institutions=[{id:'sgi-test',label:'SGI fictive'}];
  d.accounts=[{id:'account-test',portfolioId:'portfolio-test',institutionId:'sgi-test',
    label:'Compte fictif',currency:'XOF',cash:100000,reserved:0,monthly:0,brokerRate:0,otherRate:0}];
  F.calculate(d);
  return d;
}
test('Retrait de versement local avec recalcul des espèces, aucun autre compte modifié',()=>{
  const d=sample(),record=F.record(d,{type:'DEPOSIT',accountId:'account-test',
    date:'2026-11-24',brokerRef:'TEST-FUNDING-01',amount:35000});
  assert.equal(F.calculate(record).accounts[0].cash,135000);
  const next=F.removeJournalEntry(record,record.transactions[0].id,'Erreur saisie');
  assert.equal(F.calculate(next).accounts[0].cash,100000);
  assert.equal(next.transactions.length,0);
  assert.equal(next.history.length,1);
  assert.equal(next.history[0].kind,'AUDIT_RETRAIT');
  assert.equal(next.history[0].original.brokerRef,'TEST-FUNDING-01');
  assert.equal(F.calculate(record).accounts[0].cash,135000,'the original must stay unchanged');
});
test('Retrait refusé si le cash devient insuffisant après une opération liée',()=>{
  let d=sample();
  d=F.record(d,{type:'DEPOSIT',accountId:'account-test',date:'2026-11-24',brokerRef:'DEP-TEST-25',amount:30000});
  d=F.record(d,{type:'WITHDRAW',accountId:'account-test',date:'2026-11-24',brokerRef:'RET-TEST-25',amount:120000});
  assert.throws(()=>F.removeJournalEntry(d,d.transactions[0].id,'Erreur crédit'),/Retrait refusé/);
  assert.equal(d.transactions.length,2);
  assert.equal(F.calculate(d).accounts[0].cash,10000);
});
test('Retrait d’une archive antérieure sans modifier le solde d’ouverture',()=>{
  const d=sample();
  d.history.push({kind:'ARCHIVE_TRANSACTION',type:'DEPOSIT',date:'2026-09-12',
    accountId:'account-test',reference:'ANCIEN-TEST-01',amount:12345});
  const out=F.removeArchiveEntry(d,0,'Archive incorrecte');
  assert.equal(out.history.length,1);
  assert.equal(out.history[0].kind,'AUDIT_RETRAIT');
  assert.equal(out.history[0].original.reference,'ANCIEN-TEST-01');
  assert.equal(F.calculate(out).accounts[0].cash,F.calculate(d).accounts[0].cash);
  assert.throws(()=>F.removeArchiveEntry(out,0,'Audit protégé'),/ne peut pas être retirée/);
});
test('Fractions, corrections et justificatifs liés jamais retirés silencieusement',()=>{
  const d=sample();
  d.positions.push({accountId:'account-test',symbol:'SNTS',qty:1,cost:5000});
  const split={id:'split-test',type:'SPLIT',accountId:'account-test',
    symbol:'SNTS',date:'2026-11-24',brokerRef:'SPLIT-TEST-01',ratioFrom:1,ratioTo:10,
    source:'Avis fictif',status:'CONFIRMED'};
  d.transactions.push(split);
  F.calculate(d);
  assert.throws(()=>F.removeJournalEntry(d,split.id,'Supprimer split'),/interdit/);
  d.history.push({kind:'ARCHIVE_TRANSACTION',type:'SPLIT',date:'2026-10-26',
    accountId:'account-test',symbol:'SNTS',reference:'SPLIT-ANCIEN'});
  assert.throws(()=>F.removeArchiveEntry(d,0,'Supprimer split'),/ne peut pas être retirée/);
  assert.throws(()=>F.removeJournalEntry(d,'missing','Erreur saisie'),/introuvable/);
  assert.throws(()=>F.removeJournalEntry(d,split.id,''),/motif/);
});
