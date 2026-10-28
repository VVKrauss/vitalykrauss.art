import express from 'express';
import {createHash,randomUUID} from 'node:crypto';
import {ContentError} from './catalogue-model.mjs';

// Requests snapshot public facts at receipt; catalogue edits cannot rewrite history.
export function mountRequests(app,db,catalogue,config) {
 db.exec(`CREATE TABLE IF NOT EXISTS studio_requests(id TEXT PRIMARY KEY, client_id TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, received_at TEXT NOT NULL, read_at TEXT, status TEXT NOT NULL DEFAULT 'new', payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS studio_request_limits(bucket TEXT PRIMARY KEY, started INTEGER NOT NULL, count INTEGER NOT NULL);`);
 const origins=new Set(['https://vitalykrauss.art','https://www.vitalykrauss.art',config.baseURL]);
 const hash=value=>createHash('sha256').update(value).digest('hex');
 const text=(value,max)=>{if(typeof value!=='string'||value.length>max)throw new ContentError('Invalid request.',400,'invalid');return value.trim();};
 const cors=(req,res,next)=>{if(!origins.has(req.headers.origin))return res.status(403).json({error:'Forbidden origin',code:'forbidden'});res.set({'Access-Control-Allow-Origin':req.headers.origin,'Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});next();};
 app.options('/api/requests',cors,(req,res)=>res.sendStatus(204));
 app.post('/api/requests',cors,express.json({limit:'32kb'}),(req,res)=>{
  const body=req.body || {};const clientId=text(body.clientRequestId,80);
  if(!/^[a-f0-9-]{36}$/i.test(clientId))throw new ContentError('Invalid request ID.',400,'invalid');
  const email=text(body.email,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ContentError('Enter a valid email.',400,'email');
  const name=text(body.name ?? '',200),note=text(body.note ?? '',4000);
  if(!Array.isArray(body.items)||!body.items.length||body.items.length>50)throw new ContentError('Choose between 1 and 50 prints.',400,'selection');
  const rawItems=body.items.map(item=>{if(!item||typeof item.workId!=='string'||typeof item.variantId!=='string'||!Number.isInteger(item.qty)||item.qty<1||item.qty>99)throw new ContentError('Invalid print selection.',400,'selection');return {workId:item.workId,variantId:item.variantId,qty:item.qty};});
  if(new Set(rawItems.map(i=>i.workId+'\0'+i.variantId)).size!==rawItems.length)throw new ContentError('Duplicate print selection.',400,'selection');
  const fingerprint=hash(JSON.stringify({email,name,note,items:rawItems}));
  const prior=db.prepare('SELECT fingerprint FROM studio_requests WHERE client_id=?').get(clientId);
  if(prior){if(prior.fingerprint!==fingerprint)throw new ContentError('Request ID already used.',409,'conflict');return res.json({received:true});}
  const published=catalogue.published();
  const items=rawItems.map(item=>{
   const work=published.works.find(w=>w.id===item.workId),size=work?.sizes.find(s=>s.id===item.variantId && s.price>0);
   if(!size)throw new ContentError('A selected print has changed. Refresh the catalogue and choose its size again.',409,'changed');
   const quoted=body.items.find(i=>i.workId===item.workId && i.variantId===item.variantId)?.quotedPrice;
   if(quoted!==undefined && quoted!==size.price)throw new ContentError('The price has changed. Refresh the catalogue and review your cart.',409,'priceChanged');
   const series=published.series.find(s=>s.id===work.seriesId);
   const exhibitions=published.exhibitions.filter(e=>e.workIds.includes(work.id)).map(e=>({title:e.title,venue:e.venue,city:e.city}));
   return {...item,title:work.title,thumbnail:work.thumbnail,series:series?.title || null,exhibitions,widthCm:size.widthCm,heightCm:size.heightCm,price:size.price};
  });
  const now=Date.now(),bucket=hash(config.secret+'|'+req.ip),globalBucket='global';
  db.prepare('DELETE FROM studio_request_limits WHERE started < ?').run(now-86400000);
  for(const [key,period,limit] of [[bucket,600000,5],[globalBucket,86400000,200]]){
   const row=db.prepare('SELECT * FROM studio_request_limits WHERE bucket=?').get(key);
   if(row && now-row.started<period && row.count>=limit){res.set('Retry-After',String(Math.ceil((period-now+row.started)/1000)));throw new ContentError('Too many requests. Please try again later.',429,'rateLimited');}
  }
  for(const [key,period] of [[bucket,600000],[globalBucket,86400000]])db.prepare('INSERT INTO studio_request_limits VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET started=CASE WHEN ?-started>=? THEN ? ELSE started END,count=CASE WHEN ?-started>=? THEN 1 ELSE count+1 END').run(key,now,now,period,now,now,period);
  const payload={email,name,note,lang:['en','ru','es'].includes(body.lang)?body.lang:'en',units:body.units==='in'?'in':'cm',currency:'EUR',items,total:Math.round(items.reduce((sum,i)=>sum+i.price*i.qty,0)*100)/100};
  db.prepare('INSERT INTO studio_requests(id,client_id,fingerprint,received_at,payload) VALUES(?,?,?,?,?)').run(randomUUID(),clientId,fingerprint,new Date(now).toISOString(),JSON.stringify(payload));
  res.status(201).json({received:true});
 });
 const inbox=()=>({unread:db.prepare('SELECT COUNT(*) AS n FROM studio_requests WHERE read_at IS NULL').get().n,requests:db.prepare('SELECT id,received_at,read_at,status,payload FROM studio_requests ORDER BY received_at DESC LIMIT 500').all().map(row=>({id:row.id,receivedAt:row.received_at,readAt:row.read_at,status:row.status,...JSON.parse(row.payload)}))});
 app.get('/api/studio/requests',(req,res)=>res.json(inbox()));
 app.patch('/api/studio/requests/:id',(req,res)=>{
  const row=db.prepare('SELECT id FROM studio_requests WHERE id=?').get(req.params.id);if(!row)throw new ContentError('Запрос не найден.',404);
  const {read,status}=req.body || {};if(read!==undefined && typeof read!=='boolean' || status!==undefined && !['new','handled'].includes(status))throw new ContentError('Некорректный статус запроса.');
  if(read!==undefined)db.prepare('UPDATE studio_requests SET read_at=? WHERE id=?').run(read?new Date().toISOString():null,row.id);
  if(status!==undefined)db.prepare('UPDATE studio_requests SET status=? WHERE id=?').run(status,row.id);
  res.json(inbox());
 });
}
