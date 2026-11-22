(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./finance') : root.BRVM);
  if (typeof module === 'object') module.exports = api;
  else root.BRVMVault = api;
})(globalThis, F => {
  'use strict';
  const LEGACY_KEY='brvm-family-offline:local-data:v1';
  const LEGACY_DB='brvm-family-v3';
  const RESET_NOTICE='brvm-family-v3:reset:';
  const scope=()=>new URL('./',location.href).pathname;
  const FORMAT='brvm-family-encrypted-v1';
  const ACTIVE='brvm-family-local-v1';
  const iterations=600000;
  const MAX=32*1024*1024;
  const enc=new TextEncoder(), dec=new TextDecoder('utf-8',{fatal:true});
  const b64=bytes=>{
    let binary='';
    for(let n=0;n<bytes.length;n+=8192) binary+=String.fromCharCode(...bytes.subarray(n,n+8192));
    return btoa(binary);
  };
  const un64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  async function derive(pass,salt) {
    const key=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function encrypt(data,pass) {
    if(typeof pass!=='string'||pass.length<12||pass.length>1024) throw Error('Utiliser une phrase secrète de 12 à 1 024 caractères.');
    F.calculate(data);
    const clear=enc.encode(JSON.stringify(data));
    if(clear.length>MAX*.70) throw Error('Sauvegarde trop volumineuse.');
    const salt=crypto.getRandomValues(new Uint8Array(16)), iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await derive(pass,salt);
    const dataBytes=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(FORMAT)},key,clear);
    return {schema:FORMAT,kdf:'PBKDF2-SHA256',iterations,cipher:'AES-256-GCM',salt:b64(salt),iv:b64(iv),data:b64(new Uint8Array(dataBytes))};
  }
  async function decrypt(pack,pass) {
    if(pack?.schema!==FORMAT || pack.kdf!=='PBKDF2-SHA256' || pack.iterations!==iterations || pack.cipher!=='AES-256-GCM' ||
       typeof pack.data!=='string' || pack.data.length>MAX || typeof pack.salt!=='string' || pack.salt.length!==24 ||
       typeof pack.iv!=='string' || pack.iv.length!==16 || typeof pass!=='string' || pass.length>1024)
      throw Error('Format de sauvegarde chiffrée invalide.');
    let parsed;
    try {
      const salt=un64(pack.salt), iv=un64(pack.iv);
      if(salt.length!==16||iv.length!==12) throw Error();
      const key=await derive(pass,salt);
      const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:enc.encode(FORMAT)},key,un64(pack.data));
      parsed=JSON.parse(dec.decode(plaintext));
    } catch {
      throw Error('Phrase secrète incorrecte ou sauvegarde altérée.');
    }
    return inspect(parsed);
  }
  function inspect(parsed) {
    function validateShape(node,depth=0) {
      if(depth>32) throw Error('Structure de sauvegarde trop imbriquée.');
      if(!node||typeof node!=='object') return;
      for(const k of Object.keys(node)) {
        if(['__proto__','constructor','prototype'].includes(k)) throw Error('Clé non autorisée dans la sauvegarde.');
        validateShape(node[k],depth+1);
      }
    }
    validateShape(parsed);
    const d=F.migrate(parsed);
    F.calculate(d);
    return d;
  }
  async function seal(record,key,salt,slot) {
    F.calculate(record.data);
    const clear=enc.encode(JSON.stringify(record.data));
    if(clear.length>MAX*.70) throw Error('Coffre trop volumineux pour une sauvegarde portable.');
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(ACTIVE+':'+slot+':'+record.revision)},
      key,clear);
    return {format:ACTIVE,revision:record.revision,salt,iv:b64(iv),cipher:b64(new Uint8Array(cipher))};
  }
  async function unseal(record,key,slot) {
    if(!record || !key) return record;
    try {
      if(record.format!==ACTIVE || !Number.isSafeInteger(record.revision) || record.revision<1 || un64(record.iv).length!==12)
        throw Error();
      const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(record.iv),additionalData:enc.encode(ACTIVE+':'+slot+':'+record.revision)},
        key,un64(record.cipher));
      return {revision:record.revision,data:inspect(JSON.parse(dec.decode(clear)))};
    } catch {throw Error('Phrase secrète incorrecte ou coffre local altéré.');}
  }
  function open(name=LEGACY_DB+':'+scope()) {
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(name,1);
      req.onupgradeneeded=()=>req.result.createObjectStore('vault');
      req.onerror=()=>reject(Error('Stockage local indisponible.'));
      req.onblocked=()=>reject(Error('Fermer les autres onglets BRVM pour ouvrir le stockage.'));
      req.onsuccess=()=>{
        const connection=req.result;
        connection.onversionchange=()=>connection.close();
        let key,salt;
        const view=async slot=>{
          const raw=await read(connection,slot);
          if(raw?.format===ACTIVE && !key) return {locked:true,revision:raw.revision};
          return unseal(raw,key,slot);
        };
        const handle={
          read:view,
          async commit(data,revision,checkpoint) {
            F.calculate(data);
            const old=await view('current');
            if(old?.locked) throw Error('Coffre verrouillé. Rechargez avant de continuer.');
            if((old?.revision||0)!==revision) throw Error('Un autre onglet a modifié les données. Rechargez la page.');
            if(old && same(old.data,data)) return old;
            const record={data,revision:revision+1};
            const stored=key?await seal(record,key,salt,'current'):record;
            const previous=checkpoint&&old?(key?await seal(old,key,salt,'checkpoint'):old):undefined;
            await write(connection,revision,stored,previous);
            return record;
          },
          async unlock(pass) {
            const raw=await read(connection,'current');
            if(raw?.format!==ACTIVE || typeof pass!=='string' || !pass || pass.length>1024) throw Error('Coffre ou phrase secrète invalide.');
            const seed=un64(raw.salt);
            if(seed.length!==16) throw Error('Coffre local altéré.');
            const candidate=await derive(pass,seed);
            const record=await unseal(raw,candidate,'current');
            key=candidate;salt=raw.salt;
            return record;
          },
          async reset(revision) {
            const record={revision:revision+1,data:F.empty()};
            await write(connection,revision,record,null);
            key=undefined;salt=undefined;
            return record;
          },
          async protect(pass,revision,data,keepPrevious=false) {
            if(typeof pass!=='string'||pass.length<12||pass.length>1024) throw Error('Utiliser une phrase secrète de 12 à 1 024 caractères.');
            const previous=await read(connection,'current');
            if(!previous?.data || key) throw Error('Coffre déjà configuré. Rechargez la page.');
            if(previous.revision!==revision) throw Error('Un autre onglet a modifié les données. Rechargez la page.');
            const checkpoint=keepPrevious?previous:await read(connection,'checkpoint');
            const seed=crypto.getRandomValues(new Uint8Array(16)), candidate=await derive(pass,seed), encoded=b64(seed);
            const record={revision:previous.revision+1,data:data??previous.data};
            const encrypted=await seal(record,candidate,encoded,'current');
            const rollback=checkpoint?await seal(checkpoint,candidate,encoded,'checkpoint'):undefined;
            await write(connection,previous.revision,encrypted,rollback);
            key=candidate;salt=encoded;
            return record;
          },
          get protected(){return Boolean(key);},
          close(){key=undefined;connection.close();}
        };
        resolve(handle);
      };
    });
  }
  function read(db,k) {
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('vault','readonly'), r=tx.objectStore('vault').get(k);
      tx.oncomplete=()=>resolve(r.result);
      tx.onabort=()=>reject(Error('Lecture locale interrompue.'));
    });
  }
  function write(db,revision,record,checkpoint) {
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('vault','readwrite',{durability:'strict'});
      const store=tx.objectStore('vault'), req=store.get('current');
      let error;
      req.onsuccess=()=>{
        if((req.result?.revision||0)!==revision) {
          error=Error('Un autre onglet a modifié les données. Rechargez la page avant de réessayer.');
          tx.abort(); return;
        }
        if(checkpoint===null) store.delete('checkpoint');
        else if(checkpoint) store.put(checkpoint,'checkpoint');
        store.put(record,'current');
      };
      tx.oncomplete=()=>resolve();
      tx.onabort=()=>reject(error || Error('Écriture annulée. La dernière version enregistrée est conservée.'));
    });
  }
  async function start() {
    const store=await open();
    try {
      let current=await store.read('current');
      if(!current) {
        try { current=await store.commit(F.empty(),0,false); }
        catch(err) {
          current=await store.read('current');
          if(!current) throw err;
        }
      }
      if(!current.locked) F.calculate(current.data);
      return {store,current};
    } catch(err) {store.close(); throw err;}
  }
  async function legacyData(pass) {
    const legacy=await open(LEGACY_DB);
    try {
      const current=await legacy.read('current');
      if(current?.locked && pass===undefined) return {locked:true};
      if(current?.locked) return {data:(await legacy.unlock(pass)).data};
      if(current?.data) return {data:inspect(current.data)};
      const raw=localStorage.getItem(LEGACY_KEY);
      if(!raw) throw Error('Aucune donnée issue des anciennes versions sur cette origine.');
      if(raw.length>MAX) throw Error('Ancienne sauvegarde trop volumineuse.');
      return {data:inspect(JSON.parse(raw))};
    } finally {legacy.close();}
  }
  function removeLegacy() {
    return new Promise((resolve,reject)=>{
      const request=indexedDB.deleteDatabase(LEGACY_DB);
      request.onblocked=()=>reject(Error('Fermez les onglets de l’ancienne version pour terminer son effacement.'));
      request.onerror=()=>reject(Error('Ancien stockage inaccessible.'));
      request.onsuccess=()=>{
        try {localStorage.removeItem(LEGACY_KEY);resolve();}
        catch {reject(Error('L’ancienne copie V2 n’a pas pu être effacée.'));}
      };
    });
  }
  function signature(value) {
    if(!value || typeof value!=='object') return JSON.stringify(value);
    if(Array.isArray(value)) return '['+value.map(v=>signature(v)??'null').join(',')+']';
    return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+signature(value[k])).join(',')+'}';
  }
  const same=(a,b)=>signature(a)===signature(b);
  function merge(current,incoming) {
    if(same(current,incoming)) return current;
    // Each independent account may share the exact same owner, portfolio and SGI
    // with another import. All other account data must be strictly disjoint.
    // A common snapshot baseline is mandatory; never merge differing quotes,
    // opening snapshots or configuration implicitly.
    const entities=['owners','portfolios','institutions','accounts','positions','transactions',
      'orders','plans','events','attachments','history'];
    const baseline=data=>Object.fromEntries(Object.entries(data).filter(([k])=>!entities.includes(k)));
    if(!same(baseline(current),baseline(incoming))) return null;
    const shared=new Set(['owners','portfolios','institutions']);
    const withIds=['owners','portfolios','institutions','accounts','transactions',
      'orders','plans','events','attachments'];
    for(const key of [...withIds,'history']) {
      const existing=new Map(current[key].filter(item=>typeof item?.id==='string').map(item=>[item.id,item]));
      for(const item of incoming[key]) {
        if(withIds.includes(key) && typeof item?.id!=='string') return null;
        if(typeof item?.id!=='string') continue; // Legacy history entries can be unkeyed.
        const previous=existing.get(item.id);
        if(previous && (!shared.has(key) || !same(previous,item))) return null;
      }
    }
    // A split transaction is globally replayed into another account by the
    // underlying engine. Do not bypass this rule; audited opening snapshots
    // can represent earlier splits in the non-replayed history instead.
    if([...current.transactions,...incoming.transactions].some(t=>t.type==='SPLIT')) return null;
    const combined=structuredClone(current);
    for(const key of entities) {
      if(shared.has(key)) {
        const known=new Set(combined[key].map(x=>x.id));
        for(const item of incoming[key]) if(!known.has(item.id)) {
          combined[key].push(structuredClone(item));
          known.add(item.id);
        }
      } else combined[key].push(...structuredClone(incoming[key]));
    }
    try {F.calculate(combined);return combined;} catch {return null;}
  }

  // Mandatory monthly backups are kept private, entirely inside the browser.
  // An archive is only marked verified after the user re-selects the downloaded ZIP.
  const monthKey=(now=new Date())=>String(now.getFullYear()).padStart(4,'0')+'-'+String(now.getMonth()+1).padStart(2,'0');
  const backupDue=(data,now=new Date())=>Boolean(data?.accounts?.length && data?.settings?.monthlyBackup?.month!==monthKey(now));
  const slug=value=>String(value||'compte').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,45)||'compte';

  // Individual files are *current-position snapshots*, not a second replay of past trades.
  // Complete backup, included in the same ZIP, retains the full live journal and analytics.
  function accountSnapshot(data,accountId) {
    const totals=F.calculate(data);
    const current=totals.accounts.find(a=>a.id===accountId);
    const original=data.accounts.find(a=>a.id===accountId);
    if(!original || !current) throw Error('Compte introuvable pour la sauvegarde.');
    const portfolio=data.portfolios.find(p=>p.id===original.portfolioId);
    const owner=data.owners.find(o=>o.id===portfolio.ownerId);
    const institution=data.institutions.find(s=>s.id===original.institutionId);
    const snapshot=F.empty();
    snapshot.asOf=F.today();
    snapshot.source='Sauvegarde locale des comptes';
    snapshot.settings=structuredClone(data.settings);
    snapshot.owners=[structuredClone(owner)];
    snapshot.portfolios=[structuredClone(portfolio)];
    snapshot.institutions=[structuredClone(institution)];
    snapshot.accounts=[{...structuredClone(original),cash:current.cash,reserved:current.reserved}];
    snapshot.positions=Object.values(current.positions).filter(p=>p.qty>0).map(p=>({
      accountId,symbol:p.symbol,qty:p.qty,cost:p.cost
    }));
    snapshot.quotes=structuredClone(data.quotes);
    snapshot.instruments=structuredClone(data.instruments);
    if(data.fxRates) snapshot.fxRates=structuredClone(data.fxRates);
    // Keep original account records for audit, but never replay already-included cash/holdings.
    snapshot.history=data.history.filter(h=>h.accountId===accountId).map(h=>structuredClone(h));
    for(const t of data.transactions.filter(t=>t.accountId===accountId||t.toAccountId===accountId))
      snapshot.history.push({...structuredClone(t),id:'archive-tx-'+t.id,kind:'ARCHIVE_TRANSACTION'});
    for(const o of data.orders.filter(o=>o.accountId===accountId))
      snapshot.history.push({...structuredClone(o),id:'archive-order-'+o.id,kind:'ARCHIVE_ORDER'});
    for(const e of data.events.filter(e=>e.accountId===accountId))
      snapshot.history.push({...structuredClone(e),id:'archive-event-'+e.id,kind:'ARCHIVE_EVENT'});
    const refs=new Set(snapshot.history.map(h=>h.attachmentId).filter(Boolean));
    snapshot.attachments=data.attachments.filter(a=>refs.has(a.id)).map(a=>structuredClone(a));
    F.calculate(snapshot);
    return snapshot;
  }

  function crc32(bytes) {
    let crc=-1;
    for(const byte of bytes) {
      crc^=byte;
      for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xEDB88320:0);
    }
    return (crc^(-1))>>>0;
  }
  function zipFiles(files) {
    if(!Array.isArray(files)||!files.length||files.length>100) throw Error('Nombre de fichiers de sauvegarde invalide.');
    const encoder=new TextEncoder(), local=[], central=[];
    let offset=0,total=0;
    const w=(view,offset,value,size)=>size===2?view.setUint16(offset,value,true):view.setUint32(offset,value,true);
    for(const file of files) {
      if(!/^[A-Za-z0-9_./-]+\.json$/.test(file.name)||file.name.includes('..'))
        throw Error('Nom de fichier ZIP invalide.');
      const filename=encoder.encode(file.name), body=encoder.encode(file.data);
      if(body.length>MAX) throw Error('JSON individuel trop volumineux.');
      total+=body.length;
      if(total>128*1024*1024) throw Error('Archive mensuelle supérieure à 128 Mio.');
      const crc=crc32(body);
      const localHeader=new Uint8Array(30+filename.length);
      const v=new DataView(localHeader.buffer);
      w(v,0,0x04034b50,4);w(v,4,20,2);w(v,6,0x800,2);
      w(v,14,crc,4);w(v,18,body.length,4);w(v,22,body.length,4);
      w(v,26,filename.length,2);localHeader.set(filename,30);
      local.push(localHeader,body);
      const entry=new Uint8Array(46+filename.length);
      const c=new DataView(entry.buffer);
      w(c,0,0x02014b50,4);w(c,4,20,2);w(c,6,20,2);w(c,8,0x800,2);
      w(c,16,crc,4);w(c,20,body.length,4);w(c,24,body.length,4);
      w(c,28,filename.length,2);w(c,42,offset,4);entry.set(filename,46);
      central.push(entry);
      offset+=localHeader.length+body.length;
    }
    const centralLength=central.reduce((a,b)=>a+b.length,0);
    const end=new Uint8Array(22), e=new DataView(end.buffer);
    w(e,0,0x06054b50,4);w(e,8,files.length,2);w(e,10,files.length,2);
    w(e,12,centralLength,4);w(e,16,offset,4);
    const output=new Uint8Array(offset+centralLength+22);
    let cursor=0;
    for(const piece of [...local,...central,end]) {output.set(piece,cursor);cursor+=piece.length;}
    return output;
  }
  function monthlyBundle(data,now=new Date()) {
    F.calculate(data);
    if(!data.accounts.length) throw Error('Aucun compte à sauvegarder.');
    const month=monthKey(now);
    const files=[{name:'BRVM_COMPLET.json',data:JSON.stringify(data,null,2)}];
    const used=new Set(['BRVM_COMPLET.json']);
    for(const [i,a] of data.accounts.entries()) {
      const p=data.portfolios.find(x=>x.id===a.portfolioId);
      const owner=data.owners.find(x=>x.id===p.ownerId);
      const sgi=data.institutions.find(x=>x.id===a.institutionId);
      let name='comptes/'+slug(owner.label)+'_'+slug(sgi.label)+'.json';
      if(used.has(name)) name='comptes/'+slug(owner.label)+'_'+slug(sgi.label)+'_'+(i+1)+'.json';
      used.add(name);
      files.push({name,data:JSON.stringify(accountSnapshot(data,a.id),null,2)});
    }
    files.push({name:'MANIFESTE.json',data:JSON.stringify({
      format:'brvm-monthly-bundle-v1',month,generatedAt:now.toISOString(),
      accountCount:data.accounts.length,files:files.map(f=>f.name),
      note:'Le JSON complet restaure le journal actif; les JSON individuels sont des instantanes avec historique archive.'
    },null,2)});
    return {month,files,bytes:zipFiles(files)};
  }
  async function sha256(bytes) {
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  }

  return {start,open,encrypt,decrypt,inspect,legacyData,removeLegacy,same,merge,scope,RESET_NOTICE,FORMAT,MAX,
    monthKey,backupDue,accountSnapshot,zipFiles,monthlyBundle,sha256};
});
