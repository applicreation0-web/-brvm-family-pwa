const {test}=require('node:test');
const assert=require('node:assert/strict');
const F=require('../finance');
const E=require('../engine');
const A=require('../analysis');
const Q=require('../quotes');
const V=require('../vault');

const dates=['2025-01-02','2025-01-03','2025-01-06','2025-01-07','2025-01-08'];
function fixture() {
  const d=F.empty();
  d.asOf=dates[0];
  d.owners=[{id:'u',label:'Même nom'},{id:'v',label:'Même nom',kind:'child'}];
  d.portfolios=[{id:'p',ownerId:'u',label:'Principal',targets:{...E.targets}},
    {id:'q',ownerId:'u',label:'Épargne',targets:{...E.targets}},{id:'r',ownerId:'v',label:'Enfant',targets:{...E.targets}}];
  d.institutions=[{id:'fgi',label:'FGI'},{id:'cgf',label:'CGF'},{id:'custom',label:'SGI Démo'}];
  d.accounts=[['a','p','fgi',10000,100000],['b','p','fgi',5000,0],['c','p','cgf',20000,150000],
    ['d','q','custom',0,0],['e','r','cgf',200000,0]].map(([id,portfolioId,institutionId,cash,monthly])=>
    ({id,portfolioId,institutionId,cash,monthly,label:'Même compte',currency:'XOF',reserved:0,brokerRate:.01,otherRate:.006}));
  d.positions=[{accountId:'a',symbol:'SNTS',qty:10,cost:2000},{accountId:'b',symbol:'SNTS',qty:2,cost:600}];
  d.quotes=Object.fromEntries(E.symbols.map((s,i)=>[s,{price:300+i*50,date:dates[0],basis:'official',source:'Fixture'}]));
  return d;
}
function tx(d,type,props={}) {
  return F.record(d,{type,date:dates[1],accountId:'a',brokerRef:type+'-0001',...props});
}
const before=(d,id='a')=>F.calculate(d).accounts.find(a=>a.id===id);
const buy={symbol:'SNTS',qty:2,price:300,broker:5,other:4,tax:1,actualTotal:610};

test('ACC01–09 : 24 comptes, 8 propriétaires, homonymes, SGI personnalisée et renommage',()=>{
  const d=fixture();
  for(let i=0;i<24;i++) {
    const ownerId='person-'+Math.floor(i/3), p='port-'+Math.floor(i/3);
    if(i%3===0) {d.owners.push({id:ownerId,label:'Homonyme'}); d.portfolios.push({id:p,ownerId,label:'Même',targets:{...E.targets}});}
    d.accounts.push({...d.accounts[0],id:'extra-'+i,institutionId:['fgi','fgi','custom'][i%3],portfolioId:p,cash:100});
  }
  assert.equal(F.calculate(d).owners.filter(x=>x.label==='Homonyme').length,8);
  assert.equal(F.calculate(d).all.cash,237400);
  const a=d.accounts[0]; a.archived=true; a.label='Nouveau libellé';
  assert.equal(before(d).cash,10000);
  assert.throws(()=>tx(d,'DEPOSIT',{amount:10}),/inactif/);
  a.archived=false;
  assert.equal(before(tx(d,'DEPOSIT',{amount:10})).cash,10010);
  a.currency='EUR';
  assert.throws(()=>F.calculate(d),/XOF/);
});
test('FIN01 FIN09 FIN12 FIN15 : migration sans rejouer soldes, archives et frais',()=>{
  const d=E.empty();
  d.asOf='2025-01-03';d.owners=['Démo'];d.accounts=[{id:'ancien',owner:'Démo',sgi:'CGF',cash:63,reserved:0}];
  d.positions=[{accountId:'ancien',symbol:'SNTS',qty:10,cost:800}];
  d.history=[{type:'FEE',amount:12,accountId:'ancien'},{type:'SPLIT',date:'2025-01-02',symbol:'SNTS',reference:'SPLT'}];
  const newData=F.migrate(d);
  assert.deepEqual(F.migrate(newData),newData);
  assert.deepEqual(F.migrate(d),newData);
  assert.equal(before(newData,'ancien').cash,63);
  assert.equal(newData.history.length,2);
  assert.equal(newData.transactions.length,0);
  assert.throws(()=>tx(newData,'DEPOSIT',{accountId:'ancien',date:d.asOf,amount:5}),/date/);
  assert.throws(()=>tx(newData,'SPLIT',{accountId:'ancien',date:dates[2],symbol:'SNTS',brokerRef:'SPLT',ratioFrom:1,ratioTo:10,source:'avis'}),/déjà/);
});
test('FIN02 FIN05–09 : achat, PRU, frais détaillés, montant rapproché et vente partielle',()=>{
  const d=fixture(), updated=tx(d,'BUY',buy);
  assert.equal(before(updated).cash,9390);
  assert.equal(before(updated).positions.SNTS.cost,2610);
  assert.equal(before(updated,'b').cash,5000);
  for(const props of [{...buy,broker:7,actualTotal:612},{...buy,actualTotal:611},{...buy,qty:99,actualTotal:29710}])
    assert.throws(()=>tx(d,'BUY',props),/Courtage|justificatif|insuffisant/);
  assert.throws(()=>tx(updated,'BUY',buy),/déjà/);
  const sold=tx(updated,'SELL',{...buy,date:dates[2],qty:4,price:400,broker:10,other:7,tax:3,actualTotal:1580});
  assert.equal(before(sold).cash,10970);
  assert.equal(before(sold).positions.SNTS.cost,1740);
  assert.equal(before(sold).realized,710);
  assert.equal(before(sold).feesPaid,26);
  assert.equal(before(sold).taxes,4);
  assert.throws(()=>tx(updated,'SELL',{...buy,qty:50,actualTotal:14990}),/supérieure/);
});
test('FIN03 FIN04 FIN10 FIN11 : projet, réserve, exécution partielle, annulation et rapprochement',()=>{
  const d=fixture();
  const p=F.createPlan(d,{portfolioId:'p',mode:'manuel',funding:{a:500000},lines:[{accountId:'a',symbol:'SNTS',qty:4,price:300,estimateRate:.016}]});
  const oid=p.orders[0].id;
  assert.equal(before(p).cash,10000);
  assert.equal(before(p).reserved,0);
  assert.throws(()=>tx(p,'BUY',{...buy,date:F.today(),orderId:oid}),/Transmettre/);
  const sent=F.orderTransition(p,oid,'TRANSMIS','COURTIER-01');
  assert.equal(before(sent).reserved,1219.2);
  assert.throws(()=>tx(sent,'WITHDRAW',{amount:9500}),/réservations/);
  const partial=tx(sent,'BUY',{...buy,date:F.today(),orderId:oid});
  assert.equal(before(partial).cash,9390);
  assert.equal(before(partial).reserved,609.6);
  assert.equal(partial.orders[0].status,'PARTIELLEMENT EXÉCUTÉ');
  const cancel=F.orderTransition(partial,oid,'ANNULÉ','ANNUL-1');
  assert.equal(before(cancel).reserved,0);
  assert.equal(before(cancel).positions.SNTS.qty,12);
  assert.throws(()=>tx(partial,'BUY',{...buy,qty:3,actualTotal:910,date:F.today(),brokerRef:'ATT-2',orderId:oid}),/incompatible/);
  const full=tx(partial,'BUY',{...buy,date:F.today(),brokerRef:'ATT-3',orderId:oid});
  assert.equal(F.orderTransition(full,oid,'RAPPROCHÉ','SOLDE-1').orders[0].status,'RAPPROCHÉ');
});
test('FIN12–14 : rétroactivité sans solde négatif, transfert bilatéral et rectification',()=>{
  const d=fixture();
  const transfer=tx(d,'TRANSFER',{amount:500,toAccountId:'d'});
  assert.equal(before(transfer).cash,9500);
  assert.equal(before(transfer,'d').cash,500);
  assert.equal(F.calculate(transfer).all.cash,F.calculate(d).all.cash);
  assert.throws(()=>tx(d,'TRANSFER',{amount:500,toAccountId:'e'}),/même propriétaire/);
  const undo=tx(transfer,'CORRECTION',{date:dates[2],corrects:transfer.transactions[0].id});
  assert.equal(before(undo).cash,10000);
  assert.equal(before(undo,'d').cash,0);
  assert.equal(undo.transactions.length,2);
  assert.throws(()=>tx(undo,'CORRECTION',{date:dates[3],corrects:transfer.transactions[0].id,brokerRef:'AUTRE'}),/indisponible/);
  const spent=tx(d,'WITHDRAW',{amount:9990,date:dates[2]});
  assert.throws(()=>tx(spent,'FEE',{amount:100}),/à la date/);
});
test('FIN16–17 FIN21 : dividende dû sans cash, net payé une fois, FCP et VL séparés',()=>{
  const d=fixture();
  d.events.push({id:'div',accountId:'a',symbol:'SNTS',status:'DÛ',date:dates[1],source:'Avis synthétique',type:'DIVIDEND',gross:100});
  assert.equal(before(d).cash,10000);
  const paid=tx(d,'DIVIDEND',{eventId:'div',symbol:'SNTS',gross:100,tax:10,other:3});
  assert.equal(before(paid).cash,10087);
  assert.equal(before(paid).dividends,87);
  assert.equal(before(paid).grossDividends,100);
  assert.throws(()=>tx(paid,'DIVIDEND',{eventId:'div',symbol:'SNTS',gross:100,brokerRef:'DIFF'}),/déjà/);
  const l={symbol:'SALAM_CI',qty:2.5,price:100,broker:1,other:1,tax:0,actualTotal:252};
  assert.throws(()=>tx(d,'BUY',l),/prospectus/);
  Object.assign(d.instruments.SALAM_CI,{screen:'Vérifié',checked:dates[0],evidence:'Avis test',method:'Référentiel fictif',mandate:'Mandat fictif',prospectus:'Prospectus test',feeEvidence:'Grille test',distribution:'capitalizing'});
  assert.throws(()=>tx(d,'BUY',l),/valeur liquidative/);
  d.quotes.SALAM_CI={price:100,date:dates[0],basis:'manual',source:'VL fictive',kind:'FCP'};
  const fund=tx(d,'BUY',l);
  assert.equal(before(fund).positions.SALAM_CI.cost,252);
  assert.throws(()=>tx(fund,'DIVIDEND',{symbol:'SALAM_CI',gross:10,cashDistribution:true}),/hors VL/);
  const quoted=F.quoteUpdates(fund,{SALAM_CI:{price:120,date:dates[2],basis:'manual',source:'VL test',kind:'FCP'}},dates[2]).next;
  assert.equal(before(quoted).positions.SALAM_CI.market,300);
  const redeemed=tx(quoted,'SELL',{...l,qty:.5,broker:.5,actualTotal:48.5,date:dates[2]});
  assert.equal(before(redeemed).positions.SALAM_CI.qty,2);
});
test('FIN18–20 : splits successifs à valeur constante, doublon, regroupement, actions gratuites et droits',()=>{
  const d=fixture(), value=F.calculate(d).all.market;
  const split={symbol:'SNTS',ratioFrom:1,ratioTo:10,source:'Bulletin fictif'};
  const first=tx(d,'SPLIT',split);
  const second=tx(first,'SPLIT',{...split,date:dates[2],brokerRef:'SPLT-2',ratioTo:2});
  assert.equal(before(second).positions.SNTS.qty,200);
  assert.equal(F.calculate(second).all.market,value);
  assert.equal(before(second).positions.SNTS.cost,2000);
  assert.throws(()=>tx(first,'SPLIT',{...split,brokerRef:'SPLT-bis'}),/déjà/);
  assert.throws(()=>tx(second,'SPLIT',{...split,ratioFrom:3,ratioTo:1,date:dates[3],brokerRef:'SPLT-frac'}),/fraction/);
  const bonus=tx(second,'BONUS',{symbol:'SNTS',qty:5,entitlement:{underlying:'SNTS',numerator:1,denominator:10},recordDate:dates[2],date:dates[3],source:'Bulletin test'});
  const right=tx(bonus,'RIGHTS',{symbol:'DROI',qty:3,entitlement:{underlying:'SNTS',numerator:1,denominator:10},recordDate:dates[2],date:dates[3],source:'Bulletin test'});
  assert.equal(before(right).positions.SNTS.qty,205);
  assert.equal(before(right).positions.DROI.qty,3);
  assert.throws(()=>tx(bonus,'BONUS',{symbol:'SNTS',qty:5,entitlement:{underlying:'SNTS',numerator:1,denominator:10},recordDate:dates[2],date:dates[3],source:'Bulletin test',brokerRef:'BONUS-BIS'}),/déjà/);
});
test('INV01–09 INV13–14 : modes par ID, budget nul, cash réel, frais et cibles',()=>{
  const d=fixture(), original=structuredClone(d);
  const select={portfolioId:'p',accountIds:['a','b','c'],now:dates[1]};
  const p=F.propose(d,{...select,budget:500000,mode:'egalisation'});
  assert.deepEqual(d,original);
  assert.equal(p.planned,500000);
  const s=F.propose(d,{...select,budget:250000,mode:'mensuel'});
  assert.equal(s.planned,250000);
  assert.notDeepEqual(s.funding,p.funding);
  assert.ok(Math.abs(p.telecom-.45)<1e-12);
  for(const account of p.accounts) {
    assert.ok(account.cashRemaining>=0);
    assert.ok(p.lines.filter(l=>l.accountId===account.id).every(l=>Number.isInteger(l.qty)&&l.broker<=l.amount*.01&&l.symbol!=='SGBC'));
  }
  assert.equal(F.propose(d,{...select,budget:0,mode:'egalisation'}).lines.length,0);
  assert.throws(()=>F.propose(d,{...select,mode:'equilibre'}),/exactement deux/);
  assert.throws(()=>F.propose(d,{...select,accountIds:['a','e']}),/même portefeuille/);
  assert.throws(()=>F.propose(d,{...select,accountIds:['a'],mode:'manuel',budget:1,manual:{a:2}}),/supérieurs/);
  const capped=F.propose(d,{...select,mode:'equilibre',accountIds:['a','c'],budget:450});
  assert.ok(capped.lines.reduce((n,l)=>n+l.total,0)<=450);
  assert.throws(()=>tx(d,'BUY',{...buy,symbol:'SGBC'}),/dérogation/);
});
test('MKT01 MKT04–07 : format réel, alias, ancienneté, doublons, dates et suspension',()=>{
  const csv='symbol,session_date,basis,close_xof,traded,status,net_yield_pct,bulletin_date\nTTLC,2025-01-03,bulletin,4510,true,,3.1,2025-01-03\nCBIBF,2025-01-03,provisional,17500,false,suspended,,2025-01-02';
  const q=Q.parse(csv,{source:'Fixture du format brvmdata',official:true});
  assert.equal(q.TOCI.basis,'official');
  assert.equal(q.TOCI.fundamentals.yield,3.1);
  assert.equal(q.CBIB.status,'suspended');
  assert.throws(()=>Q.parse('symbol,session_date,close_xof\nSNTS,2025-02-31,-1'),/exploitable/);
  const d=F.quoteUpdates(fixture(),q,dates[1]).next;
  assert.equal(F.quoteUpdates(d,{TOCI:{...q.TOCI,date:dates[0]}},dates[1]).count,0);
  assert.equal(F.quoteUpdates(d,{TOCI:{...q.TOCI,basis:'manual'}},dates[1]).count,0);
  assert.equal(F.stale(q.TOCI,1,'2025-01-06'),false);
  assert.equal(F.stale(q.TOCI,1,'2025-01-07'),true);
  assert.throws(()=>F.quoteUpdates(d,{TOCI:{...q.TOCI,date:'2090-01-01'}},dates[1]),/future/);
});
test('PERF01–02 : TWR et XIRR selon les données, apports, projection et CSV tableur',()=>{
  const d=fixture();
  d.observations=[{portfolioId:'p',date:'2025-01-02',value:100,complete:true,attestation:'close-v1',observedAt:'2025-01-02',sources:['Test']},{portfolioId:'p',date:'2026-01-02',value:110,complete:true,attestation:'close-v1',observedAt:'2026-01-02',sources:['Test']}];
  const perf=A.performance(d,'p');
  assert.ok(Math.abs(perf.twr-.1)<1e-8);
  assert.ok(Math.abs(perf.xirr-.1)<1e-8);
  d.transactions.push({type:'DEPOSIT',accountId:'a',date:dates[3],amount:5});
  assert.equal(A.performance(d,'p').twr,null);
  assert.equal(A.performance(d,'p').gain,5);
  const project=A.project(0,250000,0,0,.016);
  assert.equal(project.values[5],14760000);
  assert.equal(project.contributed,15000000);
  assert.match(A.csv([['=1+1']]), /'=1\+1/);
});
test('ARC05 ARC06 : AES-GCM aléatoire, mauvais secret, corruption et schéma',async()=>{
  const d=fixture(), pass='Phrase de test longue', first=await V.encrypt(d,pass), second=await V.encrypt(d,pass);
  assert.notEqual(first.iv,second.iv);
  assert.notEqual(first.salt,second.salt);
  assert.notEqual(first.data,second.data);
  assert.deepEqual(await V.decrypt(first,pass),d);
  await assert.rejects(V.decrypt(first,'Mauvaise phrase'),/incorrecte/);
  await assert.rejects(V.decrypt({...first,data:(first.data[0]==='A'?'B':'A')+first.data.slice(1)},pass),/altérée/);
  assert.throws(()=>V.inspect({...d,accounts:[...d.accounts,d.accounts[0]]}),/double/);
});

test('RC2 FIN14 : annulation avec dépendances et rejeu contrôlé, sans écraser l’original',()=>{
  const d=fixture();
  const deposited=tx(d,'DEPOSIT',{amount:500});
  const spent=tx(deposited,'WITHDRAW',{date:dates[2],amount:400});
  const corrected=tx(spent,'CORRECTION',{date:dates[3],replay:true,corrects:deposited.transactions[0].id,note:'Versement saisi deux fois'});
  assert.equal(before(corrected).cash,9600);
  assert.equal(corrected.transactions.length,3);
  assert.equal(corrected.transactions[0].amount,500);
  assert.deepEqual([...A.flows(corrected,'p')],[[dates[2],-400]]);
  const used=tx(deposited,'WITHDRAW',{date:dates[2],amount:10300});
  assert.throws(()=>tx(used,'CORRECTION',{date:dates[3],replay:true,corrects:deposited.transactions[0].id,note:'Versement saisi deux fois'}),/insuffisant/);
  assert.equal(before(used).cash,200);
});

test('RC2 FIN17 : achat confirmé relié au dividende du même compte et plafonné au net',()=>{
  const d=tx(fixture(),'DIVIDEND',{symbol:'SNTS',gross:750,tax:50,other:0});
  const ref=d.transactions[0].id;
  const bought=tx(d,'BUY',{...buy,date:dates[2],reinvests:ref});
  assert.equal(F.calculate(bought).reinvested.get(ref),61000);
  assert.equal(before(bought).cash,10090);
  assert.throws(()=>tx(d,'BUY',{...buy,date:dates[2],accountId:'b',reinvests:ref}),/même compte/);
  assert.throws(()=>tx(bought,'BUY',{...buy,date:dates[3],brokerRef:'AUTRE-001',reinvests:ref}),/excède/);
  assert.throws(()=>tx(bought,'CORRECTION',{date:dates[3],replay:true,corrects:ref,note:'Dividende mal saisi'}),/requis/);
});

test('RC2 INV03 : égalisation après frais, conservation du budget sans alimenter le cash',()=>{
  const d=fixture();
  const p=F.propose(d,{portfolioId:'p',accountIds:['a','c'],mode:'equilibre',budget:30000,now:dates[1]});
  assert.equal(p.accounts.length,2);
  assert.ok(Math.abs(p.accounts[0].forecast-p.accounts[1].forecast)<1.01);
  assert.equal(p.funding.a+p.funding.c,30000);
  assert.equal(before(d).cash,10000);
});

test('RC2 MKT01 : conserve le flux contractuel lorsqu’il est autorisé ; jamais de fuite privée',async()=>{
  const headers={method:'GET',credentials:'same-origin',referrerPolicy:'no-referrer',cache:'no-store',redirect:'error'};
  const attempted=[];
  const q=await Q.online(async (url,options)=>{
    attempted.push(url);
    for(const [key,value] of Object.entries(headers)) assert.equal(options[key],value);
    if(url.endsWith('feed.json')) return Response.json({enabled:true,source:'Bulletin synthétique',authorization:'TEST-001',bulletinBasis:true});
    return new Response('symbol,session_date,basis,close_xof,traded\nTTLC,2025-01-03,bulletin,4510,true');
  });
  assert.deepEqual(attempted,['./market/feed.json','./market/latest.csv']);
  assert.equal(q.TOCI.basis,'official');
  await assert.rejects(Q.online(async url=>url.endsWith('feed.json')?
    Response.json({enabled:true,source:'Non autorisée'}) : new Response('',{status:503})),/autorisation/);
  await assert.rejects(Q.online(async url=>url.endsWith('feed.json')?
    Response.json({enabled:true,source:'Test',authorization:'TEST'}) : new Response('',{status:503})),/indisponible/);
});
test('MKT02 : source CSV directe de dernière séance (ancienne logique Vercel), lecture GET seule',async()=>{
  const csv='symbol,session_date,close_xof,basis,traded\n'+
   ['SNTS','ORAC','CIEC','TOCI','SMBC','NTLC','PALC'].map((s,i)=>
    s+','+F.today()+','+(1000+i*500)+',provisional,true').join('\n');
  const calls=[];
  const quotes=await Q.online(async (url,opt)=>{
    calls.push({url,method:opt.method,credentials:opt.credentials,mode:opt.mode});
    if(url.endsWith('/feed.json'))return Response.json({enabled:false});
    assert.equal(url,Q.URL);
    return new Response(csv,{status:200});
  });
  assert.equal(await Q.feedEnabled(),true);
  assert.equal(calls.length,2);
  assert.equal(calls[1].credentials,'omit');
  assert.equal(calls[1].mode,'cors');
  assert.equal(calls[1].method,'GET');
  assert.deepEqual(Object.keys(quotes).sort(),['CIEC','NTLC','ORAC','PALC','SMBC','SNTS','TOCI']);
  assert(quotes.SNTS.source.includes('BRVMData'));
  assert.equal(quotes.SNTS.basis,'provisional');
  assert.equal(quotes.SNTS.date,F.today());
  const d=fixture(),cash=F.calculate(d).all.cash;
  const changed=F.quoteUpdates(d,quotes).next;
  assert.equal(F.calculate(changed).all.cash,cash);
  assert.equal(changed.transactions.length,0);
});
test('MKT04 : APK Android lit le CSV hors CORS via URL native fixe, sans requête contenant des comptes',async()=>{
  const csv='symbol,session_date,close_xof,traded\n'+
    ['SNTS','ORAC','CIEC','TOCI','SMBC','NTLC','PALC'].map((sym,i)=>
      sym+',2025-01-03,'+(5000+i*100)+',true').join('\n');
  const payload=Buffer.from(csv,'utf8').toString('base64');
  let invoked=0;
  globalThis.BRVMAndroid={fetchMarketQuotes(id){
    assert.match(id,/^m[0-9]{1,10}$/);
    invoked++;
    queueMicrotask(()=>Q.receiveAndroidCsv(id,payload,''));
  }};
  try {
    const result=await Q.online(async url=>{
      assert.equal(url,'./market/feed.json');
      return Response.json({enabled:false});
    });
    assert.equal(invoked,1);
    assert.equal(result.SNTS.price,5000);
    assert.equal(result.SNTS.date,'2025-01-03');
    assert.equal(result.SNTS.basis,'provisional');
    assert.match(result.SNTS.source,/Android/);
    globalThis.BRVMAndroid={fetchMarketQuotes(id){
      queueMicrotask(()=>Q.receiveAndroidCsv(id,'','SOURCE_UNAVAILABLE'));
    }};
    await assert.rejects(Q.online(async()=>Response.json({enabled:false})),/SOURCE_UNAVAILABLE/);
  } finally {delete globalThis.BRVMAndroid;}
});
test('MKT03 : indisponibilité, source incomplète et connexion refusée ne remplacent pas les cours',async()=>{
  const bad=async url=>url.endsWith('/feed.json')?Response.json({enabled:false}):
    new Response('symbol,session_date,close_xof\nSNTS,2025-01-03,2000');
  await assert.rejects(Q.online(bad),/incomplète/);
  await assert.rejects(Q.online(async url=>{
    if(url.endsWith('/feed.json'))return Response.json({enabled:false});
    throw new TypeError('CORS failed');
  }),/CORS/);
});

test('RC2 FIN12 FIN22 : archive antérieure attestée, pièce locale et absence de double comptabilisation',()=>{
  const d=fixture(), raw={accountId:'a',date:dates[0],brokerRef:'ARCHIVE-123',note:'Relevé contrôlé',included:true};
  const reconciled=F.reconcileOpening(d,raw,{name:'preuve.txt',data:'VGVzdA=='});
  assert.equal(reconciled.transactions.length,0);
  assert.equal(reconciled.history[0].attachmentId,reconciled.attachments[0].id);
  assert.deepEqual(F.calculate(reconciled),F.calculate(d));
  assert.throws(()=>F.reconcileOpening(reconciled,raw),/déjà présent/);
  assert.throws(()=>F.reconcileOpening(d,{...raw,included:false}),/confirmation/);
  assert.throws(()=>F.reconcileOpening(d,{...raw,date:dates[1]}),/antérieur/);
});

test('RC3 MKT01 ARC06 : cours futur bloqué dans un import V2, V3 et une restauration authentique',async()=>{
  const impossible={price:999999,date:'2099-01-01',source:'Sauvegarde fictive',basis:'official'};
  const data=F.empty();data.quotes.SNTS=impossible;
  for(const read of [F.calculate,F.migrate,V.inspect]) assert.throws(()=>read(data),/future/);
  const legacy=E.empty();legacy.quotes.SNTS=impossible;
  assert.throws(()=>V.inspect(legacy),/future/);
  assert.throws(()=>F.quoteUpdates(F.empty(),{SNTS:impossible}),/future/);
  await assert.rejects(V.encrypt(data,'Phrase de test non secrète'),/future/);
  data.quotes.SNTS={...impossible,date:'2025-02-29'};
  assert.throws(()=>V.inspect(data),/invalide/);
});

test('RC3 FIN08 FIN14 : rectifier un avis rapproché restaure la réserve puis autorise le bon avis',()=>{
  const d=fixture();
  const p=F.createPlan(d,{portfolioId:'p',mode:'manuel',funding:{},lines:[{accountId:'a',symbol:'SNTS',qty:2,price:310,estimateRate:.016}]});
  const order=p.orders[0].id;
  const sent=F.orderTransition(p,order,'TRANSMIS','MANUEL-01');
  const filled=tx(sent,'BUY',{...buy,date:F.today(),orderId:order});
  const closed=F.orderTransition(filled,order,'RAPPROCHÉ','POINTAGE-01');
  const corrected=tx(closed,'CORRECTION',{date:F.today(),replay:true,corrects:filled.transactions[0].id,note:'Mauvais avis rapproché'});
  assert.equal(corrected.orders[0].status,'TRANSMIS');
  assert.equal(before(corrected).cash,10000);
  assert.equal(before(corrected).reserved,629.92);
  assert.equal(before(corrected).positions.SNTS.qty,10);
  assert.equal(corrected.transactions.length,2);
  assert.equal(corrected.orders[0].trace.at(-1).corrects,filled.transactions[0].id);
  assert.throws(()=>tx(corrected,'BUY',{...buy,date:F.today(),orderId:order}),/déjà/);
  const again=tx(corrected,'BUY',{...buy,date:F.today(),orderId:order,brokerRef:'CORRECT-01'});
  assert.equal(again.orders[0].status,'EXÉCUTÉ');
  assert.equal(before(again).cash,9390);
});

test('RC3 FIN14 FIN16 : corriger un dividende lié restaure son état et annule le net',()=>{
  const d=fixture();
  d.events.push({id:'div',accountId:'a',symbol:'SNTS',status:'DÉTACHÉ',date:dates[1],source:'Avis synthétique',type:'DIVIDEND',gross:100});
  const paid=tx(d,'DIVIDEND',{eventId:'div',symbol:'SNTS',gross:100,tax:10,other:3});
  const corrected=tx(paid,'CORRECTION',{date:dates[2],replay:true,corrects:paid.transactions[0].id,note:'Avis à annuler'});
  assert.equal(before(corrected).cash,10000);
  assert.equal(corrected.events[0].status,'DÉTACHÉ');
  const again=tx(corrected,'DIVIDEND',{date:dates[3],eventId:'div',symbol:'SNTS',gross:120,tax:12,other:3,brokerRef:'DIV-CORRECT'});
  assert.equal(again.events[0].status,'PAYÉ');
  assert.equal(before(again).cash,10105);
});

test('RC3 FIN12 : photographie corrigée sur justificatif, historique et contraintes de caisse',()=>{
  const d=fixture();
  const raw={accountId:'a',cash:12000,reserved:0,confirmed:true,brokerRef:'OUV-002',note:'Relevé original rapproché',
    position:{symbol:'SNTS',qty:12,cost:2200}};
  const spent=tx(d,'WITHDRAW',{amount:8000});
  const corrected=F.reviseOpening(spent,raw,{name:'test.txt',data:'VEVTVA=='});
  assert.equal(before(corrected).cash,4000);
  assert.equal(before(corrected).positions.SNTS.qty,12);
  assert.equal(before(corrected).netContribution,-8000);
  assert.equal(corrected.history[0].previous.cash,10000);
  assert.equal(corrected.history[0].replacement.cash,12000);
  assert.equal(F.calculate(spent).accounts[0].cash,2000);
  assert.throws(()=>F.reviseOpening(spent,{...raw,cash:7000}),/insuffisant/);
  assert.throws(()=>F.reviseOpening(corrected,raw),/déjà/);
});

test('RC3 FIN20 : contrôle de la détention à date et rapport de détachement',()=>{
  const d=fixture(), opts={symbol:'DROI',qty:2,recordDate:dates[0],date:dates[2],source:'Avis Bulletin',
    entitlement:{underlying:'SNTS',numerator:1,denominator:5}};
  assert.equal(before(tx(d,'RIGHTS',opts)).positions.DROI.qty,2);
  assert.throws(()=>tx(d,'RIGHTS',{...opts,qty:3}),/éligibles/);
  assert.throws(()=>tx(d,'RIGHTS',{...opts,accountId:'c'}),/éligibles/);
  assert.throws(()=>tx(d,'RIGHTS',{...opts,recordDate:'2024-12-31'}),/Avis quantifié/);
  const prior=tx(d,'RIGHTS',{...opts,recordDate:'2024-12-31',entitlement:{...opts.entitlement,statementQty:10,statementRef:'AVIS-2024'}});
  assert.equal(before(prior).positions.DROI.qty,2);
});

test('RC3 MKT03 PERF01 : séries alignées sur les séances, rendement sans flux et ancien historique exclu',()=>{
  const d=fixture();
  d.observations=[{portfolioId:'p',date:dates[0],value:999999,complete:true}];
  const initial=F.quoteUpdates(d,{SNTS:{price:300,date:dates[1],basis:'official',source:'Bulletin fictif'}},dates[2]).next;
  const newer=F.quoteUpdates(initial,{SNTS:{price:400,date:dates[2],basis:'official',source:'Bulletin fictif'}},dates[3]).next;
  const p=A.performance(newer,'p');
  assert.deepEqual(p.observations.map(x=>[x.date,x.observedAt]),[[dates[1],dates[2]],[dates[2],dates[3]]]);
  assert.equal(p.gain,1200);
  assert.ok(Math.abs(p.twr-(1+1200/38600-1))<1e-10);
  const replay=F.quoteUpdates(newer,{SNTS:{price:400,date:dates[2],basis:'official',source:'Bulletin fictif'}},dates[4]);
  assert.equal(replay.count,0);
  const cash=tx(newer,'DEPOSIT',{date:dates[3],amount:500});
  const corrected=F.quoteUpdates(cash,{SNTS:{price:401,date:dates[2],basis:'official',source:'Bulletin fictif'}},dates[4]).next;
  assert.equal(A.performance(corrected,'p').observations.length,2);
  assert.equal(A.performance(corrected,'p').twr,null);
});

test('ACC09 : comptes EUR et GBP natifs, taux sourcés, transfert rapproché et valorisation partielle',()=>{
  const d=fixture(), a=d.accounts[0];
  d.accounts.push({...a,id:'eur',currency:'EUR',cash:100,reserved:0,monthly:0},
    {...a,id:'gbp',currency:'GBP',cash:25,reserved:0,monthly:0});
  assert.equal(F.calculate(d).accounts.find(x=>x.id==='eur').totalXof,null);
  assert.equal(F.calculate(d).all.unknown,F.calculate(fixture()).all.unknown+2);
  const euro=F.changeRate(d,{currency:'EUR',date:dates[1],xof:655.957,source:'Parité de référence de la fixture'});
  const priced=F.changeRate(euro,{currency:'GBP',date:dates[1],xof:760,source:'Référence de la fixture'});
  const all=F.calculate(priced);
  assert.equal(all.all.total, F.calculate(fixture()).all.total+84595.7);
  const moved=tx(priced,'TRANSFER',{accountId:'eur',toAccountId:'gbp',amount:10,toAmount:8.72,
    exchange:{rate:.872,date:dates[1],source:'Bordereau fictif'}});
  assert.equal(before(moved,'eur').cash,90);
  assert.equal(before(moved,'gbp').cash,33.72);
  assert.equal(before(moved,'a').cash,before(priced,'a').cash);
  assert.throws(()=>tx(priced,'TRANSFER',{accountId:'eur',toAccountId:'gbp',amount:10,toAmount:9,
    exchange:{rate:.872,date:dates[1],source:'Bordereau fictif'}}),/concorder/);
  assert.throws(()=>F.changeRate(priced,{currency:'GBP',date:'2099-01-01',xof:760,source:'Référence'}),/Taux/);
  assert.throws(()=>tx(priced,'BUY',{...buy,accountId:'eur'}),/XOF/);
  assert.equal(A.flows(tx(priced,'DEPOSIT',{accountId:'eur',amount:2}),'p').get(dates[1]),1311.91);
  assert.equal(A.flows(tx(priced,'DEPOSIT',{accountId:'eur',date:dates[2],amount:2}),'p'),null);
});

test('ACC03 INV03 : équilibre entre deux SGI avec plusieurs comptes et identité de portefeuille',()=>{
  const d=fixture(), select={portfolioId:'p',accountIds:['a','b','c'],mode:'equilibre-sgi',budget:70000,now:dates[1]};
  const p=F.propose(d,select), forecast=new Map();
  for(const a of p.accounts) {
    const institution=d.accounts.find(x=>x.id===a.id).institutionId;
    forecast.set(institution,(forecast.get(institution)||0)+a.forecast);
  }
  assert.equal(Object.values(p.funding).reduce((a,b)=>a+b,0),70000);
  assert.ok(p.accounts.every(a=>a.cashRemaining>=0));
  assert.ok(Math.max(...forecast.values())-Math.min(...forecast.values())<=1.02);
  assert.throws(()=>F.propose(d,{...select,accountIds:['a','b']}),/deux SGI/);
  assert.throws(()=>F.propose(d,{...select,accountIds:['a','b','c','d']}),/même portefeuille/);
});

test('FIN04 FIN09 : un brouillon importé ou soumis ne devient jamais une écriture',()=>{
  const d=fixture(), p=tx(d,'DEPOSIT',{amount:500});
  p.transactions[0].status='PROJET';
  assert.throws(()=>V.inspect(p),/doit être confirmée/);
  assert.throws(()=>tx(d,'DEPOSIT',{amount:500,status:'TRANSMIS'}),/doit être confirmée/);
  assert.equal(F.calculate(d).accounts[0].cash,10000);
});

test('FIN22 : types, tailles et noms des justificatifs contrôlés',()=>{
  F.validateAttachment({name:'releve.pdf',data:btoa('%PDF-1.7 synthétique')});
  F.validateAttachment({name:'recu.txt',data:btoa('Test')});
  assert.throws(()=>F.validateAttachment({name:'releve.pdf',data:btoa('<html>')}),/extension/);
  assert.throws(()=>F.validateAttachment({name:'../recu.txt',data:btoa('Test')}),/invalide/);
  assert.throws(()=>F.validateAttachment({name:'test.txt',data:'QQ='}),/invalide/);
  F.validateAttachment({name:'limite.txt',data:btoa('x'.repeat(2*1024*1024))});
  assert.throws(()=>F.validateAttachment({name:'large.txt',data:btoa('x'.repeat(2*1024*1024+1))}),/2 Mio/);
});

test('INV11 : filtrage volontaire avec justificatif et étiquette non indépendante',()=>{
  const d=fixture();
  d.instruments.SNTS={label:'Titre fictif',kind:'ACTION',screen:'Vérifié',checked:dates[0],reviewUntil:dates[2],evidence:'Bilan fictif'};
  assert.equal(F.screening(d.instruments.SNTS,dates[1]),'Vérifié par l’utilisateur');
  assert.equal(F.screening(d.instruments.SNTS,dates[3]),'Contrôle à renouveler');
  const args={portfolioId:'p',accountIds:['a'],mode:'manuel',budget:1000,verifiedOnly:true};
  assert.ok(F.propose(d,{...args,now:dates[1]}).lines.every(x=>x.symbol==='SNTS'));
  assert.deepEqual(F.propose(d,{...args,now:dates[3]}).lines,[]);
});

test('ACC01–08 : 120 comptes de même nom, dix portefeuilles et quatre SGI',()=>{
  const d=F.empty();
  for(let i=0;i<4;i++) d.institutions.push({id:'qual-sgi-'+i,label:'SGI fictive '+i});
  for(let i=0;i<10;i++) {
    d.owners.push({id:'qual-owner-'+i,label:'Titulaire fictif'});
    d.portfolios.push({id:'qual-port-'+i,ownerId:'qual-owner-'+i,label:'Portefeuille fictif',targets:{...E.targets}});
    for(let j=0;j<12;j++) d.accounts.push({id:'qual-account-'+i+'-'+j,portfolioId:'qual-port-'+i,institutionId:'qual-sgi-'+(j%4),
      label:'Compte homonyme',currency:'XOF',cash:10+i,reserved:0,monthly:0,brokerRate:0,otherRate:0});
  }
  assert.equal(F.calculate(d).all.cash,1740);
  assert.equal(F.calculate(d).portfolios.length,10);
  d.accounts[0].archived=true;
  assert.equal(F.calculate(V.inspect(JSON.parse(JSON.stringify(d)))).accounts.length,120);
  assert.equal(F.calculate(d).accounts.find(a=>a.id==='qual-account-0-0').cash,10);
  d.accounts[0].archived=false;
  d.accounts[0].label='Anciennement homonyme';
  assert.equal(F.calculate(d).all.cash,1740);
});

test('PRIV03/04/06 : fusion sûre, répétition, impasse des conflits et sérialisation stable',()=>{
  const local=fixture();
  const incoming=F.empty();
  const owner={id:'q-2',label:'Titulaire fictif bis'};
  incoming.owners=[owner];
  incoming.portfolios=[{id:'qp-2',ownerId:owner.id,label:'Fictif bis',targets:{...E.targets}}];
  incoming.institutions=[structuredClone(local.institutions[0])];
  incoming.accounts=[{...local.accounts[0],id:'qa-2',portfolioId:'qp-2',cash:19}];
  for(const key of ['asOf','source','quotes','settings','instruments','fxRates'])
    if(Object.hasOwn(local,key)) incoming[key]=structuredClone(local[key]);
  const merged=V.merge(local,incoming);
  assert.ok(merged);
  assert.equal(merged.accounts.length,local.accounts.length+1);
  assert.equal(V.merge(merged,incoming),null);
  const reordered=Object.fromEntries(Object.entries(merged).reverse());
  assert.equal(V.merge(merged,reordered),merged);
  assert.ok(V.same({a:undefined,b:3},{b:3}));
  assert.throws(()=>V.inspect(JSON.parse('{"constructor":{},"schema":"brvm-family-v3"}')),/non autorisée/);
  assert.throws(()=>V.inspect({schema:local.schema,rest:JSON.parse('['.repeat(34)+'0'+']'.repeat(34))}),/imbriquée/);
});

test('INV11/12 : revue indépendante renseignée et dossier FCP incomplet bloqué',()=>{
  const d=fixture(), fund=d.instruments.SALAM_CI;
  const raw={accountId:'a',symbol:'SALAM_CI',qty:2.5,price:100,broker:0,other:0,tax:0,actualTotal:250,brokerRef:'FCP-TEST-3'};
  Object.assign(fund,{screen:'Revue documentée',checked:dates[0],evidence:'Pièce fictive',method:'Méthode fictive',distribution:'capitalizing'});
  assert.equal(F.screening(fund,dates[1]),'À vérifier');
  fund.reviewer='Organisme fictif';
  assert.equal(F.screening(fund,dates[1]),'Revue indépendante documentée');
  assert.throws(()=>tx(d,'BUY',raw),/prospectus/);
});

test('MKT01 : date de récupération distincte et borne des dates',()=>{
  const today=F.today();
  const quotes=Q.parse('symbol;session_date;close_xof\nSNTS;2025-01-03;123',
    {source:'Source fictive',retrievedOn:today});
  assert.equal(quotes.SNTS.retrievedOn,today);
  assert.equal(quotes.SNTS.date,'2025-01-03');
  assert.throws(()=>F.quoteUpdates(fixture(),{SNTS:{...quotes.SNTS,retrievedOn:'2024-01-02'}}),/récupération/);
});

test('MKT01/03 : lots JSON et CSV validés, doublon ancien détecté, application atomique',()=>{
  const json=(...quotes)=>JSON.stringify({schema:'brvm-cotations-v1',quotes});
  const day=dates[1], options={source:'Bulletin fictif A',official:true,retrievedOn:dates[2]};
  const row={symbol:'TTLC',date:day,price:100,basis:'official'};
  const parsed=Q.parseManual(json(row),options);
  assert.equal(parsed.TOCI.basis,'official');
  assert.equal(Q.parseManual(json(row),{...options,official:false}).TOCI.basis,'provisional');
  assert.throws(()=>Q.parseManual(json(row,{...row,date:dates[2]},{...row,symbol:'TOCI',price:200}),options),/contradictoire/);
  assert.throws(()=>Q.parseManual(json({...row,date:'2090-01-01'}),options),/future/);
  assert.throws(()=>Q.parseManual(JSON.stringify(fixture())),/Schéma de cotations/);
  assert.throws(()=>Q.parse('symbol,session_date,close_xof\nTTLC,2025-01-03,100\nTOCI,2025-01-06,120\nTTLC,2025-01-03,110'),/contradictoire/);
  const applied=F.quoteUpdates(fixture(),parsed,dates[2]).next;
  const repeat=Q.parseManual(json(row),{...options,retrievedOn:dates[3]});
  assert.equal(F.quoteUpdates(applied,repeat,dates[3]).count,0);
  const conflict=Q.parseManual(json({...row,price:110}),{...options,source:'Bulletin fictif B'});
  assert.throws(()=>F.quoteUpdates(applied,conflict,dates[3]),/Cours contradictoire/);
  assert.equal(applied.quotes.TOCI.price,100);
});

test('MKT03 : un compte ouvert après la séance ne fabrique pas de patrimoine historique',()=>{
  const d=fixture();
  d.accounts[0].openedOn=dates[2];
  const quote={SNTS:{price:220,date:dates[1],basis:'official',source:'Bulletin fictif'}};
  const earlier=F.quoteUpdates(d,quote,dates[3]).next;
  assert.equal(earlier.observations.some(o=>o.portfolioId==='p'),false);
  d.accounts[0].openedOn=dates[0];
  const observed=F.quoteUpdates(d,quote,dates[3]).next;
  assert.equal(observed.observations.some(o=>o.portfolioId==='p'),true);
});

test('FIN22 : les justificatifs synthétiques restent liés après sauvegarde chiffrée',async()=>{
  const synthetics={
    'preuve.txt':btoa('Releve fictif'),
    'preuve.pdf':btoa('%PDF-1.7\n%%EOF\n'),
    'preuve.png':Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64'),
    'preuve.jpeg':Buffer.from([255,216,255,224,0,4,255,217]).toString('base64'),
  };
  let data=fixture();
  for(const [name,bytes] of Object.entries(synthetics)) {
    data=F.record(data,{type:'DEPOSIT',accountId:'a',date:dates[1],amount:1,brokerRef:'AVIS-'+name},{name,data:bytes});
  }
  const phrase='Recette archive justificatifs fictifs';
  const restored=await V.decrypt(await V.encrypt(data,phrase),phrase);
  assert.deepEqual(restored.attachments,data.attachments);
  assert.deepEqual(restored.transactions.map(x=>x.attachmentId),data.transactions.map(x=>x.attachmentId));
  assert.equal(before(restored).cash,10004);
});

test('FIN01/FIN12 : positions répétées et mouvements antérieurs à l’ouverture refusés',()=>{
  const d=fixture();
  const duplicate=structuredClone(d);
  duplicate.positions.push(duplicate.positions[0]);
  assert.throws(()=>V.inspect(duplicate),/Position d’ouverture en double/);
  d.accounts[0].openedOn=dates[2];
  assert.throws(()=>tx(d,'DEPOSIT',{date:dates[1],amount:300}),/date/);
  assert.equal(before(tx(d,'DEPOSIT',{date:dates[2],amount:300})).cash,10300);
});

test('Scénarios : le reliquat utilise chaque plafond, frais compris',()=>{
  const d=fixture();
  const result=F.purchaseScenarios(d,{portfolioId:'p',accountId:'a',budget:8000,now:dates[4]});
  assert.deepEqual(result.scenarios.map(s=>s.cap),[4000,6000,8000]);
  assert.deepEqual(result.scenarios.map(s=>s.availableRemainder),[4000,6000,8000]);
  assert.deepEqual(result.scenarios.map(s=>s.cashAfter),[10000,10000,10000]);
  const funded=F.purchaseScenarios(fixture(),{portfolioId:'p',accountId:'a',budget:8000,now:dates[1]});
  for(const s of funded.scenarios) {
    assert.equal(s.availableRemainder,Math.round((s.cap-s.spent)*100)/100);
    assert.equal(s.cashAfter,Math.round((10000-s.spent)*100)/100);
    assert.ok(s.spent<=s.cap);
  }
});
test('Secours : GET anonyme, séance clôturée datée, alias TTLC, aucun effet sur les espèces',async()=>{
  const date=F.today(),symbols=['SNTS','ORAC','CIEC','TTLC','SMBC','NTLC','PALC',
    ...Array.from({length:35},(_,i)=>'ZZ'+String.fromCharCode(65+Math.floor(i/26))+String.fromCharCode(65+i%26))];
  const snapshot={_meta:{url:'https://www.brvm.org/fr/cours-actions/0',seance:'Fermée',maj_brvm_date:date,nb_titres:symbols.length},
    cours:Object.fromEntries(symbols.map((s,i)=>[s,{dernier:1000+i,volume:i===8?0:100}]))};
  const q=await Q.online(async (url,opt)=>{
    if(url.endsWith('/feed.json'))return Response.json({enabled:false});
    if(url===Q.URL)throw Error('CORS');
    assert.equal(url,Q.FALLBACK_URL);
    assert.equal(opt.credentials,'omit');assert.equal(opt.method,'GET');assert.equal(opt.referrerPolicy,'no-referrer');
    return Response.json(snapshot);
  });
  assert.equal(q.TOCI.price,1003);
  assert.equal(q.SNTS.date,date);
  assert.equal(q.SNTS.basis,'provisional');
  assert.equal(q.ZZAB.status,'suspended');
  const d=fixture(),cash=F.calculate(d).all.cash;
  const next=F.quoteUpdates(d,q).next;
  assert.equal(F.calculate(next).all.cash,cash);
  assert.equal(next.transactions.length,0);
  assert.throws(()=>Q.parseSession(JSON.stringify({...snapshot,_meta:{...snapshot._meta,seance:'Ouverte'}})),/clôturée/);
  assert.throws(()=>Q.parseSession(JSON.stringify({...snapshot,_meta:{...snapshot._meta,maj_brvm_date:'2025-01-01'}})),/ancienne/);
});
