// BRVM Family — high-risk corporate-action qualification using synthetic portfolios only.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../finance');
const E=require('../engine');
const V=require('../vault');
const FIX='2026-10-20';
const SPLIT='2026-10-26';
function fixture({five=true}={}) {
  const d=F.empty();
  d.asOf=FIX;d.source='Qualification comptable fictive';
  d.owners=[{id:'parent',label:'Titulaire fictif',kind:'adult'},
    ...['a','b','c'].map(id=>({id:'child-'+id,label:'Enfant fictif '+id,kind:'child'}))];
  d.portfolios=d.owners.map((o,i)=>({id:'port-'+o.id,ownerId:o.id,label:o.label,targets:{...E.targets}}));
  d.institutions=[{id:'fgi',label:'FGI'},{id:'cgf',label:'CGF'}];
  const specs=[['parent-fgi','parent','fgi',3,120000,10000],
    ['parent-cgf','parent','cgf',2,85000,20000],
    ['child-a','child-a','fgi',3,133000,30000],
    ['child-b','child-b','fgi',1,44400,40000],
    ['child-c','child-c','fgi',4,176000,50000]];
  for(const [id,who,sgi,qty,cost,cash] of specs.slice(0,five?5:1)) {
    d.accounts.push({id,portfolioId:'port-'+who,institutionId:sgi,label:id,currency:'XOF',
      cash,reserved:0,monthly:0,brokerRate:.01,otherRate:0});
    d.positions.push({accountId:id,symbol:'SNTS',qty,cost});
  }
  d.quotes.SNTS={date:'2026-10-23',price:43850,basis:'official',source:'BRVM avis 309/2026'};
  F.calculate(d);return d;
}
const at=(d,id='parent-fgi')=>F.calculate(d).accounts.find(a=>a.id===id);
const book=(d,type,props={})=>F.record(d,{type,accountId:'parent-fgi',date:'2026-10-27',
  brokerRef:'EVID-'+Math.random().toString(36).slice(2,14),...props});
const split=(d,props={})=>book(d,'SPLIT',{date:SPLIT,symbol:'SNTS',ratioFrom:1,ratioTo:10,
  source:'Avis N° 309/2026 BRVM',brokerRef:'SPLIT-SNTS-309',...props});
const round=x=>Math.round(x*100)/100;

test('OST01 SONATEL: cinq comptes, 1:10, 13 anciennes deviennent 130 nouvelles, patrimoine inchangé',()=>{
  const prior=fixture(),initial=F.calculate(prior);
  const changed=split(prior),after=F.calculate(changed);
  assert.equal(prior.transactions.length,0);
  assert.equal(changed.transactions.length,5);
  assert.equal(changed.transactions.filter(x=>x.type==='SPLIT').length,5);
  for(const old of initial.accounts) {
    const fresh=at(changed,old.id);
    assert.equal(fresh.positions.SNTS.qty,old.positions.SNTS.qty*10);
    assert.equal(fresh.positions.SNTS.cost,old.positions.SNTS.cost);
    assert.equal(fresh.cash,old.cash);
    assert.equal(fresh.positions.SNTS.price,4385);
    assert.equal(fresh.market,old.market);
  }
  assert.equal(after.all.market,initial.all.market);
  assert.equal(after.all.cash,initial.all.cash);
  assert.equal(after.all.total,initial.all.total);
  assert.equal(after.all.pnl,initial.all.pnl);
});
test('OST02 même événement n’est jamais rejoué avec un autre justificatif',()=>{
  const first=split(fixture());
  assert.throws(()=>split(first,{brokerRef:'SPLIT-SNTS-OTHER'}),/déjà/);
  assert.deepEqual(F.calculate(first).all,F.calculate(first).all);
});
test('OST03 impossible de fractionner sans détention réelle à la date',()=>{
  const d=fixture({five:false});d.positions=[];F.calculate(d);
  assert.throws(()=>split(d),/position|Aucune position/i);
});
test('OST04 regroupement 10:1 conserve coût et cash après fractionnement',()=>{
  const first=split(fixture());
  const back=split(first,{date:'2026-11-02',brokerRef:'REVERSE-11',ratioFrom:10,ratioTo:1});
  assert.deepEqual(F.calculate(back).all,F.calculate(fixture()).all);
  for(const a of F.calculate(back).accounts)
    assert.equal(a.positions.SNTS.qty,at(fixture(),a.id).positions.SNTS.qty);
});
test('OST05 regroupement produisant fractions interdit sans justificatif de rompus',()=>{
  const first=split(fixture({five:false}));
  const before=F.calculate(first);
  assert.throws(()=>split(first,{date:'2026-11-02',brokerRef:'REVERSE-FRACTION',ratioFrom:7,ratioTo:1}),
    /fraction|fraction non rapprochée/);
  assert.equal(at(first).cash,before.accounts[0].cash);
});
test('OST06 ratios nuls, négatifs ou identiques refusés',()=>{
  const d=fixture({five:false});
  for(const [from,to] of [[1,1],[0,10],[-1,10],[1,0],[1,-5],[1,1.5]]) {
    assert.throws(()=>split(d,{ratioFrom:from,ratioTo:to}),/Ratio|ratio|fraction/);
  }
});
test('OST07 l’événement ne touche pas les comptes sans ce titre',()=>{
  const d=fixture();d.positions=d.positions.filter(p=>p.accountId==='parent-fgi');
  const out=split(d);
  assert.equal(out.transactions.length,1);
  assert.equal(at(out,'parent-cgf').cash,at(d,'parent-cgf').cash);
  assert.equal(Object.keys(at(out,'child-a').positions).length,0);
});
test('OST08 état annoncé de dividende sans encaissement, puis paiement unique net',()=>{
  const d=split(fixture({five:false}));
  const id='dividende-annonce';
  d.events.push({id,type:'DIVIDEND',accountId:'parent-fgi',symbol:'SNTS',
    date:'2026-10-28',status:'ANNONCÉ',gross:5790,source:'Avis de distribution fictif'});
  assert.equal(at(d).cash,10000);
  const paid=book(d,'DIVIDEND',{date:'2026-10-30',symbol:'SNTS',eventId:id,
    gross:5790,tax:570,other:20,brokerRef:'DIVIDEND-PAID-01'});
  assert.equal(at(paid).cash,15200);
  assert.equal(at(paid).grossDividends,5790);
  assert.equal(at(paid).dividends,5200);
  assert.equal(at(paid).taxes,570);
  assert.equal(at(paid).feesPaid,20);
  assert.equal(paid.events.find(x=>x.id===id).status,'PAYÉ');
  assert.throws(()=>book(paid,'DIVIDEND',{date:'2026-10-31',symbol:'SNTS',eventId:id,
    gross:5790,brokerRef:'DIVIDEND-PAID-02'}),/déjà/);
});
test('OST09 dividende déclaré en ancien nombre et après split: même droit économique',()=>{
  const unadjusted=fixture({five:false}),adjusted=split(unadjusted);
  assert.equal(at(unadjusted).positions.SNTS.qty,3);
  assert.equal(at(adjusted).positions.SNTS.qty,30);
  const grossOld=3*1930,grossNew=30*193;
  assert.equal(grossOld,grossNew);
  const older=book(unadjusted,'DIVIDEND',{date:'2026-10-23',symbol:'SNTS',gross:grossOld,tax:500,other:10,brokerRef:'DIV-OLD'});
  const newer=book(adjusted,'DIVIDEND',{date:'2026-10-30',symbol:'SNTS',gross:grossNew,tax:500,other:10,brokerRef:'DIV-NEW'});
  assert.equal(at(older).cash,at(newer).cash);
  assert.equal(at(older).dividends,at(newer).dividends);
});
test('OST10 aucun double encaissement de la même distribution dans un compte',()=>{
  const d=fixture({five:false});
  const once=book(d,'DIVIDEND',{symbol:'SNTS',gross:4000,tax:400,brokerRef:'DIV-ONE'});
  assert.throws(()=>book(once,'DIVIDEND',{symbol:'SNTS',gross:4000,tax:400,brokerRef:'DIV-TWO'}),
    /déjà|Distribution/);
});
test('OST11 retenue supérieure au brut ou frais excessifs rejetés sans solde négatif',()=>{
  const d=fixture({five:false});
  for(const [gross,tax,other]of [[100,110,0],[100,0,120],[100,50,60],[0,0,0]]) {
    assert.throws(()=>book(d,'DIVIDEND',{symbol:'SNTS',gross,tax,other}),/invalide/);
  }
});
test('OST12 dividende lié au mauvais compte n’est pas encaissable par le parent',()=>{
  const d=fixture();d.events.push({id:'child-div',type:'DIVIDEND',accountId:'child-a',
    symbol:'SNTS',date:'2026-10-25',status:'DÛ',gross:1000,source:'Avis fictif'});
  assert.throws(()=>book(d,'DIVIDEND',{eventId:'child-div',symbol:'SNTS',gross:1000}),/incompatible/);
});
test('OST13 réinvestissement plafonné au dividende net réellement reçu',()=>{
  const d=fixture({five:false});
  const paid=book(d,'DIVIDEND',{date:'2026-10-28',symbol:'SNTS',gross:1000,tax:100,other:10,brokerRef:'DIV-NET-890'});
  const id=paid.transactions.at(-1).id;
  const ok=book(paid,'BUY',{date:'2026-10-29',symbol:'CIEC',qty:1,price:800,
    broker:0,other:0,tax:0,actualTotal:800,reinvests:id,brokerRef:'BUY-REINVEST-800'});
  assert.equal(at(ok).positions.CIEC.qty,1);
  assert.equal(at(ok).dividends,890);
  assert.throws(()=>book(ok,'BUY',{date:'2026-10-30',symbol:'CIEC',qty:1,price:100,
    broker:0,other:0,tax:0,actualTotal:100,reinvests:id,brokerRef:'BUY-REINVEST-EXCESS'}),/excède/);
});
test('OST14 distribution gratuite: quantité augmente, PRU baisse, coût total inchangé',()=>{
  const first=split(fixture({five:false}));
  const before=at(first);
  const next=book(first,'BONUS',{date:'2026-10-30',symbol:'SNTS',qty:3,recordDate:'2026-10-27',
    entitlement:{underlying:'SNTS',numerator:1,denominator:10},source:'Avis fictif'});
  assert.equal(at(next).positions.SNTS.qty,33);
  assert.equal(at(next).positions.SNTS.cost,before.positions.SNTS.cost);
  assert.ok(at(next).positions.SNTS.cost/33<before.positions.SNTS.cost/30);
  assert.equal(at(next).cash,before.cash);
});
test('OST15 dividende en actions: pas de cash ajouté, quantité plafonnée',()=>{
  const first=split(fixture({five:false}));
  const options={date:'2026-10-30',symbol:'SNTS',qty:3,recordDate:'2026-10-27',
    entitlement:{underlying:'SNTS',numerator:1,denominator:10},source:'Avis stock dividend'};
  const next=book(first,'STOCK_DIVIDEND',options);
  assert.equal(at(next).cash,at(first).cash);
  assert.equal(at(next).positions.SNTS.qty,33);
  assert.equal(at(next).positions.SNTS.cost,at(first).positions.SNTS.cost);
  assert.throws(()=>book(first,'STOCK_DIVIDEND',{...options,qty:4}),/éligibles/);
});
test('OST16 droits d’attribution: compte séparé, quantité éligible, aucun cash artificiel',()=>{
  const first=split(fixture({five:false}));
  const options={date:'2026-10-30',symbol:'DROI',qty:6,recordDate:'2026-10-27',
    entitlement:{underlying:'SNTS',numerator:1,denominator:5},source:'Avis droit fictif'};
  const next=book(first,'RIGHTS',options);
  assert.equal(at(next).positions.DROI.qty,6);
  assert.equal(at(next).positions.DROI.cost,0);
  assert.equal(at(next).cash,at(first).cash);
  assert.throws(()=>book(first,'RIGHTS',{...options,qty:7}),/éligibles/);
});
test('OST17 même droit ne peut pas être attribué deux fois à date identique',()=>{
  const first=split(fixture({five:false}));
  const opts={date:'2026-10-30',symbol:'DROI',qty:3,recordDate:'2026-10-27',
    entitlement:{underlying:'SNTS',numerator:1,denominator:10},source:'Avis droit fictif'};
  const once=book(first,'RIGHTS',{...opts,brokerRef:'RIGHT-ISSUE-01'});
  assert.throws(()=>book(once,'RIGHTS',{...opts,brokerRef:'RIGHT-ISSUE-02'}),/déjà/);
});
test('OST18 droits historiques avant ouverture: preuve de quantité exigée',()=>{
  const d=fixture({five:false});
  const opts={date:'2026-10-30',symbol:'DROI',qty:1,recordDate:'2026-10-19',
    entitlement:{underlying:'SNTS',numerator:1,denominator:3},source:'Avis droit fictif'};
  assert.throws(()=>book(d,'RIGHTS',opts),/Avis quantifié/);
  const documented=book(d,'RIGHTS',{...opts,entitlement:{...opts.entitlement,statementQty:3,statementRef:'AVIS-2026-123'}});
  assert.equal(at(documented).positions.DROI.qty,1);
});
test('OST19 droits non attribués sur un titre non détenu à la date requise',()=>{
  const d=fixture({five:false});
  assert.throws(()=>book(d,'RIGHTS',{date:'2026-10-30',symbol:'DROI',qty:1,
    recordDate:'2026-10-27',entitlement:{underlying:'ORAC',numerator:1,denominator:1},
    source:'Avis fictif'}),/éligibles/);
});
test('OST20 ordres en cours sur le titre à fractionner: refus avant régularisation',()=>{
  const d=fixture({five:false});
  d.orders.push({id:'o1',accountId:'parent-fgi',symbol:'SNTS',qty:1,limit:4000,
    status:'TRANSMIS',date:'2026-10-22',trace:[]});
  assert.throws(()=>split(d),/ordres/);
});
test('OST21 fractionnement déjà inclus dans historique initial: interdit une deuxième fois',()=>{
  const d=fixture({five:false});
  d.history.push({id:'hist-split',accountId:'parent-fgi',type:'SPLIT',symbol:'SNTS',
    date:SPLIT,reference:'BRVM-309'});
  assert.throws(()=>split(d),/déjà compris/);
});
test('OST22 devises et autres titres ne doivent pas changer de quantité sur split SNTS',()=>{
  const d=fixture({five:false});
  d.positions.push({accountId:'parent-fgi',symbol:'ORAC',qty:4,cost:80000});
  d.quotes.ORAC={date:'2026-10-23',price:20000,basis:'official',source:'Bulletin fictif'};
  const old=at(d),updated=at(split(d));
  assert.equal(updated.positions.ORAC.qty,old.positions.ORAC.qty);
  assert.equal(updated.positions.ORAC.cost,old.positions.ORAC.cost);
  assert.equal(updated.positions.ORAC.market,old.positions.ORAC.market);
});
test('OST23 sauvegarde mensuelle après split conserve positions reconstituées et cash',()=>{
  const d=split(fixture());
  const pack=V.monthlyBundle(d,new Date('2026-11-01T12:00:00Z'));
  const archive=V.readZip(pack.bytes);
  const full=V.inspect(JSON.parse(archive.get('BRVM_COMPLET.json')));
  assert.equal(F.calculate(full).all.total,F.calculate(d).all.total);
  const children=[...archive.entries()].filter(([name])=>name.startsWith('comptes/'));
  assert.equal(children.length,5);
  for(const [name,payload] of children){
    const snap=V.inspect(JSON.parse(payload));
    assert.equal(snap.transactions.length,0);
    assert.equal(snap.accounts.length,1);
    const account=at(d,snap.accounts[0].id);
    assert.equal(F.calculate(snap).accounts[0].cash,account.cash);
    assert.equal(F.calculate(snap).accounts[0].positions.SNTS.qty,account.positions.SNTS.qty);
  }
});
test('OST24 restauration de l’historique antérieur au fractionnement sans rejeu',()=>{
  const d=fixture({five:false});
  d.history.push({id:'legacy-split',type:'SPLIT',accountId:'parent-fgi',symbol:'SNTS',
    date:'2026-10-18',reference:'PRE-OPEN-100'});
  const out=V.accountSnapshot(d,'parent-fgi');
  assert.equal(out.transactions.length,0);
  assert.equal(out.history.length,1);
  assert.equal(at(out).positions.SNTS.qty,3);
});
test('OST25 vendeurs ne peuvent vendre des titres absents ni dépenser un dividende annoncé',()=>{
  const d=fixture({five:false});
  d.events.push({id:'pending',type:'DIVIDEND',status:'ANNONCÉ',accountId:'parent-fgi',
    symbol:'SNTS',date:'2026-10-22',gross:100000,source:'Avis fictif'});
  assert.equal(at(d).cash,10000);
  assert.throws(()=>book(d,'BUY',{symbol:'ORAC',qty:1,price:20000,broker:0,other:0,tax:0,
    actualTotal:20000}),/insuffisant/);
  assert.throws(()=>book(d,'SELL',{symbol:'ORAC',qty:1,price:20000,broker:0,other:0,tax:0,
    actualTotal:20000}),/quantité/);
});


test('OST26 droits attribués puis expirés: aucun cash fictif, quantité zéro',()=>{
  const issued=book(split(fixture({five:false})),'RIGHTS',{
    date:'2026-10-30',symbol:'DROI',qty:3,recordDate:'2026-10-27',
    entitlement:{underlying:'SNTS',numerator:1,denominator:10},source:'Avis de droits'});
  const expired=book(issued,'RIGHTS_EXPIRY',{date:'2026-11-02',
    symbol:'DROI',qty:3,source:'Avis expiration courtier'});
  assert.equal(at(expired).cash,at(issued).cash);
  assert.equal(at(expired).positions.DROI.qty,0);
  assert.equal(at(expired).positions.DROI.cost,0);
  assert.equal(at(expired).realized,at(issued).realized);
});
test('OST27 droits acquis contre paiement puis expirés partiellement: coût passé en perte',()=>{
  const d=fixture({five:false});
  d.instruments.DROI={label:'Droits fictifs',kind:'DROIT'};
  const bought=book(d,'BUY',{date:'2026-10-27',
    symbol:'DROI',qty:2,price:100,broker:0,other:0,tax:0,actualTotal:200});
  const first=book(bought,'RIGHTS_EXPIRY',{date:'2026-10-30',
    symbol:'DROI',qty:1,source:'Avis droits expirés'});
  assert.equal(at(first).cash,at(bought).cash);
  assert.equal(at(first).positions.DROI.qty,1);
  assert.equal(at(first).positions.DROI.cost,100);
  assert.equal(at(first).realized,-100);
  const last=book(first,'RIGHTS_EXPIRY',{date:'2026-11-02',
    symbol:'DROI',qty:1,source:'Second avis droits expirés'});
  assert.equal(at(last).positions.DROI.qty,0);
  assert.equal(at(last).realized,-200);
});
test('OST28 expiration rejetée pour action ordinaire ou quantité supérieure',()=>{
  const d=fixture({five:false});
  assert.throws(()=>book(d,'RIGHTS_EXPIRY',{symbol:'SNTS',qty:1,source:'Avis fictif'}),/droit identifié/);
  d.instruments.DROI={label:'Droits fictifs',kind:'DROIT'};
  assert.throws(()=>book(d,'RIGHTS_EXPIRY',{symbol:'DROI',qty:1,source:'Avis fictif'}),/supérieure/);
});
test('OST29 dividende vérifié sur 30 titres après fractionnement Sonatel',()=>{
  const d=split(fixture({five:false}));
  const paid=book(d,'DIVIDEND',{symbol:'SNTS',date:'2026-10-30',
    gross:5790,tax:570,other:0,dividendBasis:{
      recordDate:'2026-10-27',eligibleQty:30,grossPerShare:193}});
  assert.equal(at(paid).cash,15220);
  assert.equal(at(paid).positions.SNTS.qty,30);
});
test('OST30 éligibilité avant split: dividende brut fondé sur 3 anciens titres',()=>{
  const d=split(fixture({five:false}));
  const recordDate='2026-10-25';
  const paid=book(d,'DIVIDEND',{symbol:'SNTS',date:'2026-10-30',
    gross:5790,tax:570,other:0,dividendBasis:{recordDate,eligibleQty:3,grossPerShare:1930}});
  assert.equal(at(paid).dividends,5220);
  assert.throws(()=>book(d,'DIVIDEND',{symbol:'SNTS',date:'2026-10-30',
    gross:5790,tax:570,other:0,
    dividendBasis:{recordDate,eligibleQty:30,grossPerShare:193}}),/éligible/);
});
test('OST31 avant date de photographie: avis quantifié externe requis',()=>{
  const d=fixture({five:false});
  const props={symbol:'SNTS',date:'2026-10-30',gross:5790,tax:570,other:0,
    dividendBasis:{recordDate:'2026-10-19',eligibleQty:3,grossPerShare:1930}};
  assert.throws(()=>book(d,'DIVIDEND',props),/Avis du courtier/);
  const paid=book(d,'DIVIDEND',{...props,
    dividendBasis:{...props.dividendBasis,statementRef:'AVIS-FGI-2026'}});
  assert.equal(at(paid).dividends,5220);
});
test('OST32 montant brut incompatible avec le nombre de titres est rejeté',()=>{
  const d=split(fixture({five:false}));
  assert.throws(()=>book(d,'DIVIDEND',{symbol:'SNTS',gross:5790,tax:0,other:0,
    dividendBasis:{recordDate:'2026-10-27',eligibleQty:30,grossPerShare:200}}),/incohérent/);
  assert.throws(()=>book(d,'DIVIDEND',{symbol:'SNTS',gross:5790,tax:0,other:0,
    dividendBasis:{recordDate:'2026-10-27',eligibleQty:0,grossPerShare:193}}),/incohérent/);
});
test('OST33 achat juste après date d’éligibilité ne donne aucun dividende rétroactif',()=>{
  const base=fixture({five:false});
  base.positions=[];F.calculate(base);
  const first=book(base,'BUY',{date:'2026-10-28',
    symbol:'SNTS',qty:3,price:3000,broker:0,other:0,tax:0,actualTotal:9000});
  assert.equal(at(first).positions.SNTS.qty,3);
  assert.throws(()=>book(first,'DIVIDEND',{symbol:'SNTS',date:'2026-10-30',
    gross:5790,tax:0,other:0,
    dividendBasis:{recordDate:'2026-10-27',eligibleQty:3,grossPerShare:1930}}),/éligible/);
});
test('OST34 rectification d’une expiration restaure la quantité et le coût sans cash',()=>{
  const d=fixture({five:false});d.instruments.DROI={label:'Droit',kind:'DROIT'};
  const bought=book(d,'BUY',{date:'2026-10-27',symbol:'DROI',qty:2,price:100,
    broker:0,other:0,tax:0,actualTotal:200});
  const expired=book(bought,'RIGHTS_EXPIRY',{date:'2026-10-30',
    symbol:'DROI',qty:1,source:'Avis erreur'});
  const corrected=book(expired,'CORRECTION',{date:'2026-11-02',replay:true,
    corrects:expired.transactions.at(-1).id,note:'Annulation du mauvais avis'});
  assert.equal(at(corrected).positions.DROI.qty,2);
  assert.equal(at(corrected).positions.DROI.cost,200);
  assert.equal(at(corrected).realized,0);
  assert.equal(at(corrected).cash,at(bought).cash);
});
test('OST35 quotas des droits sont propres à chaque compte de la famille',()=>{
  const d=split(fixture());
  const first=book(d,'RIGHTS',{symbol:'DROI',date:'2026-10-30',qty:6,
    recordDate:'2026-10-27',entitlement:{underlying:'SNTS',numerator:1,denominator:5},
    source:'Avis droit fictif'});
  assert.equal(at(first,'parent-fgi').positions.DROI.qty,6);
  assert.equal(at(first,'parent-cgf').positions.DROI,undefined);
  assert.equal(at(first,'child-a').positions.DROI,undefined);
});
test('OST36 stress 80 couples split/regroupement: invariants de trésorerie et de coût',()=>{
  for(let i=0;i<80;i++){
    const ratio=2+i%9;
    const d=fixture({five:false});
    const first=split(d,{ratioTo:ratio,brokerRef:'SPLIT-STRESS-'+i});
    const second=split(first,{date:'2026-11-02',ratioFrom:ratio,ratioTo:1,
      brokerRef:'REVERSE-STRESS-'+i});
    const p=at(d),after=at(second);
    assert.equal(after.positions.SNTS.qty,p.positions.SNTS.qty);
    assert.equal(after.positions.SNTS.cost,p.positions.SNTS.cost);
    assert.equal(after.cash,p.cash);
    assert.ok(Math.abs(after.market-p.market)<0.011);
  }
});
test('OST37 les justificatifs d’attribution prévalent sur une position déjà vendue',()=>{
  const d=fixture({five:false});
  const sold=book(d,'SELL',{date:'2026-10-25',symbol:'SNTS',qty:3,price:43000,
    broker:0,other:0,tax:0,actualTotal:129000});
  assert.equal(at(sold).positions.SNTS.qty,0);
  // The right was fixed before the sale, so the share entitlement remains valid.
  const allocated=book(sold,'RIGHTS',{date:'2026-10-30',symbol:'DROI',qty:1,
    recordDate:'2026-10-24',entitlement:{underlying:'SNTS',numerator:1,denominator:3},
    source:'Avis de détachement'});
  assert.equal(at(allocated).positions.DROI.qty,1);
  assert.equal(at(allocated).positions.SNTS.qty,0);
});
