// Serve the public site locally, open it with playwright-cli, then run:
// playwright-cli run-code --filename tests/public-ui.browser.js
// Catalogue requests are intercepted; no requests are submitted to the studio.
async (page) => {
 const base=new URL('/',page.url()).href;
 const text=value=>({en:value,ru:value,es:value});
 const image=new URL('images/insecterra/bee.webp',base).href;
 const work=(id,seriesId,width,height)=>({id,seriesId,title:text(id),description:text('Work description'),year:'2026',image,thumbnail:image,width,height,sizes:[{id:'print',widthCm:60,heightCm:40,price:45}]});
 const catalogue={publishedAt:'2026-11-20T00:00:00Z',about:{name:text('Test Artist'),role:text('Artist'),intro:text('Artist introduction'),description:text('Biography')},hero:{intro:text('Introduction')},heroWorkId:'one',contact:{email:'',links:[]},layout:['works','exhibitions','about','contact','shop'].map(id=>({id,enabled:id!=='shop'})),works:[work('one','series',1400,750),work('two','series',990,1400),work('solo',null,1400,787)],series:[{id:'series',title:text('Series'),description:text('Introduction\n\nFull statement'),workIds:['one','two']}],exhibitions:[{id:'show',title:text('Exhibition'),description:text('Exhibition description'),startDate:'2026-02-10',endDate:'2026-02-12',workIds:['one'],media:[{image,thumbnail:image,width:1400,height:750}]}]};
 const failures=[];
 const check=(condition,message)=>{if(!condition)failures.push(message);};
 const named=async selector=>page.locator(selector).evaluate(e=>Boolean(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby')?.split(/\s+/).some(id=>document.getElementById(id)?.textContent.trim())));
 await page.route('**/api/catalogue',route=>route.fulfill({json:catalogue}));
 await page.goto(base);await page.evaluate(()=>localStorage.clear());await page.reload();
 await page.locator('#catalogue-content:not([hidden])').waitFor();
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});
  const cards=await page.locator('.work-card img').evaluateAll(images=>images.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height,fit:getComputedStyle(e).objectFit})));
  check(cards.every(e=>Math.abs(e.h/e.w-1.25)<0.02 && e.fit==='contain'),`Cards must show whole works in stable 4:5 previews at ${width}px`);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No horizontal overflow at ${width}px`);
 }
 await page.setViewportSize({width:1440,height:1000});
 check(await page.locator('.site-nav a[href="#contact"]').count()===0,'Do not advertise a hidden Contact section');
 check(await page.locator('#works h2').count()===1 && await page.locator('#exhibitions h2').count()===1,'Works and Exhibitions must be discoverable as section headings');
 await page.locator('.work-card[data-open-work]').click();check(await named('#viewer'),'Work dialog needs an accessible name');await page.keyboard.press('Escape');
 await page.evaluate(()=>window.VKCart.add('one','print'));await page.locator('#cart-toggle').click();await page.locator('[data-cart-checkout]').click();
 check(await named('#request-dialog'),'Request dialog needs an accessible name');await page.keyboard.press('Escape');
 await page.goto(base+'series.html?id=series');await page.locator('main h1').waitFor();
 check(await page.locator('.site-nav a[href="index.html#contact"]').count()===0,'Series navigation must omit empty Contact');
 await page.locator('summary').click();await page.locator('[data-step="1"]').focus();await page.keyboard.press('Enter');
 check(await page.locator('.slide-position').innerText()==='02 / 02','Next advances the series');
 check(await page.locator('[data-step="1"]').evaluate(e=>e===document.activeElement),'Next retains keyboard focus');
 check(await page.locator('details').evaluate(e=>e.open),'Changing slides preserves the expanded statement');
 await page.locator('[data-go="0"]').click();check(await page.locator('[data-go="0"]').evaluate(e=>e===document.activeElement),'Thumbnail retains keyboard focus');
 await page.goto(base+'exhibition.html?id=show');await page.locator('main h1').waitFor();
 check(await page.locator('.site-nav a[href="index.html#contact"]').count()===0,'Exhibition navigation must omit empty Contact');
 check(await page.locator('.exhibition-work-grid img,.exhibition-photo-grid img').evaluateAll(images=>images.every(e=>e.width>0 && e.height>0 && e.hasAttribute('width') && e.hasAttribute('height'))),'Exhibition images reserve their intrinsic dimensions');
 await page.locator('[data-lang="ru"]').click();
 check((await page.locator('.exhibition-venue').innerText()).includes('февр.'),'Exhibition dates follow the selected language');
 await page.goto(base+'series.html?id=missing');await page.locator('main h1').waitFor();
 check((await page.locator('main h1').innerText()).includes('серия'),'Unavailable series must be described as a series');
 await page.unroute('**/api/catalogue');await page.route('**/api/catalogue',route=>route.fulfill({status:503,body:'{}',contentType:'application/json'}));
 await page.goto(base+'series.html?id=series');await page.locator('main button').waitFor();
 check((await page.locator('main').innerText()).includes('серию'),'Series load failure must describe the series');
 await page.unroute('**/api/catalogue');
 if(failures.length)throw new Error(failures.join('\n'));
 return 'Public UI regression checks passed';
}
