const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const partialCard=require('./fixtures/partial-effort.cjs');
const root=path.join(__dirname,'..');
const evidence=process.env.NB_PANEL_EVIDENCE_DIR||path.join(root,'evidence');
(async()=>{
 fs.mkdirSync(evidence,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:620,height:720},colorScheme:'light'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(fixture=>window.cardFixture=fixture,partialCard());
  // Exercise the production HTML/JS in a real browser. The Trello boundary is
  // explicitly mocked, and all other external requests are rejected.
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='p.trellocdn.com')return route.fulfill({contentType:'application/javascript',body:'window.TrelloPowerUp={iframe:()=>({card:async()=>window.cardFixture,cards:async()=>window.relatedCards||[],get:async()=>({}),set:async()=>{},render:fn=>window.refreshPanel=fn,sizeTo:async()=>{}})};'});
   if(url.hostname!=='127.0.0.1')return route.abort();
   const file=path.resolve(root,'.'+url.pathname);
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':'text/html',body:fs.readFileSync(file)});
  });
  await page.goto('http://127.0.0.1/progress-panel.html');
  await page.waitForFunction(()=>document.getElementById('remaining').textContent==='≈ 34,5 h');
  assert.equal(await page.locator('body').evaluate(body=>getComputedStyle(body).backgroundColor),'rgb(17, 26, 32)');
  async function verify(percent,remaining,completed){
   assert.equal(await page.locator('#percent').textContent(),percent);
   assert.equal(await page.locator('#planned').textContent(),'Sin cerrar');
   assert.equal(await page.locator('#remaining').textContent(),remaining);
   assert.equal(await page.locator('#spent').textContent(),completed);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Horizontal overflow');
  }
  for(const width of [620,320]){
   await page.setViewportSize({width,height:720});
   await verify('25%','≈ 34,5 h','Sin estimar');
   await page.screenshot({path:path.join(evidence,'panel-25-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:620,height:720});
  await page.evaluate(()=>{window.cardFixture.checklists[1].checkItems[0].state='complete';window.cardFixture.badges.checkItemsChecked=10;return window.refreshPanel()});
  await verify('28%','≈ 32,5 h','≈ 2 h');
  await page.screenshot({path:path.join(evidence,'panel-task-completed.png'),fullPage:true});
  await page.evaluate(fixture=>{window.cardFixture=fixture;window.cardFixture.checklists=[];return window.refreshPanel()},partialCard());
  await verify('25%','≈ 34,5 h','Sin estimar');
  await page.screenshot({path:path.join(evidence,'panel-without-checkitems.png'),fullPage:true});
  // Editorial 3S v3: real browser rendering, synthetic data only.
  await page.evaluate(async()=>{
   window.cardFixture={
    id:'editorial-synthetic',idList:'6aec66ed3137d17f84ce7a3c',
    desc:'*Puente de datos reversible y sencillo*\n\n**Bloqueo**\nDepende de [Studio 01](https://trello.com/c/CPRnmJFc)\n\n**Siguiente paso**\nValidar una importación aislada\n\n*Estimación previa · ≈11 h orientativas*\n\n---\n\n*Referencias · [Issue #77](https://github.com/example/project/issues/77) · [Fuente](https://trello.com/c/CPRnmJFc)*',
    checklists:[],badges:{checkItems:4,checkItemsChecked:0}
   };
   window.relatedCards=[{
     shortLink:'CPRnmJFc',name:'Studio 01',idList:'6aec66ed3137d17f84ce7a3c',
     desc:'*Ficha sintética de Studio 01*'
   }];
   await window.refreshPanel();
  });
  await page.waitForFunction(()=>document.getElementById('planned').textContent==='≈ 11 h');
  for(const width of [620,320]){
   await page.setViewportSize({width,height:800});
   assert.equal(await page.locator('#state').textContent(),'Bloqueada');
   assert.equal(await page.locator('#planned').textContent(),'≈ 11 h');
   assert.equal(await page.locator('#remaining').textContent(),'Sin estimar');
   assert.match(await page.locator('#plannedCaption').textContent(),/orientativa/);
   assert.equal(await page.locator('#next').textContent(),'Continuaremos cuando se complete la dependencia.');
   assert.equal(await page.locator('#references a').count(),2);
   assert.deepEqual(await page.locator('#references a').allTextContents(),['Issue #77','Fuente']);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Editorial layout overflows '+width+'px');
   await page.screenshot({path:path.join(evidence,'editorial-v3-'+width+'.png'),fullPage:true});
  }
  // The human-authored next action must reappear after the dependency is completed.
  await page.evaluate(async()=>{window.relatedCards[0].idList='6aec66f2b6df305a261abb0b';await window.refreshPanel()});
  assert.equal(await page.locator('#state').textContent(),'Por hacer');
  assert.equal(await page.locator('#next').textContent(),'Validar una importación aislada');
  assert.equal(await page.locator('#remaining').textContent(),'Sin estimar');
  await page.screenshot({path:path.join(evidence,'editorial-unblocked.png'),fullPage:true});
  // The owner uses Android dark mode; confirm actual CSS and link contrast.
  await page.emulateMedia({colorScheme:'dark'});
  await page.setViewportSize({width:320,height:800});
  const palette=await page.evaluate(()=>({
    body:getComputedStyle(document.body).backgroundColor,
    link:getComputedStyle(document.querySelector('#references a')).color,
    overflow:document.documentElement.scrollWidth>innerWidth
  }));
  assert.equal(palette.body,'rgb(17, 26, 32)');
  assert.equal(palette.link,'rgb(167, 207, 249)');
  assert.equal(palette.overflow,false);
  await page.locator('#references a').first().focus();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'solid');
  await page.screenshot({path:path.join(evidence,'editorial-v3-dark-320.png'),fullPage:true});
  console.log('BROWSER_EDITORIAL_V3_OK: 320/620px, light/dark, accessibility focus, blocked/unblocked, honest time');

  assert.deepEqual(errors,[]);
  console.log('BROWSER_PANEL_TEST_OK: 9/36, missing details, mobile/desktop layout, 2-hour decrement verified');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
