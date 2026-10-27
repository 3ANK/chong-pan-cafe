import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/[[path]].js';
const raw=new DatabaseSync(':memory:');
raw.exec('PRAGMA foreign_keys=ON');
raw.exec(readFileSync(new URL('../migrations/001_schema.sql',import.meta.url),'utf8'));
raw.exec('CREATE TABLE catalog_price_reviews(product_id TEXT PRIMARY KEY REFERENCES catalog(id),source TEXT,verified INTEGER); CREATE TABLE shop_admins(line_user_id TEXT PRIMARY KEY)');
raw.exec("INSERT INTO catalog(id,name,category,price) VALUES('test-menu','เมนูทดสอบ','อาหาร',49); INSERT INTO catalog_price_reviews VALUES('test-menu','test',1); INSERT INTO members(line_user_id,display_name) VALUES('owner','Owner'); INSERT INTO orders(id,request_key,line_user_id,display_name,fulfillment,total) VALUES('order','request','owner','Owner','pickup',49); INSERT INTO order_items(id,order_id,catalog_id,name,unit_price,qty) VALUES('item','order','test-menu','เมนูทดสอบ',49,1); INSERT INTO shop_admins VALUES('admin')");
const db={prepare(sql){const stmt=raw.prepare(sql);let args=[];return {bind(...a){args=a;return this},async first(){return stmt.get(...args)||null},async run(){return stmt.run(...args)}}},async batch(steps){raw.exec('BEGIN');try{for(const step of steps)await step.run();raw.exec('COMMIT')}catch(e){raw.exec('ROLLBACK');throw e}}};
const env={DB:db,SESSION_SECRET:'local-test-only',OWNER_LINE_USER_ID:'owner'};
async function cookie(sub){const payload=Buffer.from(JSON.stringify({sub,exp:Date.now()+60000})).toString('base64url');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))).toString('base64url');return 'chongpan_sid='+payload+'.'+sig}
async function remove(data,sub,origin='https://test.example'){return onRequest({env,request:new Request('https://test.example/api/admin/menu',{method:'DELETE',headers:{'Content-Type':'application/json',Origin:origin,...(sub?{Cookie:await cookie(sub)}:{})},body:JSON.stringify(data)})})}
const data={id:'test-menu',confirmed:true};
assert.equal((await remove(data)).status,403);
assert.equal((await remove(data,'customer')).status,403);
assert.equal((await remove(data,'admin')).status,403);
assert.equal((await remove(data,'owner','https://other.example')).status,403);
assert.equal((await remove({id:'test-menu'},'owner')).status,400);
assert.equal((await remove({id:1,confirmed:true},'owner')).status,400);
assert.ok(raw.prepare('SELECT id FROM catalog').get());
const history=JSON.stringify(raw.prepare('SELECT * FROM order_items').all());
assert.equal((await remove(data,'owner')).status,200);
assert.equal(raw.prepare('SELECT COUNT(*) n FROM catalog').get().n,0);
assert.equal(raw.prepare('SELECT COUNT(*) n FROM catalog_price_reviews').get().n,0);
assert.equal(JSON.stringify(raw.prepare('SELECT * FROM order_items').all()),history);
assert.equal(raw.prepare('SELECT COUNT(*) n FROM orders').get().n,1);
assert.equal((await remove(data,'owner')).status,404);
console.log('PASS: owner-only confirmed deletion, origin validation, foreign-key cleanup, preserved order history, missing menu');
