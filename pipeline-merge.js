(function(root){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function next(rows,key,prefix){let n=0;for(const r of rows){const m=String(r[key]||'').match(new RegExp('^'+prefix+'-(\\d+)$'));if(m)n=Math.max(n,+m[1]);}return prefix+'-'+String(n+1).padStart(4,'0');}
  function merge(current,packet){
    if(packet?.format!=='Javier BDM Pipeline Update'||packet.version!==1||packet.approved!==true||packet.currency!=='USD'||!Array.isArray(packet.rows)||!packet.controls)throw Error('Archivo de pipeline no válido.');
    if(!current||!Array.isArray(current.Empresas)||!Array.isArray(current.Contactos)||!Array.isArray(current.Actividades))throw Error('Primero restaura tu base de contactos.');
    if(!Number.isInteger(packet.year)||!Number.isFinite(packet.controls.quoted)||!Number.isFinite(packet.controls.billed))throw Error('Totales o año no válidos.');
    const keys=['CotizadoUSD','Q1','Q2','Q3','Q4'];let quoted=0,billed=0;const ids=new Set();
    for(const r of packet.rows){if(!r.Empresa||!r.OrigenID||ids.has(r.OrigenID)||r.Anio!==packet.year)throw Error('Registro de pipeline no válido.');ids.add(r.OrigenID);for(const k of keys)if(r[k]!=null&&(typeof r[k]!=='number'||!Number.isFinite(r[k])))throw Error('Monto no válido.');quoted+=r.CotizadoUSD||0;billed+=keys.slice(1).reduce((a,k)=>a+(r[k]||0),0);}
    if(Math.abs(quoted-packet.controls.quoted)>.011||Math.abs(billed-packet.controls.billed)>.011)throw Error('Los totales del archivo no concuerdan.');
    const db=clone(current);db.Pipeline=db.Pipeline||[];db.Importaciones=db.Importaciones||[];
    const report={added:0,companies:0,skipped:0,pending:[],quoted:0,billed:0};
    for(const incoming of packet.rows){
      if(db.Pipeline.some(p=>p.OrigenID===incoming.OrigenID)){report.skipped++;continue;}
      // A manual opportunity for the same account may already contain these amounts.
      if(db.Pipeline.some(p=>norm(p.Empresa)===norm(incoming.Empresa)&&(!p.Anio||Number(p.Anio)===incoming.Anio))){report.pending.push({empresa:incoming.Empresa,motivo:'Ya existe pipeline de esta empresa; revisar para evitar contar dos veces.'});continue;}
      const matches=db.Empresas.filter(e=>norm(e.Empresa)===norm(incoming.Empresa));
      if(matches.length>1){report.pending.push({empresa:incoming.Empresa,motivo:'Más de una empresa coincide; revisar vínculo.'});continue;}
      let co=matches[0];if(!co){co={'Empresa ID':next(db.Empresas,'Empresa ID','EMP'),Empresa:incoming.Empresa,Clasificacion:'Por clasificar',Notas:'Creada desde pipeline Database.xlsx.'};db.Empresas.push(co);report.companies++;}
      db.Pipeline.push({...clone(incoming),'Pipeline ID':next(db.Pipeline,'Pipeline ID','PIPE'),'Empresa ID':co['Empresa ID'],Empresa:co.Empresa,Actualizado:new Date().toISOString()});report.added++;report.quoted+=incoming.CotizadoUSD||0;report.billed+=keys.slice(1).reduce((a,k)=>a+(incoming[k]||0),0);
    }
    if(!db.Importaciones.some(p=>p.id===packet.id))db.Importaciones.push({id:packet.id,tipo:'pipeline',agregados:report.added,pendientes:report.pending});
    return {data:db,report};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=merge;
  root.JavierBDMPipelineMerge=merge;
})(typeof window!=='undefined'?window:globalThis);
