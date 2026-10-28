(function(){
 const root=document.querySelector('#exhibition-page'),viewer=document.querySelector('#exhibition-viewer');
 const id=new URLSearchParams(location.search).get('id');
 let lang=preference('vk-lang') || 'en',catalogue,opener;
 if(!['en','ru','es'].includes(lang))lang='en';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const copy={en:{back:'All exhibitions',works:'Works',photos:'From the exhibition',link:'Exhibition website',missing:'This exhibition is unavailable.',retry:'Try again',error:'Could not load the exhibition.',close:'Close ×'},ru:{back:'Все выставки',works:'Работы',photos:'Фотографии выставки',link:'Сайт выставки',missing:'Эта выставка недоступна.',retry:'Повторить',error:'Не удалось загрузить выставку.',close:'Закрыть ×'},es:{back:'Todas las exposiciones',works:'Obras',photos:'Fotos de la exposición',link:'Web de la exposición',missing:'Esta exposición no está disponible.',retry:'Reintentar',error:'No se pudo cargar la exposición.',close:'Cerrar ×'}};
 function preference(key,value){try{if(value===undefined)return localStorage.getItem(key);localStorage.setItem(key,value);}catch{}}
 function header(){document.documentElement.lang=lang;document.querySelectorAll('[data-lang]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lang===lang)));document.querySelectorAll('[data-i18n]').forEach(node=>{node.textContent=SITE.strings[lang][node.dataset.i18n] || SITE.strings.en[node.dataset.i18n] || node.textContent;});document.querySelector('[data-close-photo]').textContent=copy[lang].close;const dark=document.documentElement.dataset.theme==='dark';document.querySelector('#theme-toggle').setAttribute('aria-label',SITE.strings[lang][dark?'theme.light':'theme.dark']);}
 function render(){
  header();const item=catalogue?.exhibitions.find(e=>e.id===id),words=copy[lang];
  if(!item){root.innerHTML='<a class="text-link" href="index.html#exhibitions">← '+words.back+'</a><h1>'+words.missing+'</h1>';return;}
  document.title=item.title[lang]+' — Vitaly Krauss';
  document.querySelector('meta[name=description]').content=item.description[lang].slice(0,160);
  const works=item.workIds.map(id=>catalogue.works.find(work=>work.id===id)).filter(Boolean),photos=item.media || [];
  const dates=exhibitionDate(item.startDate)+(item.endDate && item.endDate!==item.startDate?' — '+exhibitionDate(item.endDate):'');
  const url=exhibitionLink(item.url);
  const figure=(image,title,description,index)=>'<figure><button type="button" class="exhibition-image-button" data-photo="'+index+'" aria-label="'+esc(title)+'"><img src="'+esc(image)+'" alt="'+esc(title)+'" loading="lazy"></button><figcaption>'+esc(title)+'</figcaption>'+(description?'<p>'+esc(description)+'</p>':'')+'</figure>';
  root.innerHTML='<a class="text-link exhibition-back" href="index.html#exhibitions">← '+words.back+'</a><header class="exhibition-intro"><p class="eyebrow">'+esc(dates)+'</p><h1>'+esc(item.title[lang])+'</h1><p class="exhibition-venue">'+esc([item.venue[lang],item.city[lang]].filter(Boolean).join(', '))+'</p><p class="exhibition-description">'+esc(item.description[lang])+'</p>'+(url?'<a class="text-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+words.link+' '+arrowUpRight+'</a>':'')+'</header>'
    +(works.length?'<section class="exhibition-section"><h2>'+words.works+'</h2><div class="exhibition-work-grid">'+works.map((work,i)=>figure(work.image,work.title[lang],work.description[lang],i)).join('')+'</div></section>':'')
    +(photos.length?'<section class="exhibition-section exhibition-materials"><h2>'+words.photos+'</h2><div class="exhibition-photo-grid">'+photos.map((photo,i)=>figure(photo.image,item.title[lang]+' · '+(i+1),'',works.length+i)).join('')+'</div></section>':'');
  const images=[...works.map(work=>({image:work.image,title:work.title[lang]})),...photos.map(photo=>({image:photo.image,title:item.title[lang]}))];
  root.querySelectorAll('[data-photo]').forEach(button=>button.onclick=()=>{const image=images[Number(button.dataset.photo)];opener=button;viewer.querySelector('img').src=image.image;viewer.querySelector('img').alt=image.title;viewer.querySelector('p').textContent=image.title;viewer.showModal();});
 }
 async function load(){header();root.textContent=lang==='en'?'Loading exhibition…':lang==='ru'?'Загрузка выставки…':'Cargando exposición…';try{const response=await fetch('https://studio.vitalykrauss.art/api/catalogue',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error();const data=await response.json();if(!data.publishedAt || !Array.isArray(data.exhibitions))throw new Error();catalogue=normalizeCatalogue(data,false);render();}catch{root.innerHTML='<p>'+copy[lang].error+'</p><button type="button" class="ghost">'+copy[lang].retry+'</button>';root.querySelector('button').onclick=load;}}
 document.querySelectorAll('[data-lang]').forEach(button=>button.onclick=()=>{lang=button.dataset.lang;preference('vk-lang',lang);if(catalogue)render();else load();});
 document.querySelector('#theme-toggle').onclick=()=>{const style=document.createElement('style');style.textContent='*,*::before,*::after{transition:none!important}';document.head.append(style);const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;preference('vk-theme',theme);document.querySelector('meta[name=theme-color]').content=theme==='dark'?'#191a18':'#f5f2eb';header();void document.body.offsetHeight;requestAnimationFrame(()=>requestAnimationFrame(()=>style.remove()));};
 viewer.querySelector('[data-close-photo]').onclick=()=>viewer.close();viewer.onclick=event=>{if(event.target===viewer)viewer.close();};viewer.onclose=()=>opener?.focus({preventScroll:true});
 load();
})();
