import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {buildReceipt,syncLoyverse,loyverseSettings} from '../functions/_lib/loyverse.mjs';
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function database(){const raw=new DatabaseSync(':memory:');raw.exec(`CREATE TABLE shop_settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE catalog(id TEXT PRIMARY KEY,name TEXT,category TEXT,sort_order INTEGER);CREATE TABLE orders(id TEXT PRIMARY KEY,status TEXT,payment_status TEXT,payment_method TEXT,total INTEGER,points_used INTEGER,created_at TEXT,completed_at TEXT,fulfillment TEXT);CREATE TABLE order_items(order_id TEXT,catalog_id TEXT,name TEXT,qty INTEGER,unit_price INTEGER,egg TEXT,egg_qty INTEGER,egg_price INTEGER,sweetness TEXT,note TEXT);CREATE TABLE loyverse_sync(order_id TEXT PRIMARY KEY,status TEXT DEFAULT 'pending',receipt_number TEXT DEFAULT '',message TEXT DEFAULT '',updated_at TEXT DEFAULT CURRENT_TIMESTAMP);`);return {raw,prepare(sql){const stmt=raw.prepare(sql);let args=[];return {bind(...v){args=v;return this},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){return {meta:{changes:stmt.run(...args).changes}}}}}}}
const config={enabled:true,storeId:uid(1),cashId:uid(2),qrId:uid(3),discountId:uid(4),mappings:{coffee:uid(5),bread:uid(6)},eggMappings:{fried:uid(7)}};
const order={id:uid(10),status:'completed',payment_status:'verified',payment_method:'cash',total:85,points_used:0,created_at:'2026-10-17 03:00:00',completed_at:'2026-10-17 03:10:00',fulfillment:'pickup'};
const lines=[{catalog_id:'coffee',name:'มอคค่า',qty:2,unit_price:35,egg:'',sweetness:'หวาน50'},{catalog_id:'bread',name:'ปัง',qty:1,unit_price:15,egg:''}];
const p=buildReceipt(order,lines,config);assert.equal(p.payments[0].money_amount,85);assert.equal(p.line_items[0].price,35);assert.equal(p.line_items[0].line_note,'หวาน50');assert.equal(p.order,'CHONGPAN-'+order.id);
assert.throws(()=>buildReceipt({...order,status:'ready'},lines,config));assert.throws(()=>buildReceipt({...order,payment_status:'unpaid'},lines,config));assert.throws(()=>buildReceipt({...order,points_used:5},lines,config));
assert.throws(()=>buildReceipt(order,lines,{...config,mappings:{}}));
const discounted=buildReceipt({...order,total:80},lines,config);assert.equal(discounted.total_discounts[0].money_amount,5);
assert.throws(()=>buildReceipt({...order,total:80},lines,{...config,discountId:''}));
const egg=buildReceipt({...order,total:55},[{...lines[0],qty:1,egg:'fried',egg_qty:2,egg_price:20}],config);assert.equal(egg.line_items[1].quantity,2);assert.equal(egg.line_items[1].price,10);
const db=database();db.raw.prepare('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?)').run(order.id,order.status,order.payment_status,order.payment_method,85,0,order.created_at,order.completed_at,order.fulfillment);
for(const l of lines)db.raw.prepare('INSERT INTO order_items(order_id,catalog_id,name,qty,unit_price,egg,sweetness) VALUES(?,?,?,?,?,?,?)').run(order.id,l.catalog_id,l.name,l.qty,l.unit_price,l.egg,l.sweetness||'');
const saveConfig=c=>db.raw.prepare("INSERT INTO shop_settings VALUES('loyverse_config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(c));saveConfig(config);
const env={SESSION_SECRET:'test-only-encryption-key',LOYVERSE_ACCESS_TOKEN:'private-test-token'};
let posted=0,receipts=[],failMode='';
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,opts={})=>{
 assert.ok(String(url).startsWith('https://api.loyverse.com/v1.0/'));assert.equal(opts.headers.Authorization,'Bearer private-test-token');
 const path=new URL(url).pathname.split('/').pop();
 if(path==='receipts'&&opts.method==='POST'){
  posted++;const payload=JSON.parse(opts.body);assert.equal(payload.payments[0].money_amount,85);
  if(failMode==='reject')return Response.json({error:'bad input'},{status:400});
  const receipt={receipt_number:'1-'+posted,order:payload.order,store_id:config.storeId,total_money:85};receipts.push(receipt);
  if(failMode==='timeout')throw Error('timeout after accepted');return Response.json(receipt);
 }
 if(path==='receipts')return Response.json({receipts});
 if(path==='stores')return Response.json({stores:[{id:config.storeId,name:'ร้านทดสอบ'}]});
 if(path==='payment_types')return Response.json({payment_types:[{id:config.cashId,name:'Cash',type:'CASH'}]});
 if(path==='items')return Response.json({items:[{item_name:'มอคค่า',variants:[{variant_id:uid(5),default_price:35}]}]});
 if(path==='discounts')return Response.json({discounts:[{id:config.discountId,name:'ส่วนลด',type:'VARIABLE_AMOUNT'}]});
 throw Error('unexpected request');
};
try{
 // No credential: remains pending/blocked and never posts a sale.
 assert.equal((await syncLoyverse(db,{},order.id)).status,'blocked');assert.equal(posted,0);
 const result=await Promise.all([syncLoyverse(db,env,order.id),syncLoyverse(db,env,order.id)]);assert.equal(posted,1);assert.ok(result.some(x=>x.status==='synced'));
 assert.equal((await syncLoyverse(db,env,order.id)).status,'synced');assert.equal(posted,1);
 // A lost response is reconciled by stable external order, with no second POST.
 db.raw.exec('DELETE FROM loyverse_sync');receipts=[];failMode='timeout';
 assert.equal((await syncLoyverse(db,env,order.id)).status,'unknown');const before=posted;
 assert.equal((await syncLoyverse(db,env,order.id)).status,'synced');assert.equal(posted,before);
 // If no receipt is found for an uncertain attempt it still must not blindly resend.
 db.raw.prepare("UPDATE loyverse_sync SET status='unknown'").run();receipts=[];
 assert.equal((await syncLoyverse(db,env,order.id)).status,'unknown');assert.equal(posted,before);
 db.raw.exec('DELETE FROM loyverse_sync');failMode='reject';assert.equal((await syncLoyverse(db,env,order.id)).status,'error');
 // Token is encrypted at rest, never returned in settings, and configuration stays disabled until reviewed.
 const req=new Request('https://local/api/admin/loyverse',{method:'POST',body:JSON.stringify({action:'connect',token:'private-test-token'})});
 const connected=await loyverseSettings(req,{SESSION_SECRET:env.SESSION_SECRET},db);assert.equal(connected.status,200);
 const stored=db.raw.prepare("SELECT value FROM shop_settings WHERE key='loyverse_token_encrypted'").get().value;assert.ok(!stored.includes('private-test-token'));
 const read=await loyverseSettings(new Request('https://local/api/admin/loyverse'),{SESSION_SECRET:env.SESSION_SECRET},db);const text=await read.text();assert.ok(!text.includes('private-test-token'));assert.equal(JSON.parse(text).connected,true);
 console.log('LOYVERSE PASS: eligibility, totals, discounts, eggs, concurrent claim, duplicate protection, uncertain reconciliation, encrypted credentials');
}finally{globalThis.fetch=realFetch}
