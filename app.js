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
  const col=['#74e0ac','#79adff','#c3afff','#ffc37a','#64dae7','#ff9aad','#e6df7d'];
  const labels={DEPOSIT:'Versement reçu',WITHDRAW:'Retrait',BUY:'Achat',SELL:'Vente',FEE:'Frais de compte',
    DIVIDEND:'Dividende encaissé',SPLIT:'Fractionnement / regroupement',BONUS:'Actions gratuites',RIGHTS:'Droits',
    STOCK_DIVIDEND:'Dividende en actions',TRANSFER:'Transfert',CORRECTION:'Rectification'};
  const basis={manual:'Saisi localement',official:'Officiel (source déclarée)',provisional:'Provisoire',theoretical:'Théorique après split',execution:'Prix d’exécution'};
  const pages={dashboard:['Vue d’ensemble','▦'],accounts:['Comptes et positions','▤'],invest:['Investissement','◎'],orders:['Ordres','⇄'],
    events:['Dividendes et FCP','◈'],history:['Historique et analyses','◷'],settings:['Cibles et risques','⚙'],data:['Données et sauvegarde','⬡']};
  let store, record, db, calc, tab='dashboard', portfolioId='', busy=false, refreshing=false, plan=null, comparison=null, planInputs=null, importPreview=null;
  const resetKey=V.RESET_NOTICE+V.scope();
  const localChannel=typeof BroadcastChannel==='function'?new BroadcastChannel(resetKey):null;
  let importRevision, mergedImport, importReadTicket=0;
  let quoteOptions=null, checkpoint=null, restoreFocus=null, projectInputs={monthly:null,fee:.016,dividend:.03}, historyMonth='', accountFilter='', journalLimit=40, archiveLimit=40, lastQuoteAttempt=0;
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
  async function put(next,replace=false) {
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
  function dashboard() {
    if(!db.accounts.length) return welcome();
    const p=getPortfolio()||calc.portfolios[0], all=calc.all;
    const orderCount=db.orders.filter(o=>!['RAPPROCHÉ','ANNULÉ','NON EXÉCUTÉ'].includes(o.status)).length;
    const quotes=Object.values(db.quotes);
    const old=p.accounts.reduce((n,a)=>n+Object.values(a.positions).filter(x=>x.qty&&F.stale(x.quote,db.settings.staleDays)).length,0);
    const composition=new Map();
    for(const a of p.accounts) for(const x of Object.values(a.positions)) if(x.market)
      composition.set(x.symbol,(composition.get(x.symbol)||0)+x.market);
    const points=db.observations.filter(x=>x.portfolioId===p.id&&x.complete&&x.attestation==='close-v1').sort((a,b)=>a.date.localeCompare(b.date));
    return `<div class="context"><div><p class="overline">Patrimoine familial${all.unknown?' · valorisation partielle':''}</p><strong class="total">${fc(all.total)}</strong><p class="quiet">${db.accounts.length} comptes · ${db.portfolios.length} portefeuilles · ${calc.institutions.length} SGI</p></div>${portfolioPicker()}</div>
      <div class="kpis">${kpi('Patrimoine du portefeuille',fc(p.total),p.unknown?'Valeur partielle':'Titres et liquidités','accent')}${kpi('Cash disponible',fc(p.available),`${fc(p.reserved)} réservés sur ${fc(p.cash)}`)}
      ${kpi('Plus-value latente',fc(p.pnl),p.unknown?'Positions cotées uniquement':`Coût réel des titres · ${fc(p.cost)}`,p.pnl<0?'loss':'gain')}
      ${kpi('Dividendes nets reçus',fc(p.dividends),`${fc(p.grossDividends)} bruts depuis l’ouverture`)}</div>
      <div class="split">${pane('Évolution enregistrée',curve(points),'Séances avec cotations et taux documentés')}${pane('Allocation par titre',bars([...composition].sort((a,b)=>b[1]-a[1]).map(([label,value])=>({label,value}))))}</div>
      <div class="split">${pane('Répartition par SGI',bars(calc.institutions.map(i=>({label:i.label,value:p.accounts.filter(a=>a.institutionId===i.id).reduce((n,a)=>n+(a.totalXof??0),0)}))))}
      ${pane('Suivi depuis l’ouverture',table(['Indicateur','Valeur'],[['Frais et taxes comptabilisés',fc(p.feesPaid+p.taxes)],['Gains réalisés',fc(p.realized)],['Apports nets',fc(p.netContribution)],['Ordres à suivre',orderCount],['Cours absents ou anciens',old],['Cours disponibles',quotes.length]])+`<div class="actions">${go('orders','Consulter les ordres')}</div>`)}</div>
      ${pane('Comptes familiaux',table(['Compte','Titres','Cash disponible','Patrimoine'],calc.accounts.map(a=>[esc(accName(a.id)),fc(a.market),amountIn(a.available,a.currency),a.totalXof==null?'Taux absent':fc(a.totalXof)]))) }`;
  }
  function accountsView() {
    const p=getPortfolio();
    return `<div class="context compact">${p?portfolioPicker()+field('account','Filtrer les comptes',select('account',[['','Tous les comptes'],...accountsOptions(p.accounts)],accountFilter,'id="account-filter"')):''}<div class="actions">${btn('new-account','Ajouter un compte','','primary')}${btn('transaction','Saisir une opération')}</div></div>
      ${p?.accounts.filter(a=>!accountFilter||a.id===accountFilter).map(a=>pane(accName(a.id),
        `<div class="account-total"><strong>${amountIn(a.total,a.currency)}</strong><span>Cash ${amountIn(a.cash,a.currency)} · Disponible ${amountIn(a.available,a.currency)} · Réservé ${amountIn(a.reserved,a.currency)}</span>
        ${a.currency!=='XOF'?`<p class="quiet">${a.rate?`Contre-valeur indicative ${fc(a.totalXof)} · taux du ${showDate(a.rate.date)} · ${esc(a.rate.source)}${F.stale(a.rate,db.settings.staleDays)?' · taux ancien':''}`:'Taux absent · exclu du total XOF'}</p>`:''}
        ${F.isArchived(db,a)?tag('Archivé'):''}</div>`+
        table(['Instrument','Quantité','Coût de revient','PRU','Cours / VL','Valeur','P/L latent'],Object.values(a.positions).filter(s=>s.qty>0).map(s=>
          [`<b>${esc(s.symbol)}</b><br><small>${esc(db.instruments[s.symbol]?.label||E.names[s.symbol]||'')}${['SGBC','CBIB'].includes(s.symbol)?' · Banque historique':''}</small>`,
          fmt.format(s.qty),fc(s.cost),fc(s.cost/s.qty),s.price?`${fc(s.price)}<br><small>${showDate(s.quote.date)} ${F.stale(s.quote,db.settings.staleDays)?'· Ancien':''}${Math.abs(s.price-s.quote.price)>1e-7?' · Après split':''}</small>`:'—',
          s.price?fc(s.market):'—',s.pnl===null?'—':`<strong class="${s.pnl<0?'loss':'gain'}">${fc(s.pnl)}</strong>`])))).join('')||empty('Ajoutez un compte SGI pour suivre ses positions.')}
      ${pane('Personnes, portefeuilles et SGI',`<div class="actions">${btn('entity','Ajouter une personne','owners')}${btn('entity','Ajouter un portefeuille','portfolios')}${btn('entity','Ajouter une SGI','institutions')}</div>`+
        table(['Type','Nom','État','Action'],['owners','portfolios','institutions','accounts'].flatMap(group=>db[group].map(v=>[
          {owners:'Personne',portfolios:'Portefeuille',institutions:'SGI',accounts:'Compte'}[group],
          esc(group==='accounts'?accName(v.id):v.label),v.archived?'Archivé':'Actif',btn('entity','Modifier',group+'|'+v.id)]))))}`;
  }
  function accountForm(existing) {
    const a=existing||{};
    const options=(list,include)=>list.filter(x=>!x.archived||x.id===include).map(x=>[x.id,x.label]);
    return form('account',
      field('portfolioId','Portefeuille',select('portfolioId',options(db.portfolios,a.portfolioId),a.portfolioId||portfolioId,a.id?'disabled':''))+
      (!a.id?field('newPortfolio','Nouveau portefeuille si nécessaire',input('newPortfolio')):'')+
      field('institutionId','SGI',select('institutionId',[['','Choisir une SGI'],...options(db.institutions,a.institutionId)],a.institutionId,a.id?'disabled':''))+
      (!a.id?field('newInstitution','Ou ajouter une nouvelle SGI',input('newInstitution')):'')+
      field('label','Libellé du compte (facultatif)',input('label',a.label||'','text','maxlength="200"'))+
      (!a.id?field('currency','Devise du compte',select('currency',F.currencies.map(c=>[c,c]),'XOF'))+
      field('openedOn','Date d’ouverture',input('openedOn',F.today(),'date','required max="'+F.today()+'"'))+
      field('cash','Cash initial confirmé dans la devise du compte',money('cash',0)):'')+
      `<div class="fields">${field('monthly','Versement mensuel (FCFA)',money('monthly',a.monthly??'',false))}${field('broker','Courtage estimé (%)',input('broker',(a.brokerRate??.01)*100,'number','min="0" max="1" step="0.01" required'))}
      ${field('other','Autres frais estimés (%)',input('other',Math.round((a.otherRate??.006)*10000)/100,'number','min="0" max="10" step="0.01" required'))}</div>`+
      (a.id?`<label class="check"><input name="archived" type="checkbox" ${a.archived?'checked':''}> Archiver le compte</label>`:'')+
      '<p class="quiet">Les comptes en devises suivent les liquidités. Les titres BRVM et les simulations restent sur les comptes XOF.</p>','Enregistrer le compte',a.id);
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
    return `<div class="context compact">${portfolioPicker()}<p class="quiet">Les versements prévus ne financent aucun achat avant leur crédit réel.</p></div>
      <div class="invest-layout">${pane('Préparer un investissement',act.length?form('invest',`
      <fieldset><legend>1. Choisir les comptes</legend>
      <details ${act.length<=5?'open':''}><summary>Comptes et montants disponibles (${act.length})</summary>
      ${act.map((a,i)=>`<div class="investment-account"><label class="check"><input name="accounts" type="checkbox" value="${attr(a.id)}" ${(inp.accountIds?inp.accountIds.includes(a.id):i<2)?'checked':''}>${esc(accName(a.id))}</label><small>Cash disponible ${fc(a.available)} · Mensuel ${fc(a.monthly)}</small></div>`).join('')}</details>
      </fieldset>
      <fieldset><legend>2. Fixer le budget</legend>
      ${field('mode','Mode',select('mode',[['mensuel','Mensuel fixe'],['equilibre','Équilibrage 50/50 · deux comptes'],['equilibre-sgi','Équilibrage 50/50 · deux SGI'],['egalisation','Égalisation · N comptes'],['manuel','Manuel']],inp.mode||'mensuel'))}
      ${field('budget','Budget exceptionnel ou plafond (FCFA)',integer('budget',inp.budget??500000))}
      </fieldset>
      <details><summary>3. Ajuster les options</summary>
      <div data-manual ${inp.mode==='manuel'?'':'hidden'}>
      ${act.map(a=>field('manual_'+a.id,accName(a.id)+' · versement prévu',integer('manual_'+a.id,inp.manual?.[a.id]||0))).join('')}
      </div>
      <label class="check"><input type="checkbox" name="verifiedOnly" ${inp.verifiedOnly?'checked':''}> Limiter aux titres documentés</label>
      <label class="check"><input type="checkbox" name="exceptional" ${inp.exceptional?'checked':''}> Limiter les achats au budget saisi en mode mensuel</label>
      </details>`,'4. Calculer la simulation') : empty('Aucun compte XOF actif dans ce portefeuille.'))}
      <div>${plan?proposal(plan):pane('Proposition',empty('Choisissez les comptes puis calculez une proposition.'))}</div></div>`;
  }
  function proposal(p) {
    const rows=p.accounts.map(a=>[esc(accName(a.id)),fc(a.current),fc(p.funding[a.id]),fc(a.fees),fc(a.cashRemaining),fc(a.forecast)]);
    return pane('Proposition d’achats',
      `<div class="account-total">${tag('Simulation')}${tag('Télécom cible · '+pct(p.telecom),p.telecom>=.40?'wait':'ok')}<span>Écart aux cibles ${pct(p.deviation.before)} → ${pct(p.deviation.after)}</span></div>`+
      table(['Compte','Valeur actuelle','Versement projeté','Frais estimés','Cash confirmé restant','Valeur après scénario'],rows)+
      (comparison?`<details><summary>Comparer avec ${comparison.mode==='mensuel'?'les versements fixes':'l’équilibrage 50/50'}</summary>
        ${table(['Compte','Versement projeté','Valeur après scénario'],comparison.accounts.map(a=>[esc(accName(a.id)),fc(comparison.funding[a.id]),fc(a.forecast)]))}</details>`:'')+
      '<p class="quiet">Le rééquilibrage répartit les versements par valeur après les frais estimés, dans la limite des apports possibles. Des versements fixes différents peuvent creuser l’écart.</p>'+
      table(['Titre / compte','Actions','Limite / provenance','Courtage','Autres frais','Coût estimé'],p.lines.map(l=>[
        `<b>${esc(l.symbol)}</b><br><small>${esc(accName(l.accountId))}</small><br><small>Cible ${pct(p.targets[l.symbol])} · Avant ${pct(p.before[l.symbol])} · Après ${pct(p.after[l.symbol])}</small><br><small>Conformité : ${esc(F.screening(db.instruments[l.symbol]))}</small>`,l.qty,
        `${fc(l.price)}<br><small>${showDate(l.quote.date)} · ${esc(l.quote.source)}</small>`,fc(l.broker),fc(l.other),fc(l.total)]))+
      `<details><summary>Pondérations avant et après</summary>${table(['Titre','Avant','Après','Cible'],E.symbols.map(s=>[s,pct(p.before[s]),pct(p.after[s]),pct(p.targets[s])]))}</details>
      <p class="quiet">Les achats entiers privilégient les lignes sous-pondérées. Les dividendes reçus sont inclus dans le cash du compte. ${p.ignored.length?'Cours absents, anciens, suspendus ou titres exclus : '+esc(p.ignored.join(', '))+'.':''}</p>
      <div class="actions">${btn('save-plan',p.lines.length?'Enregistrer le projet':'Enregistrer le scénario','','primary')}${btn('export-plan','Exporter la simulation')}</div>`);
  }
  function ordersView() {
    const rows=db.orders.slice().reverse().map(o=>{
      const executed=calc.executed.get(o.id)||0;
      const actions={PROJET:[['TRANSMIS','Marquer transmis'],['ANNULÉ','Annuler'],['NON EXÉCUTÉ','Non exécuté']],
        TRANSMIS:[['ANNULÉ','Annuler'],['NON EXÉCUTÉ','Non exécuté']],
        'PARTIELLEMENT EXÉCUTÉ':[['ANNULÉ','Annuler le reliquat']], 'EXÉCUTÉ':[['RAPPROCHÉ','Rapprocher']]};
      return [`<b>${esc(o.symbol)}</b><br><small>${esc(accName(o.accountId))}</small>`,tag(o.status,o.status==='RAPPROCHÉ'?'ok':'wait'),
        `${fmt.format(executed)} / ${fmt.format(o.qty)}<br><small>Limite indicative ${fc(o.limit)}</small>`,
        `<div class="actions">${['TRANSMIS','PARTIELLEMENT EXÉCUTÉ'].includes(o.status)?btn('order-fill','Saisir l’avis',o.id,'primary'):''}
        ${(actions[o.status]||[]).map(([status,label])=>btn('order-state',label,o.id+'|'+status)).join('')}
        ${btn('order-trace','Voir le suivi',o.id)}</div>`];
    });
    return `<div class="context compact"><p class="quiet">La transmission se fait auprès de la SGI. Les avis réellement reçus alimentent le journal local.</p><div class="actions">${btn('new-order','Créer un ordre manuel','','primary')}${go('invest','Simuler')}</div></div>
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
      <div class="fields" data-types="BUY SELL DIVIDEND SPLIT BONUS RIGHTS STOCK_DIVIDEND">${field('symbol','Symbole',symInput(preset.symbol||''))}</div>
      <div class="fields" data-types="DEPOSIT WITHDRAW FEE TRANSFER">${field('amount','Montant confirmé dans la devise du compte',money('amount'))}</div>
      <div class="fields" data-types="TRANSFER">${field('toAccountId','Compte destinataire',select('toAccountId',accountsOptions(list),'','required'))}</div>
      <div class="fields" data-fx-transfer hidden>
        ${field('toAmount','Montant reçu en devise du compte destinataire',money('toAmount'))}
        ${field('exchangeRate','Unités reçues pour une unité débitée',input('exchangeRate','','number','min="0.000001" step="any" required'))}
        ${field('exchangeDate','Date du change',input('exchangeDate',F.today(),'date','required'))}
        ${field('exchangeSource','Référence du bordereau de change',input('exchangeSource','','text','required maxlength="200"'))}
      </div>
      <div class="fields" data-types="BUY SELL BONUS RIGHTS STOCK_DIVIDEND">${field('qty','Quantité réelle',input('qty','','number','required step="any" min="0.000001"'))}</div>
      <div class="fields" data-types="BUY SELL">${field('price','Prix unitaire réel (FCFA)',money('price'))}${field('broker','Courtage réel (FCFA)',money('broker',0))}
      ${field('actualTotal','Total débité / crédité sur avis (FCFA)',money('actualTotal'))}</div>
      <div class="fields" data-types="BUY SELL DIVIDEND">${field('other','Autres frais (FCFA)',money('other',0))}${field('tax','Impôts / retenue (FCFA)',money('tax',0))}</div>
      <div class="fields" data-types="DIVIDEND">${field('gross','Brut reçu (FCFA)',money('gross',preset.gross??''))}
      <label class="check"><input name="cashDistribution" type="checkbox"> FCP · distribution effectivement créditée hors VL</label></div>
      <div class="fields" data-types="SPLIT">${field('ratioFrom','Ancien nombre',integer('ratioFrom',1))}${field('ratioTo','Nouveau nombre',integer('ratioTo',10))}</div>
      <div class="fields" data-types="BONUS RIGHTS STOCK_DIVIDEND">
        ${field('recordDate','Date d’éligibilité avant attribution',input('recordDate','','date','required'))}
        ${field('underlying','Titre d’origine',input('underlying','','text','required maxlength="18"'))}
        ${field('ratioNumerator','Titres attribués au numérateur',integer('ratioNumerator',1))}
        ${field('ratioDenominator','Titres détenus au dénominateur',integer('ratioDenominator',1))}
        ${field('statementQty','Quantité éligible sur avis avant ouverture',integer('statementQty','',false))}
        ${field('statementRef','Référence de l’avis avant ouverture',input('statementRef','','text','maxlength="200"'))}
      </div>
      <div class="fields" data-types="SPLIT BONUS RIGHTS STOCK_DIVIDEND">${field('source','Source de l’événement',input('source','','text','required maxlength="200"'))}</div>
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
        <p class="quiet">Télécom Sonatel + Orange : ${pct(p.targets.SNTS+p.targets.ORAC)} de la cible CORE. Total des cibles : 100 %.</p>`,
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
      ${['DEPOSIT','WITHDRAW','FEE','TRANSFER','BUY','SELL','DIVIDEND','BONUS','RIGHTS','STOCK_DIVIDEND'].includes(t.type)&&!db.transactions.some(x=>x.corrects===t.id)?btn('correct','Rectifier',t.id):''}</div>`];
  }
  function historyView() {
    const p=getPortfolio();
    const monthly=p?p.accounts.reduce((n,a)=>n+a.monthly,0):250000;
    const monthlyInput=projectInputs.monthly??monthly;
    const perf=p?A.performance(db,p.id):{twr:null,xirr:null,gain:null,observations:[]};
    const txs=db.transactions.filter(t=>!historyMonth||t.date.startsWith(historyMonth)).slice().reverse();
    const scenarios=[['Prudent',-.05],['Stable',0],['Favorable',.05]].map(([label,r])=>[label,r,A.project(p?.total||0,monthlyInput,r,projectInputs.dividend,projectInputs.fee)]);
    return `<div class="context compact">${p?portfolioPicker():''}<div class="actions">${btn('transaction','Saisir une opération','','primary')}${btn('export-journal','Exporter le journal CSV')}${db.asOf&&db.accounts.length?btn('opening-proof','Rapprocher une archive')+btn('opening-revise','Corriger la photographie'):''}</div></div>
      <div class="split">${pane('Performance observée',`<div class="mini-kpis">${kpi('TWR',pct(perf.twr))}${kpi('XIRR annualisé',pct(perf.xirr))}${kpi('Gain net des apports',perf.gain===null?'—':fc(perf.gain))}</div>
        <p class="quiet">TWR calculé sur des intervalles valorisés sans flux. XIRR utilise les flux datés et exige une solution identifiable. Les tirets signalent des observations insuffisantes.</p>`+
        curve(perf.observations.filter(o=>o.complete)))}
      ${pane('Projection à cinq ans',form('projection',`<div class="fields">${field('monthly','Versement mensuel',money('monthly',monthlyInput))}
        ${field('fee','Frais d’achat (%)',input('fee',Math.round(projectInputs.fee*10000)/100,'number','min="0" max="10" step="0.01" required'))}
        ${field('dividend','Dividende net réinvesti (%)',input('dividend',Math.round(projectInputs.dividend*10000)/100,'number','min="0" max="30" step="0.01" required'))}</div>`,'Recalculer')+
        table(['Hypothèse prix annuelle','Année 1','Année 3','Année 5'],scenarios.map(([name,r,pr])=>[name+' · '+pct(r),fc(pr.values[1]),fc(pr.values[3]),fc(pr.values[5])]))+
        `<p class="quiet">Hypothèses, dividendes nets réinvestis à ${pct(projectInputs.dividend)} par an. Apports prévus ${fc(monthlyInput*60)}, frais sur apports ${fc(monthlyInput*60*projectInputs.fee)} sur cinq ans.</p>`)}</div>
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
    return `<div class="split">${pane('Sauvegardes privées',`<p>Exportez une sauvegarde chiffrée pour la conserver ou la restaurer sur un autre appareil. Le navigateur ne synchronise pas les portefeuilles. ${store.protected?'Le coffre actif est chiffré sur cet appareil. Verrouillez-le avant de quitter le profil.':'Les données actives sont stockées en clair. Vous pouvez activer le coffre local.'}</p>
      <div class="actions">${store.protected?btn('lock','Verrouiller le coffre'):btn('protect','Chiffrer les données actives')}${btn('encrypt','Exporter chiffré','','primary')}${btn('import','Importer mes données')}${btn('import','Restaurer une sauvegarde')}${btn('export-json','Exporter mon JSON')}${btn('reset','Effacer mes données locales')}${checkpoint?btn('rollback','Restaurer le point précédent'):''}</div>
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
    $('#nav').innerHTML=Object.entries(pages).map(([key,[label,icon]])=>
      `<button type="button" data-page="${key}" ${key===tab?'aria-current="page"':''}><span aria-hidden="true">${icon}</span>${label}</button>`).join('');
    $('#page-title').textContent=pages[tab][0];
    const last=Object.values(db.quotes).map(q=>q.date).sort().at(-1);
    $('#quote-date').textContent=last?'Dernière cote · '+showDate(last):'Aucun cours chargé';
    $('#view').innerHTML={dashboard,accounts:accountsView,invest:investment,orders:ordersView,events:eventsView,
      history:historyView,settings:settingsView,data:dataView}[tab]();
  }
  function goTo(page) {
    if(!Object.hasOwn(pages,page)) return;
    tab=page; $('#flash').hidden=true;
    document.body.classList.remove('menu-open'); $('#menu').setAttribute('aria-expanded','false');
    render(); $('#view').focus({preventScroll:true}); window.scrollTo(0,0);
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
        (mergedImport?field('mode','Action',select('mode',[['replace','Remplacer les données locales'],['merge','Fusionner les jeux compatibles']],'replace','required')):'')+
        (store.protected?'':'<p>Configurez le coffre pour enregistrer cet import sur cet appareil.</p>'+phraseFields()),
        identical?'Confirmer sans doublon':hasLocal?'Appliquer le choix':'Importer et enregistrer')}`);
  }
  async function chooseImport(file) {
    const ticket=++importReadTicket;
    $('#flash').hidden=true;
    if(file.size>V.MAX) throw Error('Sauvegarde trop volumineuse.');
    let raw;
    try {raw=JSON.parse(await file.text());}
    catch {throw Error('Fichier JSON illisible. Les données locales sont conservées.');}
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
        case 'refresh': void refresh(); break;
        case 'import': $('#import').click();break;
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
        case 'new-account':
          if(store.protected || db.accounts.length) modal('Ajouter un compte',accountForm());
          else modal('Protéger votre premier compte',form('protect',phraseFields(),'Activer le coffre et créer un compte','account'));
          break;
        case 'entity': entityForm(...id.split('|')); break;
        case 'transaction': transaction(id||'DEPOSIT'); break;
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
          modal('Créer un ordre à transmettre',form('new-order',field('accountId','Compte',select('accountId',accountsOptions(activeAccounts())))+
            field('symbol','Titre',symInput())+field('qty','Actions entières',integer('qty'))+
            field('price','Limite indicative',money('price')),'Enregistrer le projet'));break;
        case 'order-state': {
          const [o,status]=id.split('|');
          modal(status,form('order-state',field('reference','Référence / note de contrôle',input('reference','','text','required minlength="4" maxlength="180"')),
            status==='TRANSMIS'?'Confirmer la transmission manuelle':'Confirmer le changement',o+'|'+status));break;
        }
        case 'order-fill': {
          const o=db.orders.find(x=>x.id===id);
          transaction('BUY',{accountId:o.accountId,orderId:id,symbol:o.symbol});break;
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
            if(sgi) {i={id:F.id(),label:sgi};next.institutions.push(i);}
            if(!i) throw Error('Choisir ou nommer une SGI.');
            a={id:F.id(),portfolioId:p.id,institutionId:i.id,currency:f.get('currency'),cash:number(f,'cash'),reserved:0,openedOn:f.get('openedOn')};
            if(a.cash && next.observations.some(o=>o.portfolioId===p.id)) throw Error('Pour préserver les performances observées, créez le compte à zéro puis saisissez le montant crédité sur justificatif.');
            next.accounts.push(a);
            page='accounts';
          }
          a.label=trim(f,'label');
          const broker=institution(a.institutionId)||'';
          const newSgi=next.institutions.find(x=>x.id===a.institutionId)?.label||broker;
          const hasMonthly=next.accounts.some(x=>x.id!==a.id&&x.portfolioId===a.portfolioId&&x.institutionId===a.institutionId);
          a.monthly=a.currency!=='XOF'?0:trim(f,'monthly')?number(f,'monthly'):hasMonthly?0:{FGI:100000,CGF:150000}[newSgi.toUpperCase()]||0;
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
          planInputs={mode:f.get('mode'),budget:number(f,'budget'),accountIds,exceptional:f.has('exceptional'),verifiedOnly:f.has('verifiedOnly'),
            manual:Object.fromEntries(accountIds.map(id=>[id,number(f,'manual_'+id)]))};
          plan=F.propose(db,{portfolioId,...planInputs});
          comparison=accountIds.length===2?F.propose(db,{portfolioId,...planInputs,mode:plan.mode==='mensuel'?'equilibre':'mensuel'}):null;
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
          next=F.createPlan(db,{portfolioId:a.portfolioId,mode:'manuel',funding:{[accountId]:0},lines:[{accountId,symbol:s,qty,price,estimateRate:a.brokerRate+a.otherRate}]});
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
        case 'projection':
          projectInputs={monthly:number(f,'monthly'),fee:number(f,'fee')/100,dividend:number(f,'dividend')/100};render();return;
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
          const data=f.get('mode')==='merge'?mergedImport:importPreview;
          if(!data||record.revision!==importRevision) throw Error('Les données ont changé. Ouvrez de nouveau le fichier.');
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
          plan=null;comparison=null;planInputs=null;projectInputs={monthly:null,fee:.016,dividend:.03};
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
  document.addEventListener('change',e=>{
    const el=e.target;
    if(!db) return;
    if(el.matches('form[data-form=invest] [name=mode]')) {
      const options=el.form.querySelector('[data-manual]');
      options.hidden=el.value!=='manuel';
      if(!options.hidden) options.closest('details').open=true;
    }
    if(el.matches('#portfolio')) {portfolioId=el.value;accountFilter='';plan=null;comparison=null;planInputs=null;projectInputs.monthly=null;render();$('#portfolio')?.focus();}
    if(el.matches('#account-filter')) {accountFilter=el.value;render();$('#account-filter')?.focus();}
    if(el.matches('#history-month')) {historyMonth=el.value;journalLimit=40;render();$('#history-month')?.focus();}
    if(el.closest('form[data-form=tx]') && ['type','accountId','toAccountId'].includes(el.name)) transactionFields(el.form);
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
    if(db?.settings.autoQuotes && !document.hidden && navigator.onLine && !busy && !$('#modal').open &&
      Date.now()-lastQuoteAttempt>=15*60*1000) void refresh(true);
  }
  document.addEventListener('visibilitychange',scheduleRefresh);
  window.addEventListener('online',scheduleRefresh);
  setInterval(scheduleRefresh,60*1000);
  start();
})();
