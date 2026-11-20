// Run with playwright-cli against a locally served public site.
async(page)=>{
 const base=new URL('/',page.url()).href,text=value=>({en:value,ru:value,es:value});
 const image=new URL('images/insecterra/bee.webp',base).href;
 let enabled=false;
 const catalogue=()=>({publishedAt:'2026-11-20T00:00:00Z',about:{name:text('Artist')},works:[{id:'work',title:text('Work'),description:text('Description'),seriesId:'series',image,thumbnail:image,width:1400,height:750,sizes:[{id:'print',widthCm:60,heightCm:40,price:45}]}],series:[{id:'series',title:text('Series'),description:text('Description'),workIds:['work']}],exhibitions:[{id:'show',title:text('Exhibition'),description:text('Description'),workIds:['work']}],contact:{email:'',links:[]},layout:['works','exhibitions','about','contact','shop'].map(id=>({id,enabled:id!=='shop' || enabled}))});
 const failures=[],check=(ok,message)=>{if(!ok)failures.push(message);};
 await page.unroute('**/api/catalogue');await page.goto(base);await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
 const pending=[];await page.route('**/api/catalogue',route=>pending.push(route));
 await page.reload();
 check(!await page.locator('.cart-menu').isVisible(),'Cart must be hidden before catalogue visibility is known');
 while(!pending.length)await page.waitForTimeout(10);
 for(const route of pending.splice(0))await route.fulfill({json:catalogue()});
 await page.locator('main h1').waitFor();await page.unroute('**/api/catalogue');
 await page.route('**/api/catalogue',route=>route.fulfill({json:catalogue()}));
 for(const width of [390,1440])for(const path of ['', 'series.html?id=series', 'exhibition.html?id=show']){
  await page.setViewportSize({width,height:1000});enabled=false;await page.goto(base+path);await page.locator('main h1').waitFor();
  check(!await page.locator('.cart-menu').isVisible(),`Disabled shop hides cart on ${path || 'home'} at ${width}px`);
  await page.evaluate(()=>window.VKCart.open());
  check(await page.locator('dialog[open]').count()===0,'Disabled shop must not open checkout');
  await page.keyboard.press('Escape');
  enabled=true;await page.reload();await page.locator('main h1').waitFor();
  check(await page.locator('.cart-menu').isVisible(),`Enabled shop restores cart on ${path || 'home'} at ${width}px`);
  await page.locator('#cart-toggle').click();check(await page.locator('#cart-dropdown').isVisible(),'Enabled cart dropdown opens');await page.keyboard.press('Escape');
 }
 await page.goto(base);await page.locator('main h1').waitFor();
 await page.evaluate(()=>{window.VKCart.add('work','print');window.VKCart.open();});
 await page.evaluate(()=>window.VKCart.update(window.SITE.works,'en','cm',true,window.SITE.layout.map(e=>e.id==='shop'?{...e,enabled:false}:e)));
 check(!await page.locator('.cart-menu').isVisible(),'Turning the shop off hides an existing cart');
 check(await page.locator('dialog[open]').count()===0,'Turning the shop off closes checkout');
 check(await page.evaluate(()=>window.VKCart.items.length===1),'Turning the shop off preserves saved selections');
 await page.evaluate(()=>window.VKCart.update(window.SITE.works,'en','cm',true,window.SITE.layout));
 check(await page.locator('.cart-menu').isVisible(),'Turning the shop back on restores the saved cart');
 await page.unroute('**/api/catalogue');
 if(failures.length)throw new Error(failures.join('\n'));
 return 'Cart visibility follows the shop setting on every public page';
}
