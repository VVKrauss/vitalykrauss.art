(function(){
 const root=document.querySelector('#series-page'),viewer=document.querySelector('#series-viewer');
 const id=new URLSearchParams(location.search).get('id');
 let lang=preference('vk-lang') || 'en',catalogue,slideAt=0,opener;
 if(!['en','ru','es'].includes(lang))lang='en';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const words=()=>new Proxy({}, {get:(_,key)=>window.I18N.t('exhibition.'+key,lang)});
 function preference(key,value){try{if(value===undefined)return localStorage.getItem(key);localStorage.setItem(key,value);}catch{}}
 function header(){document.documentElement.lang=lang;window.I18N.apply(lang);document.querySelectorAll('[data-lang]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lang===lang)));document.querySelector('[data-close-photo]').textContent=words().close;const dark=document.documentElement.dataset.theme==='dark';document.querySelector('#theme-toggle').setAttribute('aria-label',window.I18N.t(dark?'theme.light':'theme.dark',lang));if(catalogue)window.VKCart.update(catalogue.works,lang,preference('vk-units')==='in'?'in':'cm',true);}

 function currentSeries(){return catalogue?.series.find(s=>s.id===id);}
 function render(){
  header();const series=currentSeries(),backLabel=window.I18N.t('works.label',lang);
  if(!series){root.innerHTML='<a class="text-link" href="index.html#works">← '+backLabel+'</a><h1>'+words().missing+'</h1>';return;}
  const title=typeof series.title==='string'?series.title:series.title[lang];
  window.applyAuthor(catalogue.about,lang,{title,description:series.statement[lang][0]});
  root.innerHTML='<a class="text-link exhibition-back" href="index.html#works">← '+backLabel+'</a><header class="exhibition-intro"><h1>'+esc(title)+'</h1></header>'
    +'<section class="exhibition-section">'+window.renderSeriesBody(series,lang,slideAt)+'</section>';
 }
 async function load(){header();root.textContent=words().loading;try{const response=await fetch(window.STUDIO_URL+'/api/catalogue',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error();const data=await response.json();if(!data.publishedAt || !Array.isArray(data.series))throw new Error();catalogue=normalizeCatalogue(data);render();}catch{root.innerHTML='<p>'+words().error+'</p><button type="button" class="ghost">'+words().retry+'</button>';root.querySelector('button').onclick=load;}}

 function stepTo(index){const series=currentSeries();if(!series || !series.works.length)return;const count=series.works.length;slideAt=((index%count)+count)%count;render();}

 document.addEventListener('click',event=>{
  const stepButton=event.target.closest('[data-step]');
  if(stepButton){stepTo(slideAt+Number(stepButton.dataset.step));return;}
  const goButton=event.target.closest('[data-go]');
  if(goButton){stepTo(Number(goButton.dataset.go));return;}
  const workButton=event.target.closest('[data-open-work]');
  if(workButton){
   const series=currentSeries();const work=series?.works.find(w=>w.id===workButton.dataset.openWork);if(!work)return;
   opener=workButton;viewer.querySelector('img').src=work.image;viewer.querySelector('img').alt=work.title[lang];viewer.querySelector('p').textContent=work.title[lang];viewer.querySelector('p').hidden=!work.title[lang];viewer.showModal();
   return;
  }
 });
 document.querySelectorAll('[data-lang]').forEach(button=>button.onclick=()=>{lang=button.dataset.lang;preference('vk-lang',lang);if(catalogue)render();else load();});
 document.querySelector('#theme-toggle').onclick=()=>{const style=document.createElement('style');style.textContent='*,*::before,*::after{transition:none!important}';document.head.append(style);const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;preference('vk-theme',theme);document.querySelector('meta[name=theme-color]').content=theme==='dark'?'#191a18':'#f5f2eb';header();void document.body.offsetHeight;requestAnimationFrame(()=>requestAnimationFrame(()=>style.remove()));};
 viewer.querySelector('[data-close-photo]').onclick=()=>viewer.close();viewer.onclick=event=>{if(event.target===viewer)viewer.close();};viewer.onclose=()=>opener?.focus({preventScroll:true});
 load();
})();
