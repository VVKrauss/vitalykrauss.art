import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../public/content.js',import.meta.url),'utf8').replace(/^import .*;$/m,'').replace(/export function /g,'function ');
function render(tabName='works',requestTab='active') {
 const node={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[],setAttribute(){},classList:{toggle(){}}};
 const context={document:{querySelector:()=>node,body:node},window:{addEventListener(){}},location:{pathname:'/'},console};
 runInNewContext(source+`;state={draft:{about:{},works:[],series:[],exhibitions:[]},media:[]};inbox={unread:0,requests:[{id:'active-request',status:'new'},{id:'handled-request',status:'handled'}].map(entry=>({...entry,email:'test@example.com',name:'',receivedAt:'2026-10-29T12:00:00Z',items:[],note:'',total:0}))};tab=${JSON.stringify(tabName)};inboxTab=${JSON.stringify(requestTab)};render();`,context);
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
