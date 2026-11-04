import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../public/content.js',import.meta.url),'utf8').replace(/^import .*;$/m,'').replace(/export function /g,'function ');
function render(tabName='works',requestTab='active') {
 const node={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[],setAttribute(){},classList:{toggle(){}}};
 const context={document:{querySelector:()=>node,body:node},window:{addEventListener(){}},location:{pathname:'/'},console};
 runInNewContext(source+`;state={draft:{about:{name:{en:'',ru:'',es:''},role:{en:'',ru:'',es:''},intro:{en:'',ru:'',es:''},description:{en:'',ru:'',es:''},avatarMediaId:null},works:[{id:'w1',title:{en:'Solo work',ru:'',es:''},seriesId:null,archived:false}],series:[{id:'s1',title:{en:'A series',ru:'',es:''},archived:false,workIds:[]}],exhibitions:[],hero:{intro:{en:'',ru:'',es:''}},contact:{email:'',links:[]},layout:[{id:'works',enabled:true},{id:'exhibitions',enabled:true},{id:'about',enabled:true},{id:'contact',enabled:true},{id:'shop',enabled:false}],worksOrder:[{type:'series',id:'s1'},{type:'work',id:'w1'}]},media:[]};inbox={unread:0,requests:[{id:'active-request',status:'new'},{id:'handled-request',status:'handled'}].map(entry=>({...entry,email:'test@example.com',name:'',receivedAt:'2026-10-29T12:00:00Z',items:[],note:'',total:0}))};tab=${JSON.stringify(tabName)};inboxTab=${JSON.stringify(requestTab)};render();`,context);
 return node.innerHTML;
}
test('studio renders its default catalogue and active request badge',()=>{
 const html=render();
 assert.match(html,/data-action="add-work"/);
 assert.match(html,/data-tab="requests"[^>]*>Запросы <span[^>]*data-request-count>1<\/span>/);
});

test('request views separate active and handled entries',()=>{
 const active=render('requests');
 assert.match(active,/data-request-id="active-request"/);
 assert.doesNotMatch(active,/data-request-id="handled-request"/);
 const handled=render('requests','handled');
 assert.match(handled,/data-request-id="handled-request"/);
 assert.doesNotMatch(handled,/data-request-id="active-request"/);
});

test('layout tab renders hero text fields and a toggle switch per section in order',()=>{
 const html=render('layout');
 assert.match(html,/data-field="intro\.en"/);
 assert.match(html,/role="switch" aria-checked="true"[^>]*data-layout-toggle="works"/);
 assert.match(html,/role="switch" aria-checked="false"[^>]*data-layout-toggle="shop"/);
 const workIndex=html.indexOf('data-layout-toggle="works"');
 const shopIndex=html.indexOf('data-layout-toggle="shop"');
 assert.ok(workIndex>=0 && shopIndex>=0 && workIndex<shopIndex);
});

test('layout tab renders a draggable Works-grid order mixing series and standalone works',()=>{
 const html=render('layout');
 assert.match(html,/data-order-id="series:s1"[^]*A series/);
 assert.match(html,/data-order-id="work:w1"[^]*Solo work/);
});

test('contact tab renders email field and an ordered link list',()=>{
 const html=render('contact');
 assert.match(html,/data-contact-email/);
 assert.match(html,/data-action="add-contact-link"/);
});

test('about tab no longer renders an email field',()=>{
 const html=render('about');
 assert.doesNotMatch(html,/data-field="email"/);
});
