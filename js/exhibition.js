(function(){
 const root=document.querySelector('#exhibition-page'),viewer=document.querySelector('#exhibition-viewer');
 const id=new URLSearchParams(location.search).get('id');
 let imageList=[],photoAt=0,touchStart=null,suppressClickUntil=0;
 let lang=preference('vk-lang') || 'en',catalogue,opener;
 if(!['en','ru','es'].includes(lang))lang='en';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const words=()=>new Proxy({}, {get:(_,key)=>window.I18N.t('exhibition.'+key,lang)});
 function preference(key,value){try{if(value===undefined)return localStorage.getItem(key);localStorage.setItem(key,value);}catch{}}
 function header(){document.documentElement.lang=lang;window.I18N.apply(lang);document.querySelectorAll('[data-lang]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lang===lang)));document.querySelector('[data-close-photo]').textContent=words().close;const dark=document.documentElement.dataset.theme==='dark';document.querySelector('#theme-toggle').setAttribute('aria-label',window.I18N.t(dark?'theme.light':'theme.dark',lang));window.applyAuthor(catalogue?.about,lang);if(catalogue)window.VKCart.update(catalogue.works,lang,preference('vk-units')==='in'?'in':'cm',true);}

 function render(){
  header();const item=catalogue?.exhibitions.find(e=>e.id===id),labels=words();
  if(!item){root.innerHTML='<a class="text-link" href="index.html#exhibitions">← '+labels.back+'</a><h1>'+labels.missing+'</h1>';return;}
  window.applyAuthor(catalogue.about,lang,{title:item.title[lang],description:item.description[lang]});
  const works=item.workIds.map(id=>catalogue.works.find(work=>work.id===id)).filter(Boolean),photos=item.media || [];
  const dates=exhibitionDate(item.startDate)+(item.endDate && item.endDate!==item.startDate?' — '+exhibitionDate(item.endDate):'');
  const url=exhibitionLink(item.url);
  const figure=(image,title,description,index)=>'<figure><button type="button" class="exhibition-image-button" data-photo="'+index+'" aria-label="'+esc(title)+'"><img src="'+esc(image)+'" alt="'+esc(title)+'" loading="lazy"></button><figcaption>'+esc(title)+'</figcaption>'+(description?'<p>'+esc(description)+'</p>':'')+'</figure>';
  root.innerHTML='<a class="text-link exhibition-back" href="index.html#exhibitions">← '+labels.back+'</a><header class="exhibition-intro"><p class="eyebrow">'+esc(dates)+'</p><h1>'+esc(item.title[lang])+'</h1><p class="exhibition-venue">'+esc([item.venue[lang],item.city[lang]].filter(Boolean).join(', '))+'</p><p class="exhibition-description">'+esc(item.description[lang])+'</p>'+(url?'<a class="text-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+labels.link+' '+arrowUpRight+'</a>':'')+'</header>'
    +(works.length?'<section class="exhibition-section"><h2>'+labels.works+'</h2><div class="exhibition-work-grid">'+works.map((work,i)=>figure(work.image,work.title[lang],work.description[lang],i)).join('')+'</div></section>':'')
    +(photos.length?'<section class="exhibition-section exhibition-materials"><h2>'+labels.photos+'</h2><div class="exhibition-photo-grid">'+photos.map((photo,i)=>'<button type="button" class="exhibition-media-thumb" data-photo="'+(works.length+i)+'" aria-label="'+esc(labels.photos+' '+(i+1))+'"><img src="'+esc(photo.thumbnail || photo.image)+'" alt="" loading="lazy"></button>').join('')+'</div></section>':'');
  imageList=[...works.map(work=>({image:work.image,title:work.title[lang]})),...photos.map(photo=>({image:photo.image,title:''}))];
  root.querySelectorAll('[data-photo]').forEach(button=>button.onclick=()=>{if(Date.now()<suppressClickUntil)return;opener=button;photoAt=Number(button.dataset.photo);showPhoto();viewer.showModal();});
  window.VKCart.update(catalogue.works,lang,preference('vk-units')==='in'?'in':'cm',true);

 }
 async function load(){header();root.textContent=words().loading;try{const response=await fetch(window.STUDIO_URL+'/api/catalogue',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error();const data=await response.json();if(!data.publishedAt || !Array.isArray(data.exhibitions))throw new Error();catalogue=normalizeCatalogue(data);render();}catch{root.innerHTML='<p>'+words().error+'</p><button type="button" class="ghost">'+words().retry+'</button>';root.querySelector('button').onclick=load;}}
 document.querySelectorAll('[data-lang]').forEach(button=>button.onclick=()=>{lang=button.dataset.lang;preference('vk-lang',lang);if(catalogue)render();else load();});
 document.querySelector('#theme-toggle').onclick=()=>{const style=document.createElement('style');style.textContent='*,*::before,*::after{transition:none!important}';document.head.append(style);const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;preference('vk-theme',theme);document.querySelector('meta[name=theme-color]').content=theme==='dark'?'#191a18':'#f5f2eb';header();void document.body.offsetHeight;requestAnimationFrame(()=>requestAnimationFrame(()=>style.remove()));};
 function showPhoto(){const photo=imageList[photoAt];if(!photo)return;viewer.querySelector('img').src=photo.image;viewer.querySelector('img').alt=photo.title;viewer.querySelector('p').textContent=photo.title;viewer.querySelector('p').hidden=!photo.title;viewer.querySelector('[data-photo-counter]').textContent=(photoAt+1)+' / '+imageList.length;}
 function stepPhoto(delta){photoAt=(photoAt+delta+imageList.length)%imageList.length;showPhoto();}
 viewer.querySelectorAll('[data-photo-step]').forEach(button=>button.onclick=()=>stepPhoto(Number(button.dataset.photoStep)));
 document.addEventListener('keydown',event=>{if(viewer.open && ['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();stepPhoto(event.key==='ArrowRight'?1:-1);}});
 viewer.addEventListener('touchstart',event=>{if(event.touches.length===1)touchStart={x:event.touches[0].clientX,y:event.touches[0].clientY};else touchStart=null;},{passive:true});
 viewer.addEventListener('touchend',event=>{if(!touchStart || !event.changedTouches.length)return;const dx=event.changedTouches[0].clientX-touchStart.x,dy=event.changedTouches[0].clientY-touchStart.y;if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)*1.5){stepPhoto(dx<0?1:-1);suppressClickUntil=Date.now()+400;}touchStart=null;},{passive:true});
 viewer.addEventListener('touchcancel',()=>touchStart=null,{passive:true});
 viewer.querySelector('[data-close-photo]').onclick=()=>viewer.close();viewer.onclick=event=>{if(event.target===viewer)viewer.close();};viewer.onclose=()=>opener?.focus({preventScroll:true});
 load();
})();
