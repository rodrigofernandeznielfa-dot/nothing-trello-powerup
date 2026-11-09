const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'connector.html'),'utf8');
const scripts=Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g));
const script=scripts.filter(m=>!m[1].includes('nb-dependencies')).map(m=>m[2]).join('\n');
const embedded=scripts.find(m=>m[1].includes('nb-dependencies'))[2];
const TODO='6aec66ed3137d17f84ce7a3c',DONE='6aec66f2b6df305a261abb0b';
function setup(withDependencies=true){
  let capabilities;
  const window={TrelloPowerUp:{initialize(value){capabilities=value;}}};
  const context=vm.createContext({window,Promise,console:{warn(){},error(){}},setTimeout,clearTimeout});
  if(withDependencies)vm.runInContext(embedded,context);
  vm.runInContext(script,context);
  return capabilities;
}
function client(overrides={}){
  return Object.assign({
    card:async()=>({idList:TODO,desc:'',badges:{checkItems:7,checkItemsChecked:2}}),
    get:async()=>({}),cards:async()=>[],signUrl:url=>url
  },overrides);
}
const plain=value=>JSON.parse(JSON.stringify(value));
const never=()=>new Promise(()=>{});
test('registers every capability without loading the optional helper',()=>{
  const c=setup(false);
  assert.deepEqual(Object.keys(c).sort(),['card-back-section','card-badges','card-buttons','card-detail-badges']);
  assert.ok(!/src="\.\/dependencies\.js/.test(html));
  assert.match(c['card-back-section'](client()).content.url,/^https:\/\//);
});
test('keeps verified native progress and unknown time',async()=>{
  const b=await setup()['card-badges'](client());
  assert.match(b[0].text,/29% \(2\/7\)/);
  assert.equal(b[1].text,'⏱ Sin estimar');
});
test('missing optional script preserves progress and does not invent dependency state',async()=>{
  const b=await setup(false)['card-badges'](client({card:async()=>({idList:TODO,desc:'NB_DEPENDENCIES_V1: CPRnmJFc',badges:{checkItems:5}})}));
  assert.equal(b[0].text,'Dependencias sin comprobar');
  assert.match(b[1].text,/0% \(0\/5\)/);
});
test('hanging estimates cannot swallow the progress badges',async()=>{
  const start=Date.now(),b=await setup()['card-badges'](client({get:never}));
  assert.match(b[0].text,/2\/7/);
  assert.equal(b[1].text,'⏱ Sin estimar');
  assert.ok(Date.now()-start<3000);
});
test('hanging board lookup leaves dependencies unknown and still returns progress',async()=>{
  const b=await setup()['card-badges'](client({
    card:async()=>({idList:TODO,desc:'NB_DEPENDENCIES_V1: CPRnmJFc',badges:{checkItems:5}}),cards:never
  }));
  assert.equal(b[0].text,'Dependencias sin comprobar');
  assert.match(b[1].text,/0\/5/);
});
test('known unfinished dependency remains blocked',async()=>{
  const b=await setup()['card-badges'](client({
    card:async()=>({idList:TODO,desc:'NB_DEPENDENCIES_V1: CPRnmJFc',badges:{checkItems:5}}),
    cards:async()=>[{shortLink:'CPRnmJFc',name:'Studio 01',idList:TODO}]
  }));
  assert.equal(b[0].text,'Bloqueada');
});
test('finished cards retain historical hours; ideas retain no badges',async()=>{
  const c=setup();
  const done=await c['card-badges'](client({card:async()=>({idList:DONE,desc:'NB_TIME_HISTORIC_ESTIMATE_V1 min=2 max=2',badges:{checkItems:5,checkItemsChecked:5}})}));
  assert.match(done[0].text,/100% \(5\/5\)/);assert.equal(done[1].text,'⏱ 2 h');
  const ideas=await c['card-badges'](client({card:async()=>({idList:'6aec66eb5ff8ae196d37b7ca'})}));
  assert.deepEqual(plain(ideas),[]);
});
test('failed essential card lookup gives a visible error on front and back',async()=>{
  const c=setup(),t=client({card:async()=>{throw Error('unavailable')}});
  assert.equal((await c['card-badges'](t))[0].text,'NB · ERROR DE LECTURA');
  assert.match((await c['card-detail-badges'](t))[0].text,/Error de lectura/);
});
test('unresponsive essential lookup returns an error before Trello abandons it',async()=>{
  const start=Date.now(),b=await setup()['card-badges'](client({card:never}));
  assert.equal(b[0].text,'NB · ERROR DE LECTURA');
  assert.ok(Date.now()-start<3500);
});

test('embedded helper matches the module used by the card panel',()=>{
  assert.equal(embedded.trim(),fs.readFileSync(path.join(root,'dependencies.js'),'utf8').trim());
});

test('readable dependency links preserve blocked state',async()=>{
  const b=await setup()['card-badges'](client({
    card:async()=>({idList:TODO,desc:'**Depende de**\n[Studio 01](https://trello.com/c/CPRnmJFc)\n\n**Objetivo**\nWork',badges:{checkItems:5}}),
    cards:async()=>[{shortLink:'CPRnmJFc',name:'Studio 01',idList:TODO}]
  }));
  assert.equal(b[0].text,'Bloqueada');
  assert.match(b[1].text,/0\/5/);
});
test('readable retrospective hours preserve the historical badge',async()=>{
  const b=await setup()['card-badges'](client({card:async()=>({idList:DONE,desc:'**Resultado verificado**\nDone\n\n**Histórico de dedicación**\nAproximadamente 1,5 h. Estimación retrospectiva, no cronometrada.',badges:{checkItems:5,checkItemsChecked:5}})}));
  assert.equal(b[1].text,'⏱ 1,5 h');
});
test('helper reads human summaries, decimal ranges and only actual dependency sections',()=>{
  const window={};vm.runInNewContext(embedded,{window});
  const h=window.NBDependencies;
  assert.equal(h.readPreview('**Resumen**\nShort summary.\n\n**Objetivo**\nLong objective.'),'Short summary.');
  assert.deepEqual(plain(h.readHistoricHours('**Histórico de dedicación**\nAproximadamente 1,5–2,5 h. Not measured.')),{min:1.5,max:2.5});
  assert.deepEqual(plain(h.readDependencyIds('**Objetivo**\nSee https://trello.com/c/CPRnmJFc')),[]);
});

test('native checklist hour annotations produce both total and remaining effort',async()=>{
  const t=client({card:async()=>({idList:TODO,desc:'',checklists:[{
    name:'Trabajo',checkItems:[
      {id:'a',name:'Diseño · ≈ 3 h',state:'complete'},
      {id:'b',name:'Pruebas · ≈ 2,5 h',state:'incomplete'}
    ]
  }]})});
  const badges=await setup()['card-badges'](t);
  assert.ok(badges[0].text.includes('50% (1/2)'));
  assert.equal(badges[1].text,'⏱ ≈ 5,5 h prev. · 2,5 h quedan');
});
test('stored estimate overrides a checklist annotation without losing remaining hours',async()=>{
  const t=client({card:async()=>({idList:TODO,desc:'',checklists:[{name:'Trabajo',checkItems:[
    {id:'a',name:'Revisar · ≈ 3 h',state:'incomplete'},
    {id:'b',name:'Entregar · ≈ 2 h',state:'complete'}
  ]}]}),get:async()=>({a:4})});
  const badges=await setup()['card-badges'](t);
  assert.equal(badges[1].text,'⏱ ≈ 6 h prev. · 4 h quedan');
});
test('uncosted milestones do not double-count work estimates',async()=>{
  const t=client({card:async()=>({idList:TODO,desc:'',checklists:[
    {name:'Logros',checkItems:[{id:'logro',name:'Primera web funcionando',state:'complete'}]},
    {name:'Trabajo',checkItems:[{id:'tarea',name:'Rediseño · ≈ 5 h',state:'incomplete'}]}
  ]})});
  const badges=await setup()['card-badges'](t);
  assert.ok(badges[0].text.includes('50% (1/2)'));
  assert.equal(badges[1].text,'⏱ ≈ 5 h quedan · total sin cerrar');
});
test('v2 uppercase Trello headings preserve dependencies, time and summary',()=>{
  const w={};vm.runInNewContext(embedded,{window:w});
  const h=w.NBDependencies;
  const desc='**NOTHING STUDIO — TAREA**\nResumen visual.\n\n**DEPENDE DE**\n[Studio 01](https://trello.com/c/CPRnmJFc)\n\n**DEDICACIÓN**\nAproximadamente 1,5 h. Estimación retrospectiva.';
  assert.deepEqual(plain(h.readDependencyIds(desc)),['CPRnmJFc']);
  assert.deepEqual(plain(h.readHistoricHours(desc)),{min:1.5,max:1.5});
  assert.equal(h.readPreview(desc),'Resumen visual.');
});

test('all supported entrypoints show planned and remaining effort, not the obsolete time badge',async()=>{
  for(const file of ['connector.html','index.html',...Array.from({length:16},(_,i)=>'connector-v'+(i+2)+'.html')]){
    const htmlText=fs.readFileSync(path.join(root,file),'utf8');
    const parts=Array.from(htmlText.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g));
    const helper=parts.find(part=>part[1].includes('nb-dependencies'));
    assert.ok(helper,file+' has embedded estimate helper');
    assert.equal(helper[2].trim(),fs.readFileSync(path.join(root,'dependencies.js'),'utf8').trim());
    const js=parts.filter(part=>!part[1].includes('nb-dependencies')).map(part=>part[2]).join('\n');
    let capabilities;
    const window={TrelloPowerUp:{initialize(data){capabilities=data}}};
    const context=vm.createContext({window,Promise,setTimeout,clearTimeout,console:{warn(){},error(){}}});
    vm.runInContext(helper[2],context);
    vm.runInContext(js,context);
    const card={idList:TODO,desc:'',checklists:[{name:'Trabajo',checkItems:[
      {id:'a',name:'Maqueta · ≈ 2 h',state:'complete'},
      {id:'b',name:'Pruebas · ≈ 3,5 h',state:'incomplete'}
    ]}]};
    const badges=await capabilities['card-badges'](client({card:async()=>card}));
    assert.ok(badges[0].text.includes('50% (1/2)'),file);
    assert.equal(badges[1].text,'⏱ ≈ 5,5 h prev. · 3,5 h quedan',file);
  }
});

test('badge uses readable description when Trello supplies progress but no checkItems',async()=>{
 const desc='**VERTICAL SLICE — TIENDA**\nPrimera fase jugable.\n\n**ESTIMACIÓN DE TRABAJO**\nPrevisto: ≈14,5 h · Pendiente: ≈14,5 h\nReferencia: 0/7 criterios completos';
 const t=client({card:async()=>({idList:TODO,desc,badges:{checkItems:7,checkItemsChecked:0},checklists:[]})});
 const b=await setup()['card-badges'](t);
 assert.match(b[0].text,/0%/);
 assert.equal(b[1].text,'⏱ ≈ 14,5 h prev. · 14,5 h quedan');
});
test('stale description does not claim an accurate remaining estimate',async()=>{
 const desc='**ESTIMACIÓN DE TRABAJO**\nPrevisto: ≈14,5 h · Pendiente: ≈14,5 h\nReferencia: 0/7 criterios completos';
 const b=await setup()['card-badges'](client({card:async()=>({idList:TODO,desc,badges:{checkItems:7,checkItemsChecked:1},checklists:[]})}));
 assert.equal(b[1].text,'⏱ ≈ 14,5 h prev. · revisar pendiente');
});
test('fresh stored snapshot replaces the description with current remaining hours',async()=>{
 const desc='**ESTIMACIÓN DE TRABAJO**\nPrevisto: ≈14,5 h · Pendiente: ≈14,5 h\nReferencia: 0/7 criterios completos';
 const t=client({card:async()=>({idList:TODO,desc,badges:{checkItems:7,checkItemsChecked:1},checklists:[]}),
 get:async(model,visibility,key)=>key==='nothing_work_snapshot_v1'?{planned:14.5,remaining:12.5,done:1,total:7}:{}});
 const b=await setup()['card-badges'](t);
 assert.equal(b[1].text,'⏱ ≈ 14,5 h prev. · 12,5 h quedan');
});

test('every historical connector shows estimated hours with only badge counts and description',async()=>{
  const files=['connector.html','index.html',...Array.from({length:16},(_,i)=>'connector-v'+(i+2)+'.html')];
  const desc='**PRIMERA TIENDA**\nComercio jugable.\n\n**ESTIMACIÓN DE TRABAJO**\nPrevisto: ≈14,5 h · Pendiente: ≈14,5 h\nReferencia: 0/7 criterios completos\n\n**REFERENCIAS**\nGithub';
  for(const file of files){
    const htmlText=fs.readFileSync(path.join(root,file),'utf8');
    const parts=Array.from(htmlText.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g));
    const helper=parts.find(part=>part[1].includes('nb-dependencies'));
    assert.ok(helper,file+' must include robust time helper');
    const js=parts.filter(part=>!part[1].includes('nb-dependencies')).map(part=>part[2]).join('\n');
    let capabilities;
    const window={TrelloPowerUp:{initialize(data){capabilities=data}}};
    const context=vm.createContext({window,Promise,setTimeout,clearTimeout,console:{warn(){},error(){}}});
    vm.runInContext(helper[2],context);
    vm.runInContext(js,context);
    const badge=await capabilities['card-badges'](client({card:async()=>({
      idList:TODO,desc,checklists:[],badges:{checkItems:7,checkItemsChecked:0}
    })}));
    assert.equal(badge[1].text,'⏱ ≈ 14,5 h prev. · 14,5 h quedan',file+' displayed '+badge[1]?.text);
    const finished=await capabilities['card-badges'](client({card:async()=>({
      idList:DONE,desc:'**DEDICACIÓN**\nAproximadamente 2 h, estimación retrospectiva.',
      checklists:[],badges:{checkItems:5,checkItemsChecked:5}
    })}));
    assert.equal(finished[1]?.text,'⏱ 2 h',file+' must show clean completed effort');
    assert.equal(finished.length,2,file+' must not add a redundant zero-hour badge');
  }
});

test('completed cards use one compact historical-time badge with no zero-hour label',async()=>{
  const c=setup();
  for(const [minutes,text] of [['0,5','⏱ 0,5 h'],['1','⏱ 1 h'],['2','⏱ 2 h'],['4,5','⏱ 4,5 h']]){
    const desc='**TRABAJO TERMINADO**\nSe ha verificado en Godot.\n\n**DEDICACIÓN**\nAproximadamente '+minutes+' h, estimación retrospectiva.';
    const badges=await c['card-badges'](client({card:async()=>({
      idList:DONE,desc,badges:{checkItems:5,checkItemsChecked:5},checklists:[]
    })}));
    assert.equal(badges.length,2);
    assert.match(badges[0].text,/100% \(5\/5\)/);
    assert.equal(badges[1].text,text);
    assert.ok(!badges.some(b=>/0 h pendientes|sin medir|aproximad/i.test(b.text)));
  }
});
test('completed cards with no historical estimate do not render a time badge',async()=>{
  const c=setup();
  const badges=await c['card-badges'](client({card:async()=>({
    idList:DONE,desc:'**TRABAJO HECHO**\nSin registro de tiempo.',
    badges:{checkItems:5,checkItemsChecked:5},checklists:[]
  })}));
  assert.equal(badges.length,1);
  assert.match(badges[0].text,/100%/);
});
test('completed cards without checklists keep the historic-only badge if recorded',async()=>{
  const c=setup();
  const badges=await c['card-badges'](client({card:async()=>({
    idList:DONE,desc:'**DEDICACIÓN**\nAproximadamente 1,5 h, estimación retrospectiva.',badges:{checkItems:0}
  })}));
  assert.deepEqual(plain(badges),[{text:'⏱ 1,5 h',color:'light-gray'}]);
});

const proposalDescription=require('./fixtures/recommendation.cjs');
const decisionKey='nothing_next_task_decision_v1';
function recommendedClient({choice,unavailable=false,desc=proposalDescription(),idList=TODO}={}){
 const source=desc.split('**PROPUESTA DE SIGUIENTE TAREA**\n')[1];
 return client({card:async()=>({idList,desc,checklists:[],badges:{checkItems:0,checkItemsChecked:0}}),
  get:async(scope,visibility,key)=>{if(key!==decisionKey)return {};if(unavailable)throw Error('unavailable');return choice?{source,choice}:{};}});
}
test('yellow next-task badge is explicit, works without checklist and has a distinct detail title',async()=>{
 const c=setup(),t=recommendedClient();
 assert.deepEqual(plain(await c['card-badges'](t)),[{text:'Propuesta · siguiente tarea',color:'yellow'}]);
 assert.equal((await c['card-detail-badges'](t))[0].title,'Propuesta de siguiente tarea');
});
test('accepted proposal becomes agreed, dismissed disappears, unknown decision stays unconfirmed',async()=>{
 const c=setup();
 assert.equal((await c['card-badges'](recommendedClient({choice:'accepted'})))[0].text,'Próxima acordada');
 assert.deepEqual(plain(await c['card-badges'](recommendedClient({choice:'dismissed'}))),[]);
 assert.match((await c['card-badges'](recommendedClient({unavailable:true})))[0].text,/revisar decisión/);
});
test('changed recommendation cannot inherit an earlier acceptance',async()=>{
 const t=recommendedClient({choice:'accepted'}),old=t.get;
 t.card=async()=>({idList:TODO,desc:proposalDescription().replace('Motivo: La prueba','Motivo: Otra prueba'),badges:{checkItems:0}});
 const b=await setup()['card-badges'](t);assert.equal(b[0].text,'Propuesta · siguiente tarea');
});
test('red blockers remain first and a blocked recommendation is never presented as ready',async()=>{
 const t=recommendedClient({choice:'accepted'}),original=t.card;
 t.card=async()=>({...await original(),desc:proposalDescription()+'\n\n**DEPENDE DE**\nhttps://trello.com/c/CPRnmJFc'});
 t.cards=async()=>[{shortLink:'CPRnmJFc',name:'Example prerequisite',idList:TODO}];
 // Recreate the matching accepted source; the following section is not part of it.
 t.get=async(scope,visibility,key)=>key===decisionKey?{source:proposalDescription().split('**PROPUESTA DE SIGUIENTE TAREA**\n')[1],choice:'accepted'}:{};
 const badges=await setup()['card-badges'](t);assert.equal(badges[0].color,'red');assert.equal(badges[1].text,'Elegida · en espera');assert.equal(badges[1].color,'yellow');
});
test('recommendations never appear in ideas, current work or completed cards',async()=>{
 for(const idList of ['6aec66eb5ff8ae196d37b7ca','6aec66f02d325131dd44f8d8',DONE]){
  const b=await setup()['card-badges'](recommendedClient({idList}));assert.ok(!b.some(x=>x.color==='yellow'||/Próxima/.test(x.text)));
 }
});

test('all 18 configured URLs serve the same stable connector, including recommendations',()=>{
 for(const file of ['index.html',...Array.from({length:16},(_,i)=>'connector-v'+(i+2)+'.html')]){
  assert.equal(fs.readFileSync(path.join(root,file),'utf8'),html,file);
 }
});

test('native-first compact cards expose their meta and only explicit dependencies',()=>{
 const ctx=vm.createContext({window:{}});
 vm.runInContext(fs.readFileSync(path.join(root,'dependencies.js'),'utf8'),ctx);
 const helper=ctx.window.NBDependencies;
 const blocked='🎯 **META** · Puente de datos reversible\n🧱 **BLOQUEO** · Depende de [Studio 01](https://trello.com/c/CPRnmJFc) y [Studio 02](https://trello.com/c/tKMRgTQQ)\n📁 **EXPEDIENTE** · [Issue](https://github.com/example/example/issues/1)';
 assert.equal(helper.readPreview(blocked),'Puente de datos reversible');
 assert.deepEqual(plain(helper.readDependencyIds(blocked)),['CPRnmJFc','tKMRgTQQ']);
 const unrelated='🎯 **META** · Puente\n🧱 **BLOQUEO** · Validación pendiente\n📁 **EXPEDIENTE** · [Studio 01](https://trello.com/c/CPRnmJFc)';
 assert.deepEqual(plain(helper.readDependencyIds(unrelated)),[]);
});


test('editorial 3S v3 renders italic lead and multiline blocker without collecting reference links',()=>{
 const ctx=vm.createContext({window:{}});
 vm.runInContext(fs.readFileSync(path.join(root,'dependencies.js'),'utf8'),ctx);
 const helper=ctx.window.NBDependencies;
 const desc='*Puente seguro entre Studio y Godot*\n\n**Bloqueo**\nDepende de [Studio 01](https://trello.com/c/CPRnmJFc) · [Studio 02](https://trello.com/c/tKMRgTQQ)\n\n**Siguiente paso**\nProbar una importación ficticia\n\n---\n\n*Referencias · [No es dependencia](https://trello.com/c/GUKFRrxj)*';
 assert.equal(helper.readPreview(desc),'Puente seguro entre Studio y Godot');
 assert.deepEqual(plain(helper.readDependencyIds(desc)),['CPRnmJFc','tKMRgTQQ']);
 const state=helper.resolve(desc,[
  {shortLink:'CPRnmJFc',idList:TODO,name:'Studio 01'},
  {shortLink:'tKMRgTQQ',idList:DONE,name:'Studio 02'}
 ],DONE);
 assert.equal(state.blocked,true);
 assert.deepEqual(plain(state.dependencies.map(x=>x.id)),['CPRnmJFc']);
 assert.deepEqual(plain(state.missing),[]);
 assert.ok(!helper.readSection(desc,'Bloqueo').includes('Referencias'));
});

test('editorial references, rough estimates and ordinary blockers never invent dependencies or hours',()=>{
 const ctx=vm.createContext({window:{}});
 vm.runInContext(fs.readFileSync(path.join(root,'dependencies.js'),'utf8'),ctx);
 const helper=ctx.window.NBDependencies;
 const desc='*Prueba aislada de exportación*\n\n**Bloqueo**\nValidación en Windows pendiente\n\n*Estimación previa · ≈11 h orientativas*\n\n---\n\n*Referencias · [Studio 01](https://trello.com/c/CPRnmJFc)*';
 assert.equal(helper.readPreview(desc),'Prueba aislada de exportación');
 assert.deepEqual(plain(helper.readDependencyIds(desc)),[]);
 assert.equal(helper.readTimeSummary(desc),null);
 const old='🎯 **META** · Puente reversible\n🧱 **BLOQUEO** · Depende de [Studio](https://trello.com/c/CPRnmJFc)';
 assert.equal(helper.readPreview(old),'Puente reversible');
 assert.deepEqual(plain(helper.readDependencyIds(old)),['CPRnmJFc']);
});

test('editorial multiline dependency remains red on the card and each legacy connector',async()=>{
 const desc='*Editor de NPC*\n\n**Bloqueo**\nDepende de [Studio](https://trello.com/c/CPRnmJFc)\n\n---\n\n*Referencias · [Another unrelated card](https://trello.com/c/GUKFRrxj)*';
 const c=setup();
 const badges=await c['card-badges'](client({
   card:async()=>({idList:TODO,desc,checklists:[],badges:{checkItems:0,checkItemsChecked:0}}),
   cards:async()=>[{shortLink:'CPRnmJFc',name:'Studio',idList:TODO}]
 }));
 assert.equal(badges[0]?.color,'red');
 for(const name of ['connector.html','index.html',...Array.from({length:16},(_,i)=>'connector-v'+(i+2)+'.html')]){
  const code=fs.readFileSync(path.join(root,name),'utf8');
  assert.match(code,/progress-panel\.html\?v=22/,name);
  assert.match(code,/readSection\(source,"Bloqueo"\)/,name);
 }
});


test('editorial rough hours appear as orientation only, never as calculated pending time',async()=>{
 const desc='*Un editor de personajes práctico*\n\n**Siguiente paso**\nProbar exportación\n\n*Estimación previa · ≈11 h (orientativa)*';
 const cap=setup();
 const empty=await cap['card-badges'](client({card:async()=>({idList:TODO,desc,checklists:[],badges:{checkItems:0,checkItemsChecked:0}})}));
 assert.deepEqual(plain(empty),[{text:'⏱ ≈ 11 h orientativas',color:'light-gray'}]);
 const counted=await cap['card-badges'](client({card:async()=>({idList:TODO,desc,checklists:[],badges:{checkItems:4,checkItemsChecked:2}})}));
 assert.match(counted[0].text,/50%/);
 assert.equal(counted[1].text,'⏱ ≈ 11 h orientativas');
 assert.ok(!counted[1].text.includes('quedan'));
 const finished=await cap['card-badges'](client({card:async()=>({idList:DONE,desc,checklists:[],badges:{checkItems:0,checkItemsChecked:0}})}));
 assert.equal(finished.length,0);
});

test('explicit native effort beats rough editorial estimate, and prior historical ranges are not treated as totals',async()=>{
 const desc='*Actividad de desarrollo*\n\n*Estimación · ≈19,5 h orientativas*';
 const cap=setup();
 const native=await cap['card-badges'](client({card:async()=>({idList:TODO,desc,checklists:[{checkItems:[
  {id:'a',name:'Trabajo uno · ≈ 2 h',state:'complete'},
  {id:'b',name:'Trabajo dos · ≈ 3 h',state:'incomplete'}
 ]}],badges:{checkItems:2,checkItemsChecked:1}})}));
 assert.equal(native[1].text,'⏱ ≈ 5 h prev. · 3 h quedan');
 const historical=await cap['card-badges'](client({card:async()=>({idList:TODO,desc:'*Estimación original · 3–6 h; no medida.*',checklists:[],badges:{checkItems:0,checkItemsChecked:0}})}));
 assert.equal(historical.length,0);
});
