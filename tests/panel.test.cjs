const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const DOING='6aec66f02d325131dd44f8d8',DONE='6aec66f2b6df305a261abb0b';
// Synthetic arithmetic fixture, not a copy of any private card description.
const summary=(done=4)=>'**ESTIMACIÓN DE TRABAJO**\nPrevisto: ≈ 5 h · Pendiente: ≈ 1,5 h\nReferencia: '+done+'/5 criterios completos';
class Element{
  constructor(){this.textContent='';this.children=[];this.hidden=false;this.style={};this.classList={toggle(){}};this.events={};}
  replaceChildren(...children){this.children=children;}
  append(...children){this.children.push(...children);}
  addEventListener(name,callback){this.events[name]=callback;}
  setAttribute(){}
}
async function panel(card,{estimate={},cached={},getFails=false,writeFails=false,decision={},writable=false,recommendationReadFails=false,recommendationReadHangs=false}={}){
  const elements=new Map();
  for(const id of fs.readFileSync(path.join(root,'progress-panel.html'),'utf8').matchAll(/id="([^"]+)"/g))elements.set(id[1],new Element());
  elements.get('content').hidden=true;
  const writes=[];
  const client={card:async()=>card,cards:async()=>[],render(){},sizeTo:async()=>{},memberCanWriteToModel:()=>writable,
    get:async(model,visibility,key)=>{if(recommendationReadHangs&&key==='nothing_next_task_decision_v1')return new Promise(()=>{});if(getFails||(recommendationReadFails&&key==='nothing_next_task_decision_v1'))throw Error('unavailable');return key==='nothing_estimates_v1'?estimate:key==='nothing_next_task_decision_v1'?decision:cached},
    set:async(model,visibility,key,value)=>{if(writeFails)throw Error('readonly');writes.push({key,value});if(key==='nothing_next_task_decision_v1')decision=value}};
  const document={body:new Element(),getElementById:id=>{assert.ok(elements.has(id),'Missing element '+id);return elements.get(id)},createElement:()=>new Element(),createTextNode:text=>({textContent:text})};
  const timers=new Set();
  const window={TrelloPowerUp:{iframe:()=>client},setTimeout:(fn,ms)=>{const id=setTimeout(fn,ms);timers.add(id);return id},clearTimeout:id=>{clearTimeout(id);timers.delete(id)}};
  const context=vm.createContext({window,document,console:{warn(){},error(){}}});
  vm.runInContext(fs.readFileSync(path.join(root,'dependencies.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'progress-panel.js'),'utf8'),context);
  try{
    for(let i=0;i<1000&&elements.get('content').hidden;i++)await new Promise(resolve=>setTimeout(resolve,2));
    assert.equal(elements.get('content').hidden,false,'Panel did not finish rendering: '+elements.get('status').textContent);
    return {text:id=>elements.get(id).textContent,node:id=>elements.get(id),writes,click:async id=>elements.get(id).events.click()};
  }finally{for(const timer of timers)clearTimeout(timer)}
}
const card=(overrides={})=>({id:'synthetic',idList:DOING,desc:summary(),checklists:[],badges:{checkItems:5,checkItemsChecked:4},...overrides});
test('card panel shows planned, remaining and completed effort without checkItems',async()=>{
  const p=await panel(card());
  assert.equal(p.text('percent'),'80%');
  assert.equal(p.text('planned'),'≈ 5 h');
  assert.equal(p.text('remaining'),'≈ 1,5 h');
  assert.equal(p.text('spentLabel'),'Completado');
  assert.equal(p.text('spent'),'≈ 3,5 h');
  assert.match(p.text('spentCaption'),/estimado.*no cronometrado/);
  assert.equal(p.writes.length,0,'Fallback must never overwrite per-item estimates or cache an unverified plan');
});
test('existing item estimates take priority over names, summary and stored snapshot',async()=>{
  const p=await panel(card({badges:{checkItems:2,checkItemsChecked:1},checklists:[{checkItems:[
    {id:'a',name:'Diseño · ≈ 2 h',state:'complete'},
    {id:'b',name:'Revisión · ≈ 3 h',state:'incomplete'}]}]}),{estimate:{b:4},cached:{planned:99,remaining:90,done:1,total:2}});
  assert.equal(p.text('planned'),'≈ 6 h');assert.equal(p.text('remaining'),'≈ 4 h');
  assert.equal(p.text('spent'),'≈ 2 h');
  assert.equal(p.writes.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(p.writes[0].value)),{planned:6,remaining:4,done:1,total:2,estimatedCompletedCount:1,unestimatedCompletedCount:0});
});
test('fresh saved plan is used when native details are absent',async()=>{
  const p=await panel(card(),{cached:{planned:7,remaining:2,done:4,total:5}});
  assert.equal(p.text('planned'),'≈ 7 h');assert.equal(p.text('remaining'),'≈ 2 h');assert.equal(p.text('spent'),'≈ 5 h');
});
test('changed progress never turns stale remaining hours into measured or proportional time',async()=>{
  const p=await panel(card({badges:{checkItems:5,checkItemsChecked:3}}));
  assert.equal(p.text('percent'),'60%');assert.equal(p.text('planned'),'≈ 5 h');
  assert.equal(p.text('remaining'),'Revisar estimación');assert.equal(p.text('spent'),'Sin estimar');
  assert.ok(p.node('warning').children.length>0);assert.equal(p.writes.length,0);
});
test('partial checklist response does not overwrite the full plan or native progress',async()=>{
  const p=await panel(card({checklists:[{checkItems:[{id:'partial',name:'Parte · ≈ 1 h',state:'complete'}]}]}));
  assert.equal(p.text('percent'),'80%');assert.equal(p.text('planned'),'≈ 5 h');
  assert.equal(p.text('remaining'),'≈ 1,5 h');assert.equal(p.writes.length,0);
});
test('new estimate summary format also works without the Referencia prefix',async()=>{
  const p=await panel(card({desc:summary().replace('Referencia: ', '')}));
  assert.equal(p.text('planned'),'≈ 5 h');assert.equal(p.text('remaining'),'≈ 1,5 h');
});
test('unavailable shared plugin data does not hide description estimates',async()=>{
  const p=await panel(card(),{getFails:true});
  assert.equal(p.text('remaining'),'≈ 1,5 h');
});
test('invalid saved numeric values cannot replace a valid readable estimate',async()=>{
  for(const cached of [{planned:Infinity,remaining:1,done:4,total:5},{planned:2,remaining:3,done:4,total:5},{planned:'5',remaining:1,done:4,total:5}]){
    const p=await panel(card(),{cached});assert.equal(p.text('planned'),'≈ 5 h');assert.equal(p.text('remaining'),'≈ 1,5 h');
  }
});
test('historical dedication stays labelled retrospective, never clocked',async()=>{
  const p=await panel(card({idList:DONE,desc:'**DEDICACIÓN**\nAproximadamente 2 h, estimación retrospectiva.'}));
  assert.equal(p.text('spentLabel'),'Dedicación');assert.equal(p.text('spent'),'≈ 2 h');
  assert.match(p.text('spentCaption'),/retrospectiva, no cronometrada/);assert.equal(p.text('remaining'),'0 h');
});
test('no estimate remains unknown, rather than deriving time from percentage',async()=>{
  const p=await panel(card({desc:''}));assert.equal(p.text('planned'),'Sin estimar');assert.equal(p.text('remaining'),'Sin estimar');assert.equal(p.text('spent'),'Sin estimar');
});
test('zero remaining/completed estimates are valid and readonly cache errors do not hide panel',async()=>{
  const p=await panel(card({badges:{checkItems:1,checkItemsChecked:0},checklists:[{checkItems:[{id:'zero',name:'Prueba · ≈ 0 h',state:'incomplete'}]}]}),{writeFails:true});
  assert.equal(p.text('planned'),'≈ 0 h');assert.equal(p.text('remaining'),'≈ 0 h');assert.equal(p.text('spent'),'≈ 0 h');
});
test('every supported connector reloads the corrected card panel',()=>{
  const html=fs.readFileSync(path.join(root,'progress-panel.html'),'utf8');
  assert.match(html,/progress-panel\.js\?v=17/);assert.match(html,/dependencies\.js\?v=8/);
  for(const file of ['connector.html','index.html',...Array.from({length:16},(_,i)=>'connector-v'+(i+2)+'.html')]){
    assert.match(fs.readFileSync(path.join(root,file),'utf8'),/progress-panel\.html\?v=18/,file);
  }
});

const partialCard=require('./fixtures/partial-effort.cjs');
test('9/36 case: 34.5 future hours are not the whole-project budget and unestimated past is not zero',async()=>{
 for(const details of [true,false]){
  const fixture=partialCard();if(!details)fixture.checklists=[];
  const p=await panel(fixture);
  assert.equal(p.text('percent'),'25%');assert.equal(p.text('remaining'),'≈ 34,5 h');
  assert.equal(p.text('planned'),'Sin cerrar');assert.equal(p.text('spent'),'Sin estimar');
  assert.match(p.text('spentCaption'),/previos.*no tienen horas/);
 }
});
test('completing a 2-hour task reduces real remaining effort by two, not a percentage of achievements',async()=>{
 const fixture=partialCard();fixture.checklists[1].checkItems[0].state='complete';fixture.badges.checkItemsChecked=10;
 const p=await panel(fixture);
 assert.equal(p.text('percent'),'28%');assert.equal(p.text('remaining'),'≈ 32,5 h');
 assert.equal(p.text('planned'),'Sin cerrar');assert.equal(p.text('spent'),'≈ 2 h');
 assert.match(p.text('spentCaption'),/avances previos sin estimar/);
});
test('legacy cache without coverage never implies zero hours for nine completed achievements',async()=>{
 const fixture=partialCard();fixture.checklists=[];fixture.desc=summary(9).replace('5 h','34,5 h').replace('1,5 h','34,5 h').replace('9/5','9/36');
 const p=await panel(fixture,{cached:{planned:34.5,remaining:34.5,done:9,total:36}});
 assert.equal(p.text('planned'),'Sin cerrar');assert.equal(p.text('spent'),'Sin estimar');
 assert.equal(p.text('remaining'),'≈ 34,5 h');
});
test('explicitly estimated zero-hour completed work stays zero, rather than being treated as missing',async()=>{
 const p=await panel(card({desc:'',badges:{checkItems:1,checkItemsChecked:1},checklists:[{checkItems:[{id:'zero',name:'Sin esfuerzo · ≈ 0 h',state:'complete'}]}]}));
 assert.equal(p.text('planned'),'≈ 0 h');assert.equal(p.text('spent'),'≈ 0 h');
});

const proposalDescription=require('./fixtures/recommendation.cjs');
const TODO='6aec66ed3137d17f84ce7a3c';
const proposalCard=()=>card({idList:TODO,desc:proposalDescription(),badges:{checkItems:0,checkItemsChecked:0}});
test('recommendation is yellow and read-only until the user explicitly decides',async()=>{
 const p=await panel(proposalCard(),{writable:true});
 assert.equal(p.node('recommendation').hidden,false);
 assert.match(p.text('recommendation-title'),/Propuesta/);
 assert.equal(p.node('recommendation-accept').disabled,false);
 assert.equal(p.writes.filter(x=>x.key==='nothing_next_task_decision_v1').length,0);
 assert.match(p.text('recommendation-status'),/Ningún botón mueve/);
});
test('accept, reconsider and park only write the exact proposal decision',async()=>{
 const fixture=proposalCard(),p=await panel(fixture,{writable:true});
 await p.click('recommendation-accept');
 assert.equal(p.writes.length,1);assert.equal(p.writes[0].key,'nothing_next_task_decision_v1');
 assert.equal(p.writes[0].value.choice,'accepted');assert.match(p.text('recommendation-title'),/acordada/);
 assert.equal(fixture.idList,TODO);assert.equal(p.node('recommendation-actions').hidden,true);
 await p.click('recommendation-reconsider');await p.click('recommendation-dismiss');
 assert.deepEqual(p.writes.map(x=>x.value.choice),['accepted','pending','dismissed']);
 assert.match(p.text('recommendation-title'),/aparcada/);assert.equal(fixture.idList,TODO);
});
test('readonly users and unavailable decisions never get write controls',async()=>{
 for(const options of [{writable:false},{writable:true,recommendationReadFails:true}]){
  const p=await panel(proposalCard(),options);assert.equal(p.node('recommendation-accept').disabled,true);await p.click('recommendation-accept');assert.equal(p.writes.length,0);
 }
});
test('proposal changes require a new decision and block a stale click',async()=>{
 const fixture=proposalCard(),p=await panel(fixture,{writable:true});fixture.desc+=' updated';
 await p.click('recommendation-accept');assert.equal(p.writes.length,0);assert.match(p.text('recommendation-status'),/ha cambiado/);
});
test('failed writes never display a saved or accepted decision',async()=>{
 const p=await panel(proposalCard(),{writable:true,writeFails:true});await p.click('recommendation-accept');
 assert.match(p.text('recommendation-title'),/Propuesta/);assert.match(p.text('recommendation-status'),/No se ha podido confirmar/);assert.equal(p.node('recommendation-accept').disabled,true);
});
test('ideas, active and finished cards have no next-task proposal',async()=>{
 for(const idList of ['6aec66eb5ff8ae196d37b7ca',DOING,DONE]){
  const p=await panel({...proposalCard(),idList});assert.equal(p.node('recommendation').hidden,true);
 }
});

test('hanging recommendation lookup cannot hide the existing progress panel',async()=>{
 const started=Date.now(),p=await panel(proposalCard(),{writable:true,recommendationReadHangs:true});
 assert.match(p.text('recommendation-status'),/No se ha podido comprobar/);assert.equal(p.node('recommendation-accept').disabled,true);assert.ok(Date.now()-started<2000);
});

test('compact cards keep their native next step instead of a generic fallback',async()=>{
 const desc='🎯 **META** · Taller de ejemplos\n⚪ **POR HACER** · Pendiente de prueba\n▶️ **PRÓXIMO** · Probar un lote pequeño de prueba\n📁 **EXPEDIENTE** · [Informe](https://github.com/example/test/issues/1)';
 const p=await panel(card({desc}));
 assert.equal(p.text('next'),'Probar un lote pequeño de prueba');
 assert.equal(p.text('state'),'En curso');
});


test('editorial 3S v3 displays the actual next step with no invented remaining effort',async()=>{
 const desc='*Estudio sencillo y visual*\n\n**Situación actual**\nPrototipo pendiente de validar\n\n**Siguiente paso**\nProbar fichas, búsqueda y exportación en Windows\n\n*Estimación previa · ≈11 h orientativas*\n\n---\n\n*Referencias · [Archivo](https://github.com/example/test/issues/1)*';
 const p=await panel(card({desc,checklists:[],badges:{checkItems:0,checkItemsChecked:0}}));
 assert.equal(p.text('next'),'Probar fichas, búsqueda y exportación en Windows');
 assert.equal(p.text('planned'),'Sin estimar');
 assert.equal(p.text('remaining'),'Sin estimar');
});


test('editorial rough estimate appears only as orientation, with unknown remaining work',async()=>{
 const desc='*Primer prototipo del catálogo*\n\n**Siguiente paso**\nRevisar navegación\n\n*Estimación · ≈ 11 h (orientativa)*';
 const p=await panel(card({desc,checklists:[],badges:{checkItems:0,checkItemsChecked:0}}));
 assert.equal(p.text('planned'),'≈ 11 h');
 assert.match(p.text('plannedCaption'),/orientativa/i);
 assert.equal(p.text('remaining'),'Sin estimar');
 assert.match(p.text('remainCaption'),/no calcula trabajo restante/i);
 assert.equal(p.text('spent'),'Sin estimar');
});
