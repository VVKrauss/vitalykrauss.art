window.STUDIO_URL="https://studio.vitalykrauss.art";
window.SITE={currency:"EUR",about:null,heroWorkId:null,works:[],series:[],exhibitions:[]};
// Normalize the published snapshot to the public presentation model.
window.normalizeCatalogue = function (source) {
  const text = function (value) {
    if (typeof value === "string") value = { en: value };
    value = value || {};
    const fallback = value.en || value.ru || value.es || "";
    return { ru: value.ru || fallback, en: value.en || fallback, es: value.es || fallback };
  };
  const image = function (value) {
    try {
      const url = new URL(value, window.STUDIO_URL);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_) { return ""; }
  };
  const groups = source.series.filter(s => !s.archived).map(function (s, i) {
    const description = text(s.description);
    return { id:s.id, index:String(i+1).padStart(2,"0"), title:text(s.title), with:s.collaborator || s.with || "", statement:Object.fromEntries(Object.entries(description).map(([k,v]) => [k,v.split("\n\n")])), works:[] };
  });
  const raw = source.works;
  const works = raw.filter(w => !w.archived).map(function (w) {
    const sizes = w.sizes || [];
    return {id:w.id,title:text(w.title),description:text(w.description),year:w.year || "",seriesId:w.seriesId,image:image(w.image),thumbnail:image(w.thumbnail || w.image),width:w.width,height:w.height,
      offers:sizes.filter(o => Number.isFinite(o.price) && o.price > 0).map(o => ({id:o.id,size:o.widthCm+" × "+o.heightCm+" cm",price:o.price}))};
  });
  const standalone = {id:"__standalone",index:"",title:Object.fromEntries(["en","ru","es"].map(lang=>[lang,window.I18N.t("exhibition.works",lang)])),with:"",statement:{en:[""],ru:[""],es:[""]},works:[],standalone:true};
  works.forEach(w => (groups.find(s => s.id === w.seriesId) || standalone).works.push(w));
  groups.forEach(group=>{const ids=source.series.find(s=>s.id===group.id)?.workIds || [];group.works.sort((a,b)=>(ids.includes(a.id)?ids.indexOf(a.id):9999)-(ids.includes(b.id)?ids.indexOf(b.id):9999));});
  if (standalone.works.length) groups.push(standalone);
  return {about:source.about?{...source.about,name:text(source.about.name),role:text(source.about.role),intro:text(source.about.intro),description:text(source.about.description),avatar:source.about.avatar?image(source.about.avatar):null}:null,heroWorkId:source.heroWorkId,series:groups,works:works,exhibitions:source.exhibitions.filter(e => !e.archived).map((e,i) => ({...e,id:e.id || "exhibition-"+(i+1),title:text(e.title),description:text(e.description),venue:text(e.venue),city:text(e.city),startDate:e.startDate || e.year || "",endDate:e.endDate || "",workIds:e.workIds || [],media:(e.media || []).map(m=>({...m,image:image(m.image),thumbnail:image(m.thumbnail || m.image)}))}))};
};

window.exhibitionDate = function(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value || ''))return value || '';
  return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));
};

window.exhibitionLink = function(value) {
  try {const url=new URL(value);return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';}catch{return '';}
};

window.arrowUpRight = '<svg class="arrow-up-right" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// All public author labels derive from the published About record, including deliberate blanks.
window.applyAuthor = function(about,lang,{title,description}={}) {
 const value=key=>about?.[key]?.[lang] ?? '';
 const name=value('name'),role=value('role');
 document.title=title ? [title,name].filter(Boolean).join(' — ') : name || window.I18N.t('site.title',lang);
 document.querySelector('meta[name="description"]').content=(description ?? [name,role,value('intro') || value('description')].filter(Boolean).join('. ')).slice(0,160);
 const heading=document.querySelector('#artist-name');if(heading){heading.textContent=name.replace(/\s+(?=\S+$)/,'\n');heading.hidden=!name;}
 document.querySelectorAll('[data-author-role]').forEach(node=>{node.textContent=role;node.hidden=!role;});
 document.querySelectorAll('.brand-logo').forEach(node=>node.setAttribute('aria-label',name || window.I18N.t('site.title',lang)));
 const titleNode=document.querySelector('#about-title');if(titleNode){titleNode.textContent=name;titleNode.hidden=!name;}
 const intro=document.querySelector('.about-intro');if(intro){intro.textContent=value('intro');intro.nextElementSibling.textContent=value('description');}
 const email=document.querySelector('#about-email');if(email){email.hidden=!about?.email;email.href=about?.email?'mailto:'+about.email:'';email.querySelector('span').textContent=about?.email || '';}
 const avatar=document.querySelector('#author-avatar');if(avatar){avatar.src=about?.avatar || 'images/author.webp';avatar.alt=name;}
};
