/* Modèle V3. Montants du journal en XOF, calculs de trésorerie en centimes. */
(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./engine') : root.BRVMEngine);
  if (typeof module === 'object') module.exports = api;
  else root.BRVM = api;
})(globalThis, E => {
  'use strict';
  const schema = 'brvm-family-v3';
  const kinds = ['DEPOSIT','WITHDRAW','BUY','SELL','FEE','DIVIDEND','SPLIT','BONUS','RIGHTS','STOCK_DIVIDEND','RIGHTS_EXPIRY','TRANSFER','CORRECTION'];
  const pending = ['TRANSMIS','PARTIELLEMENT EXÉCUTÉ','EXÉCUTÉ'];
  const statuses = ['PROJET',...pending,'RAPPROCHÉ','ANNULÉ','NON EXÉCUTÉ'];
  const banks = new Set(['SGBC','CBIB']);
  // This applies only to the user-defined CORE targets; existing legacy holdings are preserved.
  const coreExcluded = new Set(['SGBC','CBIB','ECOC','SIBC','ETIT','BICB',
    'BOAB','BOAC','BOAF','BOAM','BOAN','BOAS','STBC']);
  const defaults = { SALAM_CI: 'FCP Salam CI', ALBARAKA2: 'FCP Al Baraka 2' };
  const copy = structuredClone;
  const id = () => globalThis.crypto.randomUUID();
  const today = () => new Date().toISOString().slice(0, 10);
  const key = (...values) => JSON.stringify(values);
  const fail = (condition, message) => { if (!condition) throw Error(message); };
  const text = (value, min = 1, max = 200) => typeof value === 'string' && value.trim().length >= min && value.length <= max;
  const num = (value, min = 0) => typeof value === 'number' && Number.isFinite(value) && value >= min;
  const date = v => typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) &&
    Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  const symbol = v => typeof v === 'string' && /^[A-Z][A-Z0-9_]{1,17}$/.test(v) && v !== 'CONSTRUCTOR' && v !== 'PROTOTYPE';
  const normalizeSymbol = v => ({ TTLC: 'TOCI', CBIBF: 'CBIB' }[v] || v);
  function eligibleCoreSymbol(d,s) {
    if(!symbol(s) || coreExcluded.has(s)) return false;
    const i=d.instruments?.[s];
    if(i?.screen==='Exclu' || (i?.kind && i.kind!=='ACTION')) return false;
    const title=String(i?.label||E.names[s]||'').normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').toUpperCase();
    return !/\b(BANQUE|BANK|ASSURANCE|TABAC|CIGARETTE|CASINO|LOTERIE|BRASSERIE)\b/.test(title);
  }
  const cent = v => {
    fail(num(v) && Number.isSafeInteger(Math.round(v * 100)) && Math.abs(v * 100 - Math.round(v * 100)) < 0.001, 'Montant XOF invalide (deux décimales maximum).');
    return Math.round(v * 100);
  };
  const currencies=['XOF','EUR','GBP','USD','CHF','CAD'];
  function validateRates(d,now) {
    if(d.fxRates===undefined) return;
    fail(Array.isArray(d.fxRates),'Taux de change invalides.');
    const seen=new Set();
    for(const r of d.fxRates) {
      const k=key(r.currency,r.date);
      fail(currencies.includes(r.currency)&&r.currency!=='XOF'&&date(r.date)&&r.date<=now&&
        num(r.xof,0.000001)&&r.xof<=1000000&&text(r.source,1,500)&&!seen.has(k),'Taux de change daté ou source invalide.');
      seen.add(k);
    }
  }
  function fxRate(d,currency,day=today(),exact=false) {
    if(currency==='XOF') return {xof:1,date:day,source:'Devise comptable BRVM'};
    return (d.fxRates||[]).filter(r=>r.currency===currency&&(exact?r.date===day:r.date<=day))
      .sort((a,b)=>b.date.localeCompare(a.date))[0]||null;
  }
  function changeRate(d,r) {
    const next=copy(d);
    next.fxRates=(next.fxRates||[]).filter(x=>x.currency!==r.currency||x.date!==r.date).concat(copy(r));
    calculate(next);
    // A changed conversion cannot retroactively claim attested performance.
    for(const o of next.observations) if(o.date===r.date&&next.accounts.some(a=>a.portfolioId===o.portfolioId&&a.currency===r.currency)) o.complete=false;
    return next;
  }
  const quoteRank = { theoretical: 0, execution: 0, manual: 1, provisional: 2, official: 3 };
  const refs = values => new Map(values.map(v => [v.id, v]));
  const compareDate = (a,b) => a.date.localeCompare(b.date);
  const empty = () => ({
    schema, asOf: '', source: 'Saisie locale', owners: [], portfolios: [], institutions: [], accounts: [], positions: [],
    quotes: {}, quoteHistory: {}, transactions: [], history: [], orders: [], plans: [], events: [], observations: [], attachments: [],
    instruments: Object.fromEntries(Object.entries(defaults).map(([s,label]) => [s,{kind:'FCP',label,distribution:'unknown',screen:'À vérifier'}])),
    settings: { staleDays: 5 }
  });
  function migrate(data) {
    if (data?.schema === schema) { validate(data); return copy(data); }
    E.validate(data);
    const d = empty();
    d.asOf = data.asOf || '';
    d.source = data.source || d.source;
    const owners = [...new Set([...(data.owners || []), ...data.accounts.map(a => a.owner)])];
    for (const [index, label] of owners.entries()) {
      const ownerId = 'v2-person-' + index;
      d.owners.push({id:ownerId,label});
      d.portfolios.push({id:'v2-portfolio-' + index,ownerId,label,targets:copy(data.settings?.targets || E.targets)});
    }
    for (const [index, label] of [...new Set(data.accounts.map(a => a.sgi))].entries())
      d.institutions.push({id:'v2-sgi-' + index,label});
    const monthlyDefaults = new Set();
    d.accounts = data.accounts.map(a => {
      const portfolioId = d.portfolios[owners.indexOf(a.owner)].id;
      const monthlyKey = key(portfolioId, a.sgi);
      const monthly = monthlyDefaults.has(monthlyKey) ? 0 : a.sgi === 'FGI' ? data.settings?.monthlyFGI ?? 100000
        : a.sgi === 'CGF' ? data.settings?.monthlyCGF ?? 150000 : 0;
      monthlyDefaults.add(monthlyKey);
      return {id:a.id,portfolioId,institutionId:d.institutions.find(i => i.label===a.sgi).id,
        label:'',currency:'XOF',cash:a.cash ?? 0,reserved:a.reserved ?? 0,monthly,brokerRate:.01,
        otherRate:Math.max(0,(data.settings?.feesRate ?? .016)-.01)};
    });
    d.positions = copy(data.positions);
    d.history = copy(data.history || []);
    d.plans = copy(data.plans || []);
    for (const [s,q] of Object.entries(data.quotes || {})) {
      d.quotes[s]={...q, basis:q.adjustedBySplit?'theoretical':Object.hasOwn(quoteRank,q.basis)?q.basis:'manual'};
      if (q.adjustedBySplit) {
        const latest = (data.transactions || []).filter(t => t.type==='SPLIT' && t.symbol===s).slice().sort(compareDate).at(-1);
        if (latest) d.quotes[s].adjustedThrough = latest.date;
      }
    }
    for (const [i, t] of (data.transactions || []).entries()) {
      if (t.status !== 'CONFIRMED') { d.history.push(copy(t)); continue; }
      d.transactions.push({...copy(t), id:t.id || 'v2-tx-'+i, legacy:true,
        eventRef:t.type==='SPLIT'?key(t.symbol,t.date):undefined});
    }
    for (const p of data.quoteHistory || []) {
      const portfolio = d.portfolios[owners.indexOf(p.owner)];
      if (portfolio && date(p.date) && num(p.total))
        d.observations.push({portfolioId:portfolio.id,date:p.date,value:p.total,legacy:true});
    }
    validate(d);
    return d;
  }
  const attachmentSignature={
    pdf:[37,80,68,70,45],png:[137,80,78,71,13,10,26,10],jpg:[255,216,255],jpeg:[255,216,255]
  };
  function validateAttachment(a) {
    const ext=typeof a?.name==='string'?a.name.toLowerCase().split('.').at(-1):'';
    fail(text(a?.name,1,180)&&!/[\\/\u0000-\u001f\u007f]/.test(a.name)&&
      (ext==='txt'||Object.hasOwn(attachmentSignature,ext))&&typeof a.data==='string'&&a.data.length>0&&
      a.data.length<=2796204&&a.data.length%4===0&&/^[A-Za-z0-9+/]+={0,2}$/.test(a.data),
      'Pièce locale invalide, format ou taille non pris en charge.');
    const size=a.data.length/4*3-(a.data.endsWith('==')?2:a.data.endsWith('=')?1:0);
    fail(size<=2*1024*1024,'Pièce locale supérieure à 2 Mio.');
    const signature=attachmentSignature[ext];
    if(signature) {
      const prefix=atob(a.data.slice(0,12));
      fail(signature.every((byte,i)=>prefix.charCodeAt(i)===byte),'Le fichier ne correspond pas à son extension.');
    }
  }
  function validate(d) {
    fail(d && d.schema === schema, 'Schéma de sauvegarde inconnu.');
    for (const name of ['owners','portfolios','institutions','accounts','positions','transactions','history','orders','plans','events','observations','attachments'])
      fail(Array.isArray(d[name]), 'Structure de sauvegarde incomplète.');
    const current=today();
    validateRates(d,current);
    fail(!d.asOf || date(d.asOf) && d.asOf<=current, 'Date de photographie invalide ou future.');
    const index = {};
    for (const name of ['owners','portfolios','institutions','accounts','transactions','orders','events','attachments']) {
      index[name] = refs(d[name]);
      fail(index[name].size===d[name].length && d[name].every(x => text(x.id,1,180)), 'Identifiant absent ou en double.');
    }
    for (const x of [...d.owners,...d.portfolios,...d.institutions]) fail(text(x.label), 'Nom requis.');
    for (const p of d.portfolios) {
      fail(index.owners.has(p.ownerId), 'Propriétaire inconnu.');
      fail(p.targets && typeof p.targets==='object' && !Array.isArray(p.targets) &&
        Object.keys(p.targets).length>=1 && Object.keys(p.targets).length<=12 &&
        Object.entries(p.targets).every(([s,v])=>symbol(s) &&
          s===normalizeSymbol(s) && !banks.has(s) && num(v) && v<=1) &&
        Math.abs(Object.values(p.targets).reduce((n,v)=>n+v,0)-1)<0.000001,
        'Actions CORE invalides, exclues, en doublon ou pondérations différentes de 100 %.');
    }
    for (const a of d.accounts) {
      fail(index.portfolios.has(a.portfolioId) && index.institutions.has(a.institutionId), 'Compte orphelin.');
      fail(currencies.includes(a.currency) && typeof a.label==='string' && a.label.length<=200, 'Devise ou compte invalide.');
      fail(!a.openedOn||date(a.openedOn)&&a.openedOn<=current,'Date d’ouverture invalide.');
      fail(cent(a.cash)>=cent(a.reserved), 'Réserve supérieure au cash initial.');
      fail(num(a.brokerRate) && a.brokerRate<=.01 && num(a.otherRate) && a.otherRate<=.10, 'Taux de frais invalide.');
      cent(a.monthly);
    }
    const openingPositions=new Set();
    for (const p of d.positions) {
      const positionId=key(p.accountId,normalizeSymbol(p.symbol));
      fail(!openingPositions.has(positionId),'Position d’ouverture en double.');
      openingPositions.add(positionId);
      fail(index.accounts.get(p.accountId)?.currency==='XOF' && symbol(p.symbol) && num(p.qty) && (isFund(d,p.symbol) || Number.isSafeInteger(p.qty)), 'Position initiale invalide : titres sur compte XOF uniquement.');
      fail(p.qty>0 || p.cost===0, 'Coût sans position.');
      cent(p.cost);
    }
    fail(d.quotes && typeof d.quotes === 'object' && !Array.isArray(d.quotes) && d.instruments && typeof d.instruments === 'object' &&
      (d.settings?.autoQuotes===undefined||typeof d.settings.autoQuotes==='boolean') && Number.isInteger(d.settings?.staleDays) && d.settings.staleDays>=1 && d.settings.staleDays<=365, 'Paramètres de marché invalides.');
    for (const [s,q] of Object.entries(d.quotes)) validateQuote(s,q,current);
    if(d.quoteHistory!==undefined) {
      fail(d.quoteHistory && typeof d.quoteHistory==='object' && !Array.isArray(d.quoteHistory),'Historique de cours mal formé.');
      for(const [symbol,list] of Object.entries(d.quoteHistory)) {
        fail(Array.isArray(list) && list.length<=400 && symbol && list.every((point,index)=>
          (!index || list[index-1].date<point.date)),'Historique de cotations incohérent.');
        for(const point of list) validateQuote(symbol,point,current);
      }
    }
    if(d.settings?.coreReviews!==undefined) {
      fail(d.settings.coreReviews && typeof d.settings.coreReviews==='object' && !Array.isArray(d.settings.coreReviews),
        'Suivi CORE invalide.');
      for(const [id,state] of Object.entries(d.settings.coreReviews)) fail(index.portfolios.has(id) &&
        state && date(state.reviewedOn) && state.reviewedOn<=current && state.reviewedOn>='2026-11-23',
        'Date ou portefeuille de revue CORE invalide.');
    }
    for (const [s,i] of Object.entries(d.instruments))
      fail(symbol(s) && i && text(i.label) && ['FCP','ACTION','DROIT'].includes(i.kind) &&
        (!i.distribution || ['unknown','capitalizing','distributing'].includes(i.distribution)) &&
        (!i.reviewUntil||date(i.reviewUntil)&&date(i.checked)&&i.reviewUntil>=i.checked), 'Instrument invalide.');
    const removed=correctionTargets(d);
    const seenEvents=new Set();
    for (const e of d.events) {
      const k=key(e.accountId,e.symbol,e.date,e.type);
      fail(index.accounts.get(e.accountId)?.currency==='XOF' && symbol(e.symbol) && date(e.date) && e.type==='DIVIDEND' &&
        ['ANNONCÉ','DÉTACHÉ','DÛ','PAYÉ'].includes(e.status) && text(e.source) && !seenEvents.has(k), 'Événement invalide ou en double.');
      seenEvents.add(k);
      cent(e.gross);
      const paid=d.transactions.some(t=>t.eventId===e.id && t.type==='DIVIDEND' && !removed.has(t.id));
      fail((e.status==='PAYÉ')===paid,'État du dividende incompatible avec le journal.');
    }
    for(const a of d.attachments) validateAttachment(a);
    for(const h of d.history) if(h.attachmentId)
      fail(index.attachments.has(h.attachmentId),'Justificatif d’archive absent.');
    const sessions=new Set();
    for (const o of d.observations) {
      if(o.attestation==='close-v1') {
        const session=key(o.portfolioId,o.date);
        fail(!sessions.has(session),'Observation de séance en double.');
        sessions.add(session);
      }
      fail(index.portfolios.has(o.portfolioId) && date(o.date) && o.date<=current && num(o.value) && (o.legacy || typeof o.complete==='boolean') &&
        (!o.attestation || o.attestation==='close-v1' && date(o.observedAt) && o.date<=o.observedAt && o.observedAt<=current &&
          Array.isArray(o.sources) && o.sources.length>0 && o.sources.every(s=>text(s,1,500))),
        'Observation de performance invalide.');
    }
    for (const o of d.orders) {
      fail(index.accounts.get(o.accountId)?.currency==='XOF' && symbol(o.symbol) && Number.isSafeInteger(o.qty) && o.qty>0 &&
        num(o.limit,.01) && (!o.side || ['BUY','SELL'].includes(o.side)) && statuses.includes(o.status) && date(o.date) && Array.isArray(o.trace), 'Ordre invalide.');
      cent(o.limit);
    }
    return index;
  }
  function isFund(d,s) { return d.instruments?.[s]?.kind==='FCP'; }
  function validateQuote(s,q,maximum=today()) {
    fail(symbol(s) && q && date(q.date) && num(q.price,.000000001) && text(q.source,1,500) && (!q.status || ['active','reference','suspended'].includes(q.status)) &&
      Object.hasOwn(quoteRank,q.basis), 'Cours, source ou date invalide.');
    fail(q.date<=maximum,'Date de cotation future.');
    fail(!q.adjustedThrough||date(q.adjustedThrough)&&q.adjustedThrough<=maximum,'Date d’ajustement de cours invalide.');
    fail(!q.retrievedOn||date(q.retrievedOn)&&q.retrievedOn>=q.date&&q.retrievedOn<=maximum, 'Date de récupération invalide.');
  }
  function tradeAmounts(t) {
    const gross=cent(Math.round(t.qty*t.price*100)/100);
    const fees=t.legacy ? cent(t.fees || 0) : cent(t.broker)+cent(t.other)+cent(t.tax);
    return {gross,fees,total:t.type==='BUY'?gross+fees:gross-fees};
  }
  function validateTx(d,t,entities,removed=false) {
    fail(kinds.includes(t.type) && entities.accounts.has(t.accountId) && date(t.date) &&
      (!d.asOf || t.date>d.asOf) && (!entities.accounts.get(t.accountId).openedOn || t.date>=entities.accounts.get(t.accountId).openedOn) && t.date<=today() && text(t.brokerRef,4,180), 'Écriture, date ou référence invalide.');
    fail(t.status===undefined || t.status==='CONFIRMED','Une écriture réelle doit être confirmée.');
    if(!['DEPOSIT','WITHDRAW','FEE','TRANSFER','CORRECTION'].includes(t.type))
      fail(entities.accounts.get(t.accountId).currency==='XOF','Les titres et opérations BRVM se traitent sur un compte XOF.');
    if(t.attachmentId) fail(entities.attachments.has(t.attachmentId), 'Pièce liée absente.');
    if(t.eventId) {
      const event=entities.events.get(t.eventId);
      fail(event && event.accountId===t.accountId && event.symbol===t.symbol && t.date>=event.date && (removed || event.status==='PAYÉ'),
        'Paiement incompatible avec le calendrier.');
    }
    if(['BUY','SELL','DIVIDEND','SPLIT','BONUS','RIGHTS','STOCK_DIVIDEND','RIGHTS_EXPIRY'].includes(t.type))
      fail(symbol(t.symbol), 'Titre invalide.');
    if(['DEPOSIT','WITHDRAW','FEE','TRANSFER'].includes(t.type)) fail(cent(t.amount)>0,'Montant positif obligatoire.');
    if(t.type==='FEE' && t.feeCategory!==undefined) fail(['tenue','virement','taxe','autre'].includes(t.feeCategory),'Catégorie de frais inconnue.');
    if(['BUY','SELL','BONUS','RIGHTS','STOCK_DIVIDEND','RIGHTS_EXPIRY'].includes(t.type))
      fail(num(t.qty,.000001) && (isFund(d,t.symbol) || Number.isSafeInteger(t.qty)), 'Quantité invalide pour cet instrument.');
    if(['BUY','SELL'].includes(t.type)) {
      fail(cent(t.price)>0,'Cours d’exécution positif obligatoire.');
      const a=tradeAmounts(t);
      if(!t.legacy) {
        fail(cent(t.broker)<=Math.floor(a.gross/100), 'Courtage supérieur au plafond de 1 %.');
        fail(cent(t.actualTotal)===a.total,'Montant du justificatif différent du montant calculé.');
      }
      fail(a.total>=0,'Montant net négatif.');
    }
    if(t.type==='DIVIDEND') {
      fail(cent(t.gross)>0 && cent(t.gross)>=cent(t.tax || 0)+cent(t.other ?? t.fees ?? 0),'Montant net du dividende invalide.');
      if(!t.legacy && isFund(d,t.symbol)) fail(t.cashDistribution===true && d.instruments[t.symbol].distribution!=='capitalizing','Un FCP nécessite une distribution en cash attestée hors VL.');
      if(t.dividendBasis) {
        const b=t.dividendBasis;
        fail(date(b.recordDate)&&b.recordDate<=t.date&&
          Number.isSafeInteger(b.eligibleQty)&&b.eligibleQty>0&&cent(b.grossPerShare)>0&&
          b.eligibleQty*cent(b.grossPerShare)===cent(t.gross),
          'Dividende par action : quantité éligible, montant brut unitaire et date incohérents.');
      }
    }
    if(t.type==='SPLIT')
      fail(Number.isSafeInteger(t.ratioFrom) && Number.isSafeInteger(t.ratioTo) && t.ratioFrom>0 && t.ratioTo>0 &&
        t.ratioFrom!==t.ratioTo && (t.legacy || text(t.source)), 'Ratio ou source du fractionnement invalide.');
    if(['BONUS','RIGHTS','STOCK_DIVIDEND'].includes(t.type) && !t.legacy)
      fail(date(t.recordDate) && t.recordDate<=t.date && text(t.source),'Date d’enregistrement et source requises.');
    if(t.type==='RIGHTS_EXPIRY') {
      const wasRight=d.instruments[t.symbol]?.kind==='DROIT' ||
        d.transactions.some(x=>x.type==='RIGHTS'&&x.symbol===t.symbol&&x.accountId===t.accountId&&x.date<=t.date);
      fail(wasRight && text(t.source),'Expiration : droit identifié et avis du courtier exigés.');
    }
    if(t.type==='TRANSFER') {
      const from=entities.accounts.get(t.accountId), to=entities.accounts.get(t.toAccountId);
      fail(to && (!to.openedOn||t.date>=to.openedOn) && from.id!==to.id && entities.portfolios.get(from.portfolioId).ownerId===entities.portfolios.get(to.portfolioId).ownerId,
        'Le transfert exige deux comptes distincts du même propriétaire.');
      if(from.currency!==to.currency) {
        const x=t.exchange;
        fail(x&&num(x.rate,0.000001)&&x.rate<=1000000&&text(x.source,4)&&date(x.date)&&x.date<=t.date&&
          cent(t.toAmount)>0&&cent(t.toAmount)===Math.round(cent(t.amount)*x.rate),
          'Transfert de devises : montant reçu, taux, date et référence du change doivent concorder.');
      } else fail(!t.exchange && (t.toAmount===undefined||t.toAmount===t.amount),'Transfert de même devise : débit et crédit doivent correspondre.');
    }
  }
  const correctionTargets=d=>new Set(d.transactions.filter(t=>t.type==='CORRECTION'&&t.replay===true).map(t=>t.corrects));
  const correctable=['DEPOSIT','WITHDRAW','FEE','TRANSFER','BUY','SELL','DIVIDEND','BONUS','RIGHTS','STOCK_DIVIDEND','RIGHTS_EXPIRY'];
  function ledger(d, entities=validate(d), through=null) {
    const accounts = new Map(d.accounts.map(a=>[a.id,{...a,cash:cent(a.cash),openingReserved:cent(a.reserved),
      market:0,cost:0,realized:0,dividends:0,grossDividends:0,feesPaid:0,netContribution:0,transferred:0,taxes:0,positions:Object.create(null)}]));
    function position(a,s) { return a.positions[s] ??= {symbol:s,qty:0,cost:0}; }
    for(const p of d.positions) {
      const s=position(accounts.get(p.accountId),p.symbol);
      s.qty+=p.qty;
      s.cost+=cent(p.cost);
    }
    const removed=new Set();
    for(const t of d.transactions.filter(x=>x.type==='CORRECTION'&&x.replay===true)) {
      const original=entities.transactions.get(t.corrects);
      fail(original && original.accountId===t.accountId && original.date<=t.date &&
        correctable.includes(original.type) && !removed.has(original.id) &&
        !d.transactions.some(x=>x.type==='CORRECTION'&&x!==t&&x.corrects===original.id) && text(t.note,5),
        'Rectification impossible pour cette écriture. Le motif est obligatoire.');
      removed.add(original.id);
    }
    const reinvested=new Map();
    const seen=new Set(), seenEvents=new Set(), executed=new Map(), effects=new Map(), lastTouch=new Map(), corrected=new Set();
    const accountIdsFor = t => t.type==='TRANSFER' ? [t.accountId,t.toAccountId] : [t.accountId];
    for(const t of d.transactions.slice().sort(compareDate)) {
      if(through&&t.date>through) break;
      validateTx(d,t,entities,removed.has(t.id));
      const ref=key(t.accountId,t.brokerRef.toUpperCase(),t.symbol || '');
      fail(!seen.has(ref),'Référence déjà enregistrée pour ce compte et ce titre.');
      seen.add(ref);
      if(removed.has(t.id)||(t.type==='CORRECTION'&&t.replay===true)) continue;
      const a=accounts.get(t.accountId), s=t.symbol ? position(a,t.symbol) : null;
      const affected=accountIdsFor(t);
      if(t.eventId) {
        fail(!seenEvents.has(t.eventId),'Distribution déjà payée.');
        seenEvents.add(t.eventId);
      }
      if(t.type==='SPLIT') {
        const k=key(t.accountId,'SPLIT',t.symbol,t.date);
        fail(!seenEvents.has(k),'Fractionnement déjà appliqué.');
        seenEvents.add(k);
      }
      if(['BONUS','RIGHTS','STOCK_DIVIDEND','DIVIDEND'].includes(t.type) && !t.legacy) {
        const k=key(t.accountId,t.type,t.symbol,t.recordDate || t.date);
        fail(!seenEvents.has(k),'Distribution ou événement déjà enregistré pour cette date.');
        seenEvents.add(k);
      }
      effects.set(t.id,affected.map(accountId=>copy(accounts.get(accountId))));
      switch(t.type) {
        case 'DEPOSIT': a.cash+=cent(t.amount); a.netContribution+=cent(t.amount); break;
        case 'WITHDRAW': a.cash-=cent(t.amount); a.netContribution-=cent(t.amount); break;
        case 'FEE': a.cash-=cent(t.amount); a.feesPaid+=cent(t.amount); break;
        case 'TRANSFER': {
          const other=accounts.get(t.toAccountId), amount=cent(t.amount);
          a.cash-=amount; a.transferred-=amount;
          const received=cent(t.toAmount??t.amount);
          other.cash+=received; other.transferred+=received;
          break;
        }
        case 'BUY':
        case 'SELL': {
          const v=tradeAmounts(t);
          const tax=cent(t.tax||0);
          a.feesPaid+=v.fees-Math.min(tax,v.fees);
          a.taxes+=tax;
          if(t.reinvests) {
            const dividend=entities.transactions.get(t.reinvests);
            fail(t.type==='BUY' && dividend?.type==='DIVIDEND' && dividend.accountId===a.id &&
              effects.has(dividend.id) && !corrected.has(dividend.id),'Dividende reçu du même compte requis pour réinvestir.');
            const net=cent(dividend.gross)-cent(dividend.tax||0)-cent(dividend.other??dividend.fees??0);
            const used=(reinvested.get(dividend.id)||0)+v.total;
            fail(used<=net,'Le réinvestissement excède le dividende net disponible.');
            reinvested.set(dividend.id,used);
          }
          if(t.type==='BUY') { a.cash-=v.total; s.qty+=t.qty; s.cost+=v.total; }
          else {
            fail(s.qty+1e-9>=t.qty,'Vente supérieure à la quantité détenue.');
            const released=Math.abs(t.qty-s.qty)<1e-9 ? s.cost : Math.round(s.cost*t.qty/s.qty);
            a.cash+=v.total; a.realized+=v.total-released;
            s.qty=Math.max(0,s.qty-t.qty); s.cost-=released;
          }
          if(t.orderId) {
            const o=entities.orders.get(t.orderId);
            const filled=(executed.get(t.orderId)||0)+t.qty;
            fail(o && t.type===(o.side||'BUY') && o.accountId===t.accountId && o.symbol===t.symbol &&
              t.date>=(o.transmittedDate||o.date) && filled<=o.qty,'Avis incompatible avec la quantité, la date ou le compte de l’ordre.');
            executed.set(o.id,filled);
          }
          break;
        }
        case 'DIVIDEND': {
          const gross=cent(t.gross), tax=cent(t.tax||0), fees=cent(t.other ?? t.fees ?? 0);
          const net=gross-tax-fees;
          a.cash+=net; a.grossDividends+=gross; a.dividends+=net; a.taxes+=tax; a.feesPaid+=fees;
          break;
        }
        case 'SPLIT':
          fail(s.qty>0,'Fractionnement sans position détenue à la date effective.');
          s.qty=s.qty*t.ratioTo/t.ratioFrom;
          fail(Number.isSafeInteger(s.qty),'Le regroupement créerait une fraction non rapprochée.');
          break;
        case 'BONUS':
        case 'RIGHTS':
        case 'STOCK_DIVIDEND': s.qty+=t.qty; break;
        case 'RIGHTS_EXPIRY': {
          fail(s.qty+1e-9>=t.qty,'Expiration supérieure aux droits détenus.');
          const released=Math.abs(t.qty-s.qty)<1e-9?s.cost:Math.round(s.cost*t.qty/s.qty);
          s.qty=Math.max(0,s.qty-t.qty);
          s.cost-=released;
          a.realized-=released; // Book value written off; no invented cash
          break;
        }
        case 'CORRECTION': {
          const original=entities.transactions.get(t.corrects);
          fail(original && !['SPLIT','CORRECTION'].includes(original.type) && !original.eventId &&
            !original.orderId && !corrected.has(original.id) && original.accountId===t.accountId &&
            accountIdsFor(original).every(x=>lastTouch.get(x)===original.id), 'Rectification indisponible après des écritures dépendantes ou liées à un ordre/événement.');
          for(const snapshot of effects.get(original.id)) {
            accounts.set(snapshot.id,snapshot);
            lastTouch.set(snapshot.id,t.id);
          }
          corrected.add(original.id);
          break;
        }
      }
      for(const x of affected) {
        const account=accounts.get(x);
        fail(Number.isSafeInteger(account.cash) && account.cash>=account.openingReserved,'Cash disponible insuffisant à la date de l’écriture.');
        lastTouch.set(x,t.id);
      }
    }
    return {accounts,executed,reinvested};
  }
  function validateEntitlements(d, entities) {
    const removed=correctionTargets(d), balances=new Map();
    for(const t of d.transactions.filter(t=>t.type==='DIVIDEND'&&t.dividendBasis&&!removed.has(t.id))) {
      const basis=t.dividendBasis;
      if(!d.asOf||basis.recordDate<d.asOf) {
        fail(text(basis.statementRef,4,180),
          'Avis du courtier requis pour un dividende dont la date d’éligibilité précède la photographie.');
      } else {
        if(!balances.has(basis.recordDate))
          balances.set(basis.recordDate,ledger(d,entities,basis.recordDate).accounts);
        const eligible=balances.get(basis.recordDate).get(t.accountId)?.positions[t.symbol]?.qty||0;
        fail(basis.eligibleQty<=eligible,
          'Dividende : quantité éligible supérieure aux titres détenus à la date d’enregistrement.');
      }
    }
    for(const t of d.transactions.filter(t=>t.entitlement&&!removed.has(t.id))) {
      const e=t.entitlement;
      fail(['BONUS','RIGHTS','STOCK_DIVIDEND'].includes(t.type) && symbol(e.underlying) &&
        Number.isSafeInteger(e.numerator) && e.numerator>0 && Number.isSafeInteger(e.denominator) && e.denominator>0 &&
        date(t.recordDate) && t.recordDate<t.date,'Attribution : titre d’origine, ratio et date préalable requis.');
      let eligible;
      if(!d.asOf||t.recordDate<d.asOf) {
        fail(Number.isSafeInteger(e.statementQty) && e.statementQty>=0 && text(e.statementRef,4),
          'Avis quantifié requis pour la date antérieure à la photographie.');
        eligible=e.statementQty;
      } else {
        if(!balances.has(t.recordDate)) balances.set(t.recordDate,ledger(d,entities,t.recordDate).accounts);
        eligible=balances.get(t.recordDate).get(t.accountId)?.positions[e.underlying]?.qty||0;
      }
      const cap=Math.floor(eligible*e.numerator/e.denominator);
      fail(Number.isSafeInteger(cap) && t.qty<=cap,'Quantité supérieure aux titres effectivement éligibles.');
    }
  }
  function calculate(d) {
    const entities=validate(d);
    const {accounts,executed,reinvested}=ledger(d,entities);
    validateEntitlements(d,entities);
    const reserves=new Map();
    for(const o of d.orders) {
      const q=executed.get(o.id)||0;
      fail((o.status!=='PROJET'||q===0) && (o.status!=='TRANSMIS'||q===0) &&
        (o.status!=='PARTIELLEMENT EXÉCUTÉ'||q>0&&q<o.qty) &&
        (!['EXÉCUTÉ','RAPPROCHÉ'].includes(o.status)||q===o.qty) &&
        (o.status!=='NON EXÉCUTÉ'||q===0),'Statut d’ordre incohérent avec les exécutions.');
      if(pending.includes(o.status)) {
        const remaining=o.qty-q, a=entities.accounts.get(o.accountId);
        if(o.side==='SELL') {
          const shareKey=key(a.id,o.symbol), committed=(reserves.get(shareKey)||0)+remaining;
          fail(committed<=((accounts.get(a.id).positions[o.symbol]?.qty)||0),'Ordres de vente supérieurs aux actions détenues et non encore vendues.');
          reserves.set(shareKey,committed);
        } else {
          const reserve=Math.round(cent(o.limit)*remaining*(1+(o.estimateRate ?? a.brokerRate+a.otherRate)));
          fail(Number.isSafeInteger(reserve) && reserve>=0,'Réserve d’ordre invalide.');
          reserves.set(a.id,(reserves.get(a.id)||0)+reserve);
        }
      }
    }
    const splits=new Map();
    for(const t of d.transactions.filter(t=>t.type==='SPLIT')) {
      const events=splits.get(t.symbol)||new Map();
      events.set(t.date,t);
      splits.set(t.symbol,events);
    }
    for(const a of accounts.values()) {
      const reserved=a.openingReserved+(reserves.get(a.id)||0);
      fail(a.cash>=reserved,'Cash disponible insuffisant après réservations des autres ordres.');
      a.reserved=reserved/100; a.available=(a.cash-reserved)/100;
      a.unknown=0;
      for(const p of Object.values(a.positions)) {
        const q=d.quotes[p.symbol];
        p.price=q?.price || 0;
        for(const t of splits.get(p.symbol)?.values() || [])
          if(q && t.date>q.date && (!q.adjustedThrough || t.date>q.adjustedThrough)) p.price*=t.ratioFrom/t.ratioTo;
        p.quote=q;
        p.market=Math.round(p.price*p.qty*100)/100;
        p.cost/=100;
        p.pnl=p.price ? p.market-p.cost : null;
        a.market+=p.market;
        a.cost+=p.cost;
        if(!p.price && p.qty>0) a.unknown++;
      }
      for(const f of ['cash','dividends','grossDividends','feesPaid','taxes','realized','netContribution','transferred']) a[f]/=100;
      a.pnl=Object.values(a.positions).reduce((n,p)=>n+(p.pnl??0),0);
      a.total=a.market+a.cash;
    }
    const summaries=new Map();
    const rows=[...accounts.values()];
    for(const a of rows) {
      a.rate=fxRate(d,a.currency);
      a.totalXof=a.rate?Math.round(a.total*a.rate.xof*100)/100:null;
      if(!a.rate&&a.cash) a.unknown++;
    }
    function sum(list) {
      return Object.fromEntries(['total','market','cost','cash','reserved','available','pnl','realized','dividends','grossDividends','feesPaid','taxes','netContribution','unknown']
        .map(f=>[f,Math.round(list.reduce((n,a)=>n+a[f]*(f==='unknown'?1:a.rate?.xof||0),0)*100)/100]));
    }
    for(const [name, values] of Object.entries({portfolios:d.portfolios,owners:d.owners,institutions:d.institutions})) {
      summaries.set(name,values.map(v=>{
        const list=rows.filter(a=>name==='portfolios'?a.portfolioId===v.id:name==='institutions'?a.institutionId===v.id:entities.portfolios.get(a.portfolioId).ownerId===v.id);
        return {...v,...sum(list),accounts:list};
      }));
    }
    return {accounts:rows,all:sum(rows),portfolios:summaries.get('portfolios'),owners:summaries.get('owners'),institutions:summaries.get('institutions'),executed,reinvested};
  }
  function reconcileOpening(d, raw, attachment) {
    const next=copy(d), account=next.accounts.find(x=>x.id===raw.accountId);
    const ref=String(raw.brokerRef||'').trim(), effective=raw.date;
    fail(account && date(next.asOf) && date(effective) && effective<=next.asOf &&
      text(ref,4,180) && text(raw.note,5) && raw.included===true,
      'Rapprochement antérieur : compte, date, justificatif et confirmation de l’inclusion requis.');
    fail(!next.history.some(x=>x.accountId===account.id && [x.reference,x.brokerRef].some(v=>
      String(v||'').trim().toUpperCase()===ref.toUpperCase())), 'Justificatif déjà présent dans les archives.');
    const row={id:id(),date:effective,accountId:account.id,type:'RAPPROCHEMENT_OUVERTURE',
      reference:ref,note:raw.note,status:'Déjà compris dans la photographie'};
    if(attachment) {
      row.attachmentId=id();
      next.attachments.push({...attachment,id:row.attachmentId});
    }
    next.history.push(row);
    calculate(next);
    return next;
  }
  function reviseOpening(d, raw, attachment) {
    const next=copy(d), account=next.accounts.find(x=>x.id===raw.accountId);
    const ref=String(raw.brokerRef||'').trim();
    fail(account && date(next.asOf) && text(ref,4,180) && text(raw.note,5) && raw.confirmed===true,
      'Relevé d’ouverture, référence, motif et validation requis.');
    fail(!next.history.some(h=>h.accountId===account.id && [h.reference,h.brokerRef].some(v=>
      String(v||'').trim().toUpperCase()===ref.toUpperCase())), 'Référence déjà enregistrée dans les archives.');
    const previous={cash:account.cash,reserved:account.reserved,positions:next.positions.filter(p=>p.accountId===account.id)};
    const replacement=copy(previous);
    replacement.cash=raw.cash;
    replacement.reserved=raw.reserved;
    if(raw.position) {
      const {symbol:s,qty,cost}=raw.position;
      fail(symbol(s),'Symbole de la photographie invalide.');
      replacement.positions=replacement.positions.filter(p=>p.symbol!==s);
      if(qty!==0||cost!==0) replacement.positions.push({accountId:account.id,symbol:s,qty,cost});
    }
    account.cash=replacement.cash;account.reserved=replacement.reserved;
    next.positions=next.positions.filter(p=>p.accountId!==account.id).concat(replacement.positions);
    const row={id:id(),type:'RECTIFICATION_OUVERTURE',date:next.asOf,recordedAt:today(),accountId:account.id,
      reference:ref,note:raw.note,status:'Photographie corrigée sur relevé',previous,replacement};
    if(attachment) {
      row.attachmentId=id();
      next.attachments.push({...attachment,id:row.attachmentId});
    }
    next.history.push(row);
    for(const o of next.observations) if(o.portfolioId===account.portfolioId) o.complete=false;
    calculate(next);
    return next;
  }
  function screening(i,now=today()) {
    if(i?.screen==='Exclu') return 'Exclu';
    if(!['Vérifié','Revue documentée'].includes(i?.screen)||!date(i.checked)||i.checked>now||!text(i.evidence)) return 'À vérifier';
    if(i.reviewUntil&&i.reviewUntil<now) return 'Contrôle à renouveler';
    if(i.screen==='Revue documentée')
      return text(i.method)&&text(i.reviewer)?'Revue indépendante documentée':'À vérifier';
    return 'Vérifié par l’utilisateur';
  }
  const documented=i=>['Vérifié par l’utilisateur','Revue indépendante documentée'].includes(screening(i));
  function record(d, raw, attachment) {
    const next=copy(d);
    const a=next.accounts.find(x=>x.id===raw.accountId);
    fail(a && !isArchived(next,a),'Compte inactif ou inconnu.');
    const t={...raw,id:id(),brokerRef:String(raw.brokerRef || '').trim(),legacy:false};
    fail(t.status===undefined||t.status==='CONFIRMED','Une écriture réelle doit être confirmée.');
    t.status='CONFIRMED';
    if(t.type==='TRANSFER') {
      const to=next.accounts.find(x=>x.id===t.toAccountId);
      fail(to && !isArchived(next,to),'Compte destinataire inactif ou inconnu.');
    }
    if(['BONUS','RIGHTS','STOCK_DIVIDEND'].includes(t.type))
      fail(t.entitlement,'Avis d’attribution : renseignez le titre d’origine et le ratio.');
    if(t.type==='BUY') {
      const instrument=next.instruments[t.symbol];
      if(banks.has(t.symbol) || instrument?.screen==='Exclu')
        fail(text(t.override,10),'Nouvel achat exclu : dérogation motivée requise.');
      if(isFund(next,t.symbol)) {
        fail(documented(instrument) && text(instrument.method) && text(instrument.mandate) && text(instrument.prospectus) && text(instrument.feeEvidence) &&
          ['capitalizing','distributing'].includes(instrument.distribution),
          'Souscription bloquée : conformité, mandat, prospectus et frais à documenter.');
        const vl=next.quotes[t.symbol];
        fail(vl?.kind==='FCP'&&vl.status!=='suspended'&&vl.date<=t.date&&!stale(vl,next.settings.staleDays,t.date),
          'Souscription bloquée : valeur liquidative datée et sourcée requise.');
      }
    }
    if(attachment) {
      t.attachmentId=id();
      next.attachments.push({...attachment,id:t.attachmentId});
    }
    if(t.type==='SPLIT') {
      fail(!next.history.some(h=>h.type==='SPLIT' && h.symbol===t.symbol && (h.date===t.date || h.reference===t.brokerRef)) &&
        !next.transactions.some(x=>x.type==='SPLIT' && x.symbol===t.symbol && (x.date===t.date || x.eventRef===t.brokerRef)),
        'Fractionnement déjà compris dans les comptes ou déjà appliqué.');
      fail(!next.orders.some(o=>o.symbol===t.symbol && pending.includes(o.status)),
        'Rapprocher ou clôturer les ordres du titre avant le fractionnement.');
      const holders=[...ledger(next,validate(next),t.date).accounts.values()].filter(x=>x.positions[t.symbol]?.qty>0);
      fail(holders.length>0,'Aucune position détenue à la date effective.');
      for(const holder of holders) next.transactions.push({...t,id:id(),accountId:holder.id,eventRef:t.brokerRef});
    } else {
      if(t.orderId) {
        const o=next.orders.find(x=>x.id===t.orderId);
        fail(o && ['TRANSMIS','PARTIELLEMENT EXÉCUTÉ'].includes(o.status),'Transmettre manuellement l’ordre avant de saisir son avis.');
        const filled=(calculate(next).executed.get(o.id)||0)+t.qty;
        o.status=filled===o.qty?'EXÉCUTÉ':'PARTIELLEMENT EXÉCUTÉ';
        o.trace.push({date:today(),status:o.status,ref:t.brokerRef});
      }
      if(t.eventId) {
        const event=next.events.find(x=>x.id===t.eventId);
        fail(t.type==='DIVIDEND' && event && event.status!=='PAYÉ','Dividende déjà payé ou événement introuvable.');
        t.priorEventStatus=event.status;
        event.status='PAYÉ';
      }
      next.transactions.push(t);
    }
    const corrected=t.type==='CORRECTION'?next.transactions.find(x=>x.id===t.corrects):undefined;
    if(t.replay&&corrected?.orderId) {
      const o=next.orders.find(x=>x.id===corrected.orderId), removed=correctionTargets(next);
      fail(o,'Ordre de la rectification introuvable.');
      const filled=next.transactions.filter(x=>x.orderId===o.id&&!removed.has(x.id)).reduce((sum,x)=>sum+x.qty,0);
      if(o.status!=='ANNULÉ') o.status=filled===0?'TRANSMIS':'PARTIELLEMENT EXÉCUTÉ';
      o.trace.push({date:today(),status:o.status,ref:t.brokerRef,corrects:corrected.id});
    }
    if(t.replay&&corrected?.eventId) {
      const event=next.events.find(x=>x.id===corrected.eventId);
      fail(event,'Dividende de la rectification introuvable.');
      event.status=['ANNONCÉ','DÉTACHÉ','DÛ'].includes(corrected.priorEventStatus)?corrected.priorEventStatus:'DÛ';
    }
    const affectedDate=t.replay&&corrected?corrected.date:t.date;
    const impacted=new Set(next.accounts.filter(a=>a.id===t.accountId||a.id===t.toAccountId||a.id===corrected?.toAccountId||
      (t.type==='SPLIT'&&next.transactions.some(x=>x.type==='SPLIT'&&x.eventRef===t.brokerRef&&x.accountId===a.id))).map(a=>a.portfolioId));
    // Une écriture rétrospective modifie les valorisations observées depuis sa date.
    for(const o of next.observations) if(impacted.has(o.portfolioId) && o.date>=affectedDate && !o.legacy) o.complete=false;
    calculate(next);
    return next;
  }
  function isArchived(d,a) {
    const p=d.portfolios.find(x=>x.id===a.portfolioId);
    return a.archived || p?.archived || d.owners.find(x=>x.id===p?.ownerId)?.archived ||
      d.institutions.find(x=>x.id===a.institutionId)?.archived;
  }
  function orderTransition(d, orderId, status, reference) {
    const next=copy(d), o=next.orders.find(x=>x.id===orderId);
    const allowed={PROJET:['TRANSMIS','ANNULÉ','NON EXÉCUTÉ'],TRANSMIS:['ANNULÉ','NON EXÉCUTÉ'],
      'PARTIELLEMENT EXÉCUTÉ':['ANNULÉ'], 'EXÉCUTÉ':['RAPPROCHÉ']};
    fail(o && allowed[o.status]?.includes(status),'Transition d’ordre impossible.');
    if(status==='TRANSMIS') {
      fail(!isArchived(next,next.accounts.find(a=>a.id===o.accountId)),'Compte archivé.');
      if(o.side!=='SELL') fail(!banks.has(o.symbol) && next.instruments[o.symbol]?.screen!=='Exclu','Achat exclu des ordres proposés.');
      o.transmittedDate=today();
    }
    fail(text(reference,4,180),'Référence manuelle requise.');
    o.status=status;
    o.trace.push({date:today(),status,ref:reference});
    calculate(next);
    return next;
  }
  function createPlan(d, plan) {
    const next=copy(d), planId=id(), date=today();
    const preview={id:planId,portfolioId:plan.portfolioId,date,mode:plan.mode,forecast:copy(plan.funding)};
    next.plans.push(preview);
    for(const l of plan.lines) next.orders.push({id:id(),planId,accountId:l.accountId,symbol:l.symbol,
      qty:l.qty,limit:l.price,estimateRate:l.estimateRate,side:l.side||'BUY',date,status:'PROJET',trace:[{date,status:'PROJET'}]});
    calculate(next);
    return next;
  }
  function stale(q, threshold, now=today()) {
    if(!q || q.date>now) return true;
    let count=0;
    for(let day=Date.parse(now); day>Date.parse(q.date) && count<=threshold; day-=86400000) {
      const weekday=new Date(day).getUTCDay();
      if(weekday!==0 && weekday!==6) count++;
    }
    return count>threshold;
  }
  function quoteUpdates(d, updates, now=today()) {
    const next=copy(d); let count=0;
    for(const [s,q] of Object.entries(updates)) {
      validateQuote(s,q,now);
      fail(!q.kind || (q.kind==='FCP')===isFund(d,s), 'Une VL requiert un instrument FCP préalablement enregistré.');
      const old=next.quotes[s];
      if(old && (old.date>q.date || old.date===q.date && quoteRank[old.basis]>quoteRank[q.basis])) continue;
      if(old?.date===q.date && quoteRank[old.basis]===quoteRank[q.basis] && old.source!==q.source &&
          (old.price!==q.price||(old.status||'active')!==(q.status||'active')))
        throw Error('Cours contradictoire pour cette séance. Vérifiez la source et la qualité avant de corriger.');
      const {retrievedOn, ...quote}=q;
      if(old) {
        const {retrievedOn:previousRetrieval,...previous}=old;
        if(Object.keys(previous).length===Object.keys(quote).length &&
           Object.keys(quote).every(k=>JSON.stringify(quote[k])===JSON.stringify(previous[k])) &&
           (previousRetrieval||!retrievedOn)) continue;
      }
      next.quoteHistory??={};
      const history=next.quoteHistory[s]||[];
      const archive=q=>({date:q.date,price:q.price,basis:q.basis,source:q.source,
        ...(q.status?{status:q.status}:{}),...(q.adjustedThrough?{adjustedThrough:q.adjustedThrough}:{})});
      for(const point of [old,q].filter(Boolean)) {
        const idx=history.findIndex(x=>x.date===point.date);
        if(idx>=0) history[idx]=archive(point); else history.push(archive(point));
      }
      history.sort((a,b)=>a.date.localeCompare(b.date));
      next.quoteHistory[s]=history.slice(-400);
      next.quotes[s]=copy(q); count++;
    }
    if(count) {
      const reversed=correctionTargets(next);
      for(const p of calculate(next).portfolios) {
        const ids=new Set(p.accounts.map(a=>a.id));
        const positions=p.accounts.flatMap(a=>Object.values(a.positions).filter(s=>s.qty>0));
        if(!positions.length || p.unknown) continue;
        const session=positions[0].quote.date;
        if(positions.some(s=>s.quote.date!==session || !['official','provisional'].includes(s.quote.basis) ||
          s.quote.status==='suspended' || Math.abs(s.price-s.quote.price)>1e-9) || next.asOf>session ||
          p.accounts.some(a=>a.openedOn>session && a.total!==0) ||
          next.transactions.some(t=>t.date>session && !reversed.has(t.id) &&
            (ids.has(t.accountId)||ids.has(t.toAccountId)))) continue;
        const sources=[...new Set(positions.map(s=>s.quote.source))].sort();
        const rates=p.accounts.map(a=>fxRate(next,a.currency,session,true));
        if(rates.some((r,i)=>!r&&p.accounts[i].cash)) continue;
        const value=Math.round(p.accounts.reduce((n,a,i)=>n+a.total*(rates[i]?.xof||0),0)*100)/100;
        const o={portfolioId:p.id,date:session,observedAt:now,value,complete:true,attestation:'close-v1',sources};
        const old=next.observations.findIndex(x=>x.attestation==='close-v1' && x.portfolioId===p.id && x.date===session);
        if(old<0) next.observations.push(o); else next.observations[old]=o;
      }
    }
    return {next,count};
  }
  function equate(accounts,budget) {
    const sorted=accounts.slice().sort((a,b)=>a.total-b.total || a.id.localeCompare(b.id));
    const out=Object.fromEntries(sorted.map(a=>[a.id,0]));
    let remaining=budget;
    // Remplissage par paliers. L’arrondi au franc est réparti dans l’ordre des ID.
    for(let n=1;n<=sorted.length;n++) {
      const height=Math.round(sorted[n-1].total);
      const gap=n<sorted.length?Math.max(0,Math.round(sorted[n].total)-height):Infinity;
      const step=Math.min(remaining, gap*n);
      const average=Math.floor(step/n), remainder=step%n;
      for(let i=0;i<n;i++) out[sorted[i].id]+=average+(i<remainder?1:0);
      remaining-=step;
      if(!remaining) break;
    }
    return out;
  }
  function allocateByInstitution(accounts,budget) {
    const groups=new Map();
    for(const account of accounts) {
      if(!groups.has(account.institutionId)) groups.set(account.institutionId,[]);
      groups.get(account.institutionId).push(account);
    }
    fail(groups.size===2,'Sélectionner des comptes de deux SGI exactement.');
    const totals=[...groups].map(([id,accounts])=>({id,total:accounts.reduce((n,a)=>n+a.total,0)}));
    const envelopes=equate(totals,budget);
    return Object.fromEntries([...groups].flatMap(([id,list])=>Object.entries(equate(list,envelopes[id]))));
  }
  // One transactional write: targets only, not transactions, positions, cash, orders or other portfolios.
  // Store weights as exact basis points (100.00 % = 10000) before persisting fractions.
  function updateCoreTargets(d,portfolioId,rows) {
    fail(d?.portfolios?.some(p=>p.id===portfolioId),'Portefeuille CORE introuvable.');
    fail(Array.isArray(rows) && rows.length>=1 && rows.length<=13,
      'Liste CORE invalide (12 actions maximum).');
    const targets=Object.create(null);
    let basisPoints=0;
    for(let n=0;n<rows.length;n++) {
      const row=rows[n];
      fail(row && typeof row.symbol==='string' &&
        (typeof row.weightPct==='string' || typeof row.weightPct==='number'),
        'Ligne CORE invalide.');
      const raw=row.symbol.trim().toUpperCase(), percent=String(row.weightPct).trim();
      if(!raw && !percent) continue;
      const canonical=normalizeSymbol(raw);
      fail(eligibleCoreSymbol(d,canonical) && canonical===normalizeSymbol(canonical),
        'Action non reconnue, exclue ou non admissible : '+raw);
      fail(!Object.hasOwn(targets,canonical),
        'Action CORE en doublon : '+canonical);
      fail(/^(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,2})?$/.test(percent),
        'Pourcentage invalide à la ligne '+(n+1));
      const bp=Math.round(Number(percent)*100);
      fail(Number.isSafeInteger(bp) && bp>0 && bp<=10000,
        'Pourcentage nul ou supérieur à 100 % : '+canonical);
      targets[canonical]=bp/10000;
      basisPoints+=bp;
    }
    fail(Object.keys(targets).length>=1 && Object.keys(targets).length<=12 &&
      basisPoints===10000,'Le CORE doit totaliser exactement 100 % sur 1 à 12 actions.');
    const next=copy(d);
    next.portfolios.find(p=>p.id===portfolioId).targets={...targets};
    calculate(next); // Full ledger and referential invariants; no commit on failure.
    return next;
  }
  function propose(d,{portfolioId,accountIds,mode='cibles',budget=0,manual={},exceptional=false,verifiedOnly=false,now=today()}) {
    const p=calculate(d).portfolios.find(x=>x.id===portfolioId);
    fail(p && ['cibles','mensuel','equilibre','equilibre-sgi','egalisation','manuel'].includes(mode),'Portefeuille ou mode inconnu.');
    const coreSymbols=Object.keys(p.targets);
    const requested=new Set(accountIds), accounts=p.accounts.filter(a=>requested.has(a.id) && a.currency==='XOF' && !isArchived(d,a));
    fail(accounts.length===requested.size && accounts.length>0,'Sélectionner des comptes XOF actifs du même portefeuille.');
    fail(Number.isSafeInteger(budget) && budget>=0,'Budget entier en FCFA obligatoire.');
    if(mode==='equilibre') fail(accounts.length===2,'L’équilibrage 50/50 exige exactement deux comptes.');
    const equalize=['equilibre','equilibre-sgi','egalisation'].includes(mode);
    const allocate=mode==='equilibre-sgi'?allocateByInstitution:equate;
    let funding=equalize ? allocate(accounts,budget) :
      Object.fromEntries(accounts.map(a=>[a.id,mode==='mensuel'?a.monthly:manual[a.id] ?? 0]));
    if(mode==='cibles') funding=Object.fromEntries(accounts.map(a=>[a.id,0]));
    const planned=Object.values(funding).reduce((s,x)=>s+x,0);
    fail(Object.values(funding).every(x=>num(x)) && (mode!=='manuel'||planned<=budget),'Versements projetés supérieurs au budget.');
    const balances=Object.fromEntries(accounts.map(a=>[a.id,a.available]));
    const limits=Object.fromEntries(accounts.map(a=>[a.id,Math.floor(a.available)]));
    const spendable=Object.values(limits).reduce((s,x)=>s+x,0);
    let remaining=exceptional || mode!=='mensuel' ? Math.min(spendable,budget) : spendable;
    if(mode==='cibles' && p.accounts.some(a=>coreSymbols.some(s=>(a.positions[s]?.qty||0)>0 && !(a.positions[s]?.price>0))))
      throw Error('Cours manquant sur un titre CORE détenu : renseignez les cours avant toute proposition de rééquilibrage.');
    const initial=Object.fromEntries(coreSymbols.map(s=>[s,p.accounts.reduce((n,a)=>n+(a.positions[s]?.market||0),0)]));
    const values={...initial}, lines=new Map(), ignored=[];
    const eligible=coreSymbols.filter(s=>{
      const q=d.quotes[s];
      const valid=p.targets[s]>0 && q && !stale(q,d.settings.staleDays,now) &&
        (!q.status || q.status==='active') && ['manual','official','provisional'].includes(q.basis) &&
        !d.transactions.some(t=>t.type==='SPLIT'&&t.symbol===s&&t.date>q.date) &&
        !banks.has(s) && d.instruments[s]?.screen!=='Exclu' && (!verifiedOnly||['Vérifié par l’utilisateur','Revue indépendante documentée'].includes(screening(d.instruments[s],now)));
      if(!valid) ignored.push(s);
      return valid;
    });
    const base=Object.values(initial).reduce((s,x)=>s+x,0);
    const intended=base+remaining;
    const goals=Object.fromEntries(coreSymbols.map(s=>[s,p.targets[s]*intended]));
    // Greedy discret sur le déficit, allocation par lots quand le prix est faible.
    while(remaining>0) {
      let best;
      for(const a of accounts) for(const s of eligible) {
        const price=d.quotes[s].price, rate=a.brokerRate+a.otherRate;
        const avail=Math.min(limits[a.id],remaining), full=price*(1+rate);
        const gap=goals[s]-values[s];
        if(full>avail || gap<price/2) continue;
        const score=gap/Math.max(1,goals[s]) + Math.min(1,avail/Math.max(1,spendable))*.01;
        if(!best||score>best.score) best={a,s,price,rate,avail,full,gap,score};
      }
      if(!best) break;
      const {a,s,price,rate,avail,full,gap}=best, k=key(a.id,s);
      const qty=Math.max(1,Math.min(Math.floor(avail/full),Math.round(gap/price)));
      const l=lines.get(k)||{accountId:a.id,symbol:s,qty:0,price,estimateRate:rate,quote:d.quotes[s],reason:'Réduit le déficit de pondération CORE.'};
      const previous=l.total||0;
      l.qty+=qty; l.amount=Math.round(price*l.qty*100)/100;
      l.broker=Math.floor(l.amount*a.brokerRate*100+1e-7)/100;
      l.other=Math.floor(l.amount*a.otherRate*100+1e-7)/100;
      l.total=Math.round((l.amount+l.broker+l.other)*100)/100;
      lines.set(k,l);
      const spent=l.total-previous;
      limits[a.id]-=spent;
      remaining-=spent;
      values[s]+=price*qty;
    }
    const weights=v=>{
      const total=Object.values(v).reduce((n,x)=>n+x,0);
      return Object.fromEntries(coreSymbols.map(s=>[s,total?v[s]/total:0]));
    };
    const before=weights(initial), after=weights(values);
    const feesBy=Object.fromEntries(accounts.map(a=>[a.id,0]));
    for(const l of lines.values()) feesBy[l.accountId]+=l.broker+l.other;
    if(equalize) funding=allocate(accounts.map(a=>({...a,total:a.total-feesBy[a.id]})),budget);
    const deviation=v=>coreSymbols.reduce((n,s)=>n+Math.abs(v[s]-p.targets[s]),0)/2;
    return {portfolioId,mode,budget,funding,planned,lines:[...lines.values()],before,after,targets:p.targets,
      deviation:{before:deviation(before),after:deviation(after)},ignored,
      telecom:(p.targets.SNTS||0)+(p.targets.ORAC||0),
      accounts:accounts.map(a=>{
        const own=[...lines.values()].filter(l=>l.accountId===a.id);
        const fees=own.reduce((n,l)=>n+l.broker+l.other,0);
        const cost=own.reduce((n,l)=>n+l.total,0);
        return {id:a.id,cash:balances[a.id],cashRemaining:Math.round((balances[a.id]-cost)*100)/100,
          current:a.total,forecast:a.total+funding[a.id]-fees,fees};
      })};
  }
  return {schema,empty,migrate,validate,calculate,record,reconcileOpening,reviseOpening,propose,isArchived,createPlan,orderTransition,
    quoteUpdates,stale,validateAttachment,currencies,fxRate,changeRate,screening,normalizeSymbol,eligibleCoreSymbol,updateCoreTargets,id,today,cent,date,symbol,kinds,statuses,isFund,tradeAmounts,equate};
});
