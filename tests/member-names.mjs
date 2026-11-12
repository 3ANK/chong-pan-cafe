import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {onRequest} from '../functions/api/[[path]].js';
const raw=new DatabaseSync(':memory:');
raw.exec(readFileSync(new URL('../migrations/001_schema.sql',import.meta.url),'utf8'));
raw.exec('CREATE TABLE shop_admins(line_user_id TEXT PRIMARY KEY)');
const id='U'+'1'.repeat(32),other='U'+'2'.repeat(32);
raw.prepare('INSERT INTO members(line_user_id,display_name,points) VALUES(?,?,?)').run(id,'🌙',32);
const DB={prepare(sql){const stmt=raw.prepare(sql);let args=[];return {bind(...values){args=values;return this},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){return {meta:{changes:stmt.run(...args).changes}}}}}};
const env={DB,SESSION_SECRET:'test-member-names-secret',OWNER_LINE_USER_ID:id};
async function cookie(sub){const payload=Buffer.from(JSON.stringify({sub,exp:Date.now()+60000})).toString('base64url');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))).toString('base64url');return 'chongpan_sid='+payload+'.'+signature}
async function call(method,data,sub=id,origin='https://test.invalid'){const headers={'Content-Type':'application/json',Origin:origin};if(sub)headers.Cookie=await cookie(sub);return onRequest({env,request:new Request('https://test.invalid/api/admin/members',{method,headers,...(data===undefined?{}:{body:JSON.stringify(data)})})})}
assert.equal((await call('PATCH',{lineUserId:id,shopName:'น้องชง'},null)).status,403);
assert.equal((await call('PATCH',{lineUserId:id,shopName:'น้องชง'},other)).status,403);
assert.equal((await call('PATCH',{lineUserId:id,shopName:'น้องชง'},id,'https://other.invalid')).status,403);
assert.equal((await call('PATCH',{lineUserId:id,shopName:' น้องชง '})).status,200);
let rows=(await (await call('GET')).json()).members;
assert.equal(rows[0].shop_name,'น้องชง');assert.equal(rows[0].display_name,'🌙');assert.equal(rows[0].points,32);
assert.equal((await call('PATCH',{lineUserId:id,shopName:'ก'.repeat(81)})).status,400);
assert.equal((await call('PATCH',{lineUserId:id,shopName:'bad\nname'})).status,400);
assert.equal((await call('PATCH',{lineUserId:other,shopName:'unknown'})).status,404);
raw.prepare('UPDATE members SET display_name=? WHERE line_user_id=?').run('🌕',id);
rows=(await (await call('GET')).json()).members;assert.equal(rows[0].shop_name,'น้องชง');assert.equal(rows[0].display_name,'🌕');
assert.equal((await call('PATCH',{lineUserId:id,shopName:''})).status,200);
rows=(await (await call('GET')).json()).members;assert.equal(rows[0].shop_name,'');assert.equal(rows[0].points,32);
assert.equal(raw.prepare('SELECT count(*) AS n FROM members').get().n,1);
console.log('Member names: save, reload, clear, LINE updates, balances, authorization and validation passed.');
