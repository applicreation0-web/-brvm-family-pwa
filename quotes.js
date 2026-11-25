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
  // The browser retrieves this downloadable, published CSV directly from its source.
  // No portfolio data is ever sent, and no copy of market prices is republished by GitHub.
  // This is a delayed end-of-session information source, not a licensed real-time feed.
  const DIRECT_SOURCE='BRVMData — cours de dernière séance (consultation directe)';
  async function feedEnabled() {
    // The direct public download needs no broker credentials. Availability is tested
    // on each actual fetch: it may fail because of browser CORS or supplier outage.
    return true;
  }
  // Android's local WebView has no cross-origin permissions. The native bridge
  // fetches only the hardcoded public CSV URL, without ever receiving account data.
  let androidSeq=0;
  const pendingAndroid=new Map();
  function receiveAndroidCsv(requestId,base64,error) {
    const pending=pendingAndroid.get(requestId);
    if(!pending) return;
    pendingAndroid.delete(requestId);
    clearTimeout(pending.timer);
    if(error) {pending.reject(Error('Téléchargement des cotations Android indisponible : '+error));return;}
    try {
      const raw=atob(base64),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
      if(bytes.length===0||bytes.length>MAX_CSV) throw Error('Réponse de cotations invalide.');
      pending.resolve(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    } catch(e) {pending.reject(e);}
  }
  function androidCSV() {
    if(typeof globalThis.BRVMAndroid?.fetchMarketQuotes!=='function') return null;
    return new Promise((resolve,reject)=>{
      const requestId='m'+(++androidSeq);
      const timer=setTimeout(()=>{
        pendingAndroid.delete(requestId);
        reject(Error('Expiration du délai de téléchargement Android.'));
      },16000);
      pendingAndroid.set(requestId,{resolve,reject,timer});
      try {globalThis.BRVMAndroid.fetchMarketQuotes(requestId);}
      catch(e) {clearTimeout(timer);pendingAndroid.delete(requestId);reject(e);}
    });
  }
  const FALLBACK_URL='https://raw.githubusercontent.com/harzat/brvm-data-public/main/seance.json';
  function parseSession(content, now=F.today()) {
    const data=JSON.parse(content), meta=data?._meta, date=meta?.maj_brvm_date;
    if(meta?.url!=='https://www.brvm.org/fr/cours-actions/0' || meta.seance!=='Fermée' ||
       !F.date(date)||date>now||F.stale({date},1,now)||
       !data.cours||typeof data.cours!=='object'||Array.isArray(data.cours))
      throw Error('Séance de secours non clôturée, ancienne ou non vérifiable.');
    const rows=Object.entries(data.cours);
    if(rows.length<35||rows.length>100||meta.nb_titres!==rows.length)
      throw Error('Séance de secours incomplète.');
    const result=[];
    for(const [raw,row] of rows) {
      const symbol=F.normalizeSymbol(raw),price=row?.dernier,volume=row?.volume;
      if(!F.symbol(symbol)||!Number.isFinite(price)||price<=0||
         !Number.isSafeInteger(volume)||volume<0) continue;
      result.push([symbol,{price,date,basis:'provisional',source:'BRVM (page cours) via BRVMetrics · séance clôturée',
        status:volume===0?'suspended':'active',kind:'ACTION',retrievedOn:now,fundamentals:{volume}}]);
    }
    if(result.length<35) throw Error('Séance de secours : trop peu de cours valides.');
    return collect(result);
  }
  async function fallbackSession(fetcher) {
    const response=await fetcher(FALLBACK_URL,{method:'GET',mode:'cors',credentials:'omit',
      referrerPolicy:'no-referrer',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw Error('Source de secours HTTP '+response.status);
    return parseSession(await readLimit(response,MAX_CSV));
  }
  async function online(fetcher=fetch) {
    const own={method:'GET',credentials:'same-origin',referrerPolicy:'no-referrer',
      cache:'no-store',signal:AbortSignal.timeout(10000),redirect:'error'};
    let policy={enabled:false};
    try {
      const config=await fetcher('./market/feed.json',own);
      if(config.ok) policy=JSON.parse(await readLimit(config,8192));
      else if(config.status!==404) throw Error('Configuration du flux de marché indisponible.');
    } catch(error) {
      // Failure to retrieve a missing local configuration is not an authorization:
      // use the direct source instead, never a public mirror or proxy.
      if(!/fetch|network|timed? ?out|failed/i.test(String(error))) throw error;
    }
    if(policy?.enabled===true) {
      if(typeof policy.source!=='string'||!policy.source.trim()||policy.source.length>200||
        typeof policy.authorization!=='string'||!policy.authorization.trim())
        throw Error('Flux autorisé mal configuré : source et autorisation requises.');
      const r=await fetcher('./market/latest.csv',own);
      if(!r.ok) throw Error('Flux de cotations autorisé indisponible.');
      return parse(await readLimit(r,MAX_CSV),
        {source:policy.source,official:policy.bulletinBasis===true,retrievedOn:F.today()});
    }
    if(policy?.enabled!==false) throw Error('Configuration de marché invalide.');
    let primary, failure;
    try {
      const viaAndroid=androidCSV();
      if(viaAndroid!==null) {
        primary=parse(await viaAndroid,{source:DIRECT_SOURCE+' · téléchargement Android',official:false,retrievedOn:F.today()});
      } else {
        const remote={method:'GET',mode:'cors',credentials:'omit',cache:'no-store',
          referrerPolicy:'no-referrer',redirect:'error',signal:AbortSignal.timeout(12000)};
        let response;
        try {response=await fetcher(URL,remote);}
        catch {throw Error('Téléchargement direct des cours impossible (connexion ou CORS).');}
        if(!response.ok) throw Error('Cours BRVMData temporairement indisponibles (HTTP '+response.status+').');
        primary=parse(await readLimit(response,MAX_CSV),{source:DIRECT_SOURCE,official:false,retrievedOn:F.today()});
      }
      if(Object.keys(primary).length<5) {primary=null;throw Error('Source de cotations trop incomplète.');}
      if(Object.values(primary).every(q=>!F.stale(q,1))) return primary;
    } catch(error) {failure=error;}
    try {
      const fallback=await fallbackSession(fetcher);
      if(!primary) return fallback;
      // Preserve primary quotes for equal dates; only take newer or missing observations.
      const merged={...primary};
      for(const [s,q] of Object.entries(fallback)) if(!merged[s]||merged[s].date<q.date) merged[s]=q;
      return merged;
    } catch(error) {
      if(primary) return primary;
      throw Error(String(failure?.message||'Source principale indisponible')+' ; secours : '+String(error.message||error)+'. Import CSV possible.');
    }
  }

  async function publicWatch(fetcher=fetch) {
    const response=await fetcher('./market/public-watch.json',{method:'GET',credentials:'same-origin',
      referrerPolicy:'no-referrer',cache:'no-store',signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok) throw Error('Catalogue documentaire indisponible.');
    const feed=JSON.parse(await readLimit(response,120000));
    const safeUrl=u=>typeof u==='string'&&u.length<=500&&u.startsWith('https://www.brvm.org/')&&!/[<>\s]/.test(u);
    if(feed.schema!=='brvm-public-watch-v1'||!Array.isArray(feed.items)||feed.items.length>75||
       !Array.isArray(feed.sources)||feed.sources.length>4||
       !feed.sources.every(safeUrl)||feed.checkedOn!==null&&(!F.date(feed.checkedOn)||feed.checkedOn>F.today()))
      throw Error('Catalogue officiel invalide.');
    for(const item of feed.items) {
      if(!item||!['communique','dividende','fractionnement'].includes(item.type)||
         !safeUrl(item.url)||!safeUrl(item.sourcePage)||!feed.sources.includes(item.sourcePage)||
         typeof item.title!=='string'||item.title.length>160||!item.title||
         typeof item.issuer!=='string'||item.issuer.length>80||!item.issuer||
         item.publishedOn!==null&&(!F.date(item.publishedOn)||item.publishedOn>F.today())||
         item.eventOn!==null&&(!F.date(item.eventOn)||item.eventOn>F.today()))
        throw Error('Lien documentaire non vérifié.');
    }
    return feed;
  }
  return {parse,parseManual,parseSession,online,feedEnabled,publicWatch,receiveAndroidCsv,URL,FALLBACK_URL};
});
