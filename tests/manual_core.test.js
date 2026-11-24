const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../finance');
const E=require('../engine');

function fixture() {
  const d=F.empty();
  d.owners.push({id:'user-a',label:'Utilisateur de test'});
  d.portfolios.push({id:'portfolio-a',ownerId:'user-a',label:'Portefeuille test',targets:{...E.targets}});
  d.institutions.push({id:'sgi-a',label:'SGI fictive'});
  d.accounts.push({id:'account-a',portfolioId:'portfolio-a',institutionId:'sgi-a',label:'',
    currency:'XOF',cash:25000,reserved:0,monthly:0,brokerRate:0,otherRate:0});
  d.positions.push({accountId:'account-a',symbol:'SNTS',qty:4,cost:40000});
  return d;
}
test('MAN01 : remplacement manuel d’action sans changer titres, coût et trésorerie',()=>{
  const d=fixture();
  const before=JSON.stringify({accounts:d.accounts,positions:d.positions,transactions:d.transactions,
    orders:d.orders,events:d.events});
  const replacement={...d.portfolios[0].targets};
  delete replacement.SNTS;
  replacement.TEST=.30;
  d.portfolios[0].targets=replacement;
  assert.doesNotThrow(()=>F.calculate(d));
  assert.deepEqual(Object.keys(d.portfolios[0].targets).sort(),['CIEC','NTLC','ORAC','PALC','SMBC','TEST','TOCI'].sort());
  assert.equal(JSON.stringify({accounts:d.accounts,positions:d.positions,transactions:d.transactions,
    orders:d.orders,events:d.events}),before);
});
test('MAN02 : augmentation ou diminution de la liste de titres avec 100 % obligatoire',()=>{
  const d=fixture();
  d.portfolios[0].targets={SNTS:.6,TEST:.4};
  assert.doesNotThrow(()=>F.validate(d));
  d.portfolios[0].targets={SNTS:.6,TEST:.3};
  assert.throws(()=>F.validate(d),/100 %/);
  d.portfolios[0].targets={SNTS:.6,TEST:1.1};
  assert.throws(()=>F.validate(d),/100 %/);
});
test('MAN03 : banques connues exclues, symbole mal formé et volume de lignes borné',()=>{
  const d=fixture();
  d.portfolios[0].targets={SGBC:1};
  assert.throws(()=>F.validate(d),/Actions CORE invalides/);
  d.portfolios[0].targets={'x<script>':1};
  assert.throws(()=>F.validate(d),/Actions CORE invalides/);
  d.portfolios[0].targets=Object.fromEntries(Array.from({length:13},(_,i)=>['T'+String(i).padStart(2,'0'),1/13]));
  assert.throws(()=>F.validate(d),/Actions CORE invalides/);
});
test('MAN04 : la modification manuelle reste isolée aux portefeuilles',()=>{
  const d=fixture();
  d.owners.push({id:'user-b',label:'Second test'});
  d.portfolios.push({id:'portfolio-b',ownerId:'user-b',label:'Portefeuille B',targets:{...E.targets}});
  const second=JSON.stringify(d.portfolios[1]);
  d.portfolios[0].targets={SNTS:.5,TEST:.5};
  F.validate(d);
  assert.equal(JSON.stringify(d.portfolios[1]),second);
});
