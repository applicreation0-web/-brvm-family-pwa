(function(root, factory) {
  const api=factory(typeof module==='object' ? require('./finance') : root.BRVM,
    typeof module==='object' ? require('./engine') : root.BRVMEngine);
  if(typeof module==='object') module.exports=api;
  else root.BRVMReview=api;
})(globalThis,(F,E)=>{
  'use strict';
  const START='2026-11-23', CYCLE=6, TOLERANCE=.02, HISTORY_LIMIT=400;
  // UTC calendar months, not an assumed 180 days, with end-of-month clamp.
  function addMonths(date,months) {
    if(!F.date(date) || !Number.isInteger(months)) throw Error('Date du suivi invalide.');
    const [year,month,day]=date.split('-').map(Number);
    const first=new Date(Date.UTC(year,month-1+months,1));
    const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
    return first.getUTCFullYear()+'-'+String(first.getUTCMonth()+1).padStart(2,'0')+'-'+String(Math.min(day,last)).padStart(2,'0');
  }
  const historyPoint=q=>({date:q.date,price:q.price,basis:q.basis,source:q.source,
    ...(q.adjustedThrough?{adjustedThrough:q.adjustedThrough}:{})});
  function sixMonthReturn(d,symbol,today) {
    const last=d.quotes[symbol];
    if(!last || last.date>today || F.stale(last,d.settings.staleDays,today)) return null;
    const cutoff=addMonths(today,-6), min=addMonths(cutoff,-1);
    const records=[...(d.quoteHistory?.[symbol]||[]),last]
      .filter(q=>q.date<=today&&q.price>0).sort((a,b)=>a.date.localeCompare(b.date));
    const candidates=records.filter(q=>q.date<=cutoff && q.date>=min);
    if(!candidates.length || last.date<=cutoff) return null;
    const first=candidates.at(-1);
    // Only recorded splits may be adjusted; no unsupported total-return claim.
    const splitDates=new Map();
    for(const t of d.transactions) if(t.type==='SPLIT' && t.symbol===symbol &&
      t.date>first.date && t.date<=last.date && (!first.adjustedThrough||t.date>first.adjustedThrough)) {
      const old=splitDates.get(t.date);
      if(old && (old.from!==t.ratioFrom || old.to!==t.ratioTo)) return null;
      splitDates.set(t.date,{from:t.ratioFrom,to:t.ratioTo});
    }
    let adjusted=first.price;
    for(const x of splitDates.values()) adjusted*=x.from/x.to;
    if(!(adjusted>0)) return null;
    return {change:last.price/adjusted-1,from:first.date,to:last.date,
      splitAdjusted:splitDates.size>0,dividendsIncluded:false};
  }
  function assess(d,portfolioId,now=F.today()) {
    if(!F.date(now)) throw Error('Date de revue invalide.');
    const calc=F.calculate(d),p=calc.portfolios.find(x=>x.id===portfolioId);
    if(!p) throw Error('Portefeuille introuvable.');
    const lastReviewed=d.settings.coreReviews?.[portfolioId]?.reviewedOn||null;
    // Fixed 23 May / 23 November cadence: acknowledging late must not postpone the next audit.
    const anchor=lastReviewed||START;
    let next=addMonths(START,CYCLE);
    for(let period=2;lastReviewed&&next<=lastReviewed&&period<=240;period++)
      next=addMonths(START,period*CYCLE);
    const due=now>=next;
    const values=Object.fromEntries(E.symbols.map(sym=>[sym,p.accounts.reduce((n,a)=>
      n+(a.positions[sym]?.market||0)*(a.rate?.xof||0),0)]));
    const base=Object.values(values).reduce((n,v)=>n+v,0);
    const rows=E.symbols.map(symbol=>{
      const positions=p.accounts.map(a=>a.positions[symbol]).filter(x=>x?.qty>0);
      const quantity=positions.reduce((n,x)=>n+x.qty,0);
      const cost=positions.reduce((n,x)=>n+x.cost,0);
      const market=values[symbol],hasPrice=quantity===0 || positions.every(x=>x.price>0);
      const quote=d.quotes[symbol],old=F.stale(quote,d.settings.staleDays,now);
      const target=p.targets[symbol],actual=base && hasPrice?market/base:null;
      const gap=actual===null?null:actual-target;
      const fundamentals=d.instruments[symbol]?.fundamentals||quote?.fundamentals||{};
      const financialDate=F.date(fundamentals.date)?fundamentals.date:null;
      const screening=F.screening(d.instruments[symbol],now);
      const warnings=[];
      if(!quote||old) warnings.push('Cours absent ou ancien');
      if(!hasPrice) warnings.push('Valorisation incomplète');
      if(gap!==null&&Math.abs(gap)>TOLERANCE+1e-9) warnings.push('Écart aux cibles supérieur à 2 points');
      if(!financialDate) warnings.push('États financiers non documentés');
      else if(financialDate<addMonths(now,-12)) warnings.push('États financiers à actualiser');
      if(d.instruments[symbol]?.screen==='Exclu') warnings.push('Titre exclu par le filtrage');
      const change=sixMonthReturn(d,symbol,now);
      if(change && change.change<=-.2) warnings.push('Baisse de cours marquée sur six mois');
      return {symbol,target,actual,gap,quantity,cost,market,quoteDate:quote?.date||null,
        price:quote?.price||null,stale:old,finDate:financialDate,screening,warnings,
        sincePurchase:cost>0&&hasPrice?market/cost-1:null,change,
        status:warnings.length?'À examiner':'Suivi normal'};
    });
    return {portfolioId,anchor,lastReviewed,dueOn:next,due,rows,alerts:rows.filter(x=>x.warnings.length).length,
      priceHistoryPresent:rows.some(x=>x.change),source:'Données locales vérifiées, aucune transmission automatique'};
  }
  function acknowledge(d,portfolioId,on=F.today()) {
    if(!F.date(on)||on>F.today()||on<START) throw Error('Date d’examen invalide.');
    const next=structuredClone(d),p=next.portfolios.find(x=>x.id===portfolioId);
    if(!p) throw Error('Portefeuille introuvable.');
    next.settings.coreReviews??={};
    const previous=next.settings.coreReviews[portfolioId]?.reviewedOn;
    if(previous&&on<previous) throw Error('La date de revue ne peut pas reculer.');
    next.settings.coreReviews[portfolioId]={reviewedOn:on};
    F.calculate(next);
    return next;
  }

  // Sélection indépendante des comptes. Toutes les entrées sont des observations
  // documentées, jamais des signaux d'ordre ou des promesses de performance.
  const SELECTION_WEIGHTS=Object.freeze({
    solidity:30, valuation:20, dividends:15, liquidity:15, trend:10, transparency:10
  });
  const SELECTION_GATES=Object.freeze({
    interestDebtAssets:.33, interestAssets:.33, nonPermissibleRevenue:.05,
    minCandidateScore:75, minScoreAdvantage:10
  });
  const SOURCE_KEYS=['screening','financial','valuation','dividends','liquidity','prices','governance'];
  const SOURCE_FRESH_MONTHS={screening:12,financial:18,valuation:1,dividends:18,liquidity:1,prices:1,governance:3};
  function evaluateSelection(instrument,now=F.today()) {
    const e=instrument?.selection;
    const missing=[], blocked=[];
    const valid=n=>typeof n==='number'&&Number.isFinite(n);
    const ratio=n=>valid(n)&&n>=0&&n<=1;
    const url=s=>typeof s==='string'&&/^https:\/\/[^\s/?#]+(?:[^\s]*)$/.test(s)&&s.length<=500;
    if(!e||typeof e!=='object')
      return {status:'NON DOCUMENTÉ',score:null,missing:['Dossier de qualification absent'],blocked:[],parts:null};
    const sources=e.sources||{};
    for(const k of SOURCE_KEYS) {
      const s=sources[k];
      if(!s||!url(s.url)||!F.date(s.date)||s.date>now)
        missing.push('Source datée manquante : '+k);
      else if(s.date<addMonths(now,-SOURCE_FRESH_MONTHS[k]))
        missing.push('Source trop ancienne : '+k);
    }
    if(e.prohibitedActivity===true || e.conventionalFinance===true)
      blocked.push('Activité exclue par la politique CORE');
    if(e.prohibitedActivity!==false || e.conventionalFinance!==false)
      missing.push('Qualification sectorielle incomplète');
    for(const [key,limit,label] of [
      ['interestDebtAssets',SELECTION_GATES.interestDebtAssets,'Dette à intérêt / actifs'],
      ['interestAssets',SELECTION_GATES.interestAssets,'Actifs porteurs d’intérêts / actifs'],
      ['nonPermissibleRevenue',SELECTION_GATES.nonPermissibleRevenue,'Revenus non conformes']
    ]) {
      if(!ratio(e[key])) missing.push('Ratio charia non vérifié : '+label);
      else if(e[key] > limit || key==='nonPermissibleRevenue'&&e[key]>=limit)
        blocked.push(label+' au-delà du seuil');
    }
    const profits=e.netProfits3Y,revenues=e.revenues3Y;
    if(!Array.isArray(profits)||profits.length!==3||!profits.every(valid))
      missing.push('Bénéfices nets des 3 exercices');
    if(!Array.isArray(revenues)||revenues.length!==3||!revenues.every(v=>valid(v)&&v>0))
      missing.push('Chiffre d’affaires des 3 exercices');
    for(const [key,label,condition] of [
      ['netDebtEbitda','Dette nette / EBITDA',v=>valid(v)&&v>=-100],
      ['per','PER',v=>valid(v)&&v>0],
      ['sectorMedianPer','PER médian sectoriel',v=>valid(v)&&v>0],
      ['evEbitda','EV / EBITDA',v=>valid(v)&&v>0],
      ['sectorMedianEvEbitda','EV / EBITDA sectoriel',v=>valid(v)&&v>0],
      ['dividendsPaidYears3Y','Nombre d’années de dividendes',v=>Number.isInteger(v)&&v>=0&&v<=3],
      ['netYieldPct','Rendement net du dividende',v=>valid(v)&&v>=0&&v<=100],
      ['payoutRatio','Taux de distribution',ratio],
      ['tradedSessionShare60','Séances négociées sur 60',ratio],
      ['medianDailyTurnoverXof','Valeur quotidienne médiane négociée',v=>valid(v)&&v>=0],
      ['sixMonthPriceReturn','Cours sur six mois ajusté',v=>valid(v)&&v>=-1&&v<=100],
      ['benchmarkSixMonthReturn','Indice sur six mois',v=>valid(v)&&v>=-1&&v<=100]
    ]) if(!condition(e[key])) missing.push(label);
    if(e.audited!==true) missing.push('Certification des états annuels non confirmée');
    if(!F.date(e.annualReportDate)||e.annualReportDate>now)
      missing.push('Date des états annuels audités');
    else if(e.annualReportDate<addMonths(now,-18))
      missing.push('États annuels audités périmés');
    if(typeof e.governanceClear!=='boolean'||typeof e.suspended!=='boolean')
      missing.push('Statut de gouvernance / cotation');
    if(e.suspended===true) blocked.push('Cotation suspendue');
    if(e.governanceClear===false) blocked.push('Signal de gouvernance majeur');
    if(blocked.length)
      return {status:'EXCLU / À RÉEXAMINER',score:null,missing,blocked,parts:null};
    if(missing.length)
      return {status:'DONNÉES INSUFFISANTES',score:null,missing,blocked,parts:null};
    const relative=(a,b)=>a<=b?10:a<=b*1.25?5:0;
    const parts={
      solidity:(profits.filter(x=>x>0).length>=2?10:0)+(revenues[2]>revenues[0]?10:0)+(e.netDebtEbitda<=2.5?10:0),
      valuation:relative(e.per,e.sectorMedianPer)+relative(e.evEbitda,e.sectorMedianEvEbitda),
      dividends:(e.dividendsPaidYears3Y>=2?10:0)+(e.netYieldPct>0&&e.payoutRatio<=.8?5:0),
      liquidity:(e.tradedSessionShare60>=.7?10:0)+(e.medianDailyTurnoverXof>=5000000?5:e.medianDailyTurnoverXof>=1000000?3:0),
      trend:e.sixMonthPriceReturn>=e.benchmarkSixMonthReturn?10:e.sixMonthPriceReturn>=e.benchmarkSixMonthReturn-.05?5:0,
      transparency:5+(e.governanceClear&&!e.suspended?5:0)
    };
    const score=Object.values(parts).reduce((a,b)=>a+b,0);
    // Un score fort ne compense pas des pertes récurrentes ou une négociabilité insuffisante.
    const candidateReady=score>=75&&profits.filter(x=>x>0).length>=2&&
      e.tradedSessionShare60>=.7&&e.medianDailyTurnoverXof>=1000000;
    const status=candidateReady?'CANDIDAT / CONSERVER':score>=55?'SURVEILLER':'RÉEXAMINER';
    return {status,score,candidateReady,missing:[],blocked:[],parts,asOf:now};
  }
  // Safe issuer matching: different West-African subsidiaries must never be conflated.
  function matchCoreIssuer(name) {
    if(typeof name!=='string') return null;
    const issuer=name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
    if(/^(SONATEL|SONATEL SENEGAL|SONATEL SN)$/.test(issuer)) return 'SNTS';
    if(/^ORANGE (COTE D IVOIRE|CI)$/.test(issuer)) return 'ORAC';
    if(/^(CIE|CIE CI|CIE COTE D IVOIRE|COMPAGNIE IVOIRIENNE D ELECTRICITE)$/.test(issuer)) return 'CIEC';
    if(/^TOTALENERGIES (MARKETING )?(CI|COTE D IVOIRE)$/.test(issuer)) return 'TOCI';
    if(/^SMB( CI| COTE D IVOIRE)?$/.test(issuer)) return 'SMBC';
    if(/^NESTLE( CI| COTE D IVOIRE)?$/.test(issuer)) return 'NTLC';
    if(/^PALM( CI| COTE D IVOIRE)?$/.test(issuer)) return 'PALC';
    return null;
  }

  function selectUniverse(d,now=F.today()) {
    const codes=[...new Set([...E.symbols,...Object.entries(d.instruments||{})
      .filter(([,i])=>i?.kind==='ACTION').map(([s])=>s)])].sort();
    const rows=codes.map(symbol=>({symbol,core:E.symbols.includes(symbol),
      ...evaluateSelection(d.instruments?.[symbol],now)}));
    const core=rows.filter(x=>x.core),alternatives=rows.filter(x=>!x.core)
      .filter(x=>x.candidateReady===true&&x.score>=SELECTION_GATES.minCandidateScore)
      .sort((a,b)=>b.score-a.score||a.symbol.localeCompare(b.symbol));
    const replacements=[];
    for(const existing of core) {
      if(existing.score===null) continue;
      const better=alternatives.find(a=>a.score>=existing.score+SELECTION_GATES.minScoreAdvantage);
      if(better) replacements.push({from:existing.symbol,to:better.symbol,
        fromScore:existing.score,toScore:better.score,requiresUserDecision:true});
    }
    return {core,alternatives,replacements,unscored:rows.filter(x=>x.score===null).length,
      disclaimer:'Présélection automatisée sur données documentées, sans ordre ni modification CORE.'};
  }
  return {START,CYCLE,TOLERANCE,HISTORY_LIMIT,SELECTION_WEIGHTS,SELECTION_GATES,addMonths,historyPoint,sixMonthReturn,assess,acknowledge,evaluateSelection,selectUniverse,matchCoreIssuer};
});
