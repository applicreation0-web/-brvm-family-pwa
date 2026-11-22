const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../finance');
const E=require('../engine');
const V=require('../vault');

const target={...E.targets};
function file(owner,sgi,accountId,{child=false}={}) {
  const d=F.empty();
  d.asOf='2026-11-04';
  d.source='Source de test commune';
  d.owners=[{id:'owner-'+owner,label:owner,kind:child?'child':'adult'}];
  d.portfolios=[{id:'portfolio-'+owner,ownerId:'owner-'+owner,label:owner,targets:target}];
  d.institutions=[{id:'sgi-'+sgi,label:sgi}];
  d.accounts=[{id:accountId,portfolioId:'portfolio-'+owner,institutionId:'sgi-'+sgi,
    label:'',currency:'XOF',cash:1000,reserved:0,monthly:0,brokerRate:.01,otherRate:.006}];
  d.positions=[{accountId,symbol:'SNTS',qty:10,cost:500}];
  d.history=[{id:'summary-'+accountId,accountId,kind:'SOURCE_SUMMARY'}];
  F.calculate(d);
  return d;
}
test('JSON par compte: même parent, SGI distinctes, propriétaires et historiques non dupliqués',()=>{
  const first=file('Titulaire de test','FGI','account-fgi');
  const second=file('Titulaire de test','CGF','account-cgf');
  const merged=V.merge(first,second);
  assert.ok(merged);
  assert.equal(merged.accounts.length,2);
  assert.equal(merged.portfolios.length,1);
  assert.equal(merged.owners.length,1);
  assert.equal(merged.institutions.length,2);
  assert.equal(merged.positions.length,2);
  assert.equal(merged.history.length,2);
  assert.equal(F.calculate(merged).all.cash,2000);
  assert.equal(V.merge(merged,second),null,'Double import must never duplicate cash');
});
test('JSON par compte: trois enfants se fusionnent sans comptes parentaux',()=>{
  let db=file('Enfant A','FGI','child-a',{child:true});
  db=V.merge(db,file('Enfant B','FGI','child-b',{child:true}));
  db=V.merge(db,file('Enfant C','FGI','child-c',{child:true}));
  assert.ok(db);
  assert.equal(db.accounts.length,3);
  assert.equal(db.owners.length,3);
  assert.equal(db.institutions.length,1);
  assert.equal(F.calculate(db).all.cash,3000);
  assert.ok(db.accounts.every(a=>a.id.startsWith('child-')));
});
test('JSON par compte: divergences de propriétaire ou de données globales refusées',()=>{
  const a=file('Titulaire de test','FGI','account-fgi');
  const altered=file('Titulaire de test','CGF','account-cgf');
  altered.owners[0].label='Personne différente';
  assert.equal(V.merge(a,altered),null);
  const other=file('Autre','CGF','account-cgf');
  other.settings.staleDays=12;
  assert.equal(V.merge(a,other),null);
});
