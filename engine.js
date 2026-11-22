/* BRVM Family Offline — logique financière sans réseau ni dépendance externe.
   Toutes les données personnelles résident dans un fichier JSON séparé. */
(function(root, factory) {
  const x = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = x;
  if (root) root.BRVMEngine = x;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const symbols = ['SNTS','ORAC','CIEC','TOCI','SMBC','NTLC','PALC'];
  const names = {SNTS:'Sonatel Sénégal',ORAC:'Orange Côte d’Ivoire',CIEC:'CIE Côte d’Ivoire',TOCI:'TotalEnergies CI',SMBC:'SMB Côte d’Ivoire',NTLC:'Nestlé Côte d’Ivoire',PALC:'Palm Côte d’Ivoire',SGBC:'Société Générale CI',CBIB:'Coris Bank',SALAM_CI:'FCP Salam CI',ALBARAKA2:'FCP Al Baraka 2'};
  const market = {TOCI:'TTLC',CBIB:'CBIBF'};
  const targets = {SNTS:.30,ORAC:.15,CIEC:.10,TOCI:.12,SMBC:.09,NTLC:.15,PALC:.09};
  const rnd = x => Math.round((Number(x) + Number.EPSILON)*100)/100;
  const n = x => {const v=Number(x);return Number.isFinite(v)?v:0;};
  const clean = x => JSON.parse(JSON.stringify(x));
  const id = () => 'LOC-' + Math.random().toString(36).slice(2,11).toUpperCase() + '-' + Date.now().toString(36);
  function empty() {return {schema:'brvm-family-offline-v1',asOf:'',source:'Saisie locale',owners:[],accounts:[],positions:[],quotes:{},transactions:[],history:[],plans:[],quoteHistory:[],settings:{targets:clean(targets),feesRate:.016,fcpTarget:.075,monthlyFGI:100000,monthlyCGF:150000,preferNoBankBuys:true,fcpValidated:false}};}
  function assert(condition,msg){if(!condition) throw Error(msg);}
  function validate(data) {
    assert(data&&data.schema==='brvm-family-offline-v1','Format JSON non reconnu : attendu brvm-family-offline-v1.');
    assert(Array.isArray(data.accounts)&&Array.isArray(data.positions),'JSON incomplet : comptes ou positions manquants.');
    const seen=new Set();
    for(const a of data.accounts){
      assert(typeof a.id==='string' && a.id && !seen.has(a.id),'Identifiant de compte manquant ou dupliqué.');
      seen.add(a.id); assert(n(a.cash)>=0 && n(a.reserved)>=0 && n(a.cash)>=n(a.reserved),'Liquidités invalides.');
    }
    for(const p of data.positions){assert(seen.has(p.accountId),'Position liée à un compte inconnu.');assert(typeof p.symbol==='string'&&/^[A-Z0-9_]{2,18}$/.test(p.symbol),'Code titre invalide.'); assert(n(p.qty)>=0&&n(p.cost)>=0,'Position ou coût négatif.');}
    const expected = Object.keys(data.settings?.targets||targets).reduce((s,k)=>s+n((data.settings?.targets||targets)[k]),0);
    assert(Math.abs(expected-1)<0.001,'Les pondérations cibles doivent totaliser 100 %.');
    return true;
  }
  const acct = (a,s) => a.accounts.find(x=>x.id===s);
  const qPrice = (d,sym) => n(d.quotes?.[sym]?.price);
  function calculate(d) {
    validate(d);
    const accounts=new Map(d.accounts.map(a=>[a.id,{...clean(a), positions:{},market:0,cost:0,realized:0,dividends:0,feesPaid:0,netContribution:0,errors:[]} ]));
    for(const p of d.positions) {
      const a=accounts.get(p.accountId); if(!a)continue;
      const s=a.positions[p.symbol]||{symbol:p.symbol,qty:0,cost:0};s.qty+=n(p.qty);s.cost+=n(p.cost);a.positions[p.symbol]=s;
    }
    const usedRefs = new Set();
    const sorted=(d.transactions||[]).filter(t=>t.status==='CONFIRMED').slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||n(a.createdAt)-n(b.createdAt));
    for(const t of sorted) {
      const a=accounts.get(t.accountId);
      if(!a) continue;
      const v=n(t.amount), qty=n(t.qty), price=n(t.price), fees=n(t.fees);
      const s=a.positions[t.symbol]||{symbol:t.symbol,qty:0,cost:0};
      const k=a.id+'|'+(t.brokerRef||t.id);
      if(usedRefs.has(k)) {a.errors.push('Référence en double : '+(t.brokerRef||'?')); continue;}
      usedRefs.add(k);
      const total=qty*price+fees;
      switch(t.type) {
        case 'DEPOSIT': a.cash+=v; a.netContribution+=v; break;
        case 'WITHDRAW': a.cash-=v; a.netContribution-=v; break;
        case 'BUY': a.cash-=total;s.qty+=qty;s.cost+=total;a.positions[t.symbol]=s;a.feesPaid+=fees; break;
        case 'SELL': {
          if(s.qty<qty-1e-7){a.errors.push('Vente supérieure aux titres détenus : '+t.symbol);break;}
          const released=s.qty>0?s.cost*qty/s.qty:0;s.qty-=qty;s.cost-=released;a.cash+=qty*price-fees;a.realized+=qty*price-fees-released;a.feesPaid+=fees;a.positions[t.symbol]=s;break;
        }
        case 'DIVIDEND': {
          const net=n(t.gross)-n(t.tax)-fees;a.cash+=net;a.dividends+=net;a.feesPaid+=fees;break;
        }
        case 'FEE': a.cash-=v;a.feesPaid+=v;break;
        case 'SPLIT': {
          const from=n(t.ratioFrom),to=n(t.ratioTo);
          if(from>0&&to>0){s.qty=s.qty*to/from;a.positions[t.symbol]=s;}
          break;
        }
        case 'BONUS':s.qty+=qty;a.positions[t.symbol]=s;break;
      }
      if(a.cash < -0.001) a.errors.push('Liquidités négatives après '+t.type+' du '+t.date);
    }
    const perOwner={};
    for(const a of accounts.values()) {
      for(const p of Object.values(a.positions)) {
        const price=qPrice(d,p.symbol);p.price=price;p.market=price*p.qty;p.pnl=price?(p.market-p.cost):0;
        p.quoteDate=d.quotes?.[p.symbol]?.date||'';a.market+=p.market;a.cost+=p.cost;
      }
      a.total=a.market+a.cash; a.available=a.cash-n(a.reserved);
      a.pnl=a.market-a.cost;
      const owner=a.owner||'Sans nom';
      if(!perOwner[owner])perOwner[owner]={owner,total:0,market:0,cash:0,cost:0,accounts:[],pnl:0};
      const o=perOwner[owner];o.total+=a.total;o.market+=a.market;o.cash+=a.cash;o.cost+=a.cost;o.pnl+=a.pnl;o.accounts.push(a);
    }
    return {accounts:Array.from(accounts.values()),owners:Object.values(perOwner)};
  }
  function eligibleHoldings(d,owner){
    const s={};for(const sym of symbols)s[sym]=0;
    const snap=calculate(d);
    for(const a of snap.accounts.filter(a=>a.owner===owner))for(const sym of symbols)s[sym]+=n(a.positions[sym]?.market);
    return s;
  }
  function splitFunding(d,owner,budget,mode,fixFGI=100000,fixCGF=150000,manFGI=0,manCGF=0){
    const a=calculate(d).accounts.filter(a=>a.owner===owner);
    const f=a.find(x=>x.sgi==='FGI'),c=a.find(x=>x.sgi==='CGF');
    if(!f||!c)return {FGI:f?budget:0,CGF:c?budget:0,note:'Un seul courtier actif : égalisation FGI/CGF non applicable.'};
    let FGI,CGF;
    if(mode==='manuel'){FGI=Math.max(0,Math.min(budget,n(manFGI)));CGF=Math.max(0,Math.min(budget-FGI,n(manCGF)));}
    else if(mode==='mensuel'){const tot=n(fixFGI)+n(fixCGF);FGI=tot?Math.round(budget*n(fixFGI)/tot):budget/2;CGF=budget-FGI;}
    else {FGI=Math.round(Math.max(0,Math.min(budget,(c.total+budget-f.total)/2)));CGF=budget-FGI;}
    return {FGI,CGF,note:mode==='equilibre'?'Égalisation théorique de la valeur totale, avant frais de négociation.':'Ventilation des nouveaux versements.'};
  }
  function propose(d,opts){
    const owner=opts.owner, budget=Math.max(0,n(opts.budget)), fee=Math.max(0,n(opts.feeRate??d.settings.feesRate));
    const mode=opts.mode||'equilibre';
    const funding=opts._fundingOverride||splitFunding(d,owner,budget,mode,opts.monthlyFGI??d.settings.monthlyFGI,opts.monthlyCGF??d.settings.monthlyCGF,opts.manualFGI,opts.manualCGF);
    const pre=calculate(d);const o=pre.owners.find(x=>x.owner===owner);
    if(!o)throw Error('Portefeuille introuvable.');
    const accounts=o.accounts;
    const accountFunds={};for(const a of accounts)accountFunds[a.id]=n(funding[a.sgi]||0)+(opts.useExistingCash?Math.max(0,a.available):0);
    const currentActive=eligibleHoldings(d,owner),activeStart=Object.values(currentActive).reduce((s,x)=>s+x,0);
    let reserve=0, fundLines=[];
    if(opts.includeFcp !== false) {
      const currentFunds=accounts.reduce((sum,a)=>sum+Object.values(a.positions).filter(x=>x.symbol==='SALAM_CI'||x.symbol==='ALBARAKA2').reduce((t,x)=>t+x.market,0),0);
      const desired=(o.total+budget)*Math.max(0,Math.min(0.3,n(opts.fcpTarget??d.settings.fcpTarget)));
      const c=accounts.find(a=>a.sgi==='CGF')||accounts[0];
      reserve=Math.min(Math.max(0,desired-currentFunds),accountFunds[c.id]||0);
      accountFunds[c.id]-=reserve;
      fundLines=[{symbol:'SALAM_CI',accountId:c.id,owner,sgi:c.sgi,amount:Math.round(reserve*2/3),status:'DOCUMENTS À VÉRIFIER'},{symbol:'ALBARAKA2',accountId:c.id,owner,sgi:c.sgi,amount:Math.round(reserve*1/3),status:'DOCUMENTS À VÉRIFIER'}];
    }
    const investable=Object.values(accountFunds).reduce((sum,x)=>sum+x,0)/(1+fee);
    const desiredActive=activeStart+investable;
    const goal=Object.fromEntries(symbols.map(s=>[s,desiredActive*n(d.settings.targets[s])]));
    const acquired={...currentActive};
    const localByAccount={};const lines=[];
    for(const a of accounts){
      const local=Object.fromEntries(symbols.map(s=>[s,n(a.positions[s]?.market)]));localByAccount[a.id]=local;
    }
    // La SGI la moins dotée en valeur CORE par titre est servie prioritairement,
    // sans jamais dépasser le budget de son propre compte.
    for(const a of accounts.slice().sort((a,b)=>a.sgi==='FGI'?-1:b.sgi==='FGI'?1:0)){
      let remaining=accountFunds[a.id],iterations=0;
      while(remaining>0&&iterations++<700){
        let best=null;
        const local=localByAccount[a.id];
        const localAll=Object.values(local).reduce((s,x)=>s+x,0);
        for(const sym of symbols){
          const price=qPrice(d,sym),allIn=price*(1+fee);
          if(!price||allIn>remaining+0.01)continue;
          const missing=goal[sym]-acquired[sym];
          if(missing<=-price*0.55)continue;
          const globalGap=missing/Math.max(1,goal[sym]);
          const localGap=(n(d.settings.targets[sym])*(localAll+remaining/(1+fee))-local[sym])/Math.max(1,localAll+remaining/(1+fee));
          const score=globalGap*4+localGap*.85-(price/Math.max(1,remaining))*.035;
          if(!best||score>best.score)best={sym,price,score};
        }
        if(!best||best.score<-0.2)break;
        const chosen=lines.find(l=>l.accountId===a.id&&l.symbol===best.sym);
        if(chosen){chosen.qty++;chosen.price=best.price;chosen.amount+=best.price;chosen.fees=round2(chosen.amount*fee);chosen.total=round2(chosen.amount+chosen.fees);}
        else lines.push({id:id(),owner,accountId:a.id,sgi:a.sgi,symbol:best.sym,qty:1,price:best.price,amount:best.price,fees:round2(best.price*fee),total:round2(best.price*(1+fee)),status:'PROJET',quoteDate:d.quotes?.[best.sym]?.date||''});
        acquired[best.sym]+=best.price;localByAccount[a.id][best.sym]+=best.price;remaining-=best.price*(1+fee);
      }
      accountFunds[a.id]=Math.max(0,round2(remaining));
    }
    // Optimisation discrète de la dernière ligne : échange de titres à budget constant
    // afin de rapprocher davantage les 7 pondérations cibles après le greedy.
    // Refus de toute nouvelle ligne bancaire ou surcoût sur un des comptes.
    const accountsById=Object.fromEntries(accounts.map(a=>[a.id,a]));
    const currentCounts={};
    for(const a of accounts){currentCounts[a.id]={};for(const sym of symbols)currentCounts[a.id][sym]=0;}
    for(const l of lines)currentCounts[l.accountId][l.symbol]=l.qty;
    function calcScore(counts){
      const v={...currentActive}; let added=0,spentBy={};
      for(const a of accounts){
        let spent=0;
        for(const s of symbols){const cost=n(counts[a.id][s])*qPrice(d,s);v[s]+=cost;added+=cost;spent+=cost*(1+fee);}
        spentBy[a.id]=spent;
      }
      const base=activeStart+added||1;
      const deviation=symbols.reduce((loss,s)=>loss+Math.pow(v[s]/base-n(d.settings.targets[s]),2),0)*1e6;
      let unused=0;for(const a of accounts){const limit=(funding[a.sgi]||0)+(opts.useExistingCash?Math.max(0,a.available):0)-(fundLines.filter(f=>f.accountId===a.id).reduce((x,y)=>x+y.amount,0));
        if(spentBy[a.id]>limit+0.02)return Infinity;
        unused+=Math.max(0,limit-spentBy[a.id]);}
      return deviation + unused/Math.max(1,base)*2;
    }
    let bestScore=calcScore(currentCounts);
    for(let iteration=0;iteration<28;iteration++){
      let proposal=null;
      for(const a of accounts){const k=a.id;
        for(const removeSym of [null,...symbols])for(const addSym of symbols){
          if(removeSym===addSym)continue;
          for(const remN of (removeSym?[1,2]:[0])){
            if(removeSym&&currentCounts[k][removeSym]<remN)continue;
            for(const addN of [1,2,3,4,5,6]){
              currentCounts[k][addSym]+=addN;
              if(removeSym)currentCounts[k][removeSym]-=remN;
              const v=calcScore(currentCounts);
              if(v < bestScore-0.001 && (!proposal||v<proposal.score))proposal={k,removeSym,remN,addSym,addN,score:v};
              currentCounts[k][addSym]-=addN;
              if(removeSym)currentCounts[k][removeSym]+=remN;
            }
          }
        }
      }
      if(!proposal)break;
      currentCounts[proposal.k][proposal.addSym]+=proposal.addN;
      if(proposal.removeSym)currentCounts[proposal.k][proposal.removeSym]-=proposal.remN;
      bestScore=proposal.score;
    }
    lines.splice(0,lines.length);
    for(const a of accounts)for(const sym of symbols){const qty=currentCounts[a.id][sym];if(!qty)continue;
      const price=qPrice(d,sym),amount=qty*price,fees=round2(amount*fee);
      lines.push({id:id(),owner,accountId:a.id,sgi:a.sgi,symbol:sym,qty,price,amount,fees,total:round2(amount+fees),status:'PROJET',quoteDate:d.quotes?.[sym]?.date||''});
    }
    for(const s of symbols)acquired[s]=currentActive[s]+lines.filter(l=>l.symbol===s).reduce((acc,l)=>acc+l.amount,0);
    for(const a of accounts){const used=lines.filter(l=>l.accountId===a.id).reduce((acc,l)=>acc+l.total,0);
      const baseline=(funding[a.sgi]||0)+(opts.useExistingCash?Math.max(0,a.available):0);
      accountFunds[a.id]=Math.max(0,round2(baseline-(fundLines.filter(l=>l.accountId===a.id).reduce((acc,l)=>acc+l.amount,0))-used));
    }
    const invested=lines.reduce((s,x)=>s+x.amount,0),fees=lines.reduce((s,x)=>s+x.fees,0);
    if(mode==='equilibre'&&!opts._fundingOverride && accounts.some(a=>a.sgi==='FGI')&&accounts.some(a=>a.sgi==='CGF')){
      const fgiFees=lines.filter(l=>l.sgi==='FGI').reduce((x,y)=>x+y.fees,0);
      const cgfFees=lines.filter(l=>l.sgi==='CGF').reduce((x,y)=>x+y.fees,0);
      const shift=Math.round((fgiFees-cgfFees)/2);
      if(Math.abs(shift)>20){
        const newFGI=Math.max(0,Math.min(budget,(funding.FGI||0)+shift));
        return propose(d,{...opts,_fundingOverride:{FGI:newFGI,CGF:budget-newFGI,note:'Égalisation ajustée des frais de courtage estimés.'}});
      }
    }
    const newTotals={};for(const a of accounts){const buyCost=lines.filter(l=>l.accountId===a.id).reduce((s,l)=>s+l.fees,0);newTotals[a.sgi]=a.total+(funding[a.sgi]||0)-buyCost;}
    const sumActive=Object.values(acquired).reduce((a,b)=>a+b,0);
    const futureShares=Object.fromEntries(symbols.map(x=>[x,100*acquired[x]/(sumActive||1)]));
    return {owner,budget,mode,funding,lines,fees:round2(fees),invested,unused:Object.values(accountFunds).reduce((a,b)=>a+b,0),fcpReserve:round2(reserve),fundLines,activeStart,projectedWeights:futureShares,projectedSGI:newTotals,target:clean(d.settings.targets),asOf:d.asOf};
  }
  const round2 = x => Math.round((x+Number.EPSILON)*100)/100;
  function record(d,raw){
    const next=clean(d);validate(next);
    const a=next.accounts.find(x=>x.id===raw.accountId);assert(a,'Compte inconnu.');
    const t={...raw};t.status='CONFIRMED';t.id=id();t.createdAt=Date.now();
    t.date=String(t.date||'').slice(0,10);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(t.date)&&(!next.asOf || t.date>next.asOf),'Date invalide ou antérieure/égale à la photographie initiale.');
    const allowed=['DEPOSIT','WITHDRAW','BUY','SELL','DIVIDEND','FEE','SPLIT','BONUS'];
    assert(allowed.includes(t.type),'Type d’opération non reconnu.');
    const ref=String(t.brokerRef||'').trim();assert(ref.length>=4,'Référence de justificatif obligatoire (4 caractères minimum).');
    assert(!next.transactions.some(v=>v.accountId===t.accountId&&v.brokerRef===ref),'Référence déjà enregistrée pour ce compte.');
    t.brokerRef=ref;
    const moneyTypes=['DEPOSIT','WITHDRAW','FEE'];
    if(moneyTypes.includes(t.type))assert(n(t.amount)>0,'Montant positif obligatoire.');
    if(['BUY','SELL'].includes(t.type)) {
      assert(/^[A-Z0-9_]{2,18}$/.test(String(t.symbol||'')),'Symbole invalide.');
      assert(n(t.qty)>0&&n(t.price)>0,'Quantité et cours positifs obligatoires.');
      assert(n(t.fees)>=0,'Frais invalides.');
      if(t.type==='BUY'&&['SGBC','CBIB'].includes(t.symbol)) throw Error('Nouveaux achats bancaires désactivés conformément à la stratégie CORE.');
      if(t.type==='BUY'&&['SALAM_CI','ALBARAKA2'].includes(t.symbol)&&!next.settings.fcpValidated) throw Error('Souscription FCP bloquée : confirmer les documents et activer les FCP dans les paramètres.');
      const cur=calculate(d).accounts.find(x=>x.id===t.accountId);
      if(t.type==='BUY') assert(cur.available>=n(t.qty)*n(t.price)+n(t.fees)-.01,'Cash disponible insuffisant : comptabiliser le versement réellement crédité avant de confirmer l’achat.');
      if(t.type==='SELL') assert(n(cur.positions[t.symbol]?.qty)>=n(t.qty),'Quantité vendue supérieure aux titres détenus.');
    }
    if(t.type==='DIVIDEND')assert(n(t.gross)>0&&n(t.tax)>=0&&n(t.fees)>=0&&n(t.gross)>=n(t.tax)+n(t.fees),'Dividende brut, retenue ou frais invalides.');
    if(t.type==='SPLIT') {
      assert(n(t.ratioFrom)>0&&n(t.ratioTo)>0,'Rapport de fractionnement invalide.');
      assert(!next.transactions.some(v=>v.type==='SPLIT'&&v.symbol===t.symbol&&v.date===t.date),'Fractionnement déjà appliqué à tous les comptes pour cette date.');
      const affected=calculate(d).accounts.filter(x=>n(x.positions[t.symbol]?.qty)>0);
      assert(affected.length>0,'Aucune action détenue à fractionner.');
      for(const holder of affected){const q=n(holder.positions[t.symbol].qty);
        assert(Math.abs(q*n(t.ratioTo)/n(t.ratioFrom)-Math.round(q*n(t.ratioTo)/n(t.ratioFrom)))<1e-6,'Le ratio produit une quantité fractionnaire pour '+holder.id+' ; rapprocher manuellement.');
      }
      // Un fractionnement coté s'applique à TOUS les détenteurs du titre,
      // et non à une seule SGI ; sinon le prix global ajusté dévaloriserait les autres comptes.
      for(const holder of affected)next.transactions.push({...t,id:id(),accountId:holder.id,brokerRef:t.brokerRef+'-'+holder.id,note:(t.note||'')+' [Événement global]'});
    } else {
      next.transactions.push(t);
    }
    if(t.type==='BONUS')assert(n(t.qty)>0,'Quantité positive obligatoire.');
    if(['WITHDRAW','FEE'].includes(t.type))assert(calculate(d).accounts.find(x=>x.id===t.accountId).available>=n(t.amount),'Cash insuffisant.');
    // Réévaluation théorique de la cote après un split : évite une hausse fictive
    // avant réception d’une nouvelle cotation officielle. Pas de nouveau cours de séance inventé.
    if(t.type==='SPLIT'&&next.quotes[t.symbol]){
      const old=next.quotes[t.symbol];next.quotes[t.symbol]={...old,price:round2(n(old.price)*n(t.ratioFrom)/n(t.ratioTo)),adjustedBySplit:true,source:'Théorique après fractionnement, à remplacer par une cotation officielle'};
    }
    // L'achat d'une part FCP fournit un dernier prix d'exécution, pas une VL actualisée.
    if(t.type==='BUY'&&['SALAM_CI','ALBARAKA2'].includes(t.symbol)&&!next.quotes[t.symbol])next.quotes[t.symbol]={price:n(t.price),date:t.date,source:'Prix d’exécution (VL ultérieure à renseigner)',estimated:true};
    const check=calculate(next).accounts.find(x=>x.id===t.accountId);assert(check.cash>=-0.01,'Écriture incompatible avec le solde de trésorerie.');
    if(t.type==='SPLIT'&&next.quotes[t.symbol]){ /* old event history remains reference only */ }
    return next;
  }
  function parseCSV(text) {
    const delimiter=text.split(/\r?\n/)[0].includes(';')?';':',';
    const data=[];let cell='',line=[],quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
      else if(c===delimiter&&!quoted){line.push(cell);cell='';}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;line.push(cell);if(line.some(x=>x.trim()))data.push(line);line=[];cell='';}
      else cell+=c;
    }
    if(cell.length||line.length){line.push(cell);data.push(line);}
    return data;
  }
  function extractQuotesCSV(text, prior={}) {
    const rows=parseCSV(text.trimStart());assert(rows.length>1,'Aucune cotation reconnue.');
    const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const hs=rows[0].map(norm);
    const pick=needles=>hs.findIndex(h=>needles.some(n=>h===n||h.includes(n)));
    const ix=pick(['symbole','symbol','ticker','codevaleur','codebrvm']);
    const ip=pick(['courscloture','closingprice','derniercours','lastprice','close','coursjour','cours']);
    const it=pick(['datedeseance','datesession','datecotation','seance','date']);
    assert(ix>=0&&ip>=0&&it>=0,'Colonnes CSV absentes (symbole, cours, date).');
    const result={};
    const aliases={TTLC:'TOCI',CBIBF:'CBIB'};
    for(const r of rows.slice(1)){
      const s=String(r[ix]||'').trim().toUpperCase(),sym=aliases[s]||s;
      if(!sym||!r[ip]||!r[it])continue;
      const raw=String(r[ip]).trim().replace(/\s/g,'').replace(/\u00a0/g,'');
      const dot=raw.includes(',')&&raw.includes('.')?raw.replace(/\./g,'').replace(',','.'):raw.replace(',','.');
      const price=Number(dot),date=String(r[it]).trim().slice(0,10);
      if(price<=0||!Number.isFinite(price)||!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
      if(prior[sym]&&prior[sym].date>date)continue;
      if(!result[sym]||result[sym].date<date)result[sym]={price,date,source:'BRVM Data / BRVM — CSV importé',marketSymbol:s};
    }
    assert(Object.keys(result).length>0,'Aucune cotation exploitable dans ce CSV.');
    return result;
  }
  function applyQuotes(d,updates){const x=clean(d);let count=0;for(const [sym,p] of Object.entries(updates)){const prev=x.quotes[sym];if(prev?.date&&p.date<prev.date)continue;x.quotes[sym]=p;count++;}return {next:x,count};}
  return {symbols,names,targets,market,empty,validate,calculate,eligibleHoldings,splitFunding,propose,record,parseCSV,extractQuotesCSV,applyQuotes,fmt:x=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(n(x)),percent:x=>n(x).toLocaleString('fr-FR',{maximumFractionDigits:1})+' %'};
});
