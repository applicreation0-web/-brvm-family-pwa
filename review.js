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
    const anchor=lastReviewed||START, next=addMonths(anchor,CYCLE), due=now>=next;
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
  return {START,CYCLE,TOLERANCE,HISTORY_LIMIT,addMonths,historyPoint,sixMonthReturn,assess,acknowledge};
});
