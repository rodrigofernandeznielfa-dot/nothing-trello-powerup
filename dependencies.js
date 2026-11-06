(function(root){
"use strict";
function readSection(desc,heading){
 const lines=String(desc||"").replace(/\r/g,"").split("\n");
 const start=lines.findIndex(line=>line.trim()==="**"+heading+"**");
 if(start<0)return "";
 const result=[];
 for(const line of lines.slice(start+1)){
  if(/^\*\*[^*]+\*\*\s*$/.test(line.trim()))break;
  result.push(line);
 }
 return result.join("\n").trim();
}
function readDependencyIds(desc){
 const line=String(desc||"").match(/^NB_DEPENDENCIES_V1:\s*([A-Za-z0-9,\s-]+)$/m);
 const ids=line?line[1].split(",").map(x=>x.trim())
  :Array.from(readSection(desc,"Depende de").matchAll(/https:\/\/trello\.com\/c\/([A-Za-z0-9]{8})(?=[/)\s]|$)/g),m=>m[1]);
 return [...new Set(ids.filter(x=>/^[A-Za-z0-9]{8}$/.test(x)))].slice(0,12);
}
function readHistoricHours(desc){
 const old=String(desc||"").match(/NB_TIME_HISTORIC_ESTIMATE_V1 min=(\d+(?:\.\d+)?) max=(\d+(?:\.\d+)?)/);
 const readable=readSection(desc,"Histórico de dedicación").match(/^Aproximadamente (\d+(?:[.,]\d+)?)(?:[–-](\d+(?:[.,]\d+)?))? h\./);
 const match=old||readable;
 if(!match)return null;
 const min=Number(match[1].replace(",",".")),max=Number((match[2]||match[1]).replace(",","."));
 return Number.isFinite(min)&&Number.isFinite(max)&&min>=0&&max>=min?{min,max}:null;
}
function readPreview(desc){
 const old=String(desc||"").match(/^NB_PREVIEW_V1:\s*(.+)$/m);
 return old?old[1]:readSection(desc,"Resumen");
}
function resolve(desc,cards,doneListId){
 const dependencyIds=readDependencyIds(desc);
 if(!dependencyIds.length)return {blocked:false,dependencies:[],missing:[]};
 const mapped=new Map((Array.isArray(cards)?cards:[]).filter(Boolean).map(card=>[card.shortLink,card]));
 const unresolved=[],missing=[];
 for(const id of dependencyIds){
  const card=mapped.get(id);
  if(!card){missing.push(id);continue}
  if(card.idList!==doneListId)unresolved.push({id,name:card.name||"Tarjeta "+id,url:"https://trello.com/c/"+id});
 }
 return {blocked:unresolved.length>0,dependencies:unresolved,missing:missing};
}
root.NBDependencies={readDependencyIds,resolve,readHistoricHours,readPreview};
})(typeof window!=="undefined"?window:globalThis);
