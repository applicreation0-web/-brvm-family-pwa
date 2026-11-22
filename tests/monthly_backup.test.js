const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../finance');
const E=require('../engine');
const V=require('../vault');

function synthetic() {
  const d=F.empty();
  d.asOf='2025-01-02';
  d.owners=[{id:'parent',label:'Parent fictif',kind:'adult'},
    {id:'child',label:'Enfant fictif',kind:'child'}];
  d.portfolios=[{id:'p',ownerId:'parent',label:'Parent fictif',targets:{...E.targets}},
    {id:'c',ownerId:'child',label:'Enfant fictif',targets:{...E.targets}}];
  d.institutions=[{id:'f',label:'FGI'},{id:'g',label:'CGF'}];
  d.accounts=[{id:'p-f',portfolioId:'p',institutionId:'f',label:'',currency:'XOF',cash:10000,reserved:0,monthly:0,brokerRate:.01,otherRate:0},
    {id:'p-g',portfolioId:'p',institutionId:'g',label:'',currency:'XOF',cash:20000,reserved:0,monthly:0,brokerRate:.01,otherRate:0},
    {id:'c-f',portfolioId:'c',institutionId:'f',label:'',currency:'XOF',cash:30000,reserved:0,monthly:0,brokerRate:.01,otherRate:0}];
  d.positions=[{accountId:'p-f',symbol:'SNTS',qty:5,cost:1000},
    {accountId:'p-g',symbol:'SNTS',qty:2,cost:500},
    {accountId:'c-f',symbol:'CIEC',qty:10,cost:4000}];
  d.history=[{id:'history-pf',accountId:'p-f',type:'BUY',symbol:'SNTS',date:'2025-01-01',reference:'OLD-PF'},
    {id:'history-cf',accountId:'c-f',type:'BUY',symbol:'CIEC',date:'2025-01-01',reference:'OLD-CF'}];
  d.transactions=[{id:'deposit',accountId:'p-f',type:'DEPOSIT',status:'CONFIRMED',date:'2025-01-03',
    brokerRef:'BANK-REF-1',amount:4000}];
  F.calculate(d);
  return d;
}
function unzipStored(data) {
  const files=new Map();
  const v=new DataView(data.buffer,data.byteOffset,data.byteLength);
  const decoder=new TextDecoder();
  let off=0;
  while(off+30<=data.length && v.getUint32(off,true)===0x04034b50) {
    assert.equal(v.getUint16(off+8,true),0,'ZIP must store uncompressed JSON');
    const size=v.getUint32(off+18,true),nameLength=v.getUint16(off+26,true);
    const extra=v.getUint16(off+28,true);
    const filename=decoder.decode(data.slice(off+30,off+30+nameLength));
    const start=off+30+nameLength+extra;
    files.set(filename,JSON.parse(decoder.decode(data.slice(start,start+size))));
    off=start+size;
  }
  assert.equal(v.getUint32(off,true),0x02014b50,'Central directory missing');
  return files;
}
test('backup obligatoire chaque mois: premier mois, même mois, mois suivant',()=>{
  const d=F.empty();
  const nov=new Date('2026-11-15T12:00:00Z'),dec=new Date('2026-12-15T12:00:00Z');
  assert.equal(V.backupDue(d,nov),false);
  d.accounts=[{id:'synthetic'}];
  assert.equal(V.backupDue(d,nov),true);
  d.settings.monthlyBackup={month:'2026-11',verifiedAt:'2026-11-15T12:00:00Z',sha256:'fixture'};
  assert.equal(V.backupDue(d,nov),false);
  assert.equal(V.backupDue(d,dec),true);
});
test('sauvegarde ZIP: complet + exactement un JSON par compte et un manifeste',async()=>{
  const d=synthetic(),pack=V.monthlyBundle(d,new Date('2026-11-22T12:00:00Z'));
  assert.equal(pack.month,'2026-11');
  const files=unzipStored(pack.bytes);
  const imported=V.readZip(pack.bytes);
  assert.equal(imported.size,files.size);
  assert.deepEqual(JSON.parse(imported.get('BRVM_COMPLET.json')),d);
  const tampered=pack.bytes.slice();
  const firstNameLength=new DataView(tampered.buffer).getUint16(26,true);
  tampered[30+firstNameLength+12]^=1; // alter JSON bytes, not its filename
  assert.throws(()=>V.readZip(tampered),/CRC32/);
  assert.equal(files.size,5);
  assert.equal(files.get('MANIFESTE.json').accountCount,3);
  assert.equal(files.get('MANIFESTE.json').month,'2026-11');
  assert.deepEqual(files.get('BRVM_COMPLET.json'),d);
  for(const [id,filename] of [['p-f','comptes/Parent_fictif_FGI.json'],
    ['p-g','comptes/Parent_fictif_CGF.json'],
    ['c-f','comptes/Enfant_fictif_FGI.json']]) {
    const account=V.inspect(files.get(filename));
    assert.equal(account.accounts.length,1);
    assert.equal(account.accounts[0].id,id);
    const current=F.calculate(d).accounts.find(a=>a.id===id);
    const restored=F.calculate(account).accounts[0];
    assert.equal(restored.cash,current.cash);
    assert.equal(restored.reserved,current.reserved);
    assert.deepEqual(Object.fromEntries(Object.entries(restored.positions)
      .map(([k,p])=>[k,{qty:p.qty,cost:p.cost}])),
      Object.fromEntries(Object.entries(current.positions).filter(([,p])=>p.qty>0)
        .map(([k,p])=>[k,{qty:p.qty,cost:p.cost}])));
    assert.ok(account.transactions.length===0,'no replay of already counted operations');
    assert.ok(account.history.every(h=>!h.accountId||h.accountId===id),
      'one-account exports must not leak other accounts');
  }
  const roundtrip=V.inspect(files.get('BRVM_COMPLET.json'));
  assert.equal(F.calculate(roundtrip).all.cash,F.calculate(d).all.cash);
  const fp=await V.sha256(pack.bytes);
  const changed=pack.bytes.slice();
  changed[40]^=1;
  assert.notEqual(await V.sha256(changed),fp);
});
test('fusion des instantanés parent FGI/CGF et enfant FGI sans perte de cash',()=>{
  const d=synthetic();
  const first=V.accountSnapshot(d,'p-f'),second=V.accountSnapshot(d,'p-g'),child=V.accountSnapshot(d,'c-f');
  let combo=V.merge(first,second);
  assert.ok(combo);
  combo=V.merge(combo,child);
  assert.ok(combo);
  assert.equal(combo.accounts.length,3);
  assert.equal(combo.owners.length,2);
  assert.equal(combo.institutions.length,2);
  assert.equal(F.calculate(combo).all.cash,F.calculate(d).all.cash);
  assert.equal(V.merge(combo,child),null);
});
