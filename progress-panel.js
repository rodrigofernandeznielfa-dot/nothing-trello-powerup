(function(){
"use strict";
const t=window.TrelloPowerUp.iframe();
const DONE="6aec66f2b6df305a261abb0b",TODO="6aec66ed3137d17f84ce7a3c",DOING="6aec66f02d325131dd44f8d8";
const KEY="nothing_estimates_v1";
const el=id=>document.getElementById(id);
function asHours(n){return Number.isFinite(n)?String(Math.round(n*10)/10).replace(".",",")+" h":"—"}
function historic(desc){
  const match=(desc||"").match(/NB_TIME_HISTORIC_ESTIMATE_V1 min=(\d+(?:\.\d+)?) max=(\d+(?:\.\d+)?)/);
  if(!match)return null;
  const a=Number(match[1]),b=Number(match[2]);
  return a===b?"≈ "+asHours(a):"≈ "+asHours(a)+"–"+asHours(b);
}
function setText(id,value){el(id).textContent=value}
function extract(card,estimate){
  const items=(card.checklists||[]).flatMap(c=>(c.checkItems||[]).map(i=>({id:i.id,name:i.name||"Criterio sin título",done:String(i.state).toLowerCase()==="complete"})));
  const total=items.length||Number(card.badges?.checkItems)||0, completed=items.length?items.filter(i=>i.done).length:Number(card.badges?.checkItemsChecked)||0;
  const pending=items.filter(i=>!i.done);
  const allKnown=items.length>0 && pending.every(i=>typeof estimate[i.id]==="number"&&Number.isFinite(estimate[i.id])&&estimate[i.id]>=0);
  const remaining=allKnown?pending.reduce((n,i)=>n+estimate[i.id],0):null;
  return {items,total,completed,remaining,hasDetailedItems:items.length>0};
}
function render(card,estimate,dependencies){
 const s=extract(card,estimate||{});
 const finished=card.idList===DONE,progress=s.total?Math.round(s.completed*100/s.total):null;
 const blocked=!finished&&dependencies&&dependencies.blocked;
 setText("state",blocked?"Bloqueada":finished?"Hecho":card.idList===DOING?"En curso":card.idList===TODO?"Por hacer":"En seguimiento");
 el("state").classList.toggle("blocked",!!blocked);
 const blocker=el("blocker");blocker.replaceChildren();
 if(blocked){
  const heading=document.createElement("strong");heading.textContent="Depende de:";
  const details=document.createElement("p");
  dependencies.dependencies.forEach((dep,index)=>{
    if(index)details.append(document.createTextNode(" · "));
    const link=document.createElement("a");
    link.href=dep.url;link.target="_blank";link.rel="noopener noreferrer";
    link.textContent=dep.name.replace(/^[^A-Za-z0-9]* /,"").split(" — ")[0];
    details.append(link);
  });
  blocker.append(heading,details);blocker.hidden=false;
 }else blocker.hidden=true;
 setText("percent",progress===null?"—":progress+"%");
 setText("done",s.total?s.completed+" completados":"Sin criterios");
 setText("left",s.total?(s.total-s.completed)+" pendientes":"");
 const bar=el("track");bar.replaceChildren();
 if(s.total){for(let i=0;i<Math.min(s.total,20);i++){const seg=document.createElement("span");seg.className="segment"+(i<Math.round((s.completed/s.total)*Math.min(s.total,20))?" done":"");bar.append(seg)}}
 const historical=historic(card.desc);
 setText("spent",finished?historical||"Sin medir":"Sin medir");
 setText("spentCaption",historical&&finished?"Esfuerzo retrospectivo aproximado":"No hay sesiones activas verificadas");
 setText("remaining",finished?"0 h":s.remaining===null?"Sin estimar":asHours(s.remaining));
 setText("remainCaption",finished?"Criterios cerrados":s.remaining===null?"Faltan estimaciones por objetivo":"Según criterios aún pendientes");
 const list=el("steps");list.replaceChildren();
 if(s.hasDetailedItems){s.items.slice(0,12).forEach(item=>{
   const li=document.createElement("li"),mark=document.createElement("span"),text=document.createElement("span");
   mark.className=item.done?"mark":"todo";mark.textContent=item.done?"✓":"○";
   text.className="grow";text.textContent=item.name;
   li.append(mark,text);
   if(!item.done&&typeof estimate[item.id]==="number"){const h=document.createElement("span");h.className="small";h.textContent=asHours(estimate[item.id]);li.append(h)}
   list.append(li);
 });if(s.items.length>12){const li=document.createElement("li");li.className="small";li.textContent="Y "+(s.items.length-12)+" criterios más en la checklist de Trello";list.append(li)}}
 else{const li=document.createElement("li");li.className="muted";li.textContent=s.total?"Hay "+s.total+" criterios; el detalle no está disponible en esta vista.":"Esta tarjeta todavía no tiene checklist.";list.append(li)}
 const next=s.items.find(item=>!item.done);
 setText("next",finished?"Trabajo cerrado. Consulta la descripción y las evidencias de la tarjeta.":blocked?"Continuaremos cuando se complete la dependencia.":next?next.name:"Revisar la descripción de la tarjeta para elegir el siguiente paso.");
 const warnings=[];
 if(!finished&&s.total&&s.completed===s.total)warnings.push("Checklist completa, pero la tarjeta todavía no está cerrada.");
 if(!finished&&s.remaining===null)warnings.push("Tiempo restante no calculable: faltan estimaciones o detalle de los criterios.");
 const warning=el("warning");warning.replaceChildren();
 warnings.forEach(w=>{const p=document.createElement("p");p.className="notice small";p.textContent=w;warning.append(p)});
 el("status").hidden=true;el("content").hidden=false;
 resizePanel();
}
function resizePanel(){
 if(typeof t.sizeTo==="function"){
  Promise.resolve(t.sizeTo(document.body)).catch(function(e){console.warn("NOTHING resize",e)});
 }
}
let loaded=false;
const loadingTimeout=window.setTimeout(function(){
 if(!loaded){
  el("status").textContent="La conexión con Trello está tardando demasiado. Cierra y vuelve a abrir la tarjeta.";
  setText("state","Sin conexión");
  resizePanel();
 }
},9000);
async function load(){
 try{
  const [card,estimate]=await Promise.all([t.card("idList","desc","checklists","badges"),t.get("card","shared",KEY,{}).catch(()=>({}))]);
  let dependencies={blocked:false,dependencies:[],missing:[]};
  if(card.idList!==DONE && window.NBDependencies.readDependencyIds(card.desc).length){
    try{
      const cards=await t.cards("id","name","shortLink","idList");
      dependencies=window.NBDependencies.resolve(card.desc,cards,DONE);
    }catch(error){console.warn("NOTHING dependency lookup failed",error)}
  }
  render(card,estimate||{},dependencies);
  loaded=true;window.clearTimeout(loadingTimeout);
 }catch(err){
  loaded=true;window.clearTimeout(loadingTimeout);
  el("status").textContent="No se pudo leer la tarjeta. Cierra y vuelve a abrirla.";
  setText("state","Error");
  resizePanel();
  console.error("NOTHING panel",err);
 }
}
t.render(load);
load();
})();
