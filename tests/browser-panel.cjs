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
  const page=await browser.newPage({viewport:{width:620,height:720}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(fixture=>window.cardFixture=fixture,partialCard());
  // Exercise the production HTML/JS in a real browser. The Trello boundary is
  // explicitly mocked, and all other external requests are rejected.
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='p.trellocdn.com')return route.fulfill({contentType:'application/javascript',body:'window.TrelloPowerUp={iframe:()=>({card:async()=>window.cardFixture,get:async()=>({}),set:async()=>{},render:fn=>window.refreshPanel=fn,sizeTo:async()=>{}})};'});
   if(url.hostname!=='127.0.0.1')return route.abort();
   const file=path.resolve(root,'.'+url.pathname);
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':'text/html',body:fs.readFileSync(file)});
  });
  await page.goto('http://127.0.0.1/progress-panel.html');
  await page.waitForFunction(()=>document.getElementById('remaining').textContent==='≈ 34,5 h');
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
  assert.deepEqual(errors,[]);
  console.log('BROWSER_PANEL_TEST_OK: 9/36, missing details, mobile/desktop layout, 2-hour decrement verified');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
