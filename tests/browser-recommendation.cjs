const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const description=require('./fixtures/recommendation.cjs');
const root=path.join(__dirname,'..');
const evidence=process.env.NB_PANEL_EVIDENCE_DIR||path.join(root,'evidence');
(async()=>{
 fs.mkdirSync(evidence,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:620,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(desc=>{
   window.cardFixture={id:'synthetic-next-task',idList:'6aec66ed3137d17f84ce7a3c',desc,checklists:[],badges:{checkItems:0,checkItemsChecked:0}};
   window.savedDecision={};window.decisionWrites=[];window.canEdit=true;window.writeFails=false;window.readFails=false;
  },description());
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='p.trellocdn.com')return route.fulfill({contentType:'application/javascript',body:`window.TrelloPowerUp={iframe:()=>({
    card:async()=>window.cardFixture,cards:async()=>[],memberCanWriteToModel:()=>window.canEdit,
    get:async(scope,visibility,key)=>{if(key!=='nothing_next_task_decision_v1')return {};if(window.readFails)throw Error('read unavailable');return window.savedDecision;},
    set:async(scope,visibility,key,value)=>{if(window.writeFails)throw Error('write unavailable');window.decisionWrites.push({key,value});window.savedDecision=value;},
    render:fn=>window.refreshPanel=fn,sizeTo:async()=>{}
   })};`});
   if(url.hostname!=='127.0.0.1')return route.abort();
   const file=path.resolve(root,'.'+url.pathname);
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':'text/html',body:fs.readFileSync(file)});
  });
  await page.goto('http://127.0.0.1/progress-panel.html');
  await page.locator('#recommendation').waitFor({state:'visible'});
  const title=()=>page.locator('#recommendation-title').textContent();
  const untouched=async()=>assert.equal(await page.evaluate(()=>window.cardFixture.idList),'6aec66ed3137d17f84ce7a3c');
  for(const width of [620,320]){
   await page.setViewportSize({width,height:800});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Recommendation overflows narrow viewport');
   await page.screenshot({path:path.join(evidence,'recommendation-pending-'+width+'.png'),fullPage:true});
  }
  // The owner requires a true yellow accent, not orange, and readable action buttons.
  const palette=await page.evaluate(()=>({
   accent:getComputedStyle(document.querySelector('#recommendation')).borderLeftColor,
   accept:getComputedStyle(document.getElementById('recommendation-accept')).backgroundColor
  }));
  assert.equal(palette.accent,'rgb(250, 204, 21)');
  assert.equal(palette.accept,'rgb(250, 204, 21)');
  assert.equal(await page.evaluate(()=>window.decisionWrites.length),0,'Loading a suggestion must not accept it');
  await page.locator('#recommendation-accept').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.getElementById('recommendation-title').textContent==='Próxima tarea acordada');
  await untouched();assert.equal(await page.evaluate(()=>window.decisionWrites.length),1);
  assert.equal(await page.evaluate(()=>window.decisionWrites[0].key),'nothing_next_task_decision_v1');
  await page.screenshot({path:path.join(evidence,'recommendation-accepted.png'),fullPage:true});
  await page.locator('#recommendation-reconsider').click();await page.locator('#recommendation-dismiss').click();
  await page.waitForFunction(()=>document.getElementById('recommendation-title').textContent==='Propuesta aparcada');
  await untouched();await page.screenshot({path:path.join(evidence,'recommendation-dismissed.png'),fullPage:true});
  await page.evaluate(()=>{window.cardFixture.desc=window.cardFixture.desc.replace('Motivo: La prueba','Motivo: Una revisión nueva de la prueba');return window.refreshPanel()});
  assert.equal(await title(),'Propuesta · siguiente tarea','Revised proposal must require another decision');
  await page.evaluate(()=>{window.canEdit=false;return window.refreshPanel()});
  assert.equal(await page.locator('#recommendation-accept').isDisabled(),true);
  await page.evaluate(()=>{window.canEdit=true;window.readFails=true;return window.refreshPanel()});
  assert.equal(await page.locator('#recommendation-accept').isDisabled(),true);
  await page.evaluate(()=>{window.readFails=false;window.writeFails=true;return window.refreshPanel()});
  await page.locator('#recommendation-accept').click();
  await page.waitForFunction(()=>document.getElementById('recommendation-status').textContent.includes('No se ha podido confirmar'));
  assert.equal(await title(),'Propuesta · siguiente tarea');await untouched();
  for(const idList of ['6aec66eb5ff8ae196d37b7ca','6aec66f02d325131dd44f8d8','6aec66f2b6df305a261abb0b']){
   await page.evaluate(id=>{window.cardFixture.idList=id;return window.refreshPanel()},idList);
   assert.equal(await page.locator('#recommendation').isVisible(),false);
  }
  assert.deepEqual(errors,[]);
  console.log('BROWSER_RECOMMENDATION_OK: keyboard acceptance, park/reconsider, revised proposal, read-only, errors, 320/620px; no card moves');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
