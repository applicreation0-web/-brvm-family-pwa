(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./finance') : root.BRVM);
  if (typeof module === 'object') module.exports=api;
  else root.BRVMAnalysis=api;
})(globalThis, F => {
  const day=86400000;
  function flows(d, portfolioId) {
    const ids=new Set(d.accounts.filter(a=>a.portfolioId===portfolioId).map(a=>a.id));
    const result=new Map(), tx=new Map(d.transactions.map(t=>[t.id,t]));
    const accounts=new Map(d.accounts.map(a=>[a.id,a]));
    const convert=(accountId,date,amount)=>{
      if(!ids.has(accountId)) return 0;
      const rate=F.fxRate(d,accounts.get(accountId).currency,date,true);
      return rate?Math.round(amount*rate.xof*100)/100:NaN;
    };
    const amount=t=>{
      if(t.type==='DEPOSIT') return convert(t.accountId,t.date,t.amount);
      if(t.type==='WITHDRAW') return -convert(t.accountId,t.date,t.amount);
      if(t.type==='TRANSFER') {
        if(ids.has(t.accountId)&&ids.has(t.toAccountId)) return 0;
        return convert(t.toAccountId,t.date,t.toAmount??t.amount)-convert(t.accountId,t.date,t.amount);
      }
      return 0;
    };
    const removed=new Set(d.transactions.filter(t=>t.type==='CORRECTION'&&t.replay).map(t=>t.corrects));
    for(const t of d.transactions) {
      if(t.replay||removed.has(t.id)) continue;
      const value=t.type==='CORRECTION'?-amount(tx.get(t.corrects)):amount(t);
      if(!Number.isFinite(value)) return null;
      if(value) result.set(t.date,(result.get(t.date)||0)+value);
    }
    return result;
  }
  function xirr(entries) {
    const sorted=entries.slice().sort((a,b)=>a.date.localeCompare(b.date));
    // Même date regroupée avant détection des signes. Deux changements
    // de signe ou plus peuvent produire plusieurs taux plausibles.
    const totals=new Map();
    for(const e of sorted) totals.set(e.date,(totals.get(e.date)||0)+e.amount);
    const values=[...totals].filter(([,v])=>v);
    if(values.length<2 || values.slice(1).filter((e,i)=>Math.sign(e[1])!==Math.sign(values[i][1])).length!==1) return null;
    const initial=Date.parse(values[0][0]), calc=r=>values.reduce((n,[date,amount])=>n+amount*Math.exp(-r*(Date.parse(date)-initial)/(365*day)),0);
    let lo=-15, hi=15;
    const sign=Math.sign(calc(lo));
    if(!sign || Math.sign(calc(hi))===sign) return null;
    for(let i=0;i<100;i++) {
      const mid=(lo+hi)/2;
      if(Math.sign(calc(mid))===sign) lo=mid; else hi=mid;
    }
    return Math.expm1((hi+lo)/2);
  }
  function performance(d,portfolioId) {
    const observations=d.observations.filter(o=>o.portfolioId===portfolioId&&o.attestation==='close-v1').slice().sort((a,b)=>a.date.localeCompare(b.date));
    const points=observations.filter(o=>o.complete && o.value>0);
    const flow=flows(d,portfolioId), blank={twr:null,xirr:null,gain:null,observations};
    if(!flow || points.length<2) return blank;
    const [first,last]=[points[0],points.at(-1)];
    if(d.transactions.some(t=>t.date>last.date &&
      d.accounts.some(a=>[t.accountId,t.toAccountId].includes(a.id)&&a.portfolioId===portfolioId))) return blank;
    const between=[...flow].filter(([date])=>date>first.date && date<=last.date);
    const gain=last.value-first.value-between.reduce((n,[,x])=>n+x,0);
    const irr=xirr([{date:first.date,amount:-first.value},...between.map(([date,amount])=>({date,amount:-amount})),{date:last.date,amount:last.value}]);
    let twr=1;
    for(let n=1;n<points.length;n++) {
      const a=points[n-1], b=points[n];
      const within=between.filter(([date])=>date>a.date && date<=b.date);
      // Une observation de fin de journée sans ordre des flux intrajournaliers
      // ne suffit pas à chaîner un sous-intervalle exact lorsqu’il y a des flux.
      if(within.length) return {twr:null,xirr:irr,gain,observations};
      twr*=b.value/a.value;
    }
    return {twr:twr-1,xirr:irr,gain,observations};
  }
  function project(initial, monthly, rate, dividend, costs) {
    const effective=(1+rate+dividend)**(1/12)-1, values=[initial];
    let fees=0, capital=initial;
    for(let n=1;n<=60;n++) {
      const fee=monthly*costs;
      fees+=fee;
      capital=capital*(1+effective)+monthly-fee;
      if(n%12===0) values.push(Math.round(capital));
    }
    return {values,fees,contributed:monthly*60};
  }
  function csv(rows) {
    return rows.map(r=>r.map(v=>{
      let s=String(v??'');
      if(typeof v==='string' && /^[\s\uFEFF]*[=+\-@]/.test(s)) s="'"+s;
      return '"'+s.replaceAll('"','""')+'"';
    }).join(';')).join('\r\n');
  }
  return {flows,xirr,performance,project,csv};
});
