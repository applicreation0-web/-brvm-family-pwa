(() => {
  'use strict';
  const F=window.BRVM, E=window.BRVMEngine, V=window.BRVMVault, Q=window.BRVMQuotes, A=window.BRVMAnalysis;
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const attr=esc;
  const fmt=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2});
  const fc=v=>fmt.format(v)+' F';
  const amountIn=(v,c)=>!c||c==='XOF'?fc(v):fmt.format(v)+' '+c;
  const pct=v=>v==null?'—':fmt.format(v*100)+' %';
  const showDate=v=>F.date(v)?v.split('-').reverse().join('/'):'—';
  // Correspondance couleur↔titre fixe : filtrer une SGI ne change jamais l'identité visuelle d'un titre.
  const colors=Object.freeze({SNTS:'#00A86B',ORAC:'#2563EB',CIEC:'#FACC15',TOCI:'#F97316',
    SMBC:'#8B5CF6',NTLC:'#E11D48',PALC:'#0E7490',SGBC:'#F472B6',CBIB:'#94A3B8',
    Espèces:'#E7E5E4',SALAM_CI:'#84CC16',ALBARAKA2:'#C084FC'});
  const fallbackColors=['#1D4ED8','#F97316','#B91C1C','#0D9488','#A16207','#7C3AED'];
  const colorOf=s=>colors[s]||fallbackColors[[...s].reduce((x,c)=>x+c.charCodeAt(0),0)%fallbackColors.length];
  const col=['#00A86B','#2563EB','#FACC15','#F97316','#8B5CF6','#E11D48','#0E7490'];

  const labels={DEPOSIT:'Versement reçu',WITHDRAW:'Retrait',BUY:'Achat',SELL:'Vente',FEE:'Frais de compte',
    DIVIDEND:'Dividende encaissé',SPLIT:'Fractionnement / regroupement',BONUS:'Actions gratuites',RIGHTS:'Droits',
    STOCK_DIVIDEND:'Dividende en actions',RIGHTS_EXPIRY:'Expiration de droits',TRANSFER:'Transfert',CORRECTION:'Rectification'};
  const basis={manual:'Saisi localement',official:'Officiel (source déclarée)',provisional:'Provisoire',theoretical:'Théorique après split',execution:'Prix d’exécution'};
  const pages={dashboard:['Vue d’ensemble','▦'],accounts:['Comptes et positions','▤'],invest:['Investissement ponctuel','◎'],orders:['Ordres achat / vente','⇄'],
    events:['Dividendes et FCP','◈'],history:['Historique et analyses','◷'],settings:['Cibles et risques','⚙'],data:['Données et sauvegarde','⬡']};
  let store, record, db, calc, tab='dashboard', portfolioId='', busy=false, refreshing=false, plan=null, comparison=null, planInputs=null, importPreview=null;
  const resetKey=V.RESET_NOTICE+V.scope();
  const localChannel=typeof BroadcastChannel==='function'?new BroadcastChannel(resetKey):null;
  let importRevision, mergedImport, importReadTicket=0, pendingBackup=null;
  let quoteOptions=null, checkpoint=null, restoreFocus=null, sgiFilter='', historyMonth='', accountFilter='', journalLimit=40, archiveLimit=40, lastQuoteAttempt=0;
  const getPortfolio=()=>calc.portfolios.find(x=>x.id===portfolioId);
  const findAccount=id=>db.accounts.find(x=>x.id===id);
  const institution=id=>db.institutions.find(x=>x.id===id)?.label||'—';
  const accName=id=>{
    const a=findAccount(id);
    if(!a) return '—';
    const p=db.portfolios.find(x=>x.id===a.portfolioId);
    const owner=db.owners.find(x=>x.id===p?.ownerId);
    return [owner?.label,p?.label!==owner?.label?p?.label:'',institution(a.institutionId),a.label,a.currency==='XOF'?'':a.currency].filter(Boolean).join(' · ');
  };
  const activeAccounts=()=>db.accounts.filter(a=>!F.isArchived(db,a));
  const heading=(title,sub='')=>`<div class="pane-head"><h2>${esc(title)}</h2>${sub?`<p>${esc(sub)}</p>`:''}</div>`;
  const empty=(msg)=>`<p class="empty">${esc(msg)}</p>`;
  const pane=(title,body,subtitle='')=>`<article class="pane">${heading(title,subtitle)}${body}</article>`;
  const btn=(action,label,id='',style='secondary')=>`<button type="button" class="${style}" data-action="${action}" data-id="${attr(id)}">${esc(label)}</button>`;
  const go=(page,label)=>`<button type="button" class="primary" data-page="${page}">${esc(label)}</button>`;
  const tag=(text,kind='wait')=>`<span class="tag ${kind}">${esc(text)}</span>`;
  const field=(name,label,html)=>`<label class="field"><span>${esc(label)}</span>${html}</label>`;
  const input=(name,value='',type='text',options='')=>`<input name="${attr(name)}" type="${type}" value="${attr(value)}" ${options}>`;
  const money=(name,v='',required=true)=>input(name,v,'number',`step="0.01" min="0" ${required?'required':''}`);
  const integer=(name,v='',required=true)=>input(name,v,'number',`step="1" min="0" ${required?'required':''}`);
  const select=(name,options,selected='',extra='')=>`<select name="${attr(name)}" ${extra}>${options.map(([v,l])=>`<option value="${attr(v)}" ${selected===v?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  const accountsOptions=(list)=>list.map(a=>[a.id,accName(a.id)]);
  const symList=()=>[...new Set([...Object.keys(E.names),...Object.keys(db.quotes),...Object.keys(db.instruments),...db.positions.map(p=>p.symbol)])].sort();
  const symInput=(s='')=>`${input('symbol',s,'text','required maxlength="18" list="symbols" autocapitalize="characters"')}<datalist id="symbols">${symList().map(v=>`<option value="${attr(v)}">${esc(E.names[v]||db.instruments[v]?.label||v)}</option>`).join('')}</datalist>`;
  const table=(headers,rows)=>rows.length?`<div class="table-scroll" tabindex="0" role="region" aria-label="${attr(headers.join(', '))}"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')}</tbody></table></div>`:empty('Aucune donnée à afficher.');
  const form=(name,body,label='Enregistrer',id='')=>`<form data-form="${name}" data-id="${attr(id)}"><div class="form-body">${body}</div><div class="actions"><button type="submit" class="primary">${esc(label)}</button></div></form>`;
  function notify(message,error=false) {
    const n=$('#flash');
    n.hidden=false; n.textContent=message; n.className=error?'alert error':'alert';
  }
  function modal(title,body) {
    const m=$('#modal');
    if(!m.open) restoreFocus=document.activeElement;
    m.innerHTML=`<header><h2 id="modal-title">${esc(title)}</h2>${btn('close','Fermer')}</header><div class="dialog-body">${body}<div class="modal-error" role="alert" hidden></div></div>`;
    if(!m.open) m.showModal();
    m.querySelector('input:not([type=hidden]), select, textarea, button')?.focus();
  }
  function clearModal() {
    if($('#modal').open) return;
    $('#modal').replaceChildren();
    importPreview=null;mergedImport=null;importReadTicket++;quoteOptions=null;
  }
  function close() { $('#modal').close(); clearModal();restoreFocus?.focus(); }
  function showError(err) {
    const target=$('#modal[open] .modal-error')||$('#view form[data-form=unlock] + .modal-error');
    if(target) {target.hidden=false; target.textContent=err.message; target.scrollIntoView({block:'nearest'});}
    else notify(err.message,true);
  }
  async function put(next,replace=false,backupApproval=false) {
    if(!backupApproval && V.backupDue(db)) throw Error('Sauvegarde mensuelle obligatoire : téléchargez et vérifiez le ZIP avant toute modification.');
    record=await store.commit(next,record.revision,replace);
    db=record.data;
    calc=F.calculate(db);
    checkpoint=await store.read('checkpoint');
  }
  function download(value,name,mime='application/json') {
    const url=URL.createObjectURL(new Blob([value],{type:mime}));
    const a=document.createElement('a');
    a.href=url; a.download=name; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  async function exportMonthlyBackup() {
    if(!db?.accounts.length) throw Error('Ajoutez ou importez d’abord un compte.');
    const bundle=V.monthlyBundle(db);
    const fingerprint=await V.sha256(bundle.bytes);
    pendingBackup={fingerprint,month:bundle.month,revision:record.revision,bytes:bundle.bytes.length};
    download(bundle.bytes,'BRVM_SAUVEGARDE_'+bundle.month+'.zip','application/zip');
    modal('Sauvegarde mensuelle à vérifier',
      '<p>Le ZIP contient le JSON complet et un JSON par compte actif. Conservez ce fichier hors du téléphone, dans un espace privé. Les JSON sont en clair.</p>'+
      '<p><strong>Étape obligatoire :</strong> sélectionnez ci-dessous le ZIP que vous venez d’enregistrer. Le contenu et son empreinte seront contrôlés avant de débloquer les modifications.</p>'+
      '<label class="field"><span>Vérifier le ZIP sauvegardé</span><input id="backup-verify" type="file" accept=".zip,application/zip"></label>'+
      '<p class="quiet">La consultation et la récupération de données restent possibles même sans sauvegarde. L’application ne peut pas vérifier un stockage externe sans ce contrôle.</p>');
  }
  async function verifyMonthlyBackup(file) {
    const proof=pendingBackup;
    if(!proof || !file) throw Error('Relancez d’abord la sauvegarde mensuelle.');
    if(file.size!==proof.bytes || file.size>128*1024*1024)
      throw Error('La taille de la sauvegarde ne correspond pas.');
    const digest=await V.sha256(await file.arrayBuffer());
    if(digest!==proof.fingerprint) throw Error('Le fichier n’est pas identique au ZIP exporté.');
    if(record.revision!==proof.revision || V.monthKey()!==proof.month)
      throw Error('Les données ou le mois ont changé. Relancez la sauvegarde.');
    const next=structuredClone(db);
    next.settings.monthlyBackup={month:proof.month,verifiedAt:new Date().toISOString(),sha256:digest};
    await put(next,true,true);
    pendingBackup=null;
    close();render();
    notify('Sauvegarde du mois vérifiée. Les modifications sont à nouveau autorisées.');
  }
  function selectedSgiAccounts(p) {
    return sgiFilter ? p.accounts.filter(a=>a.institutionId===sgiFilter) : p.accounts;
  }
  function sgiPicker(p) {
    const ids=[...new Set(p.accounts.map(a=>a.institutionId))];
    if(sgiFilter&&!ids.includes(sgiFilter)) sgiFilter='';
    const choices=[['','Toutes les SGI'],...ids.map(id=>[id,institution(id)])];
    return `<label class="picker sgi-picker"><span>Camembert par SGI</span>${select('sgi-view',choices,sgiFilter,'id="sgi-view" aria-label="Filtrer le camembert par SGI"')}</label>`;
  }
  function portfolioPicker() {
    return `<label class="picker"><span>Portefeuille</span>${select('portfolio',calc.portfolios.map(p=>[p.id,p.label+(p.archived?' · archivé':'')]),portfolioId,'id="portfolio"')}</label>`;
  }
  function kpi(name,value,sub='',kind='') {
    return `<article class="kpi ${kind}"><p>${esc(name)}</p><strong>${esc(value)}</strong><small>${esc(sub)}</small></article>`;
  }
  function bars(rows) {
    const max=Math.max(1,...rows.map(r=>Math.abs(r.value)));
    return rows.length?`<ul class="bars">${rows.map((r,i)=>`<li><div><span><i style="background:${col[i%col.length]}"></i>${esc(r.label)}</span><b>${esc(r.display??fc(r.value))}</b></div><div class="track"><i style="width:${Math.abs(r.value)/max*100}%;background:${col[i%col.length]}"></i></div></li>`).join('')}</ul>`:empty('Aucune position valorisée.');
  }
  function curve(points) {
    if(points.length<2) return empty('La courbe apparaît après deux valorisations observées à des dates différentes.');
    const min=Math.min(...points.map(o=>o.value)), max=Math.max(...points.map(o=>o.value));
    const coords=points.map((o,i)=>[20+i*560/(points.length-1),140-(o.value-min)/Math.max(1,max-min)*112]);
    return `<figure class="curve"><svg viewBox="0 0 600 155" role="img" aria-label="Évolution du patrimoine selon les valorisations observées">
       <path d="M20 28H580 M20 84H580 M20 140H580" class="gridlines"/><polyline points="${coords.map(c=>c.join(',')).join(' ')}"/>
       ${coords.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="4"/>`).join('')}</svg>
       <figcaption><span>${showDate(points[0].date)} · ${fc(points[0].value)}</span><span>${showDate(points.at(-1).date)} · ${fc(points.at(-1).value)}</span></figcaption>
       <details><summary>Valeurs de la courbe</summary>${table(['Date','Valeur'],points.map(o=>[showDate(o.date),fc(o.value)]))}</details></figure>`;
  }
  function welcome() {
    return `<div class="welcome"><div><p class="overline">BOURSE RÉGIONALE DES VALEURS MOBILIÈRES</p><h2>Suivez vos portefeuilles BRVM.</h2><p>Retrouvez les positions, liquidités et ordres de chaque compte. Les comptes et les justificatifs sont conservés sur cet appareil.</p><div class="actions">${btn('import','Importer mes données','','primary')}${btn('new-account','Créer un compte')}</div></div><div class="welcome-art" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>`;
  }

  // Camembert fondé sur les titres réellement valorisés et les espèces, par portefeuille.
  // Les positions sans cours restent explicitement signalées, jamais converties en zéro "connu".
  function allocationVisual(p) {
    const selected=selectedSgiAccounts(p);
    const holdings=new Map();let cash=0, missing=0,missingFx=0;
    for(const a of selected) {
      const rate=a.rate?.xof||(a.currency==='XOF'?1:0);
      if(!rate) {if(a.cash||Object.values(a.positions).some(x=>x.qty)) missingFx++;continue;}
      cash+=a.cash*rate;
      for(const pos of Object.values(a.positions)) {
        if(pos.qty<=0) continue;
        if(!(pos.price>0)) {missing++;continue;}
        holdings.set(pos.symbol,(holdings.get(pos.symbol)||0)+pos.market*rate);
      }
    }
    const titles=[...holdings].filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]);
    const entries=titles.map(([symbol,value])=>({symbol,value}));
    if(cash>0) entries.push({symbol:'Espèces',value:cash});
    const total=entries.reduce((n,x)=>n+x.value,0);
    if(!total) return pane('Répartition réelle',empty('Aucune valeur connue à représenter. Ajoutez les cours des titres.'), 'Valorisations issues des cours disponibles');
    // Traits sombres explicites entre parts : deux couleurs proches ne fusionnent pas visuellement.
    let start=0;const stops=entries.flatMap(x=>{
      const from=start;start+=x.value/total*100;
      const gap=Math.min(.18,(start-from)/5);
      return ['#171b23 '+from.toFixed(5)+'% '+(from+gap).toFixed(5)+'%',
        colorOf(x.symbol)+' '+(from+gap).toFixed(5)+'% '+(start-gap).toFixed(5)+'%',
        '#171b23 '+(start-gap).toFixed(5)+'% '+start.toFixed(5)+'%'];
    }).join(', ');
    const core=E.symbols.reduce((n,x)=>n+(holdings.get(x)||0),0);
    const legend=entries.map(x=>{
      const actual=x.value/total;
      const coreWeight=E.symbols.includes(x.symbol)&&core>0?(holdings.get(x.symbol)||0)/core:null;
      const target=E.symbols.includes(x.symbol)?p.targets[x.symbol]:null;
      return `<li><span class="allocation-name"><i style="background:${colorOf(x.symbol)}" aria-hidden="true"></i><b>${esc(x.symbol)}</b><small>${esc(E.names[x.symbol]||'')}</small></span>
        <span class="allocation-value"><strong>${pct(actual)}</strong><small>${fc(x.value)}</small>${db.quotes[x.symbol]?'<small>Cours '+showDate(db.quotes[x.symbol].date)+(F.stale(db.quotes[x.symbol],db.settings.staleDays)?' · ancien':'')+'</small>':''}${target!=null?'<small>CORE : '+pct(coreWeight)+' / cible '+pct(target)+'</small>':''}</span></li>`;
    });
    const warning=missing||missingFx?`<p class="quiet" role="status">Répartition partielle : ${missing} titre(s) sans cours et ${missingFx} compte(s) sans conversion. Aucun montant inconnu n'est valorisé à zéro.</p>`:'';
    const title=sgiFilter?institution(sgiFilter):'Toutes les SGI';
    const compact=legend.slice(0,6).join('');
    const more=legend.length>6?`<details class="allocation-more"><summary>Afficher les ${legend.length-6} autres titres et espèces</summary><ul class="allocation-legend">${legend.slice(6).join('')}</ul></details>`:'';
    return `<article class="pane allocation"><div class="pane-head"><h2>Répartition réelle · ${esc(title)}</h2><p>Actifs valorisés, espèces comprises · ${fc(total)} · ${selected.length} compte(s)</p></div>
       ${sgiPicker(p)}
       <div class="allocation-grid"><div class="allocation-pie-wrap"><div class="allocation-pie" role="img" aria-label="Répartition ${esc(title)} des actifs cotés et espèces, repérée par couleurs et légende" style="background:conic-gradient(${stops})"><div class="allocation-hole"><small>Patrimoine connu</small><strong>${fc(total)}</strong></div></div></div>
       <div class="allocation-breakdown"><ul class="allocation-legend">${compact}</ul>${more}</div></div>${warning}
       <p class="quiet">Pourcentage principal = part du patrimoine connu. Sous chaque titre CORE : part des actions CORE / cible configurée. Les prix doivent être datés.</p>
       <div class="actions">${go('invest','Rééquilibrer sur les cibles')}${go('accounts','Voir les comptes')}${btn('new-account','Ajouter une SGI / un compte')}</div></article>`;
  }
  const validatedCore=()=>E.symbols.map(s=>s+' '+pct(E.targets[s])).join(' · ');
  function targetNotice(p) {
    if(!E.symbols.some(s=>Math.abs((p.targets[s]??0)-E.targets[s])>1e-8)) return '';
    return `<section class="core-notice" role="status"><strong>Les cibles de ce portefeuille diffèrent des objectifs CORE validés.</strong>
      <p>Sonatel 30 %, Orange 15 %, CIE 10 %, TotalEnergies 12 %, SMB 9 %, Nestlé 15 %, Palm 9 %.</p>
      <p class="quiet">Les objectifs ne sont jamais remplacés silencieusement. Aucun cours, titre, frais ou solde ne sera modifié.</p>
      ${btn('apply-core-targets','Rétablir les objectifs CORE validés','','primary')}</section>`;
  }
  function coreProgress(p) {
    const actual=Object.fromEntries(E.symbols.map(s=>[s,selectedSgiAccounts(p).reduce((sum,a)=>sum+(a.positions[s]?.market||0),0)]));
    const known=Object.values(actual).reduce((n,v)=>n+v,0);
    const rows=E.symbols.map(s=>{
      const weight=known?actual[s]/known:0, target=p.targets[s], diff=weight-target;
      const width=Math.min(100,Math.round(weight*100)),targetWidth=Math.min(100,Math.round(target*100));
      return `<div class="core-progress">
        <div class="core-line"><strong>${esc(s)}</strong><span>${known?pct(weight):'—'} · cible ${pct(target)} · écart ${known?(diff>=0?'+':'')+pct(diff):'—'}</span></div>
        <div class="core-track" aria-label="${esc(s)} actuellement ${pct(weight)}, cible ${pct(target)}"><span style="width:${width}%"></span><i style="left:${targetWidth}%"></i></div></div>`;
    }).join('');
    const missing=selectedSgiAccounts(p).some(a=>E.symbols.some(sym=>(a.positions[sym]?.qty||0)>0 && !(a.positions[sym]?.price>0)));
    return `<article class="pane"><div class="pane-head"><h2>CORE · ${esc(sgiFilter?institution(sgiFilter):'Toutes les SGI')} face aux cibles du portefeuille</h2><p>Le trait clair indique la cible, la barre représente le poids réel dans les actions CORE.</p></div>
      ${known?rows:empty('Aucune action CORE valorisée. Importez d’abord les cours.')}
      ${missing?'<p class="quiet">Cours manquants : les pourcentages sont incomplets.</p>':''}
      <div class="actions">${go('invest','Acheter les lignes sous-pondérées')}</div></article>`;
  }
  function quickActions() {
    return `<nav class="quick-actions" aria-label="Opérations essentielles">
      ${btn('trade-buy','Acheter','','primary')}${btn('trade-sell','Vendre')}
      ${btn('dividend-received','Dividende')}${btn('corporate-action','Opérations sur titres')}
      ${btn('monthly-backup','Sauvegarder')}</nav>`;
  }
  function dashboard() {
    if(!db.accounts.length) return welcome();
    const p=getPortfolio()||calc.portfolios[0], all=calc.all;
    const orderCount=db.orders.filter(o=>!['RAPPROCHÉ','ANNULÉ','NON EXÉCUTÉ'].includes(o.status)).length;
    const quotes=Object.values(db.quotes);
    const old=p.accounts.reduce((n,a)=>n+Object.values(a.positions).filter(x=>x.qty&&F.stale(x.quote,db.settings.staleDays)).length,0);
    const points=db.observations.filter(x=>x.portfolioId===p.id&&x.complete&&x.attestation==='close-v1').sort((a,b)=>a.date.localeCompare(b.date));
    return `<div class="context"><div><p class="overline">Portefeuille ${p.unknown?'· cours incomplets':''}</p><strong class="total">${fc(p.total)}</strong><p class="quiet">${p.accounts.length} compte(s) · Patrimoine familial connu : ${fc(all.total)}</p></div>${portfolioPicker()}</div>
      ${quickActions()}
      ${allocationVisual(p)}
      <div class="kpis">${kpi('Patrimoine du portefeuille',fc(p.total),p.unknown?'Valeur partielle':'Titres et liquidités','accent')}${kpi('Cash disponible',fc(p.available),`${fc(p.reserved)} réservés sur ${fc(p.cash)}`)}
      ${kpi('Plus-value latente',fc(p.pnl),p.unknown?'Positions cotées uniquement':`Coût réel des titres · ${fc(p.cost)}`,p.pnl<0?'loss':'gain')}
      ${kpi('Dividendes nets reçus',fc(p.dividends),`${fc(p.grossDividends)} bruts depuis l’ouverture`)}</div>
      ${targetNotice(p)}
      ${coreProgress(p)}
      ${points.length>1?pane('Évolution du patrimoine',curve(points),'Valeurs historiques validées et comparables'):''}
      <details class="dashboard-advanced"><summary>Voir le détail des comptes et des analyses</summary>
      <div class="split">${pane('Répartition par SGI',bars(calc.institutions.map(i=>({label:i.label,value:p.accounts.filter(a=>a.institutionId===i.id).reduce((n,a)=>n+(a.totalXof??0),0)}))))}</div>
      <div class="split">${pane('Suivi depuis l’ouverture',table(['Indicateur','Valeur'],[['Frais et taxes comptabilisés',fc(p.feesPaid+p.taxes)],['Gains réalisés',fc(p.realized)],['Apports nets',fc(p.netContribution)],['Ordres à suivre',orderCount],['Cours absents ou anciens',old],['Cours disponibles',quotes.length]])+`<div class="actions">${go('orders','Consulter les ordres')}</div>`)}</div>
      ${pane('Comptes familiaux',table(['Compte','Titres','Cash disponible','Patrimoine'],calc.accounts.map(a=>[esc(accName(a.id)),fc(a.market),amountIn(a.available,a.currency),a.totalXof==null?'Taux absent':fc(a.totalXof)]))) }</details>`;
  }
  function accountsView() {
    const p=getPortfolio();
    return `<div class="context compact">${p?portfolioPicker()+field('account','Filtrer les comptes',select('account',[['','Tous les comptes'],...accountsOptions(p.accounts)],accountFilter,'id="account-filter"')):''}<div class="actions">${btn('trade-buy','Acheter','','primary')}${btn('trade-sell','Vendre')}${btn('new-account','Ajouter une SGI / un compte')}</div></div>
      ${p?.accounts.filter(a=>!accountFilter||a.id===accountFilter).map(a=>pane(accName(a.id),
        `<div class="account-total"><strong>${amountIn(a.total,a.currency)}</strong><span>Cash ${amountIn(a.cash,a.currency)} · Disponible ${amountIn(a.available,a.currency)} · Réservé ${amountIn(a.reserved,a.currency)}</span>
        ${a.currency!=='XOF'?`<p class="quiet">${a.rate?`Contre-valeur indicative ${fc(a.totalXof)} · taux du ${showDate(a.rate.date)} · ${esc(a.rate.source)}${F.stale(a.rate,db.settings.staleDays)?' · taux ancien':''}`:'Taux absent · exclu du total XOF'}</p>`:''}
        ${F.isArchived(db,a)?tag('Archivé'):''}</div>`+
        table(['Instrument','Quantité','Coût de revient','PRU','Cours / VL','Valeur','P/L latent','Opération'],Object.values(a.positions).filter(s=>s.qty>0).map(s=>
          [`<b>${esc(s.symbol)}</b><br><small>${esc(db.instruments[s.symbol]?.label||E.names[s.symbol]||'')}${['SGBC','CBIB'].includes(s.symbol)?' · Banque historique':''}</small>`,
          fmt.format(s.qty),fc(s.cost),fc(s.cost/s.qty),s.price?`${fc(s.price)}<br><small>${showDate(s.quote.date)} ${F.stale(s.quote,db.settings.staleDays)?'· Ancien':''}${Math.abs(s.price-s.quote.price)>1e-7?' · Après split':''}</small>`:'—',
          s.price?fc(s.market):'—',s.pnl===null?'—':`<strong class="${s.pnl<0?'loss':'gain'}">${fc(s.pnl)}</strong>`,btn('sell-position','Vendre',a.id+'|'+s.symbol)])))).join('')||empty('Ajoutez un compte SGI pour suivre ses positions.')}
      ${pane('Personnes, portefeuilles et SGI',`<div class="actions">${btn('entity','Ajouter une personne','owners')}${btn('entity','Ajouter un portefeuille','portfolios')}${btn('entity','Ajouter une SGI','institutions')}</div>`+
        table(['Type','Nom','État','Action'],['owners','portfolios','institutions','accounts'].flatMap(group=>db[group].map(v=>[
          {owners:'Personne',portfolios:'Portefeuille',institutions:'SGI',accounts:'Compte'}[group],
          esc(group==='accounts'?accName(v.id):v.label),v.archived?'Archivé':'Actif',btn('entity','Modifier',group+'|'+v.id)]))))}`;
  }
  function accountForm(existing) {
    const a=existing||{};
    const options=(list,include)=>list.filter(x=>!x.archived||x.id===include).map(x=>[x.id,x.label]);
    return form('account',
      field('portfolioId','1. À quel portefeuille rattacher ce compte ?',select('portfolioId',options(db.portfolios,a.portfolioId),a.portfolioId||portfolioId,a.id?'disabled':''))+
      (!a.id?field('newPortfolio','Nouveau portefeuille si nécessaire',input('newPortfolio')):'')+
      field('institutionId','2. SGI déjà enregistrée',select('institutionId',[['','Choisir une SGI'],...options(db.institutions,a.institutionId)],a.institutionId,a.id?'disabled':''))+
      (!a.id?field('newInstitution','Ou saisir une nouvelle SGI (prioritaire si remplie)',input('newInstitution','','text','maxlength="200"')):'')+
      field('label','3. Nom du compte (facultatif)',input('label',a.label||'','text','maxlength="200"'))+
      (!a.id?field('currency','Devise du compte',select('currency',F.currencies.map(c=>[c,c]),'XOF'))+
      field('openedOn','Date d’ouverture',input('openedOn',F.today(),'date','required max="'+F.today()+'"'))+
      field('cash','Espèces réellement détenues sur le relevé (0 si compte neuf)',money('cash',0)):'')+
      `<div class="fields">${field('broker','Courtage estimé (%)',input('broker',(a.brokerRate??.01)*100,'number','min="0" max="1" step="0.01" required'))}
      ${field('other','Autres frais estimés (%)',input('other',Math.round((a.otherRate??.006)*10000)/100,'number','min="0" max="10" step="0.01" required'))}</div>`+
      (a.id?`<label class="check"><input name="archived" type="checkbox" ${a.archived?'checked':''}> Archiver le compte</label>`:'')+
      '<p class="quiet">Ce formulaire crée uniquement le suivi local. Ouvrez d’abord le compte auprès de la SGI. Aucun achat, dépôt, frais ou mensualité fictive n’est créé ; la photographie initiale doit correspondre au relevé.</p>','Enregistrer le compte',a.id);
  }
  function entityForm(group,id) {
    const names={owners:'personne',portfolios:'portefeuille',institutions:'SGI'};
    if(group==='accounts') return modal('Modifier le compte',accountForm(findAccount(id)));
    const entity=db[group].find(v=>v.id===id);
    modal((entity?'Modifier · ':'Ajouter · ')+names[group],form('entity',
      field('label','Nom / pseudonyme',input('label',entity?.label||'','text','required maxlength="200"'))+
      (group==='portfolios'?field('ownerId','Personne',select('ownerId',db.owners.map(o=>[o.id,o.label]),entity?.ownerId||'','required')):'')+
      (group==='owners'?field('kind','Type de personne',select('kind',[['adult','Adulte'],['child','Enfant']],entity?.kind||'adult')):'')+
      (entity?`<label class="check"><input name="archived" type="checkbox" ${entity.archived?'checked':''}> Archiver et conserver le suivi</label>`:''),
      'Enregistrer',group+'|'+(id||'')));
  }
  function investment() {
    const p=getPortfolio();
    if(!p) return welcome();
    const act=p.accounts.filter(a=>a.currency==='XOF'&&!F.isArchived(db,a)), inp=planInputs||{};
    const available=Math.floor(act.reduce((n,a)=>n+a.available,0));
    return `<div class="context compact">${portfolioPicker()}<p class="quiet">Investissement ponctuel uniquement. Aucune mensualité ni versement futur n'est ajouté fictivement.</p></div>
      <div class="invest-layout">${pane('Achat ponctuel · rattrapage des cibles',act.length?form('invest',`
      <fieldset><legend>1. Espèces disponibles par compte</legend>
      ${act.map(a=>`<div class="investment-account"><label class="check"><input name="accounts" type="checkbox" value="${attr(a.id)}" ${inp.accountIds?inp.accountIds.includes(a.id)?'checked':'':'checked'}>${esc(accName(a.id))}</label><small>Espèces mobilisables : ${fc(a.available)} · courtage maximal : 1 % (taux du compte ${pct(a.brokerRate)})</small></div>`).join('')}
      </fieldset>
      <fieldset><legend>2. Plafond ponctuel</legend>
      ${field('budget','Budget maximum à dépenser (FCFA)',integer('budget',inp.budget??available))}
      <p class="quiet">Le plafond est limité aux espèces réellement présentes sur les comptes sélectionnés. Pour investir un nouveau versement, enregistrez d'abord son crédit confirmé.</p>
      </fieldset>
      <label class="check"><input type="checkbox" name="verifiedOnly" ${inp.verifiedOnly?'checked':''}> Réserver la simulation aux titres dont la conformité est documentée</label>
      <p class="quiet">L'algorithme cible les titres CORE actuellement sous-pondérés. Il tient compte des prix datés, des actions entières et des frais estimés par SGI. Aucune vente n'est simulée automatiquement.</p>
      `,'Calculer l’investissement ponctuel') : empty('Aucun compte XOF actif dans ce portefeuille.'))}
      <div>${plan?proposal(plan):pane('Résultat',empty('Sélectionnez les comptes, puis calculez la proposition.'))}</div></div>`;
  }
  function proposal(p) {
    const rows=p.accounts.map(a=>[esc(accName(a.id)),fc(a.current),fc(a.cash),fc(a.fees),fc(a.cashRemaining),fc(a.forecast)]);
    const fees=p.lines.reduce((n,l)=>n+l.broker+l.other,0);
    const spent=p.lines.reduce((n,l)=>n+l.total,0);
    const coreRows=E.symbols.map(s=>[esc(s)+' · '+esc(E.names[s]||''),pct(p.before[s]),pct(p.targets[s]),pct(p.after[s]),pct(p.after[s]-p.targets[s])]);
    return pane('Achats ponctuels simulés',
      `<div class="account-total">${tag('Simulation sans exécution','ok')}<strong>${fc(spent)}</strong><span>Frais estimés inclus : ${fc(fees)}</span></div>
      <p class="quiet">Écart absolu aux cibles : ${pct(p.deviation.before)} avant → ${pct(p.deviation.after)} après. La valeur ne doit pas augmenter fictivement du montant dépensé : seul le coût des frais la réduit.</p>
      ${table(['Compte','Valeur actuelle','Cash disponible','Frais prévus','Cash après','Valeur après frais'],rows)}
      ${table(['Titre / compte','Qté à acheter','Cours daté','Courtage','Autres frais','Débit total estimé'],p.lines.map(l=>[
        `<b>${esc(l.symbol)}</b><br><small>${esc(accName(l.accountId))}</small>`,fmt.format(l.qty),
        `${fc(l.price)}<br><small>${showDate(l.quote.date)} · ${esc(l.quote.source)}</small>`,
        fc(l.broker),fc(l.other),fc(l.total)]))}
      <details open><summary>Répartition réelle, après achats et cible</summary>${table(['Titre CORE','Avant','Cible','Après','Écart après'],coreRows)}</details>
      <p class="quiet">Seul un avis d'opération confirmé modifie les quantités ou les liquidités. Les frais définitifs sont ceux du courtier, dans la limite du plafond de courtage de 1 %.</p>
      <div class="actions">${p.lines.length?btn('save-plan','Enregistrer les ordres d’achat proposés','','primary'):''}${btn('export-plan','Exporter la simulation')}${btn('trade-sell','Vendre des actions')}</div>`);
  }
  function ordersView() {
    const rows=db.orders.slice().reverse().map(o=>{
      const executed=calc.executed.get(o.id)||0;
      const actions={PROJET:[['TRANSMIS','Marquer transmis'],['ANNULÉ','Annuler'],['NON EXÉCUTÉ','Non exécuté']],
        TRANSMIS:[['ANNULÉ','Annuler'],['NON EXÉCUTÉ','Non exécuté']],
        'PARTIELLEMENT EXÉCUTÉ':[['ANNULÉ','Annuler le reliquat']], 'EXÉCUTÉ':[['RAPPROCHÉ','Rapprocher']]};
      return [`<b>${o.side==='SELL'?'Vente':'Achat'} · ${esc(o.symbol)}</b><br><small>${esc(accName(o.accountId))}</small>`,tag(o.status,o.status==='RAPPROCHÉ'?'ok':'wait'),
        `${fmt.format(executed)} / ${fmt.format(o.qty)}<br><small>Limite indicative ${fc(o.limit)}</small>`,
        `<div class="actions">${['TRANSMIS','PARTIELLEMENT EXÉCUTÉ'].includes(o.status)?btn('order-fill','Saisir l’avis',o.id,'primary'):''}
        ${(actions[o.status]||[]).map(([status,label])=>btn('order-state',label,o.id+'|'+status)).join('')}
        ${btn('order-trace','Voir le suivi',o.id)}</div>`];
    });
    return `<div class="context compact"><p class="quiet">Aucune transmission automatique à la SGI. Une opération réelle est comptabilisée seulement sur justificatif.</p><div class="actions">${btn('new-order','Créer un ordre achat / vente','','primary')}${btn('trade-buy','Achat exécuté')}${btn('trade-sell','Vente exécutée')}${go('invest','Répartir un achat')}</div></div>
      ${pane('Ordres et rapprochement',table(['Titre / compte','État','Rapproché / demandé','Actions'],rows))}
      ${pane('Scénarios enregistrés',table(['Date','Mode','Versements prévus'],db.plans.slice().reverse().map(p=>
        [showDate(p.date||p.createdDate),esc(p.mode||'—'),fc(Object.values(p.forecast||p.funding||{}).filter(v=>typeof v==='number').reduce((n,v)=>n+v,0))]))) }`;
  }
  function transaction(type='DEPOSIT',preset={}) {
    const list=activeAccounts();
    if(!list.length) throw Error('Créer un compte actif avant la saisie.');
    const a=preset.accountId||list.find(x=>x.portfolioId===portfolioId)?.id||list[0].id;
    const forced=!!(preset.orderId||preset.eventId||preset.corrects||preset.reinvests);
    modal(labels[type]||'Opération confirmée',form('tx',
      `<div class="fields">${field('type','Opération',select('type',Object.entries(labels).filter(([k])=>k!=='CORRECTION'||k===type),type,forced?'data-locked="yes"':''))}
      ${field('accountId','Compte',select('accountId',accountsOptions(list),a,forced?'data-locked="yes"':''))}
      ${field('date','Date effective',input('date',F.today(),'date','required max="'+F.today()+'"'))}
      ${field('brokerRef','Référence du justificatif',input('brokerRef','','text','required minlength="4" maxlength="180"'))}</div>
      <div class="fields" data-types="BUY SELL DIVIDEND SPLIT BONUS RIGHTS STOCK_DIVIDEND RIGHTS_EXPIRY">${field('symbol','Symbole',symInput(preset.symbol||''))}</div>
      <div class="fields" data-types="DEPOSIT WITHDRAW FEE TRANSFER">${field('amount','Montant confirmé dans la devise du compte',money('amount'))}</div>
      <div class="fields" data-types="TRANSFER">${field('toAccountId','Compte destinataire',select('toAccountId',accountsOptions(list),'','required'))}</div>
      <div class="fields" data-fx-transfer hidden>
        ${field('toAmount','Montant reçu en devise du compte destinataire',money('toAmount'))}
        ${field('exchangeRate','Unités reçues pour une unité débitée',input('exchangeRate','','number','min="0.000001" step="any" required'))}
        ${field('exchangeDate','Date du change',input('exchangeDate',F.today(),'date','required'))}
        ${field('exchangeSource','Référence du bordereau de change',input('exchangeSource','','text','required maxlength="200"'))}
      </div>
      <div class="fields" data-types="BUY SELL BONUS RIGHTS STOCK_DIVIDEND RIGHTS_EXPIRY">${field('qty','Quantité réelle',input('qty',preset.qty??'','number','required step="any" min="0.000001"'))}</div>
      <div class="fields" data-types="BUY SELL">${field('price','Prix unitaire réel (FCFA)',money('price'))}${field('broker','Courtage réel (FCFA)',money('broker',0))}
      ${field('actualTotal','Total débité / crédité sur avis (FCFA)',money('actualTotal'))}</div>
      <div class="fields" data-types="BUY SELL DIVIDEND">${field('other','Autres frais (FCFA)',money('other',0))}${field('tax','Impôts / retenue (FCFA)',money('tax',0))}</div>
      <div class="trade-preview" data-types="BUY SELL"><span>Montant calculé selon les frais saisis</span><strong data-trade-total>—</strong><small data-fee-hint>Renseignez le nombre d'actions et le cours.</small><small>Vérifiez chaque commission et le total réel sur l’avis. Courtage plafonné à 1 % du brut.</small></div>
      <div class="fields" data-types="DIVIDEND">${field('gross','Brut reçu (FCFA)',money('gross',preset.gross??''))}
      <label class="check"><input name="cashDistribution" type="checkbox"> FCP · distribution effectivement créditée hors VL</label>
      <p class="quiet">Contrôle par action facultatif : renseignez les trois champs pour vérifier la quantité éligible avant/après fractionnement.</p>
      ${field('dividendRecordDate','Date d’éligibilité du dividende',input('dividendRecordDate','','date'))}
      ${field('dividendEligibleQty','Nombre de titres éligibles',input('dividendEligibleQty','','number','step="1" min="1"'))}
      ${field('dividendGrossPerShare','Dividende brut par action (FCFA)',input('dividendGrossPerShare','','number','step="0.01" min="0.01"'))}
      ${field('dividendStatementRef','Avis de situation initiale (si date antérieure à la photographie)',input('dividendStatementRef','','text','maxlength="180"'))}</div>
      <div class="fields" data-types="SPLIT">${field('ratioFrom','Ancien nombre',integer('ratioFrom',1))}${field('ratioTo','Nouveau nombre',integer('ratioTo',10))}</div>
      <div class="fields" data-types="BONUS RIGHTS STOCK_DIVIDEND">
        ${field('recordDate','Date d’éligibilité avant attribution',input('recordDate','','date','required'))}
        ${field('underlying','Titre d’origine',input('underlying','','text','required maxlength="18"'))}
        ${field('ratioNumerator','Titres attribués au numérateur',integer('ratioNumerator',1))}
        ${field('ratioDenominator','Titres détenus au dénominateur',integer('ratioDenominator',1))}
        ${field('statementQty','Quantité éligible sur avis avant ouverture',integer('statementQty','',false))}
        ${field('statementRef','Référence de l’avis avant ouverture',input('statementRef','','text','maxlength="200"'))}
      </div>
      <div class="fields" data-types="SPLIT BONUS RIGHTS STOCK_DIVIDEND RIGHTS_EXPIRY">${field('source','Source de l’événement',input('source','','text','required maxlength="200"'))}</div>
      <div data-types="BUY" class="fields">${field('override','Motif de dérogation si titre exclu',input('override','','text','maxlength="200"'))}</div>
      ${preset.corrects?'<p>Le moteur recalcule les écritures suivantes. Une rectification incompatible est refusée sans modifier le journal.</p>':''}
      ${preset.reinvests?'<p>Achat confirmé financé par le dividende net associé, dans la limite du solde disponible.</p>':''}
      <div class="fields">${field('note',preset.corrects?'Motif de la rectification':'Note locale',input('note','','text',preset.corrects?'required minlength="5" maxlength="200"':'maxlength="200"'))}
      ${field('attachment','Pièce locale facultative (2 Mio max.)','<input name="attachment" type="file" accept=".pdf,.jpg,.jpeg,.png,.txt">')}</div>
      <input name="orderId" type="hidden" value="${attr(preset.orderId||'')}"><input name="eventId" type="hidden" value="${attr(preset.eventId||'')}"><input name="reinvests" type="hidden" value="${attr(preset.reinvests||'')}"><input name="corrects" type="hidden" value="${attr(preset.corrects||'')}">
      <label class="check"><input type="checkbox" name="confirmed" required> Les informations correspondent à un justificatif reçu.</label>`,'Comptabiliser'));
    let tx=$('#modal form');
    if(forced) {
      for(const name of ['type','accountId']) {const el=tx.elements[name];el.disabled=true;}
      if(preset.symbol) tx.elements.symbol.readOnly=true;
    }
    tx.dataset.type=type; tx.dataset.account=a;
    transactionFields(tx);
    tradePreview(tx);
  }
  function transactionFields(form) {
    const type=form.elements.type.value;
    const account=findAccount(form.elements.accountId.value);
    form.querySelectorAll('[data-types]').forEach(node=>{
      node.hidden=!node.dataset.types.split(' ').includes(type);
      node.querySelectorAll('input,select').forEach(el=>el.disabled=node.hidden);
    });
    if(type==='TRANSFER') {
      const owner=db.portfolios.find(p=>p.id===account?.portfolioId)?.ownerId;
      for(const o of form.elements.toAccountId.options) {
        const dest=findAccount(o.value);
        o.disabled=account?.id===o.value||db.portfolios.find(p=>p.id===dest?.portfolioId)?.ownerId!==owner;
      }
      if(form.elements.toAccountId.selectedOptions[0]?.disabled)
        form.elements.toAccountId.value=[...form.elements.toAccountId.options].find(o=>!o.disabled)?.value||'';
    }
    const dest=findAccount(form.elements.toAccountId.value), exchange=form.querySelector('[data-fx-transfer]');
    exchange.hidden=!(type==='TRANSFER'&&account&&dest&&account.currency!==dest.currency);
    exchange.querySelectorAll('input').forEach(el=>el.disabled=exchange.hidden);
  }
  function tradePreview(form) {
    const type=form.elements.type?.value||form.dataset.type;
    if(!['BUY','SELL'].includes(type)) return;
    const qty=Number(form.elements.qty?.value)||0, price=Number(form.elements.price?.value)||0;
    const broker=Number(form.elements.broker?.value)||0;
    const other=Number(form.elements.other?.value)||0, tax=Number(form.elements.tax?.value)||0;
    const gross=qty*price, net=type==='BUY'?gross+broker+other+tax:gross-broker-other-tax;
    const output=form.querySelector('[data-trade-total]');
    if(output) output.textContent=qty>0&&price>0?fc(net)+' · '+(type==='BUY'?'débit':'crédit'):'Renseignez quantité, cours et frais.';
    const a=findAccount(form.elements.accountId?.value), hint=form.querySelector('[data-fee-hint]');
    if(hint) hint.textContent=qty>0&&price>0&&a?'Barème indicatif de ce compte : courtage '+pct(a.brokerRate)+' (~'+fc(Math.floor(gross*a.brokerRate*100)/100)+'), autres frais '+pct(a.otherRate)+' (~'+fc(Math.floor(gross*a.otherRate*100)/100)+'). Seul le bordereau fait foi.':'Renseignez quantité et cours pour afficher le barème indicatif du compte.';
  }
  function eventsView() {
    const eventRows=db.events.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(e=>[
      esc(e.symbol)+'<br><small>'+esc(accName(e.accountId))+'</small>',showDate(e.date),tag(e.status,e.status==='PAYÉ'?'ok':'wait'),
      e.gross?fc(e.gross):'—',esc(e.source),
      e.status==='PAYÉ'?'—':`<div class="actions">${e.status==='ANNONCÉ'?btn('event-step','Marquer détaché',e.id):''}
      ${e.status==='DÉTACHÉ'?btn('event-step','Marquer dû',e.id):''}${btn('event-pay','Confirmer l’encaissement',e.id)}</div>`]);
    return `<div class="context compact"><p class="quiet">Les annonces servent au suivi. Seul un paiement rapproché augmente le cash.</p><div class="actions">
      ${btn('event','Ajouter une annonce','','primary')}${btn('transaction','Saisir un événement','SPLIT')}${btn('instrument','Documenter un FCP')}</div></div>
      ${pane('Calendrier des dividendes',table(['Titre / compte','Date','État','Brut prévu','Source','Actions'],eventRows))}
      ${pane('Fonds communs de placement',table(['Fonds','VL observée','Distribution','Dossier','Action'],Object.entries(db.instruments).filter(([,i])=>i.kind==='FCP').map(([s,i])=>[
        `${esc(i.label)}<br><small>${esc(s)}</small>`,db.quotes[s]?fc(db.quotes[s].price)+' · '+showDate(db.quotes[s].date):'—',
        {capitalizing:'Capitalisation dans la VL',distributing:'Distribution en cash',unknown:'À vérifier'}[i.distribution]||'À vérifier',
        `${tag(F.screening(i))}${i.checked?'<br><small>'+showDate(i.checked)+'</small>':''}`,btn('instrument','Documenter',s)])),
        'Les frais prélevés dans la VL restent dans la valorisation. Les commissions payées directement se saisissent sur l’avis.')}
    `;
  }
  function instrumentForm(s='') {
    const i=db.instruments[s]||{};
    modal('Dossier de l’instrument',form('instrument',
      field('symbol','Symbole',symInput(s))+
      field('label','Libellé',input('label',i.label||E.names[s]||'','text','required maxlength="200"'))+
      field('kind','Instrument',select('kind',[['FCP','FCP'],['ACTION','Action'],['DROIT','Droit']],i.kind||'FCP'))+
      field('distribution','Distributions FCP',select('distribution',[['unknown','À vérifier'],['capitalizing','Capitalisation dans la VL'],['distributing','Paiement en cash']],i.distribution||'unknown'))+
      field('screen','Statut du contrôle',select('screen',[['À vérifier','À vérifier'],['Exclu','Exclu'],['Vérifié','Vérifié sur pièces par l’utilisateur'],['Revue documentée','Revue indépendante documentée']],i.screen||'À vérifier'))+
      field('checked','Date du contrôle',input('checked',i.checked||'','date','max="'+F.today()+'"'))+
      field('reviewUntil','Contrôle valable jusqu’au (facultatif)',input('reviewUntil',i.reviewUntil||'','date'))+
      field('evidence','Référence du justificatif de conformité',input('evidence',i.evidence||'','text','maxlength="200"'))+
      field('method','Méthode ou référentiel',input('method',i.method||'','text','maxlength="200"'))+
      field('reviewer','Organisme indépendant (si applicable)',input('reviewer',i.reviewer||'','text','maxlength="200"'))+
      field('mandate','Référence du mandat FCP',input('mandate',i.mandate||'','text','maxlength="200"'))+
      field('prospectus','Référence du prospectus FCP',input('prospectus',i.prospectus||'','text','maxlength="200"'))+
      field('feeEvidence','Frais de souscription, gestion et rachat',input('feeEvidence',i.feeEvidence||'','text','maxlength="200"'))+
      '<p class="quiet">Documentez la méthode et la source du filtrage. Une coche ne constitue pas une certification.</p>','Enregistrer',s));
  }
  function foundationForm(s='') {
    const q=db.quotes[s], i=db.instruments[s]||{}, f=i.fundamentals||{};
    modal('Analyse de l’émetteur',form('foundation',field('symbol','Symbole',symInput(s))+
      field('date','Date du document',input('date',f.date||q?.date||F.today(),'date','required max="'+F.today()+'"'))+
      field('source','Source publique / référence',input('source',f.source||'','text','maxlength="200" required'))+
      `<div class="fields">${[['per','PER'],['revenue','Chiffre d’affaires (FCFA)'],['earnings','Résultat net (FCFA)'],['growth','Croissance (%)'],['margin','Marge (%)'],['yield','Rendement du dividende (%)'],['volume','Volume (titres)'],['turnover','Valeur échangée (FCFA)']].map(([k,l])=>
        field(k,l,input(k,f[k]??'','number','step="any"'))).join('')}</div>`+
      field('risk','Risque identifié',input('risk',f.risk||'','text','maxlength="200"')),'Enregistrer',s));
  }
  function settingsView() {
    const p=getPortfolio();
    return `<div class="context compact">${p?portfolioPicker():''}<p class="quiet">Les cibles s’appliquent au portefeuille sélectionné.</p></div>
      <div class="split">${pane('Cibles CORE',p?form('targets',`<div class="targets">${E.symbols.map(s=>
        field(s,`${s} · ${E.names[s]} (%)`,input(s,Math.round(p.targets[s]*10000)/100,'number','min="0" max="100" step="0.01" required'))).join('')}</div>
        <p class="quiet">Télécom Sonatel + Orange : ${pct(p.targets.SNTS+p.targets.ORAC)} de la cible CORE. Total des cibles : 100 %.</p>
        ${targetNotice(p)}`,
        'Enregistrer les cibles',p.id):empty('Créez un portefeuille pour fixer ses cibles.'))}
      ${pane('Filtrage et vigilance',`<p>Les banques historiques SGBC et CBIB restent en portefeuille. Elles sont exclues des propositions. Toute saisie d’achat exclu requiert un motif.</p>
        <p>Examiner l’activité, les revenus et ratios financiers et les critères du référentiel choisi. Écarter alcool, tabac, jeux et banques à intérêt selon la stratégie du portefeuille.</p>
        <p class="quiet">Les statuts sont documentés localement. Une absence de source ou une donnée ancienne nécessite une nouvelle vérification.</p>
        <div class="actions">${btn('instrument','Documenter un titre')}${btn('foundation','Saisir des données émetteur')}</div>`)}</div>
      ${pane('Données financières publiques et vérifications',table(['Titre','PER','Revenus / résultat / marge / croissance','Rendement','Volume / valeur','Date et source','Filtrage / risque','Actions'],symList().map(s=>{
        const q=db.quotes[s], i=db.instruments[s], f=i?.fundamentals||q?.fundamentals||{};
        const val=k=>f[k]==null?'Indisponible':fmt.format(f[k]);
        return [s,val('per'),[val('revenue'),val('earnings'),val('margin'),val('growth')].join(' / '),val('yield'),[val('volume'),val('turnover')].join(' / '),
          `${showDate(f.date||q?.date)}<br><small>${esc(f.source||q?.source||'Source à renseigner')}</small>`,
          esc(F.screening(i))+(f.risk?'<br><small>'+esc(f.risk)+'</small>':''),
          `<div class="actions">${btn('instrument','Filtrage',s)}${btn('foundation','Analyse',s)}</div>`];
      }))) }`;
  }
  function journalRow(t) {
    let value='—';
    if(['BUY','SELL'].includes(t.type)) value=fc(F.tradeAmounts(t).total/100);
    if(t.type==='DIVIDEND') value=fc(t.gross-(t.tax||0)-(t.other??t.fees??0));
    if(t.amount!=null && !['BUY','SELL','DIVIDEND'].includes(t.type)) value=amountIn(t.amount,findAccount(t.accountId)?.currency)+(t.exchange?' → '+amountIn(t.toAmount,findAccount(t.toAccountId)?.currency):'');
    return [showDate(t.date),`${esc(accName(t.accountId))}${t.toAccountId?'<br>Vers '+esc(accName(t.toAccountId)):''}`,
      esc(labels[t.type])+(t.symbol?' · '+esc(t.symbol):'')+
      (t.reinvests?' · Réinvestissement':db.transactions.some(x=>x.corrects===t.id)?' · Rectifiée':''),value,
      esc(t.brokerRef)+(t.note?'<br><small>'+esc(t.note)+'</small>':''),
      `<div class="actions">${btn('tx-detail','Détail',t.id)}${t.attachmentId?btn('attachment','Télécharger la pièce',t.attachmentId):''}
      ${t.type==='DIVIDEND'&&!db.transactions.some(x=>x.corrects===t.id)?btn('reinvest','Réinvestir sur avis',t.id):''}
      ${['DEPOSIT','WITHDRAW','FEE','TRANSFER','BUY','SELL','DIVIDEND','BONUS','RIGHTS','STOCK_DIVIDEND','RIGHTS_EXPIRY'].includes(t.type)&&!db.transactions.some(x=>x.corrects===t.id)?btn('correct','Rectifier',t.id):''}</div>`];
  }
  function historyView() {
    const p=getPortfolio();
    const perf=p?A.performance(db,p.id):{twr:null,xirr:null,gain:null,observations:[]};
    const txs=db.transactions.filter(t=>!historyMonth||t.date.startsWith(historyMonth)).slice().reverse();
    return `<div class="context compact">${p?portfolioPicker():''}<div class="actions">${btn('trade-buy','Acheter','','primary')+btn('trade-sell','Vendre')+btn('dividend-received','Dividende')}${btn('export-journal','Exporter le journal CSV')}${db.asOf&&db.accounts.length?btn('opening-proof','Rapprocher une archive')+btn('opening-revise','Corriger la photographie'):''}</div></div>
      <div class="split">${pane('Performance observée',`<div class="mini-kpis">${kpi('TWR',pct(perf.twr))}${kpi('XIRR annualisé',pct(perf.xirr))}${kpi('Gain net des apports',perf.gain===null?'—':fc(perf.gain))}</div>
        <p class="quiet">TWR calculé sur des intervalles valorisés sans flux. XIRR utilise les flux datés et exige une solution identifiable. Les tirets signalent des observations insuffisantes.</p>`+
        curve(perf.observations.filter(o=>o.complete)))}
      ${pane('Situation financière',p?table(['Indicateur','Montant'],[
        ['Actions valorisées',fc(p.market)],['Espèces disponibles',fc(p.available)],
        ['Frais et taxes enregistrés',fc(p.feesPaid+p.taxes)],
        ['Plus-value réalisée sur ventes',fc(p.realized)],['Dividendes nets encaissés',fc(p.dividends)]
      ]):empty('Aucun portefeuille sélectionné'))}</div>
      ${pane('Journal des écritures locales',`<div class="context compact">${field('month','Filtrer par mois',input('month',historyMonth,'month','id="history-month"'))}<span class="quiet">${txs.length} écritures</span></div>`+
        table(['Date','Compte','Opération','Montant','Référence','Actions'],txs.slice(0,journalLimit).map(journalRow))+
        (txs.length>journalLimit?`<div class="actions">${btn('history-more','Afficher 40 écritures de plus')}</div>`:''))}
      ${pane('Archives comprises dans le solde d’ouverture',table(['Date','Compte','Opération','Justificatif / état','Montant'],db.history.slice().reverse().slice(0,archiveLimit).map(t=>[
        F.date(t.date)?showDate(t.date):'—',esc(accName(t.accountId)),esc(labels[t.type]||t.kind||t.type||'')+(t.symbol?' · '+esc(t.symbol):''),
        esc([t.reference,t.status,t.note].filter(Boolean).join(' · '))+(t.attachmentId?' '+btn('attachment','Télécharger la pièce',t.attachmentId):''),typeof (t.actualTotal??t.amount)==='number'?fc(t.actualTotal??t.amount):'—']))+
        (db.history.length>archiveLimit?`<div class="actions">${btn('archive-more','Afficher 40 archives de plus')}</div>`:''),
        'Consultation uniquement. Les écritures historiques sont déjà incluses dans les soldes d’ouverture.')}
    `;
  }
  function dataView() {
    return `<div class="split">${pane('Sauvegardes privées',`<p>Sauvegarde mensuelle obligatoire : un ZIP contenant le JSON complet et un fichier indépendant pour chaque compte. Le mois est validé après relecture du fichier exporté.</p><p>Exportez une sauvegarde chiffrée pour la conserver ou la restaurer sur un autre appareil. Le navigateur ne synchronise pas les portefeuilles. ${store.protected?'Le coffre actif est chiffré sur cet appareil. Verrouillez-le avant de quitter le profil.':'Les données actives sont stockées en clair. Vous pouvez activer le coffre local.'}</p>
      <div class="actions">${btn('monthly-backup','Sauvegarde mensuelle JSON · '+(V.backupDue(db)?'À effectuer':'Vérifiée'),'','primary')}${store.protected?btn('lock','Verrouiller le coffre'):btn('protect','Chiffrer les données actives')}${btn('encrypt','Exporter chiffré','','primary')}${btn('import','Importer mes données')}${btn('import','Restaurer une sauvegarde')}${btn('export-json','Exporter mon JSON')}${btn('reset','Effacer mes données locales')}${checkpoint?btn('rollback','Restaurer le point précédent'):''}</div>
      <p class="quiet">Une importation de remplacement garde le jeu précédent dans un point de restauration local. Sauvegardez avant de désinstaller, de changer d’adresse ou d’effacer les données du navigateur.</p>
      <details><summary>Données d’une ancienne version</summary><p>BRVM V2 et certaines versions V3 utilisaient un stockage commun à cette adresse. Vérifiez le contenu avant de le reprendre.</p>${btn('legacy','Voir les données de l’ancienne version')}</details>`)}
      ${pane('Sources de marché',`<p>L’actualisation automatique exige un flux autorisé pour cette installation. Le téléchargement manuel du fournisseur et l’import local restent disponibles.</p>
      <div class="actions"><a href="${Q.URL}" target="_blank" rel="noopener noreferrer">Télécharger le CSV BRVMData</a>${btn('refresh','Actualiser','','primary')}${btn('quote-import','Importer CSV ou JSON')}${btn('manual-quote','Saisir un cours / une VL')}</div>
      ${form('stale',field('days','Seuil en jours ouvrés estimés (week-ends exclus)',input('days',db.settings.staleDays,'number','required min="1" max="365" step="1"'))+
      `<label class="check"><input type="checkbox" name="autoQuotes" ${db.settings.autoQuotes?'checked':''}> Actualiser automatiquement un flux autorisé pendant l’utilisation</label>`,
      'Enregistrer les paramètres de marché')}
      <div class="actions"><a href="https://brvmdata.com/donnees/actions-derniere-seance/" rel="noopener noreferrer" target="_blank">Dernière séance BRVMData</a><a href="https://www.brvm.org/fr/bulletins-officiels-de-la-cote" rel="noopener noreferrer" target="_blank">Bulletins officiels BRVM</a></div>`)}</div>
      ${pane('Taux de change',form('fx',
        `<div class="fields">
        ${field('currency','Devise',select('currency',F.currencies.filter(c=>c!=='XOF').map(c=>[c,c]),'EUR'))}
        ${field('date','Date de référence',input('date',F.today(),'date','required max="'+F.today()+'"'))}
        ${field('xof','FCFA pour une unité de devise',input('xof','','number','required min="0.000001" step="any"'))}
        ${field('source','Source ou référence',input('source','','text','required maxlength="200"'))}
        </div>`,'Enregistrer le taux')+
        table(['Devise','Date','FCFA par unité','Source'],(db.fxRates||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r=>[esc(r.currency),showDate(r.date),String(r.xof),esc(r.source)])),
        'Les taux renseignés restent locaux. Ils servent aux contre-valeurs et ne modifient pas les balances natives.')}
      ${pane('Derniers cours et valeurs liquidatives',table(['Symbole','Prix','Date de séance','Récupéré le','Qualité','Source'],Object.entries(db.quotes).sort(([a],[b])=>a.localeCompare(b)).map(([s,q])=>[
        esc(s)+(q.kind==='FCP'?' · VL':''),fc(q.price),showDate(q.date),showDate(q.retrievedOn),
        tag(q.status==='suspended'?'Suspendu':q.status==='reference'?'Cours de référence · non traité':basis[q.basis],q.basis==='official'?'ok':'wait')+
        (F.stale(q,db.settings.staleDays)?' '+tag('Ancien'):'')+(db.transactions.some(t=>t.type==='SPLIT'&&t.symbol===s&&t.date>q.date)?' '+tag('Avant split'):''),
        esc(q.source)]))) }`;
  }
  function render() {
    if(!db) return;
    if(!calc.portfolios.some(p=>p.id===portfolioId)) portfolioId=calc.portfolios[0]?.id||'';
    if(sgiFilter && !calc.portfolios.find(p=>p.id===portfolioId)?.accounts.some(a=>a.institutionId===sgiFilter)) sgiFilter='';
    $('#nav').innerHTML=Object.entries(pages).map(([key,[label,icon]])=>
      `<button type="button" data-page="${key}" ${key===tab?'aria-current="page"':''}><span aria-hidden="true">${icon}</span>${label}</button>`).join('');
    $('#page-title').textContent=pages[tab][0];
    const last=Object.values(db.quotes).map(q=>q.date).sort().at(-1);
    $('#quote-date').textContent=last?'Cours enregistrés · '+showDate(last):'Aucun cours chargé';
    $('#view').innerHTML=(V.backupDue(db)?'<section class="backup-banner" role="status"><span><strong>Sauvegarde du mois requise.</strong> Les modifications restent verrouillées.</span>'+btn('monthly-backup','Sauvegarder et vérifier','','primary')+'</section>':'')+
      {dashboard,accounts:accountsView,invest:investment,orders:ordersView,events:eventsView,
      history:historyView,settings:settingsView,data:dataView}[tab]();
  }
  function goTo(page) {
    if(!Object.hasOwn(pages,page)) return;
    tab=page; $('#flash').hidden=true;
    document.body.classList.remove('menu-open'); $('#menu').setAttribute('aria-expanded','false');
    render(); $('#view').focus({preventScroll:true}); window.scrollTo(0,0);
  }
  function marketUpdateHelp() {
    const last=Object.values(db.quotes).map(q=>q.date).sort().at(-1);
    modal('Mettre à jour les cours BRVM',`
      <p class="market-update-intro">Dernière séance enregistrée : <strong>${showDate(last)}</strong>.
      Cette installation n'a actuellement aucun flux automatique autorisé :
      appuyer sur « Actualiser » ne peut donc pas inventer une nouvelle clôture.</p>
      <div class="market-update-options">
        ${btn('quote-import','1. Importer un fichier de cours CSV / JSON','','primary')}
        <a href="https://brvmdata.com/telechargements/actions-derniere-seance.csv" target="_blank" rel="noopener noreferrer">2. Télécharger les cours de dernière séance (BRVMData)</a>
        <a href="https://www.brvm.org/fr/marche/bulletin-officiel-de-la-cote" target="_blank" rel="noopener noreferrer">3. Vérifier le Bulletin officiel BRVM</a>
      </div>
      <p class="quiet">Importez le CSV téléchargé, puis indiquez sa provenance. L'app conserve la date de séance,
      la source et la qualité de chaque cotation et refuse les fichiers invalides ou les séances contradictoires.
      Les titres, les quantités et les espèces ne changent pas lors d'une actualisation des cours.</p>`);
  }
  async function refresh(silent=false) {
    if(refreshing) return;
    refreshing=true;lastQuoteAttempt=Date.now();
    try {
      const quotes=await Q.online();
      if(!busy && (!silent||!$('#modal').open)) {
        busy=true;
        try {
          const result=F.quoteUpdates(db,quotes);
          if(result.count) {await put(result.next); render();}
          if(!silent) notify(result.count?result.count+' cotations enregistrées.':'Les dernières cotations sont déjà enregistrées.');
        } finally {busy=false;}
      }
    } catch(err) {if(!silent) notify('Les cours locaux sont conservés. Vérifiez la source ou importez un CSV depuis Données et sauvegarde.',true);}
    finally {refreshing=false;}
  }
  const phraseFields=()=>field('pass','Phrase secrète (12 caractères ou plus)',input('pass','','password','required minlength="12" maxlength="1024" autocomplete="new-password"'))+
    field('again','Répéter la phrase',input('again','','password','required minlength="12" maxlength="1024" autocomplete="new-password"'));
  function preview(d) {
    // Backup verification is local to each device. Restoring an old JSON never
    // certifies that a new independent copy exists on this device.
    d=structuredClone(d);
    if(d.settings) delete d.settings.monthlyBackup;
    importPreview=d;
    importRevision=record.revision;
    const fact=F.calculate(d), identical=V.same(d,db);
    const hasLocal=db.accounts.length||db.owners.length||db.portfolios.length||db.transactions.length||db.history.length;
    mergedImport=hasLocal&&!identical?V.merge(db,d):null;
    modal('Aperçu de l’import',`
      <p>${d.accounts.length} comptes · ${d.positions.length} positions d’ouverture · ${d.transactions.length} écritures locales · ${d.history.length} archives</p>
      ${table(['Portefeuille','Cash','Valeur connue'],fact.portfolios.map(p=>[esc(p.label),fc(p.cash),fc(p.total)]))}
      <p>${identical?'Ce fichier est identique aux données locales. Aucune écriture ne sera ajoutée.':
        hasLocal?'Le remplacement conserve le jeu précédent. Une fusion est proposée uniquement lorsque les données peuvent être réunies sans doublon ni rejeu.':'Les données seront enregistrées après votre confirmation.'}</p>
      ${form('restore',
        (mergedImport?field('mode','Action',select('mode',[['merge','Fusionner les comptes compatibles'],['replace','Remplacer les données locales']],'merge','required')):'')+
        (hasLocal&&!identical?'<label class="check"><input name="acceptReplace" type="checkbox"> Je comprends qu’un remplacement supprime tous les comptes absents du fichier importé.</label>':'')+
        (store.protected?'':'<p>Configurez le coffre pour enregistrer cet import sur cet appareil.</p>'+phraseFields()),
        identical?'Confirmer sans doublon':hasLocal?'Appliquer le choix':'Importer et enregistrer')}`);
  }
  async function chooseImport(file) {
    const ticket=++importReadTicket;
    $('#flash').hidden=true;
    const isZip=/\.zip$/i.test(file.name);
    if(file.size>(isZip?128*1024*1024:V.MAX)) throw Error('Sauvegarde trop volumineuse.');
    let raw;
    if(isZip) {
      const archive=V.readZip(new Uint8Array(await file.arrayBuffer()));
      const manifest=JSON.parse(archive.get('MANIFESTE.json')||'null');
      if(manifest?.format!=='brvm-monthly-bundle-v1'||!archive.has('BRVM_COMPLET.json'))
        throw Error('Le ZIP ne correspond pas à une sauvegarde BRVM mensuelle.');
      try {raw=JSON.parse(archive.get('BRVM_COMPLET.json'));}
      catch {throw Error('JSON complet corrompu dans le ZIP.');}
    } else {
      try {raw=JSON.parse(await file.text());}
      catch {throw Error('Fichier JSON illisible. Les données locales sont conservées.');}
    }
    if(ticket!==importReadTicket) return;
    if(raw?.schema===V.FORMAT) {
      importPreview=raw;
      modal('Ouvrir la sauvegarde chiffrée',form('decrypt',field('pass','Phrase secrète de la sauvegarde',input('pass','','password','required maxlength="1024" autocomplete="off"')),'Déchiffrer'));
    } else preview(V.inspect(raw));
  }
  async function recoverLegacy(pass) {
    const legacy=await V.legacyData(pass);
    if(legacy.locked) {
      modal('Ouvrir le coffre de l’ancienne version',
        form('legacy-unlock',field('pass','Ancienne phrase secrète',input('pass','','password','required maxlength="1024" autocomplete="off"')),'Afficher l’aperçu'));
    } else preview(legacy.data);
  }
  async function chooseQuotes(file) {
    if(file.size>2*1024*1024) throw Error('Fichier de cotations trop volumineux.');
    quoteOptions=await file.text();
    const rows=Q.parseManual(quoteOptions);
    modal('Aperçu des cotations',`<p>${Object.keys(rows).length} cotations reconnues.</p>`+
      form('quotes-import',field('source','Provenance',input('source','','text','required maxlength="200"'))+
      '<label class="check"><input name="official" type="checkbox"> Les lignes marquées official proviennent du bulletin officiel vérifié.</label>','Enregistrer les cotations'));
  }
  function manualQuote() {
    modal('Saisir un cours ou une VL',form('manual-quote',field('symbol','Symbole',symInput())+
      field('price','Clôture / VL en FCFA',input('price','','number','required min="0.000001" step="any"'))+
      field('date','Date de séance ou de VL',input('date',F.today(),'date','required max="'+F.today()+'"'))+
      field('source','Source précise',input('source','','text','required maxlength="200"'))+
      field('kind','Instrument',select('kind',[['ACTION','Action'],['FCP','VL de FCP']]))+
      field('basis','Provenance',select('basis',[['manual','Saisie manuelle'],['official','Bulletin officiel vérifié'],['provisional','Provisoire']]))+
      '<label class="check"><input name="suspended" type="checkbox"> Titre suspendu</label>','Enregistrer le cours'));
  }
  async function attach(file) {
    if(!file?.size) return null;
    if(file.size>2*1024*1024 || !/\.(pdf|jpe?g|png|txt)$/i.test(file.name)) throw Error('Pièce non prise en charge ou supérieure à 2 Mio.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    let raw='';
    for(let i=0;i<bytes.length;i+=8192) raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const attachment={name:file.name,data:btoa(raw)};
    F.validateAttachment(attachment);
    return attachment;
  }
  function exportJournal() {
    const rows=[['Date','Compte','Destination','Opération','Titre','Quantité','Montant','Devise','Montant reçu','Devise reçue','Date du change','Référence du change','Courtage','Autres frais','Taxe','Référence','Rectifie']];
    for(const t of db.transactions.filter(t=>!historyMonth||t.date.startsWith(historyMonth))) {
      const amount=['BUY','SELL'].includes(t.type)?F.tradeAmounts(t).total/100:t.type==='DIVIDEND'?t.gross-(t.tax||0)-(t.other??t.fees??0):t.amount;
      rows.push([t.date,accName(t.accountId),t.toAccountId?accName(t.toAccountId):'',labels[t.type],t.symbol,t.qty,amount,findAccount(t.accountId)?.currency,t.toAmount,t.toAccountId?findAccount(t.toAccountId)?.currency:'',t.exchange?.date,t.exchange?.source,t.broker,t.other??t.fees,t.tax,t.brokerRef,t.corrects]);
    }
    download(A.csv(rows),'BRVM-journal-prive.csv','text/csv;charset=utf-8');
  }
  document.addEventListener('click',async e=>{
    const b=e.target.closest('[data-action],[data-page]');
    if(!b || busy || (!db&&!['reset','close'].includes(b.dataset.action))) return;
    if(b.dataset.page) {goTo(b.dataset.page);return;}
    const {action,id}=b.dataset;
    try {
      switch(action) {
        case 'close': close(); break;
        case 'refresh': if(await Q.feedEnabled()) void refresh(); else marketUpdateHelp(); break;
        case 'import': $('#import').click();break;
        case 'monthly-backup': await exportMonthlyBackup();break;
        case 'legacy':
          modal('Reprendre les données de l’ancienne version',form('legacy',
            '<p>Les anciennes versions partageaient leur stockage sur cette origine. Vérifiez que l’aperçu correspond à vos données avant de confirmer.</p>','Afficher l’aperçu'));
          break;
        case 'reset':
          modal('Effacer mes données locales',form('reset',
            '<p>Exportez une sauvegarde avant de continuer. Le coffre et le point de restauration de cette installation seront effacés. Les exports déjà téléchargés sont conservés.</p>'+
            '<label class="check"><input type="checkbox" name="older"> Effacer aussi les copies des anciennes versions partagées sur cette adresse</label>'+
            field('confirm','Saisissez EFFACER pour confirmer',input('confirm','','text','required pattern="EFFACER" autocomplete="off"')),'Effacer définitivement'));
          break;
        case 'quote-import': $('#quote-import').click(); break;
        case 'manual-quote': manualQuote(); break;
        case 'apply-core-targets': {
          const p=getPortfolio();
          if(!p) throw Error('Sélectionnez un portefeuille.');
          modal('Confirmer les objectifs CORE',form('apply-core-targets',
            '<p>Répartition validée : <strong>Sonatel 30 % · Orange 15 % · CIE 10 % · TotalEnergies 12 % · SMB 9 % · Nestlé 15 % · Palm 9 %</strong></p>'+
            '<p>Seules les pondérations cibles du portefeuille sélectionné changent ; les titres et espèces sont conservés.</p>'+
            '<label class="check"><input type="checkbox" name="confirmed" required> Appliquer cette répartition à mon portefeuille.</label>',
            'Appliquer les cibles',p.id));
          break;
        }
        case 'new-account':
          if(store.protected || db.accounts.length) modal('Ajouter une SGI / un compte',accountForm());
          else modal('Protéger votre premier compte',form('protect',phraseFields(),'Activer le coffre et créer un compte','account'));
          break;
        case 'entity': entityForm(...id.split('|')); break;
        case 'transaction': transaction(id||'DEPOSIT'); break;
        case 'trade-buy': transaction('BUY');break;
        case 'trade-sell': transaction('SELL');break;
        case 'dividend-received': transaction('DIVIDEND');break;
        case 'sell-position': {const [accountId,symbol]=id.split('|');const qty=calc.accounts.find(a=>a.id===accountId)?.positions[symbol]?.qty||0;transaction('SELL',{accountId,symbol,qty});break;}
        case 'corporate-action': modal('Opérations sur titres',`<p class="quiet">Sélectionnez l’opération indiquée sur votre avis de SGI. Le fractionnement conserve le coût de revient et ajuste la quantité.</p><div class="action-choices">${[['SPLIT','Fractionnement / regroupement'],['BONUS','Actions gratuites'],['RIGHTS','Attribution de droits'],['STOCK_DIVIDEND','Dividende en actions'],['RIGHTS_EXPIRY','Expiration des droits']].map(([type,label])=>btn('corporate-type',label,type)).join('')}</div>`);break;
        case 'corporate-type': transaction(id);break;
        case 'reinvest': {const t=db.transactions.find(x=>x.id===id);transaction('BUY',{accountId:t.accountId,reinvests:id});break;}
        case 'opening-revise':
          modal('Corriger la photographie d’ouverture',form('opening-revise',
            '<p>Saisissez les chiffres d’ouverture d’après le relevé. Le journal ultérieur est recalculé et la photographie précédente conservée dans l’archive.</p>'+
            field('accountId','Compte',select('accountId',accountsOptions(db.accounts)))+
            field('cash','Cash exact du relevé',money('cash'))+field('reserved','Réserve exacte du relevé',money('reserved'))+
            field('positionSymbol','Titre à corriger (facultatif)',input('positionSymbol','','text','maxlength="18"'))+
            field('positionQty','Quantité d’ouverture corrigée',input('positionQty','','number','step="any" min="0"'))+
            field('positionCost','Coût historique corrigé',money('positionCost','',false))+
            field('brokerRef','Référence du relevé',input('brokerRef','','text','required minlength="4" maxlength="180"'))+
            field('note','Motif de correction',input('note','','text','required minlength="5" maxlength="200"'))+
            field('attachment','Pièce locale (facultative)','<input name="attachment" type="file" accept=".pdf,.jpg,.jpeg,.png,.txt">')+
            '<label class="check"><input name="confirmed" type="checkbox" required> J’ai rapproché la photographie avec le relevé d’ouverture.</label>',
            'Enregistrer la correction'));break;
        case 'opening-proof':
          modal('Rapprocher une archive',form('opening-proof',
            '<p>Si le relevé confirme que l’opération est déjà incluse, consignez le justificatif. Les soldes et positions restent ceux de la photographie.</p>'+
            field('accountId','Compte',select('accountId',accountsOptions(db.accounts)))+
            field('date','Date antérieure ou égale à l’ouverture',input('date',db.asOf,'date','required max="'+db.asOf+'"'))+
            field('brokerRef','Référence du justificatif',input('brokerRef','','text','required minlength="4" maxlength="180"'))+
            field('note','Motif et référence du relevé',input('note','','text','required minlength="5" maxlength="200"'))+
            field('attachment','Pièce locale facultative (2 Mio max.)','<input name="attachment" type="file" accept=".pdf,.jpg,.jpeg,.png,.txt">')+
            '<label class="check"><input name="included" type="checkbox" required> Le relevé confirme que l’opération est incluse dans la photographie.</label>',
            'Ajouter le rapprochement à l’archive'));break;
        case 'correct': {const t=db.transactions.find(x=>x.id===id);transaction('CORRECTION',{accountId:t.accountId,corrects:id});break;}
        case 'tx-detail': {
          const t=db.transactions.find(x=>x.id===id);
          const info=['Date '+showDate(t.date),'Référence '+t.brokerRef,t.note,t.source,t.override,t.corrects?'Rectifie '+t.corrects:'',t.reinvests?'Dividende d’origine '+(db.transactions.find(x=>x.id===t.reinvests)?.brokerRef||''):''].filter(Boolean);
          const rows=['qty','price','actualTotal','broker','other','tax','gross','fees','ratioFrom','ratioTo'].filter(k=>typeof t[k]==='number').map(k=>[
            {qty:'Quantité',price:'Prix',actualTotal:'Montant sur avis',broker:'Courtage',other:'Autres frais',tax:'Taxes',gross:'Brut',fees:'Frais historiques',ratioFrom:'Ancien ratio',ratioTo:'Nouveau ratio'}[k],fmt.format(t[k])]);
          modal(labels[t.type],info.map(v=>'<p>'+esc(v)+'</p>').join('')+table(['Détail','Valeur'],rows));break;
        }
        case 'attachment': {
          const a=db.attachments.find(x=>x.id===id);
          download(Uint8Array.from(atob(a.data),c=>c.charCodeAt(0)),a.name,'application/octet-stream');break;
        }
        case 'new-order':
          if(!activeAccounts().length) throw Error('Ajouter un compte actif.');
          modal('Ordre manuel · achat ou vente',form('new-order',field('side','Nature',select('side',[['BUY','Acheter'],['SELL','Vendre']],'BUY'))+
            field('accountId','Compte',select('accountId',accountsOptions(activeAccounts().filter(a=>a.currency==='XOF'))))+
            field('symbol','Titre',symInput())+field('qty','Actions entières',integer('qty'))+
            field('price','Limite indicative (FCFA)',money('price'))+
            '<p class="quiet">Un projet ne touche ni aux espèces ni aux titres. Une vente requiert des actions réellement détenues ; les frais réels sont enregistrés à réception de l’avis.</p>','Enregistrer le projet'));break;
        case 'order-state': {
          const [o,status]=id.split('|');
          modal(status,form('order-state',field('reference','Référence / note de contrôle',input('reference','','text','required minlength="4" maxlength="180"')),
            status==='TRANSMIS'?'Confirmer la transmission manuelle':'Confirmer le changement',o+'|'+status));break;
        }
        case 'order-fill': {
          const o=db.orders.find(x=>x.id===id);
          transaction(o.side||'BUY',{accountId:o.accountId,orderId:id,symbol:o.symbol});break;
        }
        case 'order-trace': {
          const o=db.orders.find(x=>x.id===id);
          modal('Suivi de l’ordre',table(['Date','État','Référence'],o.trace.map(x=>[showDate(x.date),esc(x.status),esc(x.ref||'—')]))+
            table(['Exécution','Référence','Quantité','Total réel'],db.transactions.filter(t=>t.orderId===id).map(t=>
              [showDate(t.date),esc(t.brokerRef),fmt.format(t.qty),fc(t.actualTotal)])));break;
        }
        case 'event':
          if(!activeAccounts().length) throw Error('Ajouter un compte actif.');
          modal('Annoncer un dividende',form('event',field('accountId','Compte',select('accountId',accountsOptions(activeAccounts())))+
            field('symbol','Titre',symInput())+field('date','Date de détachement ou de référence',input('date','','date','required'))+
            field('gross','Brut annoncé (facultatif)',money('gross',0,false))+
            field('source','Source',input('source','','text','required maxlength="200"')),'Enregistrer l’annonce'));break;
        case 'event-pay': {const ev=db.events.find(x=>x.id===id);transaction('DIVIDEND',{accountId:ev.accountId,eventId:ev.id,symbol:ev.symbol,gross:ev.gross||''});break;}
        case 'event-step': {
          busy=true;
          const next=structuredClone(db), ev=next.events.find(x=>x.id===id);
          if(ev.date>F.today()) throw Error('La date de référence est à venir.');
          ev.status=ev.status==='ANNONCÉ'?'DÉTACHÉ':'DÛ';
          await put(next);render();notify('Calendrier mis à jour.');break;
        }
        case 'instrument': instrumentForm(id);break;
        case 'foundation': foundationForm(id);break;
        case 'save-plan':
          if(!plan) throw Error('Calculez une proposition.');
          modal('Confirmer le projet',form('save-plan',
            `<p>${plan.lines.length} lignes proposées · ${fc(plan.planned)} de versements prévus.</p><p>Le projet ne transmet aucun ordre et ne modifie pas la trésorerie.</p>`,
            'Confirmer le projet'));break;
        case 'export-plan':
          download(A.csv([['Compte','Symbole','Quantité projet','Limite','Frais estimés','Total','Date de séance'],...plan.lines.map(l=>
            [accName(l.accountId),l.symbol,l.qty,l.price,l.broker+l.other,l.total,l.quote.date])]),'BRVM-simulation.csv','text/csv;charset=utf-8');break;
        case 'export-journal': exportJournal();break;
        case 'history-more': journalLimit+=40;render();$('#view').focus({preventScroll:true});break;
        case 'archive-more': archiveLimit+=40;render();$('#view').focus({preventScroll:true});break;
        case 'lock': location.reload();break;
        case 'protect': modal('Activer le coffre local',form('protect',
          '<p>Exportez une sauvegarde avant d’activer cette protection. La phrase est nécessaire à chaque ouverture.</p>'+
          field('pass','Phrase secrète',input('pass','','password','required minlength="12" maxlength="1024" autocomplete="new-password"'))+
          field('again','Répéter la phrase',input('again','','password','required minlength="12" maxlength="1024" autocomplete="new-password"')),'Activer le chiffrement'));break;
        case 'encrypt': modal('Exporter une sauvegarde chiffrée',form('encrypt',
          field('pass','Phrase secrète (12 caractères ou plus)',input('pass','','password','required minlength="12" maxlength="1024" autocomplete="new-password"'))+
          field('again','Répéter la phrase',input('again','','password','required minlength="12" maxlength="1024" autocomplete="new-password"')),'Chiffrer et télécharger'));break;
        case 'export-json': modal('Exporter un JSON lisible',form('export-json','<p>Ce fichier contient les positions, écritures et pièces locales en clair. Gardez-le dans un emplacement privé.</p>','Télécharger le JSON lisible'));break;
        case 'rollback':
          if(!checkpoint) throw Error('Aucun point de restauration disponible.');
          preview(checkpoint.data);break;
      }
    } catch(err) {showError(err);}
    finally {if(action!=='refresh') busy=false;}
  });
  const trim=(f,name)=>String(f.get(name)||'').trim();
  const number=(f,name)=>Number(f.get(name)||0);
  const readSymbol=f=>F.normalizeSymbol(trim(f,'symbol').toUpperCase());
  document.addEventListener('submit',async e=>{
    const form=e.target.closest('form[data-form]');
    if(!form) return;
    e.preventDefault();
    const type=form.dataset.form, id=form.dataset.id;
    if(busy||(!db&&!['unlock','reset'].includes(type))) return;
    busy=true;
    const f=new FormData(form);
    const feedback=$('#modal[open] .modal-error')||$('#view form[data-form=unlock] + .modal-error');
    if(feedback) feedback.hidden=true;
    let next, message='Enregistré sur cet appareil.', replace=false, page;
    try {
      switch(type) {
        case 'apply-core-targets': {
          if(!f.has('confirmed')) throw Error('Confirmez les nouvelles cibles.');
          next=structuredClone(db);
          const target=next.portfolios.find(p=>p.id===id);
          if(!target) throw Error('Portefeuille introuvable.');
          target.targets={...E.targets};
          plan=null;comparison=null;planInputs=null;
          message='Cibles CORE rétablies : Sonatel 30 %, total 100 %. Les positions sont inchangées.';
          break;
        }
        case 'account': {
          next=structuredClone(db);
          let a=next.accounts.find(x=>x.id===id);
          if(!a) {
            let p=next.portfolios.find(x=>x.id===f.get('portfolioId'));
            const name=trim(f,'newPortfolio');
            if(name || !p) {
              if(!name) throw Error('Choisir ou nommer un portefeuille.');
              const owner={id:F.id(),label:name,kind:'adult'};
              p={id:F.id(),ownerId:owner.id,label:name,targets:{...E.targets}};
              next.owners.push(owner); next.portfolios.push(p);
            }
            let i=next.institutions.find(x=>x.id===f.get('institutionId'));
            const sgi=trim(f,'newInstitution');
            if(sgi) {
              i=next.institutions.find(existing=>existing.label.trim().toLocaleLowerCase('fr')===sgi.toLocaleLowerCase('fr'));
              if(!i) {i={id:F.id(),label:sgi};next.institutions.push(i);}
            }
            if(!i) throw Error('Choisir ou nommer une SGI.');
            a={id:F.id(),portfolioId:p.id,institutionId:i.id,currency:f.get('currency'),cash:number(f,'cash'),reserved:0,openedOn:f.get('openedOn')};
            if(a.cash && next.observations.some(o=>o.portfolioId===p.id)) throw Error('Pour préserver les performances observées, créez le compte à zéro puis saisissez le montant crédité sur justificatif.');
            next.accounts.push(a);
            page='accounts';
          }
          a.label=trim(f,'label');
          const broker=institution(a.institutionId)||'';
          const newSgi=next.institutions.find(x=>x.id===a.institutionId)?.label||broker;
          a.monthly=0; // Aucune mensualité : tout investissement est ponctuel.
          a.brokerRate=number(f,'broker')/100; a.otherRate=number(f,'other')/100;
          a.archived=f.has('archived');
          portfolioId=a.portfolioId;
          break;
        }
        case 'entity': {
          const [group,id]=form.dataset.id.split('|');
          next=structuredClone(db);
          let x=next[group].find(v=>v.id===id);
          if(!x) {x={id:F.id()};next[group].push(x);}
          if(group==='portfolios') {
            const newOwner=f.get('ownerId');
            if(x.ownerId && x.ownerId!==newOwner && next.accounts.some(a=>a.portfolioId===x.id))
              throw Error('Ce portefeuille contient des comptes. Créez un nouveau portefeuille pour isoler les fonds de l’autre personne.');
            x.ownerId=newOwner;
            x.targets??={...E.targets};
            portfolioId=x.id;
          }
          if(group==='owners') x.kind=f.get('kind');
          x.label=trim(f,'label'); x.archived=f.has('archived');
          break;
        }
        case 'invest': {
          const accountIds=f.getAll('accounts');
          planInputs={mode:'cibles',budget:number(f,'budget'),accountIds,exceptional:true,verifiedOnly:f.has('verifiedOnly')};
          plan=F.propose(db,{portfolioId,...planInputs});
          comparison=null;
          render();return;
        }
        case 'opening-revise': {
          const s=trim(f,'positionSymbol');
          if(s&&(!trim(f,'positionQty')||!trim(f,'positionCost'))) throw Error('Quantité et coût requis pour corriger un titre.');
          next=F.reviseOpening(db,{accountId:f.get('accountId'),brokerRef:trim(f,'brokerRef'),note:trim(f,'note'),
            cash:number(f,'cash'),reserved:number(f,'reserved'),confirmed:f.has('confirmed'),
            position:s?{symbol:F.normalizeSymbol(s.toUpperCase()),qty:number(f,'positionQty'),cost:number(f,'positionCost')}:null},
            await attach(f.get('attachment')));
          message='Photographie corrigée. Valeurs précédentes conservées dans l’archive.';break;
        }
        case 'opening-proof':
          next=F.reconcileOpening(db,{accountId:f.get('accountId'),date:f.get('date'),brokerRef:trim(f,'brokerRef'),
            note:trim(f,'note'),included:f.has('included')},await attach(f.get('attachment')));
          message='Justificatif archivé. Aucun solde ni position modifié.';break;
        case 'tx': {
          const row=Object.fromEntries([...f].filter(([k])=>!['attachment','confirmed'].includes(k)));
          for(const k of ['amount','price','qty','broker','actualTotal','other','tax','gross','ratioFrom','ratioTo'])
            if(f.has(k)) row[k]=number(f,k);
          if(row.symbol) row.symbol=readSymbol(f);
          row.type ||= form.dataset.type;
          row.accountId ||= form.dataset.account;
          row.cashDistribution=f.has('cashDistribution');
          if(row.type==='DIVIDEND'&&['dividendRecordDate','dividendEligibleQty',
            'dividendGrossPerShare','dividendStatementRef'].some(k=>trim(f,k))) {
            row.dividendBasis={recordDate:trim(f,'dividendRecordDate'),
              eligibleQty:number(f,'dividendEligibleQty'),grossPerShare:number(f,'dividendGrossPerShare'),
              statementRef:trim(f,'dividendStatementRef')};
          }
          for(const k of ['dividendRecordDate','dividendEligibleQty','dividendGrossPerShare','dividendStatementRef']) delete row[k];
          if(row.type==='CORRECTION') row.replay=true;
          if(row.type==='TRANSFER'&&f.has('exchangeRate')) {
            row.toAmount=number(f,'toAmount');
            row.exchange={rate:number(f,'exchangeRate'),date:f.get('exchangeDate'),source:trim(f,'exchangeSource')};
            for(const k of ['exchangeRate','exchangeDate','exchangeSource']) delete row[k];
          }
          if(['BONUS','RIGHTS','STOCK_DIVIDEND'].includes(row.type)) row.entitlement={
            underlying:F.normalizeSymbol(trim(f,'underlying').toUpperCase()),numerator:number(f,'ratioNumerator'),
            denominator:number(f,'ratioDenominator'),statementQty:trim(f,'statementQty')?number(f,'statementQty'):undefined,
            statementRef:trim(f,'statementRef')
          };
          if(!f.has('confirmed')) throw Error('Confirmer la vérification du justificatif.');
          next=F.record(db,row,await attach(f.get('attachment')));
          message='Écriture confirmée et enregistrée dans le journal.';
          break;
        }
        case 'new-order': {
          const accountId=f.get('accountId'), s=readSymbol(f), qty=number(f,'qty'), price=number(f,'price');
          if(F.isFund(db,s)) throw Error('Saisir la souscription FCP confirmée dans Dividendes et FCP.');
          const a=findAccount(accountId);
          if(!a||!F.symbol(s)||!Number.isSafeInteger(qty)||!qty||price<=0) throw Error('Ordre invalide.');
          const side=f.get('side');if(!['BUY','SELL'].includes(side)) throw Error('Type d’ordre inconnu.');
          if(side==='SELL') {const held=calc.accounts.find(x=>x.id===accountId)?.positions[s]?.qty||0;
            if(qty>held) throw Error('Vente supérieure aux actions détenues.');}
          next=F.createPlan(db,{portfolioId:a.portfolioId,mode:'manuel',funding:{[accountId]:0},lines:[{accountId,symbol:s,qty,price,side,estimateRate:a.brokerRate+a.otherRate}]});
          break;
        }
        case 'save-plan':
          if(!plan) throw Error('Calculez une proposition.');
          next=F.createPlan(db,F.propose(db,{...planInputs,portfolioId}));
          page='orders';message='Projet conservé sans écriture de trésorerie.';break;
        case 'order-state': {
          const [id,status]=form.dataset.id.split('|');
          next=F.orderTransition(db,id,status,trim(f,'reference'));break;
        }
        case 'event': {
          next=structuredClone(db);
          next.events.push({id:F.id(),type:'DIVIDEND',status:'ANNONCÉ',symbol:readSymbol(f),
            accountId:f.get('accountId'),date:f.get('date'),source:trim(f,'source'),gross:number(f,'gross')});
          break;
        }
        case 'instrument': {
          next=structuredClone(db); const s=readSymbol(f);
          if(!F.symbol(s)) throw Error('Symbole invalide.');
          if(id && id!==s) throw Error('Créer une fiche distincte pour un autre instrument.');
          const current=next.instruments[s];
          if(current?.kind && current.kind!==f.get('kind') && (next.positions.some(p=>p.symbol===s)||next.transactions.some(t=>t.symbol===s)))
            throw Error('Le type d’un instrument avec historique ne peut pas être modifié.');
          const model={...current,label:trim(f,'label'),kind:f.get('kind'),distribution:f.get('distribution'),
            screen:f.get('screen'),checked:f.get('checked'),reviewUntil:f.get('reviewUntil')||undefined,evidence:trim(f,'evidence'),prospectus:trim(f,'prospectus'),feeEvidence:trim(f,'feeEvidence'),mandate:trim(f,'mandate'),method:trim(f,'method'),reviewer:trim(f,'reviewer')};
          if(['Vérifié','Revue documentée'].includes(model.screen) &&
             (!F.date(model.checked)||model.checked>F.today()||!model.evidence||!model.method||model.screen==='Revue documentée'&&!model.reviewer))
            throw Error('Renseignez la date, la méthode, le justificatif et, le cas échéant, l’organisme.');
          next.instruments[s]=model;break;
        }
        case 'foundation': {
          next=structuredClone(db); const s=readSymbol(f);
          if(!F.symbol(s)||!F.date(f.get('date'))||!trim(f,'source')) throw Error('Symbole, date et source requis.');
          const i=next.instruments[s]??={label:E.names[s]||s,kind:'ACTION',screen:'À vérifier'};
          i.fundamentals={date:f.get('date'),source:trim(f,'source'),risk:trim(f,'risk')};
          for(const key of ['per','revenue','earnings','growth','margin','yield','volume','turnover'])
            if(trim(f,key)!=='') i.fundamentals[key]=number(f,key);
          break;
        }
        case 'targets':
          next=structuredClone(db);
          next.portfolios.find(p=>p.id===id).targets=Object.fromEntries(E.symbols.map(s=>[s,number(f,s)/100]));
          break;
        case 'fx':
          next=F.changeRate(db,{currency:f.get('currency'),date:f.get('date'),xof:number(f,'xof'),source:trim(f,'source')});
          break;
        case 'stale':
          next=structuredClone(db);next.settings.staleDays=number(f,'days');next.settings.autoQuotes=f.has('autoQuotes');break;
        case 'quotes-import': {
          const r=F.quoteUpdates(db,Q.parseManual(quoteOptions,{source:trim(f,'source'),official:f.has('official'),retrievedOn:F.today()}));
          next=r.next;message=r.count+' cotations acceptées.';break;
        }
        case 'manual-quote': {
          const s=readSymbol(f);
          const r=F.quoteUpdates(db,{[s]:{price:number(f,'price'),date:f.get('date'),source:trim(f,'source'),retrievedOn:F.today(),
            basis:f.get('basis'),kind:f.get('kind'),status:f.has('suspended')?'suspended':'active'}});
          next=r.next;message=r.count?'Cotation enregistrée.':'Cours local plus récent ou de meilleure provenance conservé.';break;
        }
        case 'export-json':
          download(JSON.stringify(db,null,2),'BRVM-sauvegarde-privee.json');close();return;
        case 'unlock':
          await load(await store.unlock(f.get('pass')));$('#flash').hidden=true;return;
        case 'protect':
          if(f.get('pass')!==f.get('again')) throw Error('Les deux phrases diffèrent.');
          await load(await store.protect(f.get('pass'),record.revision));
          close();
          if(id==='account') modal('Ajouter un compte',accountForm());
          else notify('Coffre actif et point de restauration chiffrés.');
          return;
        case 'encrypt':
          if(f.get('pass')!==f.get('again')) throw Error('Les deux phrases diffèrent.');
          download(JSON.stringify(await V.encrypt(db,f.get('pass'))),'BRVM-sauvegarde-chiffree.json');close();return;
        case 'decrypt':
          preview(await V.decrypt(importPreview,f.get('pass')));return;
        case 'legacy': await recoverLegacy();return;
        case 'legacy-unlock': await recoverLegacy(f.get('pass'));return;
        case 'restore': {
          const mergeMode=f.get('mode')==='merge';
          const data=mergeMode?mergedImport:importPreview;
          if(!data||record.revision!==importRevision) throw Error('Les données ont changé. Ouvrez de nouveau le fichier.');
          const currentHasData=db.accounts.length||db.owners.length||db.portfolios.length||
            db.transactions.length||db.history.length;
          if(!mergeMode&&currentHasData&&!V.same(db,importPreview)&&!f.has('acceptReplace'))
            throw Error('Confirmez explicitement le remplacement pour éviter la perte d’autres comptes.');
          if(!store.protected) {
            if(f.get('pass')!==f.get('again')) throw Error('Les deux phrases diffèrent.');
            record=await store.protect(f.get('pass'),importRevision,data,true);
          } else record=await store.commit(data,importRevision,true);
          portfolioId='';accountFilter='';plan=null;comparison=null;planInputs=null;
          close();await load(record);goTo('dashboard');notify('Données importées et chiffrées sur cet appareil.');return;
        }
        case 'reset': {
          if(f.get('confirm')!=='EFFACER') throw Error('Saisissez EFFACER.');
          const reset=await store.reset(record.revision);
          localChannel?.postMessage('reset');
          try {localStorage.setItem(resetKey,String(reset.revision));localStorage.removeItem(resetKey);} catch {}
          close();portfolioId='';accountFilter='';historyMonth='';journalLimit=40;archiveLimit=40;
          plan=null;comparison=null;planInputs=null;
          await load(reset);goTo('dashboard');notify('Données de cette installation effacées.');
          if(f.has('older')) await V.removeLegacy();
          return;
        }

      }
      if(!next) return;
      await put(next,replace);
      if(type!=='account'&&type!=='entity'&&replace) portfolioId='';
      plan=null;comparison=null;
      if(replace) planInputs=null;
      if($('#modal').open) close();
      if(page) goTo(page); else render();
      notify(message);
    } catch(err) {showError(err);}
    finally {busy=false;}
  });
  document.addEventListener('input',e=>{
    const form=e.target.closest('form[data-form=tx]');
    if(form && ['qty','price','broker','other','tax'].includes(e.target.name)) tradePreview(form);
  });
  document.addEventListener('change',e=>{
    const el=e.target;
    if(!db) return;
    if(el.matches('form[data-form=invest] [name=mode]')) {
      const options=el.form.querySelector('[data-manual]');
      options.hidden=el.value!=='manuel';
      if(!options.hidden) options.closest('details').open=true;
    }
    if(el.matches('#portfolio')) {portfolioId=el.value;sgiFilter='';accountFilter='';plan=null;comparison=null;planInputs=null;render();$('#portfolio')?.focus();}
    if(el.matches('#sgi-view')) {sgiFilter=el.value;render();$('#sgi-view')?.focus();}
    if(el.matches('#account-filter')) {accountFilter=el.value;render();$('#account-filter')?.focus();}
    if(el.matches('#history-month')) {historyMonth=el.value;journalLimit=40;render();$('#history-month')?.focus();}
    if(el.closest('form[data-form=tx]') && ['type','accountId','toAccountId'].includes(el.name)) {transactionFields(el.form);tradePreview(el.form);}
    if(el.id==='backup-verify') {
      const file=el.files?.[0];el.value='';
      if(file) void verifyMonthlyBackup(file).catch(showError);
    }
    if(el.id==='import'||el.id==='quote-import') {
      const file=el.files?.[0];el.value='';
      if(file) void (el.id==='import'?chooseImport(file):chooseQuotes(file)).catch(showError);
    }
  });
  $('#menu').addEventListener('click',()=>{
    const open=document.body.classList.toggle('menu-open');
    $('#menu').setAttribute('aria-expanded',String(open));
    if(open) $('#nav button')?.focus();
  });
  $('#modal').addEventListener('close',clearModal);
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&document.body.classList.contains('menu-open')&&!$('#modal').open) {
      document.body.classList.remove('menu-open');
      $('#menu').setAttribute('aria-expanded','false');$('#menu').focus();
    }
  });
  if(localChannel) localChannel.onmessage=e=>{if(e.data==='reset') location.reload();};
  window.addEventListener('storage',e=>{if(e.key===resetKey&&e.newValue) location.reload();});
  async function load(value) {
    record=value;db=record.data;calc=F.calculate(db);
    checkpoint=await store.read('checkpoint');
    render();
    scheduleRefresh();
  }
  let installOffer;
  addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();installOffer=event;$('#install-app').hidden=false;
  });
  addEventListener('appinstalled',()=>{
    installOffer=null;$('#install-app').hidden=true;
    notify('Application installée. Votre coffre reste sur cet appareil.');
  });
  $('#install-app').addEventListener('click',async()=>{
    if(!installOffer) return;
    const offer=installOffer;installOffer=null;$('#install-app').hidden=true;
    try {await offer.prompt();} catch {notify('Installation indisponible dans cette fenêtre.',true);}
  });
  function start() {
    if('serviceWorker' in navigator && isSecureContext)
      navigator.serviceWorker.register('./sw.js').then(registration=>{
        const announce=()=>{
          if(registration.waiting&&navigator.serviceWorker.controller)
            document.querySelector('#update-tip').hidden=false;
        };
        announce();
        registration.addEventListener('updatefound',()=>{
          registration.installing?.addEventListener('statechange',announce);
        });
      }).catch(()=>notify('Cache hors ligne indisponible dans ce navigateur.',true));
    V.start().then(async result=>{
      store=result.store;
      if(result.current.locked) {
        record=result.current;
        $('#quote-date').textContent='';
        $('#view').innerHTML=pane('Coffre local verrouillé',form('unlock',
          field('pass','Phrase secrète',input('pass','','password','required maxlength="1024" autocomplete="off"')),'Déverrouiller')
          +'<p class="quiet">Le contenu reste verrouillé jusqu’à la saisie de votre phrase secrète.</p><p class="modal-error" role="alert" hidden></p>'+btn('reset','Effacer mes données locales'));
        return;
      }
      await load(result.current);
    }).catch(err=>{
      $('#view').textContent='Impossible d’ouvrir les données locales. '+err.message;
    });
  }
  function scheduleRefresh() {
    if(db?.settings.autoQuotes && !V.backupDue(db) && !document.hidden && navigator.onLine && !busy && !$('#modal').open &&
      Date.now()-lastQuoteAttempt>=15*60*1000) void refresh(true);
  }
  document.addEventListener('visibilitychange',scheduleRefresh);
  window.addEventListener('online',scheduleRefresh);
  setInterval(scheduleRefresh,60*1000);
  start();
})();
