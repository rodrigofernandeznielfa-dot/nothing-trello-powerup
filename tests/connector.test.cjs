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
  assert.equal(b[1].text,'Sin estimar');
});
test('missing optional script preserves progress and does not invent dependency state',async()=>{
  const b=await setup(false)['card-badges'](client({card:async()=>({idList:TODO,desc:'NB_DEPENDENCIES_V1: CPRnmJFc',badges:{checkItems:5}})}));
  assert.equal(b[0].text,'Dependencias sin comprobar');
  assert.match(b[1].text,/0% \(0\/5\)/);
});
test('hanging estimates cannot swallow the progress badges',async()=>{
  const start=Date.now(),b=await setup()['card-badges'](client({get:never}));
  assert.match(b[0].text,/2\/7/);
  assert.equal(b[1].text,'Sin estimar');
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
  assert.match(done[0].text,/100% \(5\/5\)/);assert.equal(done[1].text,'≈ 2 h');
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
  assert.equal(b[1].text,'≈ 1.5 h');
});
test('helper reads human summaries, decimal ranges and only actual dependency sections',()=>{
  const window={};vm.runInNewContext(embedded,{window});
  const h=window.NBDependencies;
  assert.equal(h.readPreview('**Resumen**\nShort summary.\n\n**Objetivo**\nLong objective.'),'Short summary.');
  assert.deepEqual(plain(h.readHistoricHours('**Histórico de dedicación**\nAproximadamente 1,5–2,5 h. Not measured.')),{min:1.5,max:2.5});
  assert.deepEqual(plain(h.readDependencyIds('**Objetivo**\nSee https://trello.com/c/CPRnmJFc')),[]);
});
