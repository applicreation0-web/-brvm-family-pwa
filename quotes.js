(function (root, factory) {
  const api=factory(typeof module === 'object' ? require('./finance') : root.BRVM,
    typeof module === 'object' ? require('./engine') : root.BRVMEngine);
  if (typeof module === 'object') module.exports=api;
  else root.BRVMQuotes=api;
})(globalThis,(F,E)=>{
  const URL='https://brvmdata.com/telechargements/actions-derniere-seance.csv';
  const MAX_CSV=2*1024*1024;
  function collect(rows) {
    const latest=Object.create(null), all=new Map();
    for(const [symbol,quote] of rows) {
      const key=symbol+'|'+quote.date, previous=all.get(key);
      if(previous && (previous.price!==quote.price||previous.status!==quote.status||previous.kind!==quote.kind))
        throw Error('Fichier contradictoire : plusieurs cours pour une même séance.');
      all.set(key,quote);
      if(!latest[symbol]||latest[symbol].date<quote.date||
         latest[symbol].date===quote.date&&latest[symbol].basis!=='official'&&quote.basis==='official') latest[symbol]=quote;
    }
    if(!Object.keys(latest).length) throw Error('Aucune cotation exploitable.');
    return latest;
  }
  function parse(content,{source='CSV local',official=false,retrievedOn}={}) {
    const rows=E.parseCSV(content.trimStart());
    if(rows.length<2) throw Error('CSV vide.');
    const header=rows[0].map(v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''));
    const ix=(...names)=>header.findIndex(x=>names.includes(x));
    const si=ix('symbol','symbole','ticker'), pi=ix('closexof','courscloture','cours','vl','vlxof'),
      di=ix('sessiondate','datesession','dateseance','date'), bi=ix('basis','base'), sti=ix('status','statut','tradingstatus'), ti=ix('traded'), bdi=ix('bulletindate'), sci=ix('sectorfr','sectorcode');
    if([si,pi,di].includes(-1)) throw Error('Colonnes requises : symbol, session_date, close_xof ou vl_xof.');
    const numeric=x=>{
      const v=x?.trim().replace(/[\s\u00A0\u202F]/g,'');
      if(!v) return null;
      const normalized=v.includes(',')&&v.includes('.') ? v.lastIndexOf(',')>v.lastIndexOf('.') ?
        v.replaceAll('.','').replace(',','.') : v.replaceAll(',','') : v.replace(',','.');
      const n=Number(normalized);
      return Number.isFinite(n)?n:null;
    };
    const metrics={per:ix('pe','per','perx','priceearnings'),volume:ix('volume','volumeactions','volumeshares'),
      dividend:ix('lastdividendnetxof','lastdividendxof','dividendxof','dernierdividende'),yield:ix('netyieldpct','dividendyield','dividendyieldpct','rendement'),
      turnover:ix('tradedvaluexof','valuexof','valeur'),margin:ix('margin','marginpct'),growth:ix('growth','growthpct'),
      earnings:ix('earningsxof','netprofitxof'), revenue:ix('revenuexof','chiffreaffairesxof')};
    const result=[];
    for(const r of rows.slice(1)) {
      const raw=r[si]?.trim().toUpperCase(), symbol=F.normalizeSymbol(raw), date=r[di]?.trim();
      const price=numeric(r[pi]);
      if(!F.symbol(symbol)||!F.date(date)||!price||price<0) continue;
      if(date>F.today()) throw Error('Date de cotation future.');
      const officialFlag=['official','officiel','boc','bulletin'].includes(r[bi]?.trim().toLowerCase());
      const basis=official&&officialFlag?'official':source==='CSV local'&&!r[bi]?'manual':'provisional';
      const status=/susp|halt/i.test(r[sti]||'')?'suspended':r[ti]?.trim().toLowerCase()==='false'?'reference':'active';
      const fundamentals=Object.fromEntries(Object.entries(metrics).map(([k,i])=>[k,numeric(r[i])]).filter(([,v])=>v!==null));
      if(F.date(r[bdi])) fundamentals.date=r[bdi];
      if(r[sci]) fundamentals.sector=r[sci];
      const q={price,date,basis,source,status,...(retrievedOn?{retrievedOn}:{}),fundamentals,kind:header[pi].startsWith('vl')?'FCP':'ACTION'};
      result.push([symbol,q]);
    }
    return collect(result);
  }
  function parseManual(content,options={}) {
    if(new TextEncoder().encode(content).byteLength>MAX_CSV) throw Error('Fichier de cotations trop volumineux.');
    if(!content.trimStart().startsWith('{')) return parse(content,options);
    let json;
    try {json=JSON.parse(content);}
    catch {throw Error('JSON de cotations illisible.');}
    if(json.schema!=='brvm-cotations-v1'||!Array.isArray(json.quotes)||json.quotes.length>10000)
      throw Error('Schéma de cotations JSON inconnu.');
    const {source='Fichier local',official=false,retrievedOn=F.today()}=options;
    return collect(json.quotes.map(row=>{
      const symbol=typeof row?.symbol==='string'?F.normalizeSymbol(row.symbol.trim().toUpperCase()):'';
      const {date,price,kind='ACTION',status='active',basis='provisional'}=row||{};
      if(!F.symbol(symbol)||!F.date(date)||!Number.isFinite(price)||price<=0||
         !['ACTION','FCP'].includes(kind)||!['active','reference','suspended'].includes(status)||
         !['official','provisional','manual'].includes(basis))
        throw Error('Symbole, séance, prix ou statut de cotation JSON invalide.');
      if(date>retrievedOn) throw Error('Date de cotation future.');
      return [symbol,{date,price,kind,status,source,retrievedOn,basis:basis==='official'&&!official?'provisional':basis}];
    }));
  }
  async function readLimit(response, max) {
    if(!response.body) throw Error('Réponse vide.');
    const reader=response.body.getReader(), decoder=new TextDecoder('utf-8',{fatal:true});
    let result='', count=0;
    try {
      for(;;) {
        const {done,value}=await reader.read();
        if(done) break;
        count+=value.byteLength;
        if(count>max) throw Error('Flux trop volumineux.');
        result+=decoder.decode(value,{stream:true});
      }
      return result+decoder.decode();
    } finally {await reader.cancel().catch(()=>{});}
  }
  // The public shell is shipped without an authorized live redistribution feed.
  // Fail closed and prefer user-initiated, provenance-checked local CSV import.
  async function feedEnabled(fetcher=fetch) {
    try {
      const response=await fetcher('./market/feed.json',{method:'GET',credentials:'same-origin',
        referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!response.ok) return false;
      const policy=JSON.parse(await readLimit(response,8192));
      return policy?.enabled===true && typeof policy.source==='string' &&
        typeof policy.authorization==='string' && !!policy.authorization.trim();
    } catch {return false;}
  }
  async function online(fetcher=fetch) {
    const options={method:'GET',credentials:'same-origin',referrerPolicy:'no-referrer',cache:'no-store',
      signal:AbortSignal.timeout(10000),redirect:'error'};
    const config=await fetcher('./market/feed.json',options);
    if(config.status===404) throw Error('Aucun flux autorisé configuré pour cette installation.');
    if(!config.ok) throw Error('Configuration du flux indisponible.');
    const policy=JSON.parse(await readLimit(config,8192));
    if(policy.enabled!==true) throw Error('Aucun flux autorisé configuré pour cette installation.');
    if(typeof policy.source!=='string'||!policy.source.trim()||policy.source.length>200||
      typeof policy.authorization!=='string'||!policy.authorization.trim())
      throw Error('Déploiement du flux incomplet : source et autorisation requises.');
    const r=await fetcher('./market/latest.csv',options);
    if(!r.ok) throw Error('Flux de cotations indisponible.');
    return parse(await readLimit(r,MAX_CSV),{source:policy.source,official:policy.bulletinBasis===true,retrievedOn:F.today()});
  }
  async function publicWatch(fetcher=fetch) {
    const response=await fetcher('./market/public-watch.json',{method:'GET',credentials:'same-origin',
      referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok) throw Error('Catalogue documentaire indisponible.');
    const feed=JSON.parse(await readLimit(response,200000));
    const safeUrl=u=>typeof u==='string'&&u.length<=500&&u.startsWith('https://www.brvm.org/')&&!/[<>\s]/.test(u);
    if(feed.schema!=='brvm-public-watch-v1'||!Array.isArray(feed.items)||feed.items.length>120||
       !Array.isArray(feed.sources)||feed.sources.length>8||
       !feed.sources.every(safeUrl)||feed.checkedOn!==null&&(!F.date(feed.checkedOn)||feed.checkedOn>F.today()))
      throw Error('Catalogue officiel invalide.');
    for(const item of feed.items) {
      if(!item||!['communique','dividende','fractionnement','financiers','annuel','semestriel','trimestriel'].includes(item.type)||
         !safeUrl(item.url)||!safeUrl(item.sourcePage)||!feed.sources.includes(item.sourcePage)||
         typeof item.title!=='string'||item.title.length>160||!item.title||
         typeof item.issuer!=='string'||item.issuer.length>80||!item.issuer||
         item.publishedOn!==null&&(!F.date(item.publishedOn)||item.publishedOn>F.today())||
         item.eventOn!==null&&(!F.date(item.eventOn)||item.eventOn>F.today()))
        throw Error('Lien documentaire non vérifié.');
    }
    return feed;
  }
  return {parse,parseManual,online,feedEnabled,publicWatch,URL};
});
