(function(root){
"use strict";
function headingKey(value){
 return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
}
function readSection(desc,heading){
 const lines=String(desc||"").replace(/\r/g,"").split("\n");
 const start=lines.findIndex(line=>{
  const found=line.trim().match(/^\*\*([^*]+)\*\*$/);
  return found && headingKey(found[1])===headingKey(heading);
 });
 if(start<0)return "";
 const result=[];
 for(const line of lines.slice(start+1)){
  if(/^\*\*[^*]+\*\*\s*$/.test(line.trim()))break;
  result.push(line);
 }
 return result.join("\n").trim();
}
function readDependencyIds(desc){
 const legacy=String(desc||"").match(/^NB_DEPENDENCIES_V1:\s*([A-Za-z0-9,\s-]+)$/m);
 const ids=legacy?legacy[1].split(",").map(x=>x.trim())
  :Array.from(readSection(desc,"Depende de").matchAll(/https:\/\/trello\.com\/c\/([A-Za-z0-9]{8})(?=[/)\s]|$)/g),m=>m[1]);
 return [...new Set(ids.filter(x=>/^[A-Za-z0-9]{8}$/.test(x)))].slice(0,12);
}
function readHistoricHours(desc){
 const legacy=String(desc||"").match(/NB_TIME_HISTORIC_ESTIMATE_V1 min=(\d+(?:\.\d+)?) max=(\d+(?:\.\d+)?)/);
 const section=readSection(desc,"Dedicación")||readSection(desc,"Histórico de dedicación");
 const readable=section.match(/^Aproximadamente\s+(\d+(?:[.,]\d+)?)(?:[–-](\d+(?:[.,]\d+)?))?\s+h(?=\s*[,.;]|\s*$)/i);
 const m=legacy||readable;
 if(!m)return null;
 const min=Number(m[1].replace(",",".")),max=Number((m[2]||m[1]).replace(",","."));
 return Number.isFinite(min)&&Number.isFinite(max)&&min>=0&&max>=min?{min,max}:null;
}
function readPreview(desc){
 const old=String(desc||"").match(/^NB_PREVIEW_V1:\s*(.+)$/m);
 if(old)return old[1];
 const section=readSection(desc,"Resumen");
 if(section)return section.split(/\n\s*\n/)[0].trim();
 const parts=String(desc||"").replace(/\r/g,"").split("\n");
 if(/^\*\*[^*]+\*\*$/.test((parts[0]||"").trim()))return (parts[1]||"").trim();
 return "";
}
function readCriterionHours(name){
 // Editable, visible work estimate on a native Trello check item:
 // "Revisar el diseño · ≈ 2,5 h". No other numbers are treated as hours.
 const m=String(name||"").match(/\s[·•]\s≈\s*(\d+(?:[.,]\d+)?)\s*h\s*$/i);
 if(!m)return null;
 const h=Number(m[1].replace(",","."));
 return Number.isFinite(h)&&h>=0&&h<=999?h:null;
}
function readTimePlan(checklists,estimates){
 const manual=estimates&&typeof estimates==="object"&&!Array.isArray(estimates)?estimates:{};
 const items=(Array.isArray(checklists)?checklists:[]).flatMap(c=>
   (Array.isArray(c.checkItems)?c.checkItems:[]).map(item=>({id:item.id,name:item.name,
     done:String(item.state).toLowerCase()==="complete"}))
 );
 let planned=0,remaining=0,estimatedCount=0,estimatedCompletedCount=0,unestimatedCompletedCount=0;
 for(const item of items){
  // Existing Power-Up values take precedence. We never overwrite saved edits.
  const explicit=manual[item.id];
  const hours=typeof explicit==="number"&&Number.isFinite(explicit)&&explicit>=0&&explicit<=999
    ?explicit:readCriterionHours(item.name);
  if(hours===null){if(item.done)unestimatedCompletedCount++;continue}
  estimatedCount++;
  planned+=hours;
  if(!item.done)remaining+=hours;
  else estimatedCompletedCount++;
 }
 if(!estimatedCount)return null;
 const rounded=x=>Math.round(x*10)/10;
 return {planned:rounded(planned),remaining:rounded(remaining),estimatedCount,totalItems:items.length,
   completedEffort:rounded(planned-remaining),estimatedCompletedCount,unestimatedCompletedCount};
}
// Human-readable summary stored in the card description as a fallback for
// Trello's card-badges context, where checkItems may not be provided.
function readTimeSummary(desc){
 const section=readSection(desc,"ESTIMACIÓN DE TRABAJO");
 if(!section)return null;
 const match=section.match(/Previsto:\s*≈?\s*(\d+(?:[.,]\d+)?)\s*h\s*[·|/]\s*Pendiente:\s*≈?\s*(\d+(?:[.,]\d+)?)\s*h/i);
 const pendingOnly=section.match(/^Pendiente:\s*≈?\s*(\d+(?:[.,]\d+)?)\s*h\s*$/im);
 const progress=section.match(/(?:Referencia:\s*)?(\d+)\s*\/\s*(\d+)\s*criterios/i);
 if((!match&&!pendingOnly)||!progress)return null;
 const planned=Number((match?match[1]:pendingOnly[1]).replace(",",".")),remaining=Number((match?match[2]:pendingOnly[1]).replace(",","."));
 const done=Number(progress[1]),total=Number(progress[2]);
 if(![planned,remaining,done,total].every(Number.isFinite) || planned<0 || remaining<0 || remaining>planned || done<0 || total<1 || done>total)return null;
 return match?{planned,remaining,done,total}:{planned,remaining,done,total,unestimatedCompletedCount:done,estimatedCompletedCount:0};
}
function hasUnestimatedCompleted(plan,done){
 if(!plan)return false;
 if(Number.isInteger(plan.unestimatedCompletedCount))return plan.unestimatedCompletedCount>0;
 // Older summaries/cache only contain the future-work subtotal. Zero difference
 // cannot prove zero effort for already-completed criteria without cost coverage.
 return done>0&&plan.planned===plan.remaining&&plan.estimatedCompletedCount!==done;
}
function resolve(desc,cards,doneListId){
 const ids=readDependencyIds(desc);
 if(!ids.length)return {blocked:false,dependencies:[],missing:[]};
 const mapped=new Map((Array.isArray(cards)?cards:[]).filter(Boolean).map(card=>[card.shortLink,card]));
 const unresolved=[],missing=[];
 for(const id of ids){
  const card=mapped.get(id);
  if(!card){missing.push(id);continue}
  if(card.idList!==doneListId)unresolved.push({id,name:card.name||"Tarjeta "+id,url:"https://trello.com/c/"+id});
 }
 return {blocked:unresolved.length>0,dependencies:unresolved,missing};
}
root.NBDependencies={readSection,readDependencyIds,resolve,readHistoricHours,readPreview,readCriterionHours,readTimePlan,readTimeSummary,hasUnestimatedCompleted};
})(typeof window!=="undefined"?window:globalThis);
