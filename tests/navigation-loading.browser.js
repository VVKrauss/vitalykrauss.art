// Run through playwright-cli on a locally served public site.
// Keep the catalogue pending to observe the header before its response.
async (page) => {
 const base=new URL('/',page.url()).href;
 await page.setViewportSize({width:1440,height:1000});
 await page.unroute('**/api/catalogue');
 const text=value=>({en:value,ru:value,es:value});
 const catalogue={publishedAt:'2026-11-20T00:00:00Z',works:[],series:[{id:'navigation',title:text('Series'),description:text('Description')}],exhibitions:[{id:'navigation',title:text('Exhibition'),description:text('Description'),workIds:[]}],about:{name:text('Artist')},contact:{email:'',links:[]},layout:['works','exhibitions','about','contact','shop'].map(id=>({id,enabled:id!=='shop'}))};
 const expected=['works','exhibitions','about'];
 const failures=[];
 const check=(condition,message)=>{if(!condition)failures.push(message);};
 const links=()=>page.locator('#site-navigation > a').evaluateAll(es=>es.map(e=>e.hash.slice(1)));
 const same=values=>JSON.stringify(values)===JSON.stringify(expected);
 const pending=[];
 await page.goto(base);
 await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
 await page.route('**/api/catalogue',route=>{pending.push(route);});
 async function release(){
  await page.waitForFunction(()=>window.VKCart && window.applyNav);
  while(!pending.length)await page.waitForTimeout(10);
  for(const route of pending.splice(0))await route.fulfill({json:catalogue});
  await page.waitForFunction(()=>document.querySelectorAll('#site-navigation > a').length===3);
 }
 await page.reload();
 check((await links()).length===0,'A first visit must not show guessed navigation while the catalogue is pending');
 await release();
 for(const [name,path] of [['series','series.html?id=navigation'],['exhibition','exhibition.html?id=navigation'],['home','']]){
  await page.goto(base+path);
  check(same(await links()),`${name} must show only confirmed navigation before the catalogue response`);
  await release();
  check(same(await links()),`${name} must keep the confirmed navigation after loading`);
  await page.evaluate(()=>window.navigationAnchor=document.querySelector('#site-navigation > a'));
  await page.locator('#theme-toggle').click();
  check(await page.evaluate(()=>window.navigationAnchor===document.querySelector('#site-navigation > a')),`${name} must not replace unchanged navigation on a theme change`);
 }
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'series.html?id=navigation');await page.locator('#menu-toggle').click();
 check(same(await links()),'Mobile navigation must not flash hidden sections while the catalogue is pending');
 await release();
 await page.unroute('**/api/catalogue');
 if(failures.length)throw new Error(failures.join('\n'));
 return 'Navigation remains consistent before and after catalogue loading';
}
