(function(root){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const aliases={'keytronics':'keytronic','harman international':'harman','joyson safety systems':'joyson','sbd':'stanley black decker','konfection':'konfektion','thyseenkrup':'thyssenkrupp'};
  const company=v=>aliases[norm(v)]||norm(v);
  const emails=v=>[...new Set((String(v||'').toLowerCase().match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/g)||[]))];
  const generic=e=>/^(info|sales|ventas|compras|admin|contact|support|notifications|noreply)([._\d-]|$)/.test(e.split('@')[0]);
  const digits=v=>String(v||'').replace(/\D/g,'');
  function nextId(rows,key,prefix){let max=0;const used=new Set(rows.map(r=>r[key]));for(const id of used){const m=String(id).match(new RegExp('^'+prefix+'-(\\d+)$'));if(m)max=Math.max(max,+m[1]);}let id;do{id=prefix+'-'+String(++max).padStart(4,'0')}while(used.has(id));return id;}
  function merge(current,packet){
    if(!current||!Array.isArray(current.Empresas)||!Array.isArray(current.Contactos)||!Array.isArray(current.Actividades))throw Error('Restaura primero una base válida.');
    if(packet?.format!=='Javier BDM Update'||packet?.version!==1||packet?.approvedSubset!==true||!Array.isArray(packet.contacts)||!Array.isArray(packet.companies))throw Error('Actualización no válida.');
    const db=clone(current),report={added:0,filled:0,merged:0,clearedPhones:0,pending:[]};
    db.Historial=db.Historial||[];
    const applied=Array.isArray(db.Importaciones)?db.Importaciones:[];
    const alreadyApplied=packet.id&&applied.some(x=>x.id===packet.id);
    // Explicit decisions apply only when expected identity evidence still agrees.
    for(const decision of alreadyApplied?[]:(packet.merges||[])){
      const target=db.Contactos.find(c=>c['Contacto ID']===decision.keep),old=db.Contactos.find(c=>c['Contacto ID']===decision.remove);
      if(!old)continue;
      const accepted=c=>c&&decision.names.includes(norm(c.Contacto))&&company(c.Empresa)===company(decision.company);
      if(!accepted(target)||!accepted(old)){if(accepted(target))report.pending.push({type:'fusion',ids:[decision.keep,decision.remove],reason:'Los datos actuales no coinciden con la decisión auditada'});continue;}
      target.Email=[...new Set([...emails(target.Email),...emails(old.Email)])].join('; ');
      for(const k of ['Puesto','Ubicación','Teléfono(s)'])if(!target[k]&&old[k])target[k]=old[k];
      if(old.Notas&&!String(target.Notas||'').includes(old.Notas))target.Notas=[target.Notas,old.Notas].filter(Boolean).join('\n');
      target.Contacto=decision.name;
      db.Contactos=db.Contactos.filter(c=>c!==old);
      for(const h of db.Historial)if(h['Contacto ID']===decision.remove)h['Contacto ID']=decision.keep;
      report.merged++;
    }
    for(const excluded of packet.phoneExclusions||[]){
      for(const c of db.Contactos){
        if(norm(c.Contacto)!==norm(excluded.Contacto)||company(c.Empresa)!==company(excluded.Empresa)||digits(c['Teléfono(s)'])!==digits(excluded.telefono_original)||!c['Teléfono(s)'])continue;
        let extra;try{extra=JSON.parse(c['Datos adicionales']||'{}')}catch{extra={texto_original:c['Datos adicionales']}}
        if(!extra||typeof extra!=='object'||Array.isArray(extra))extra={datos_originales:extra};
        extra.telefono_excluido={valor:c['Teléfono(s)'],motivo:excluded.motivo};c['Datos adicionales']=JSON.stringify(extra);c['Teléfono(s)']='';report.clearedPhones++;
      }
    }
    for(const incoming of packet.contacts){
      if(!incoming.Contacto||!incoming.Empresa){report.pending.push({name:incoming.Contacto,reason:'Nombre o empresa faltante'});continue;}
      let matches=db.Contactos.filter(c=>norm(c.Contacto)===norm(incoming.Contacto)&&company(c.Empresa)===company(incoming.Empresa));
      const incomingEmails=emails(incoming.Email).filter(e=>!generic(e));
      const emailMatches=db.Contactos.filter(c=>emails(c.Email).some(e=>incomingEmails.includes(e)));
      if(emailMatches.length){
        const compatible=emailMatches.filter(c=>company(c.Empresa)===company(incoming.Empresa)&&(norm(c.Contacto).split(' ').some(n=>norm(incoming.Contacto).split(' ').includes(n))||(norm(incoming.Contacto)==='hugo luna'&&norm(c.Contacto)==='methode'&&digits(c['Teléfono(s)']).endsWith('8116801297'))));
        if(compatible.length)matches=[...new Set([...matches,...compatible])];
        else if(!matches.length){report.pending.push({name:incoming.Contacto,reason:'Email compartido con otra identidad o empresa'});continue;}
      }
      // Hugo Luna was stored under a company placeholder, but email AND mobile agree.
      if(!matches.length&&norm(incoming.Contacto)==='hugo luna'){
        matches=db.Contactos.filter(c=>norm(c.Contacto)==='methode'&&company(c.Empresa)==='methode'&&emails(c.Email).includes('hugo.luna@methode.com')&&digits(c['Teléfono(s)']).endsWith('8116801297'));
        if(matches.length===1){matches[0].Contacto='Hugo Luna';report.filled++;}
      }
      if(matches.length>1){report.pending.push({name:incoming.Contacto,reason:'Varias coincidencias actuales',ids:matches.map(c=>c['Contacto ID'])});continue;}
      if(matches.length===1){
        const c=matches[0];let changed=false;
        if(norm(incoming.Contacto)==='hugo luna'&&norm(c.Contacto)==='methode'&&emails(c.Email).includes('hugo.luna@methode.com')&&digits(c['Teléfono(s)']).endsWith('8116801297')){c.Contacto='Hugo Luna';changed=true;}
        for(const k of ['Email','Teléfono(s)','Puesto','Ubicación'])if(!c[k]&&incoming[k]){c[k]=incoming[k];changed=true;}
        // Preserve imported alternatives as evidence without replacing current edits.
        if(incoming['Datos adicionales']&&c['Datos adicionales']!==incoming['Datos adicionales']){
          let extra;try{extra=JSON.parse(c['Datos adicionales']||'{}')}catch{extra={texto_original:c['Datos adicionales']}}
          if(!extra||typeof extra!=='object'||Array.isArray(extra))extra={datos_originales:extra};
          if(extra.evidencia_importada!==incoming['Datos adicionales']){extra.evidencia_importada=incoming['Datos adicionales'];c['Datos adicionales']=JSON.stringify(extra);changed=true;}
        }
        if(changed)report.filled++;
        continue;
      }
      let companies=db.Empresas.filter(c=>company(c.Empresa)===company(incoming.Empresa));
      // Prefer exact company name when aliases exist on the phone.
      if(companies.length>1){const exact=companies.filter(c=>norm(c.Empresa)===norm(incoming.Empresa));if(exact.length===1)companies=exact;}
      if(companies.length>1){const canonical=companies.find(c=>c['Empresa ID']===incoming['Empresa ID']);if(canonical)companies=[canonical];}
      if(companies.length>1){report.pending.push({name:incoming.Contacto,reason:'Varias empresas actuales equivalentes'});continue;}
      if(!companies.length){
        const template=packet.companies.find(c=>c['Empresa ID']===incoming['Empresa ID'])||{Empresa:incoming.Empresa};
        const c=clone(template);c['Empresa ID']=nextId(db.Empresas,'Empresa ID','EMP');db.Empresas.push(c);companies=[c];
      }
      const c=clone(incoming);c['Contacto ID']=nextId(db.Contactos,'Contacto ID','CON');c['Empresa ID']=companies[0]['Empresa ID'];c.Empresa=companies[0].Empresa;
      db.Contactos.push(c);report.added++;
    }
    if(new Set(db.Contactos.map(c=>c['Contacto ID'])).size!==db.Contactos.length)throw Error('IDs de contacto duplicados en la base actual.');
    if(new Set(db.Empresas.map(c=>c['Empresa ID'])).size!==db.Empresas.length)throw Error('IDs de empresa duplicados en la base actual.');
    if(packet.id&&!alreadyApplied)db.Importaciones=[...applied,{id:packet.id,added:report.added,merged:report.merged,pending:report.pending}];
    return {data:db,report};
  }
  root.JavierBDMMerge=merge;
  if(typeof module==='object'&&module.exports)module.exports=merge;
})(typeof globalThis==='object'?globalThis:this);
