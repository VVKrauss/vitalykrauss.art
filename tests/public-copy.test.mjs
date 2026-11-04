import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('shared public translations cover identical keys without embedded artist content',async()=>{
 const context={window:{}};vm.createContext(context);vm.runInContext(await readFile(new URL('../js/i18n.js',import.meta.url),'utf8'),context);
 const {messages,t}=context.window.I18N;const keys=Object.keys(messages.en).sort();for(const lang of ['ru','es'])assert.deepEqual(Object.keys(messages[lang]).sort(),keys);
 assert.equal(t('series.count','ru'),'{n} работ');assert.equal(t('series.count','ru',{n:3}),'3 работ');assert.equal(t('series.with','en',{name:'Collaborator'}),'with Collaborator');
 assert.equal(t('cart.send','ru'),'Отправить запрос');assert.equal(t('requestError.priceChanged','ru'),'Цена изменилась. Обновите каталог и проверьте корзину.');
 assert.ok(!JSON.stringify(messages).match(/Vitaly|Insecterra|Snail|kraussvitaliy|mail app/));
});

test('public presentation starts without a demo catalogue and only normalizes server works',async()=>{
 const context={window:{I18N:{t:(key,lang)=>({en:'Works',ru:'Работы',es:'Obras'}[lang])}},URL,location:{href:'https://example.test/'},Intl,document:{}};vm.createContext(context);vm.runInContext(await readFile(new URL('../js/content.js',import.meta.url),'utf8'),context);
 assert.equal(context.window.SITE.works.length,0);assert.equal(context.window.SITE.series.length,0);assert.equal(context.window.SITE.about,null);
 const source={about:{name:{en:'New Artist'},role:{en:'New Role'},intro:{en:'New intro'},description:{en:'New biography'},email:'new@example.test',avatar:null},heroWorkId:null,works:[],series:[],exhibitions:[]};
 const normalized=context.window.normalizeCatalogue(source);assert.equal(normalized.about.name.ru,'New Artist');assert.equal(normalized.about.intro.en,'New intro');assert.equal(normalized.works.length,0);
});


test('exhibition metadata joins dates and translated place including optional country',async()=>{
 const context={window:{},Intl};vm.createContext(context);vm.runInContext(await readFile(new URL('../js/content.js',import.meta.url),'utf8'),context);
 const item={startDate:'2026-02-10',endDate:'2026-02-12',venue:{en:'Gallery'},city:{en:'London'},country:{en:'United Kingdom'}};
 assert.equal(context.window.exhibitionMeta(item,'en'),'10 Feb 2026 — 12 Feb 2026 · Gallery, London, United Kingdom');
 assert.equal(context.window.exhibitionMeta({startDate:'2026',city:{en:'London'}},'en'),'2026 · London');
 assert.equal(context.window.exhibitionMeta({startDate:'',country:{en:'United Kingdom'}},'en'),'United Kingdom');
});

test('published About intro updates the About block, including clearing it',async()=>{
 const intro={textContent:''},biography={textContent:''},meta={content:''};
 const document={title:'',querySelector:selector=>selector==='meta[name="description"]'?meta:null,querySelectorAll:selector=>selector==='[data-author-intro]'?[intro]:selector==='[data-author-description]'?[biography]:[]};
 const context={window:{I18N:{t:()=>''}},document};vm.createContext(context);vm.runInContext(await readFile(new URL('../js/content.js',import.meta.url),'utf8'),context);
 context.window.applyAuthor({name:{en:'Artist'},role:{en:'Digital artist'},intro:{en:'Published author introduction'},description:{en:'Full biography'}},'en');
 assert.equal(intro.textContent,'Published author introduction');assert.equal(biography.textContent,'Full biography');
 context.window.applyAuthor({intro:{en:''},description:{en:''}},'en');assert.equal(intro.textContent,'');assert.equal(intro.hidden,true);assert.equal(biography.hidden,true);
});

test('normalizeCatalogue defaults layout and splits standalone works from series', async () => {
 const context={window:{I18N:{t:()=>''}},URL,location:{href:'https://example.test/'},Intl,document:{}};vm.createContext(context);vm.runInContext(await readFile(new URL('../js/content.js',import.meta.url),'utf8'),context);
 const source = { about:{name:{en:'A'}}, heroWorkId:null, works:[
  {id:'w1', title:{en:'Solo'}, description:{}, seriesId:null, image:'', thumbnail:'', width:1, height:1, sizes:[]},
 ], series:[], exhibitions:[] };
 const normalized = context.window.normalizeCatalogue(source);
 assert.equal(normalized.series.length, 0);
 assert.equal(normalized.standaloneWorks.length, 1);
 assert.deepEqual(Array.from(normalized.layout, s => s.id), ['works','exhibitions','about','contact','shop']);
 assert.equal(JSON.stringify(normalized.worksOrder), JSON.stringify([{type:'work', id:'w1'}]));
});

test('normalizeCatalogue carries hero intro and contact separately from about', async () => {
 const context={window:{I18N:{t:()=>''}},URL,location:{href:'https://example.test/'},Intl,document:{}};vm.createContext(context);vm.runInContext(await readFile(new URL('../js/content.js',import.meta.url),'utf8'),context);
 const source = { about:{name:{en:'A'}}, hero:{intro:{en:'Short'}}, contact:{email:'a@b.test', links:[{id:'l1',label:{en:'IG'},url:'https://instagram.com/a',icon:'instagram'}]},
  heroWorkId:null, works:[], series:[], exhibitions:[] };
 const normalized = context.window.normalizeCatalogue(source);
 assert.equal(normalized.hero.intro.en, 'Short');
 assert.equal(normalized.contact.email, 'a@b.test');
 assert.equal(normalized.contact.links[0].icon, 'instagram');
});
