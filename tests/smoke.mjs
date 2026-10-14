// Dependency-free test of the actual Cloudflare Pages onRequest code using SQLite D1 adapter.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';

function createD1(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../migrations/001_schema.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/002_seed_recovered_catalog.sql',import.meta.url),'utf8'));
 return {
  raw:db,
  prepare(sql){const stmt=db.prepare(sql);let args=[];return {
   bind(...v){args=v;return this},
   async first(){return stmt.get(...args)||null},
   async all(){return {results:stmt.all(...args)}},
   async run(){return {meta:{changes:stmt.run(...args).changes}}}
  }},
  async batch(steps){db.exec('BEGIN');try{const results=[];for(const s of steps)results.push(await s.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}
 };
}
const db=createD1();
const env={DB:db,SHOP_ENABLED:'false',LINE_CHANNEL_ID:'2011951537',SESSION_SECRET:'local-test-secret-which-is-never-deployed',OWNER_LINE_USER_ID:'Utestowner'};
async function call(path, method='GET', data=undefined,cookie='',origin='http://localhost:8788'){
 const init={method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{})}};
 if(data!==undefined){init.body=JSON.stringify(data);init.headers['Content-Type']='application/json'}
 const request=new Request('http://localhost:8788/api/'+path,init);
 const res=await onRequest({request,env});
 return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')};
}
let r=await call('health'); assert.equal(r.status,200);assert.equal(r.data.ordersEnabled,false);
r=await call('menu');assert.equal(r.data.products.length,38);assert.equal(r.data.shopEnabled,false);assert.equal(r.data.products.find(x=>x.id==='7').price,45);
r=await call('me');assert.equal(r.data.member,null);
r=await call('orders','POST',{items:[{id:'7',qty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()});assert.equal(r.status,401);
r=await call('orders','POST',{items:[]},'', 'https://evil.invalid');assert.equal(r.status,403);
const realFetch=globalThis.fetch;
globalThis.fetch=async (url)=>{
 if(String(url)==='https://api.line.me/oauth2/v2.1/verify')return new Response(JSON.stringify({aud:'2011951537',sub:'Utestowner',name:'ทดสอบ',exp:Math.floor(Date.now()/1000)+600}),{status:200});
 throw new Error('Unexpected external request in test: '+url)
};
r=await call('auth/line','POST',{idToken:'fake-test-token'});assert.equal(r.status,200);assert.ok(r.cookie?.includes('HttpOnly'));const cookie=r.cookie.split(';')[0];
r=await call('me','GET',undefined,cookie);assert.equal(r.data.member.isOwner,true);
r=await call('orders','POST',{items:[{id:'7',qty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,503);
// Only test mode: explicitly switch on both the environment flag and DB flag.
env.SHOP_ENABLED='true'; db.raw.exec("UPDATE shop_settings SET value='1' WHERE key='shop_enabled'");
const requestKey=crypto.randomUUID();
r=await call('orders','POST',{items:[{id:'7',qty:2,price:1,sweetness:'ปกติ'}],fulfillment:'pickup',requestKey},cookie);assert.equal(r.status,201);assert.equal(r.data.total,90);const orderId=r.data.orderId;
r=await call('orders','POST',{items:[{id:'7',qty:2}],fulfillment:'pickup',requestKey},cookie);assert.equal(r.status,200);assert.equal(r.data.reused,true);
r=await call('orders','GET',undefined,cookie);assert.equal(r.data.orders.length,1);
for(const status of ['accepted','preparing','ready','completed']){r=await call('admin/orders','PATCH',{id:orderId,status},cookie);assert.equal(r.status,200,JSON.stringify(r));}
r=await call('me','GET',undefined,cookie);assert.equal(r.data.member.points,3);
r=await call('admin/orders','PATCH',{id:orderId,status:'completed'},cookie);assert.equal(r.status,409);
r=await call('me','GET',undefined,cookie);assert.equal(r.data.member.points,3);
r=await call('admin/menu','PATCH',{id:'7',price:50,available:false},cookie);assert.equal(r.status,200);
r=await call('menu');assert.equal(r.data.products.find(x=>x.id==='7').available,false);
globalThis.fetch=realFetch;
console.log('PASS: health, 38 products, closed checkout, origin blocking, LINE verification mock, signed cookie, total server-side 90 not 2, idempotency, owner/admin transitions, no double points, catalog edit');