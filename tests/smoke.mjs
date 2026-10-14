// Dependency-free test of the actual Cloudflare Pages onRequest code using SQLite D1 adapter.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';

function createD1(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../migrations/001_schema.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/002_seed_recovered_catalog.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/003_legacy_points.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/004_menu_photos_and_preview_prices.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/005_catalog_drafts_and_reviews.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/005_catalog_drafts_and_reviews.sql',import.meta.url),'utf8')); // idempotence
 db.exec(readFileSync(new URL('../migrations/006_owner_prices.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/007_old_order_menu_reconciliation.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/008_selfhosted_menu_images.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/009_order_notifications.sql',import.meta.url),'utf8'));
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
const env={DB:db,SHOP_ENABLED:'false',LINE_CHANNEL_ID:'2011951537',SESSION_SECRET:'local-test-secret-which-is-never-deployed',OWNER_LINE_USER_ID:'U'+'a'.repeat(32)};
async function call(path, method='GET', data=undefined,cookie='',origin='http://localhost:8788'){
 const init={method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{})}};
 if(data!==undefined){init.body=JSON.stringify(data);init.headers['Content-Type']='application/json'}
 const request=new Request('http://localhost:8788/api/'+path,init);
 const res=await onRequest({request,env});
 return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')};
}
let r=await call('health'); assert.equal(r.status,200);assert.equal(r.data.ordersEnabled,false);
r=await call('menu');assert.equal(r.data.products.length,90);assert.equal(r.data.shopEnabled,false);assert.equal(r.data.products.find(x=>x.id==='7').price,40);assert.equal(r.data.products.find(x=>x.id==='84').price,40);assert.equal(r.data.products.find(x=>x.id==='64').price,40);assert.equal(r.data.products.find(x=>x.id==='69').price,50);assert.ok(r.data.products.every(p=>p.image.startsWith('/assets/products/')&&p.image.endsWith('.webp')));
r=await call('me');assert.equal(r.data.member,null);
r=await call('loyalty/info');assert.equal(r.status,200);assert.equal(r.data.policy.bahtPerPoint,25);assert.equal(r.data.rewardsEnabled,false);
r=await call('points');assert.equal(r.status,401);
r=await call('admin/readiness');assert.equal(r.status,403);
r=await call('admin/shop','POST',{enabled:true,ownerConfirmed:true});assert.equal(r.status,403);
r=await call('orders','POST',{items:[{id:'7',qty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()});assert.equal(r.status,401);
r=await call('orders','POST',{items:[]},'', 'https://evil.invalid');assert.equal(r.status,403);
const realFetch=globalThis.fetch;
globalThis.fetch=async (url)=>{
 if(String(url)==='https://api.line.me/oauth2/v2.1/verify')return new Response(JSON.stringify({aud:'2011951537',sub:'U'+'a'.repeat(32),name:'ทดสอบ',exp:Math.floor(Date.now()/1000)+600}),{status:200});
 if(String(url)==='https://api.line.me/v2/bot/message/push')return new Response('',{status:200});
 throw new Error('Unexpected external request in test: '+url)
};
r=await call('auth/line','POST',{idToken:'fake-test-token'});assert.equal(r.status,200);assert.ok(r.cookie?.includes('HttpOnly'));const cookie=r.cookie.split(';')[0];
r=await call('me','GET',undefined,cookie);assert.equal(r.data.member.isOwner,true);
r=await call('admin/readiness','GET',undefined,cookie);assert.equal(r.status,200);assert.equal(r.data.catalog.total,90);assert.equal(r.data.catalog.unverified,90);assert.equal(r.data.ordersEnabled,false);
assert.ok(r.data.checks.some(c=>c.id==='alert_token'&&!c.ok));
r=await call('admin/shop','POST',{enabled:true,ownerConfirmed:true},cookie);assert.equal(r.status,409);
r=await call('points','GET',undefined,cookie);assert.equal(r.status,200);assert.equal(r.data.member.points,0);assert.deepEqual(r.data.history,[]);
r=await call('orders','POST',{items:[{id:'7',qty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,503);
// Only test mode: explicitly switch on both the environment flag and DB flag.
env.SHOP_ENABLED='true'; db.raw.exec("UPDATE shop_settings SET value='1' WHERE key='shop_enabled'");
r=await call('health');assert.equal(r.data.ordersEnabled,false); // cannot go live with unverified prices
// Only the test suite can simulate the owner having verified all sellable prices.
db.raw.exec("UPDATE catalog_price_reviews SET verified=1 WHERE product_id IN (SELECT id FROM catalog WHERE available=1)");
r=await call('health');assert.equal(r.data.ordersEnabled,false); // Another gate: LINE must be configured.
env.LINE_MESSAGING_ACCESS_TOKEN='fake-test-token';env.LIFF_ID='2011951537-7IBatvMp';env.LIFF_ENDPOINT_CONFIRMED='true';
r=await call('admin/shop','POST',{enabled:false},cookie);assert.equal(r.status,200);assert.equal(r.data.shopEnabled,false);
r=await call('health');assert.equal(r.data.ordersEnabled,false);
r=await call('admin/shop','POST',{enabled:true,ownerConfirmed:false},cookie);assert.equal(r.status,400);
r=await call('admin/shop','POST',{enabled:true,ownerConfirmed:true},cookie);assert.equal(r.status,200);assert.equal(r.data.shopEnabled,true);
r=await call('health');assert.equal(r.data.ordersEnabled,true);
r=await call('admin/readiness','GET',undefined,cookie);assert.equal(r.data.checks.every(c=>c.ok),true);
r=await call('orders','POST',{items:[{id:'not-in-menu',qty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,400);
const requestKey=crypto.randomUUID();
r=await call('orders','POST',{items:[{id:'7',qty:2,price:1,sweetness:'ปกติ'}],fulfillment:'pickup',requestKey},cookie);assert.equal(r.status,201);assert.equal(r.data.total,80);assert.equal(r.data.ownerAlertOk,true);const orderId=r.data.orderId;
r=await call('orders','POST',{items:[{id:'7',qty:2}],fulfillment:'pickup',requestKey},cookie);assert.equal(r.status,200);assert.equal(r.data.reused,true);
r=await call('orders','GET',undefined,cookie);assert.equal(r.data.orders.length,1);
for(const status of ['accepted','preparing','ready','completed']){r=await call('admin/orders','PATCH',{id:orderId,status},cookie);assert.equal(r.status,200,JSON.stringify(r));}
r=await call('me','GET',undefined,cookie);assert.equal(r.data.member.points,3);
r=await call('points','GET',undefined,cookie);assert.equal(r.status,200);assert.equal(r.data.member.points,3);assert.ok(r.data.history.some(x=>x.kind==='order'&&x.delta===3));
r=await call('admin/orders','PATCH',{id:orderId,status:'completed'},cookie);assert.equal(r.status,409);
r=await call('me','GET',undefined,cookie);assert.equal(r.data.member.points,3);
// Import an example legacy account, restricted to owner; point awards remain after future order completion.
db.raw.exec("INSERT INTO legacy_accounts(legacy_code,display_name,snapshot_points) VALUES('ABCDEF12','ลูกค้าทดสอบ',5)");
r=await call('admin/legacy','GET',undefined,cookie);assert.equal(r.status,200);assert.equal(r.data.legacy.length,1);
r=await call('admin/legacy/assign','POST',{legacyCode:'ABCDEF12',lineUserId:env.OWNER_LINE_USER_ID,ownerVerified:false},cookie);assert.equal(r.status,400);
r=await call('admin/legacy/assign','POST',{legacyCode:'ABCDEF12',lineUserId:env.OWNER_LINE_USER_ID,ownerVerified:true},cookie);assert.equal(r.status,200);assert.equal(r.data.pointsTransferred,5);
r=await call('me','GET',undefined,cookie);assert.equal(r.data.member.points,8);
r=await call('points','GET',undefined,cookie);assert.equal(r.data.member.points,8);assert.ok(r.data.history.some(x=>x.kind==='legacy'&&x.delta===5));assert.equal(r.data.history.length,2);
r=await call('admin/legacy/assign','POST',{legacyCode:'ABCDEF12',lineUserId:env.OWNER_LINE_USER_ID,ownerVerified:true},cookie);assert.equal(r.status,409);
const req2=crypto.randomUUID();
r=await call('orders','POST',{items:[{id:'7',qty:1}],fulfillment:'pickup',requestKey:req2},cookie);assert.equal(r.status,201);
for(const status of ['accepted','ready','completed']) {const x=await call('admin/orders','PATCH',{id:r.data.orderId,status},cookie);assert.equal(x.status,200)}
r=await call('me','GET',undefined,cookie);assert.equal(r.data.member.points,9);
// Bread and milk bundle must be calculated on server, not only visual cart.
r=await call('orders','POST',{items:[{id:'30',qty:2}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,201);assert.equal(r.data.total,25);
r=await call('orders','POST',{items:[{id:'30',qty:3}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,201);assert.equal(r.data.total,40);
for(const id of ['31','32']){
 r=await call('orders','POST',{items:[{id,qty:2}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,201);assert.equal(r.data.total,35);
}
r=await call('orders','POST',{items:[{id:'84',qty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,201);assert.equal(r.data.total,40);
r=await call('admin/menu','GET',undefined,cookie);assert.equal(r.status,200);assert.equal(r.data.products.length,90);
r=await call('admin/menu','PATCH',{id:'7',price:50,available:false},cookie);assert.equal(r.status,200);
r=await call('admin/menu','GET',undefined,cookie);assert.equal(r.data.products.find(x=>x.id==='7').verified,0);
r=await call('admin/menu','PATCH',{id:'84',price:0,available:true,verified:true},cookie);assert.equal(r.status,400);
r=await call('admin/menu','POST',{name:'เมนูทดสอบ',category:'น้ำปั่น',price:42,drink:true},cookie);assert.equal(r.status,201);
r=await call('admin/menu','GET',undefined,cookie);assert.equal(r.data.products.length,91);
r=await call('admin/menu','GET');assert.equal(r.status,403);
r=await call('menu');assert.equal(r.data.products.find(x=>x.id==='7').available,false);
let attemptedPush=false;
globalThis.fetch=async url=>{
 if(String(url)==='https://api.line.me/v2/bot/message/push'){attemptedPush=true;return new Response('LINE temporarily unavailable',{status:503})}
 throw Error('Unexpected external URL');
};
r=await call('orders','POST',{items:[{id:'30',qty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);
assert.equal(r.status,201);assert.equal(attemptedPush,true);assert.equal(r.data.ownerAlertOk,false);assert.equal(r.data.shopAutoPaused,true);
assert.equal(db.raw.prepare("SELECT value FROM shop_settings WHERE key='shop_enabled'").get().value,'0');
assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_notifications WHERE delivered=0").get().n,1);
r=await call('health');assert.equal(r.data.ordersEnabled,false);
r=await call('orders','POST',{items:[{id:'30',qty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,503);
globalThis.fetch=realFetch;
console.log('PASS: health, 90 products reconciled to old order display, verification gate, closed checkout, origin blocking, LINE verification mock, signed cookie, total server-side 90 not 2, idempotency, owner/admin transitions, no double points, order notification fail-closed, catalog edit');