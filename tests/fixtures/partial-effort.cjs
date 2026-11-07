// Anonymous data shape: 9 unestimated achievements, 15 estimated future tasks,
// 12 uncosted verification criteria. No private card titles or descriptions.
module.exports=function partialCard(){
 const hours=[2,3.5,2,2,1.5,2,3,2,1,.5,4,2,4,2,3];
 return {id:'synthetic',idList:'6aec66f02d325131dd44f8d8',
  desc:'**ESTIMACIÓN DE TRABAJO**\nPendiente: ≈ 34,5 h\nTrabajo previo: sin estimar\nReferencia: 9/36 criterios completos',
  badges:{checkItems:36,checkItemsChecked:9},checklists:[
   {name:'Logros',checkItems:Array.from({length:9},(_,i)=>({id:'past-'+i,name:'Avance comprobado '+i,state:'complete'}))},
   {name:'Trabajo futuro',checkItems:hours.map((h,i)=>({id:'future-'+i,name:'Trabajo '+i+' · ≈ '+h+' h',state:'incomplete'}))},
   {name:'Verificaciones',checkItems:Array.from({length:12},(_,i)=>({id:'verify-'+i,name:'Verificación '+i,state:'incomplete'}))}
  ]};
};
