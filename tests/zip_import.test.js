const {test}=require('node:test');
const assert=require('node:assert/strict');
const {deflateRawSync}=require('node:zlib');
const F=require('../finance');
const V=require('../vault');
const E=require('../engine');
function account(i,ratioTo=10) {
  const d=F.empty(),owner='test-owner-'+i,portfolio='test-portfolio-'+i,a='test-account-'+i;
  d.owners.push({id:owner,label:'Propriétaire fictif '+i});
  d.portfolios.push({id:portfolio,ownerId:owner,label:'Portefeuille '+i,targets:{...E.targets}});
  d.institutions.push({id:'test-sgi',label:'SGI fictive'});
  d.accounts.push({id:a,portfolioId:portfolio,institutionId:'test-sgi',label:'Compte '+i,
    currency:'XOF',cash:10000+i,reserved:0,monthly:0,brokerRate:0,otherRate:0});
  d.positions.push({accountId:a,symbol:'SNTS',qty:1,cost:4000+i});
  d.transactions.push({id:'split-'+i,type:'SPLIT',accountId:a,symbol:'SNTS',
    date:'2026-10-26',status:'CONFIRMED',brokerRef:'FICTIF_26-10-'+i,
    ratioFrom:1,ratioTo,source:'Test fictif'});
  F.calculate(d);return d;
}
function crc32(bytes){let x=-1;for(const b of bytes){x^=b;for(let k=0;k<8;k++)x=(x>>>1)^((x&1)?0xEDB88320:0);}return (x^(-1))>>>0;}
function deflated(files) {
  let offset=0;const body=[],central=[];
  for(const [name,content] of files) {
    const n=Buffer.from(name),data=Buffer.from(content),zip=deflateRawSync(data),crc=crc32(data);
    const h=Buffer.alloc(30+n.length);
    h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);
    h.writeUInt32LE(crc,14);h.writeUInt32LE(zip.length,18);h.writeUInt32LE(data.length,22);
    h.writeUInt16LE(n.length,26);n.copy(h,30);body.push(h,zip);
    const c=Buffer.alloc(46+n.length);
    c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);
    c.writeUInt16LE(8,10);c.writeUInt32LE(crc,16);
    c.writeUInt32LE(zip.length,20);c.writeUInt32LE(data.length,24);
    c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);n.copy(c,46);
    central.push(c);offset+=h.length+zip.length;
  }
  const e=Buffer.alloc(22),clen=central.reduce((v,c)=>v+c.length,0);
  e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(files.length,8);
  e.writeUInt16LE(files.length,10);e.writeUInt32LE(clen,12);e.writeUInt32LE(offset,16);
  return Buffer.concat([...body,...central,e]);
}
test('ZIP standard compressé : 5 comptes, fractionnements par compte, cash et positions intacts',async()=>{
  const originals=Array.from({length:5},(_,i)=>account(i));
  const zip=deflated(originals.map((d,i)=>['compte_'+i+'.json',JSON.stringify(d)]));
  const rows=await V.readZipFlexible(zip);
  const merged=V.mergeAccountArchive(rows);
  const ledger=F.calculate(merged);
  assert.equal(merged.accounts.length,5);
  assert.equal(merged.transactions.length,5);
  assert.equal(ledger.accounts.length,5);
  for(let i=0;i<5;i++) {
    const before=F.calculate(originals[i]).accounts[0];
    const after=ledger.accounts.find(a=>a.id==='test-account-'+i);
    assert.equal(after.cash,before.cash);
    assert.equal(after.positions.SNTS.qty,10);
    assert.equal(after.positions.SNTS.cost,before.positions.SNTS.cost);
  }
  const internal=V.monthlyBundle(merged,new Date('2026-11-24T09:00:00Z'));
  const reread=await V.readZipFlexible(internal.bytes);
  assert.equal(reread.size,7);
  assert.equal(JSON.parse(reread.get('BRVM_COMPLET.json')).accounts.length,5);
});
test('Refus des doublons et des calendriers de fractionnement incohérents',()=>{
  const a=account(1),b=account(2,11),original=JSON.stringify(a);
  assert.equal(V.merge(a,b),null);
  assert.throws(()=>V.mergeAccountArchive(new Map([['a.json',JSON.stringify(a)],['b.json',JSON.stringify(a)]])),/doublon/);
  b.settings.staleDays=6;
  assert.throws(()=>V.mergeAccountArchive(new Map([['a.json',JSON.stringify(a)],['b.json',JSON.stringify(b)]])),/divergence/);
  assert.equal(JSON.stringify(a),original);
});
test('CRC, taille annoncée, chemin malveillant et fichier dupliqué détectés',async()=>{
  const data=JSON.stringify(account(1)),valid=deflated([['a.json',data],['b.json',data]]);
  assert.equal((await V.readZipFlexible(valid)).size,2);
  const bad=Buffer.from(valid);bad[51]^=1;
  await assert.rejects(()=>V.readZipFlexible(bad));
  const size=Buffer.from(valid);size.writeUInt32LE(1,22);
  await assert.rejects(()=>V.readZipFlexible(size),/Taille ZIP décompressée invalide/);
  await assert.rejects(()=>V.readZipFlexible(deflated([['../bad.json',data]])));
  await assert.rejects(()=>V.readZipFlexible(deflated([['a.json',data],['a.json',data]])));
});
