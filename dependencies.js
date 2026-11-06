(function(root){
"use strict";
function readDependencyIds(desc){
 const line=String(desc||"").match(/^NB_DEPENDENCIES_V1:\s*([A-Za-z0-9,\s-]+)$/m);
 if(!line)return [];
 return [...new Set(line[1].split(",").map(x=>x.trim()).filter(x=>/^[A-Za-z0-9]{8}$/.test(x)))].slice(0,12);
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
root.NBDependencies={readDependencyIds,resolve};
})(typeof window!=="undefined"?window:globalThis);
