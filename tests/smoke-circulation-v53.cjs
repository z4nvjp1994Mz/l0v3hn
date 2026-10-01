const {chromium}=require('playwright');
const fs=require('node:fs');
(async()=>{
 fs.mkdirSync('tests/artifacts',{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1400,height:1000},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('favicon'))errors.push(msg.text());});
 page.setDefaultTimeout(120000);
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.__DALOC_V53?.ready===true,{},{timeout:120000});
 const state=await page.evaluate(()=>({version:__DALOC_V53.version,layers:__DALOC_V53.layers,areas:__DALOC_V53.areasPx2,trees:__DALOC_V53.newGreenbeltTrees,frame:__DALOC_V53.frameSignature}));
 if(state.version!==53||state.layers.length!==4)throw new Error('Missing circulation layers');
 await page.waitForTimeout(1800);
 await page.screenshot({path:'tests/artifacts/v53-overview.png'});
 for(const id of ['vt','vd','v3']){await page.locator('#'+id).click();await page.waitForTimeout(300);}
 await page.locator('#bp').click();await page.waitForTimeout(300);await page.locator('#bp').click();
 await page.locator('#roadLayerV53').click();
 if(!(await page.locator('#roadLayerV53').textContent()).includes('Off'))throw new Error('Road layer toggle failed');
 await page.locator('#roadLayerV53').click();await page.waitForTimeout(4000);
 await page.evaluate(()=>window.__DALOC_V53.focus(930,810,480));
 await page.waitForTimeout(2500);
 await page.screenshot({path:'tests/artifacts/v53-road-detail.png'});
 await page.goto('http://127.0.0.1:8000/road-review-v53.html',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__ROAD_REVIEW_READY===true);
 await page.screenshot({path:'tests/artifacts/v53-source-overlay.png',fullPage:true});
 await page.locator('#original').click();await page.screenshot({path:'tests/artifacts/v53-source-only.png',fullPage:true});
 // Ignore the browser's optional favicon request, but never ignore a JS or shader error.
 const realErrors=errors.filter(e=>!e.includes('Failed to load resource: the server responded with a status of 404 (File not found)'));
 fs.mkdirSync('docs',{recursive:true});
 const result={status:realErrors.length?'failed':'passed',...state,errors:realErrors,checks:['startup','four surfaces','view buttons','blueprint toggle','road toggle','source overlay'],runtime:'headless Chromium / software WebGL'};
 fs.writeFileSync('docs/v53-browser-check.json',JSON.stringify(result,null,2));
 await browser.close();
 if(realErrors.length)throw new Error(realErrors.join('\n'));
 console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
