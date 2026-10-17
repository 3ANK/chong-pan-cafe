// Dependency-free test of the actual Cloudflare Pages onRequest code using SQLite D1 adapter.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import './admin-payment.mjs';
import './loyverse.mjs';
import './logout.mjs';
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
 db.exec(readFileSync(new URL('../migrations/010_loyverse_confirmed_prices.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/010_loyverse_confirmed_prices.sql',import.meta.url),'utf8')); // idempotence
 db.exec(readFileSync(new URL('../migrations/011_order_payment_options.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/012_egg_quantity_per_plate.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/013_shop_admins.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/014_point_redemptions.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/015_order_points.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/016_loyverse_sync.sql',import.meta.url),'utf8'));
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
// The menu is gated on a verified LINE session before it is revealed to visitors.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const appJS=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
assert.ok(html.indexOf('id="lineGate"')>=0);
assert.ok(html.indexOf('id="lineGate"')<html.indexOf('id="shopShell" hidden'));
assert.ok(html.includes('<body class="line-auth-pending">'));
assert.ok(html.includes('id="lineGateRetry"')&&html.includes('id="shopShell" hidden'));
assert.ok(css.includes('body.line-auth-pending #basketBar{display:none!important}'));
assert.ok(css.includes('#shopShell[hidden]'));
// Native hidden attributes must win over dialog label {display:block}.
// Drinks should not expose egg toppings, while savory dishes should not expose sweetness.
assert.ok(css.includes('[hidden]{display:none!important}'));
assert.ok(html.includes('<label id="eggGroup" hidden>'));
assert.ok(appJS.includes("show('sweetnessGroup',!!p.drink)"));
assert.ok(appJS.includes("show('eggGroup',supportsEgg(p))"));
assert.ok(appJS.includes("egg:supportsEgg(p)?$('egg').value:''"));
assert.ok(appJS.includes("egg:supportsEgg(p)?it.egg:''"));
assert.ok(appJS.includes("const eggEligibleCategories=new Set(['กะเพรา','ข้าวกระเทียม'])"));
assert.ok(html.includes('id="eggQuantityGroup"')&&html.includes('id="increaseEggQty"'));
assert.ok(appJS.includes('function setOptionEggQuantity(next)'));
assert.ok(appJS.includes('eggQty:egg?(eggQty??1):0'));
assert.ok(css.includes('.egg-quantity-group[hidden]'));

assert.ok(appJS.includes("egg:supportsEgg(p)?$('egg').value:''"));

assert.ok(appJS.includes('await Promise.all([bootMenu(),bootPayments()]);')&&appJS.includes('await loadMember();'));
assert.ok(appJS.includes('if(state.member){')&&appJS.includes('showShopAfterLogin();'));
const adminHtml=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const adminJS=readFileSync(new URL('../admin/admin.js',import.meta.url),'utf8');
assert.ok(!html.includes('id="adminPanel"')&&!html.includes('id="adminTab"'));
assert.ok(html.includes('id="paymentSelector"')&&html.includes('id="paymentDialog"'));assert.ok(html.includes('class="shop-payment-label">ชง&ปั่น'));
assert.ok(html.includes('name="paymentMethod" value="cash" checked'));
assert.ok(html.includes('name="paymentMethod" value="qr" id="payQrOption" disabled'));
assert.ok(adminHtml.includes('id="adminPrivate" hidden')&&adminHtml.includes('id="paymentSettingsForm"'));
assert.ok(adminJS.includes("if(!next.member?.isOwner)")&&adminJS.includes("admin/orders/payment"));
assert.ok(adminHtml.includes('id="orderFocusStatus"'));
assert.ok(adminJS.includes("const selectedOrderId="));
assert.ok(adminJS.includes("redirectUri:location.origin+'/admin/'+location.search"));
assert.ok(adminJS.includes("data-order-id="));
assert.ok(adminJS.includes("card?.scrollIntoView({behavior:'smooth',block:'center'})"));
assert.ok(adminJS.includes("s==='accepted'?'รับออเดอร์'"));
assert.ok(adminJS.includes("data-complete-order"));
assert.ok(adminJS.includes("Math.floor(Math.max(0,Number(o.total)||0)/25)"));
assert.ok(adminJS.includes("isPointsRedemption(o)||o.payment_method==='points'?'':' · เพิ่ม +'+reward+' แต้ม'"));
assert.ok(adminJS.includes("if(b.dataset.completeOrder){"));
assert.ok(adminJS.includes("status:'completed'"));
assert.ok(adminJS.includes("o.pointsAwarded"));
const adminCSS=readFileSync(new URL('../admin/admin.css',import.meta.url),'utf8');
assert.ok(adminCSS.includes('.loyalty-points{')&&adminCSS.includes('.award-points-button{'));
assert.equal(Math.floor(539/25),21);
assert.ok(appJS.includes("https://line.me/R/oaMessage/")&&appJS.includes('paymentMethod'));
assert.ok(appJS.includes("const link='https://line.me/R/oaMessage/'+encodeURIComponent(cfg.oaId);"));
assert.ok(!appJS.includes('encodeURIComponent(message)')&&!appJS.includes('แจ้งส่งสลิปชำระเงิน'));
assert.ok(html.includes('ไม่มีข้อความเตรียมไว้หรือคัดลอกให้อัตโนมัติ'));

assert.ok(appJS.includes("liff.login({redirectUri:location.origin+location.pathname+(state.redeemMode?'?redeem=1':'')})"));
assert.ok(appJS.includes("await request('auth/line'"));
assert.ok(appJS.includes("await authenticate(false)"));

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
r=await call('menu');assert.equal(r.data.products.length,90);assert.equal(r.data.shopEnabled,false);assert.equal(r.data.products.find(x=>x.id==='7').price,45);assert.equal(r.data.products.find(x=>x.id==='84').price,40);assert.equal(r.data.products.find(x=>x.id==='64').price,40);assert.equal(r.data.products.find(x=>x.id==='69').price,50);assert.ok(r.data.products.every(p=>p.image.startsWith('/assets/products/')&&p.image.endsWith('.webp')));
r=await call('me');assert.equal(r.data.member,null);
r=await call('loyalty/info');assert.equal(r.status,200);assert.equal(r.data.policy.bahtPerPoint,25);assert.equal(r.data.rewardsEnabled,undefined);
r=await call('points');assert.equal(r.status,401);
r=await call('payment/config');assert.equal(r.status,200);assert.equal(r.data.qrEnabled,false);
r=await call('admin/payment/config','GET');assert.equal(r.status,403);
r=await call('admin/orders/payment','PATCH',{id:'bad',confirmed:true});assert.equal(r.status,403);

r=await call('admin/readiness');assert.equal(r.status,403);
r=await call('admin/shop','POST',{enabled:true,ownerConfirmed:true});assert.equal(r.status,403);
r=await call('admin/line/test','POST',{});assert.equal(r.status,403);
r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'7',qty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()});assert.equal(r.status,401);
r=await call('orders','POST',{paymentMethod:'cash',items:[]},'', 'https://evil.invalid');assert.equal(r.status,403);
const realFetch=globalThis.fetch;
let lastOwnerOrderNotification='';
globalThis.fetch=async (url,init)=>{
 if(String(url)==='https://api.line.me/oauth2/v2.1/verify')return new Response(JSON.stringify({aud:'2011951537',sub:'U'+'a'.repeat(32),name:'ทดสอบ',exp:Math.floor(Date.now()/1000)+600}),{status:200});
 if(String(url)==='https://api.line.me/v2/bot/message/push'){
  lastOwnerOrderNotification=JSON.parse(init.body).messages[0].text;
  return new Response('',{status:200});
 }
 throw new Error('Unexpected external request in test: '+url)
};
r=await call('auth/line','POST',{idToken:'fake-test-token'});assert.equal(r.status,200);assert.ok(r.cookie?.includes('HttpOnly'));const cookie=r.cookie.split(';')[0];
r=await call('me','GET',undefined,cookie);assert.equal(r.data.member.isOwner,true);
r=await call('admin/readiness','GET',undefined,cookie);assert.equal(r.status,200);assert.equal(r.data.catalog.total,90);assert.equal(r.data.catalog.unverified,0);assert.equal(r.data.ordersEnabled,false);
assert.ok(r.data.checks.some(c=>c.id==='alert_token'&&!c.ok));
// Owner-only settings; fake names and placeholder paths only in test DB.
r=await call('admin/payment/config','POST',{qrPath:'/assets/payment/shop-qr.png',oaId:'wrong'},cookie);assert.equal(r.status,400);
r=await call('admin/payment/config','POST',{qrPath:'/assets/payment/shop-qr.svg',oaId:'@chongpanTest'},cookie);assert.equal(r.status,200);assert.equal(r.data.qrEnabled,false); // Real QR asset still needs verified deployment.
env.PAYMENT_QR_READY='true';
r=await call('admin/payment/config','GET',undefined,cookie);assert.equal(r.status,200);assert.equal(r.data.qrEnabled,true);
r=await call('payment/config');assert.equal(r.data.oaId,'@chongpanTest');
r=await call('admin/line/test','POST',{},cookie);assert.equal(r.status,409);
r=await call('admin/shop','POST',{enabled:true,ownerConfirmed:true},cookie);assert.equal(r.status,409);
r=await call('points','GET',undefined,cookie);assert.equal(r.status,200);assert.equal(r.data.member.points,0);assert.deepEqual(r.data.history,[]);
r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'7',qty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,503);
// Only test mode: explicitly switch on both the environment flag and DB flag.
env.SHOP_ENABLED='true'; db.raw.exec("UPDATE shop_settings SET value='1' WHERE key='shop_enabled'");
db.raw.exec("UPDATE catalog_price_reviews SET verified=0 WHERE product_id='7'"); // simulate a pending price review
r=await call('health');assert.equal(r.data.ordersEnabled,false); // cannot go live with unverified prices
// Simulate completing the newly unverified price (all 90 were initially verified by Loyverse migration).
db.raw.exec("UPDATE catalog_price_reviews SET verified=1 WHERE product_id='7'");
r=await call('health');assert.equal(r.data.ordersEnabled,false); // Another gate: LINE must be configured.
env.LINE_MESSAGING_ACCESS_TOKEN='fake-test-token';env.LIFF_ID='2011951537-7IBatvMp';env.LIFF_ENDPOINT_CONFIRMED='true';
r=await call('admin/line/test','POST',{},cookie);assert.equal(r.status,200);assert.equal(r.data.acceptedByLine,true);assert.equal(r.data.confirmOnPhone,true);
r=await call('admin/shop','POST',{enabled:false},cookie);assert.equal(r.status,200);assert.equal(r.data.shopEnabled,false);
r=await call('health');assert.equal(r.data.ordersEnabled,false);
r=await call('admin/shop','POST',{enabled:true,ownerConfirmed:false},cookie);assert.equal(r.status,400);
r=await call('admin/shop','POST',{enabled:true,ownerConfirmed:true},cookie);assert.equal(r.status,200);assert.equal(r.data.shopEnabled,true);
r=await call('health');assert.equal(r.data.ordersEnabled,true);
r=await call('admin/readiness','GET',undefined,cookie);assert.equal(r.data.checks.every(c=>c.ok),true);
r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'not-in-menu',qty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,400);
const requestKey=crypto.randomUUID();
r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'7',qty:2,price:1,sweetness:'ปกติ'}],fulfillment:'pickup',requestKey},cookie);assert.equal(r.status,201);assert.equal(r.data.total,90);assert.equal(r.data.ownerAlertOk,true);const orderId=r.data.orderId;
r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'7',qty:2}],fulfillment:'pickup',requestKey},cookie);assert.equal(r.status,200);assert.equal(r.data.reused,true);
r=await call('orders','GET',undefined,cookie);assert.equal(r.data.orders.length,1);
for(const status of ['accepted','preparing','ready','completed']){r=await call('admin/orders','PATCH',{id:orderId,status},cookie);assert.equal(r.status,200,JSON.stringify(r));}
r=await call('me','GET',undefined,cookie);assert.equal(r.data.member.points,3);
r=await call('admin/orders','GET',undefined,cookie);
assert.equal(r.data.orders.find(o=>o.id===orderId).pointsAwarded,3);
assert.equal(r.data.orders.find(o=>o.id===orderId).payment_status,'verified');
// Reproduce an old completed cash order: payment confirmation repairs only payment status.
db.raw.prepare("UPDATE orders SET payment_status='unpaid' WHERE id=?").run(orderId);
const ledgerBefore=db.raw.prepare('SELECT COUNT(*) AS n FROM points_ledger WHERE order_id=?').get(orderId).n;
r=await call('admin/orders/payment','PATCH',{id:orderId,confirmed:true},cookie);assert.equal(r.status,200);
r=await call('admin/orders/payment','PATCH',{id:orderId,confirmed:true},cookie);assert.equal(r.status,200);assert.equal(r.data.alreadyVerified,true);
assert.equal(db.raw.prepare('SELECT status,payment_status FROM orders WHERE id=?').get(orderId).status,'completed');
assert.equal(db.raw.prepare('SELECT payment_status FROM orders WHERE id=?').get(orderId).payment_status,'verified');
assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM points_ledger WHERE order_id=?').get(orderId).n,ledgerBefore);

r=await call('points','GET',undefined,cookie);assert.equal(r.status,200);assert.equal(r.data.member.points,3);assert.ok(r.data.history.some(x=>x.kind==='order'&&x.delta===3));
r=await call('admin/orders','PATCH',{id:orderId,status:'completed'},cookie);assert.equal(r.status,409);
r=await call('me','GET',undefined,cookie);assert.equal(r.data.member.points,3);
// QR paid orders cannot complete or earn points until owner has verified funds.
r=await call('orders','POST',{paymentMethod:'qr',items:[{id:'7',qty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);
assert.equal(r.status,201);const qrOrderId=r.data.orderId;
r=await call('orders','GET',undefined,cookie);assert.ok(r.data.orders.some(x=>x.id===qrOrderId&&x.payment_method==='qr'&&x.payment_status==='unpaid'));
assert.equal(r.data.orders.find(x=>x.id===qrOrderId).pointsAwarded,null);
for(const status of ['accepted','preparing','ready']){const x=await call('admin/orders','PATCH',{id:qrOrderId,status},cookie);assert.equal(x.status,200)}
r=await call('admin/orders','PATCH',{id:qrOrderId,status:'completed'},cookie);assert.equal(r.status,409);
r=await call('admin/orders/payment','PATCH',{id:qrOrderId,confirmed:true},cookie);assert.equal(r.status,200);
r=await call('admin/orders','PATCH',{id:qrOrderId,status:'completed'},cookie);assert.equal(r.status,200);
r=await call('admin/orders','GET',undefined,cookie);
assert.equal(r.data.orders.find(x=>x.id===qrOrderId).pointsAwarded,Math.floor(45/25));
// Import an example legacy account, restricted to owner; point awards remain after future order completion.
db.raw.exec("INSERT INTO legacy_accounts(legacy_code,display_name,snapshot_points) VALUES('ABCDEF12','ลูกค้าทดสอบ',5)");
r=await call('admin/legacy','GET',undefined,cookie);assert.equal(r.status,200);assert.equal(r.data.legacy.length,1);
r=await call('admin/legacy/assign','POST',{legacyCode:'ABCDEF12',lineUserId:env.OWNER_LINE_USER_ID,ownerVerified:false},cookie);assert.equal(r.status,400);
r=await call('admin/legacy/assign','POST',{legacyCode:'ABCDEF12',lineUserId:env.OWNER_LINE_USER_ID,ownerVerified:true},cookie);assert.equal(r.status,200);assert.equal(r.data.pointsTransferred,5);
r=await call('me','GET',undefined,cookie);assert.equal(r.data.member.points,9);
r=await call('points','GET',undefined,cookie);assert.equal(r.data.member.points,9);assert.ok(r.data.history.some(x=>x.kind==='legacy'&&x.delta===5));assert.equal(r.data.history.length,3);
r=await call('admin/legacy/assign','POST',{legacyCode:'ABCDEF12',lineUserId:env.OWNER_LINE_USER_ID,ownerVerified:true},cookie);assert.equal(r.status,409);
const req2=crypto.randomUUID();
r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'7',qty:1}],fulfillment:'pickup',requestKey:req2},cookie);assert.equal(r.status,201);
for(const status of ['accepted','ready','completed']) {const x=await call('admin/orders','PATCH',{id:r.data.orderId,status},cookie);assert.equal(x.status,200)}
r=await call('me','GET',undefined,cookie);assert.equal(r.data.member.points,10);
// Bread and milk bundle must be calculated on server, not only visual cart.
r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'30',qty:2}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,201);assert.equal(r.data.total,25);
r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'30',qty:3}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,201);assert.equal(r.data.total,40);
for(const id of ['31','32']){
 r=await call('orders','POST',{paymentMethod:'cash',items:[{id,qty:2}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,201);assert.equal(r.data.total,35);
}
r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'84',qty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,201);assert.equal(r.data.total,40);

 // Regression: LINE push uses readable Thai egg names (and per-plate extras), never raw internal codes.
 r=await call('orders','POST',{paymentMethod:'cash',items:[
  {id:'1',qty:3,sweetness:'หวานน้อย'},
  {id:'33',qty:1,egg:'omelet'},
  {id:'33',qty:2,egg:'creamy'}
 ],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);
 assert.equal(r.status,201);
 assert.ok(lastOwnerOrderNotification.includes('1× กะเพราหมู +ไข่เจียว 1 ฟอง/จาน (+10 บาท/จาน)'));
 assert.ok(lastOwnerOrderNotification.includes('3× เอสเพรสโซ (หวานน้อย)'));
 assert.ok(lastOwnerOrderNotification.includes('2× กะเพราหมู +ไข่ข้น 1 ฟอง/จาน (+20 บาท/จาน)'));
 assert.ok(!lastOwnerOrderNotification.includes('omelet')&&!lastOwnerOrderNotification.includes('creamy'));
 assert.ok(lastOwnerOrderNotification.includes('3× เอสเพรสโซ (หวานน้อย)'));
 assert.equal(r.data.total,302);
 assert.ok(lastOwnerOrderNotification.includes('กดรับ / จัดการออเดอร์นี้:'));
 assert.ok(lastOwnerOrderNotification.includes('https://chongpan-ordering-v2.pages.dev/admin/?order='+r.data.orderId));
 assert.ok(!lastOwnerOrderNotification.includes('chongpan-members.oakenzebra4.chatgpt.site'));
 // Two dishes with two fried eggs EACH: 4 eggs and 138 THB total.
 r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'33',qty:2,egg:'fried',eggQty:2}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);
 assert.equal(r.status,201);assert.equal(r.data.total,138);
 const eggOrderId=r.data.orderId;
 assert.ok(lastOwnerOrderNotification.includes('2× กะเพราหมู +ไข่ดาว 2 ฟอง/จาน (+20 บาท/จาน)'));
 r=await call('orders','GET',undefined,cookie);
 const eggOrder=r.data.orders.find(o=>o.id===eggOrderId);
 assert.equal(eggOrder.items[0].eggQty,2);
 assert.equal(eggOrder.items[0].eggPrice,20);
 // Mixed egg quantities must remain separate. Existing clients without eggQty imply one per plate.
 r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'33',qty:1,egg:'fried'}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);
 assert.equal(r.status,201);assert.equal(r.data.total,59);
 assert.ok(lastOwnerOrderNotification.includes('1× กะเพราหมู +ไข่ดาว 1 ฟอง/จาน'));
 // Garlic rice dishes can choose fried egg, omelet or creamy egg with per-plate quantity.
 r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'55',qty:2,egg:'fried',eggQty:2}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);
 assert.equal(r.status,201);assert.equal(r.data.total,138);
 assert.ok(lastOwnerOrderNotification.includes('2× ข้าวหมูกระเทียม +ไข่ดาว 2 ฟอง/จาน (+20 บาท/จาน)'));
 const garlicOrderId=r.data.orderId;
 r=await call('orders','GET',undefined,cookie);
 const garlicItem=r.data.orders.find(o=>o.id===garlicOrderId)?.items?.[0];
 assert.equal(garlicItem.egg,'fried');assert.equal(garlicItem.eggQty,2);assert.equal(garlicItem.eggPrice,20);
 r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'56',qty:1,egg:'omelet',eggQty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);
 assert.equal(r.status,201);assert.equal(r.data.total,59);
 assert.ok(lastOwnerOrderNotification.includes('1× ข้าวไก่กระเทียม +ไข่เจียว 1 ฟอง/จาน'));
 r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'55',qty:1,egg:'creamy',eggQty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);
 assert.equal(r.status,201);assert.equal(r.data.total,69);
 assert.ok(lastOwnerOrderNotification.includes('1× ข้าวหมูกระเทียม +ไข่ข้น 1 ฟอง/จาน'));
 for(const badEggQty of [0,6,-1,1.5,'2']){
  r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'33',qty:1,egg:'fried',eggQty:badEggQty}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);
  assert.equal(r.status,400);
 }
 r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'1',qty:1,eggQty:2}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,400);


r=await call('admin/menu','GET',undefined,cookie);assert.equal(r.status,200);assert.equal(r.data.products.length,90);
r=await call('admin/menu','PATCH',{id:'7',price:50,available:false},cookie);assert.equal(r.status,200);
r=await call('admin/menu','GET',undefined,cookie);assert.equal(r.data.products.find(x=>x.id==='7').verified,0);
r=await call('admin/menu','PATCH',{id:'84',price:0,available:true,verified:true},cookie);assert.equal(r.status,400);
r=await call('admin/menu','POST',{name:'เมนูทดสอบ',category:'น้ำปั่น',price:42,drink:true},cookie);assert.equal(r.status,201);
r=await call('admin/menu','GET',undefined,cookie);assert.equal(r.data.products.length,91);
r=await call('admin/menu','GET');assert.equal(r.status,403);
r=await call('menu');assert.equal(r.data.products.find(x=>x.id==='7').available,false);
// Hungry customer scenario in isolated D1 test DB, not the live cafe.
const hungrySub='U'+'b'.repeat(32);
globalThis.fetch=async (url,init)=>{
 if(String(url)==='https://api.line.me/oauth2/v2.1/verify'){
  await new Promise(resolve=>setTimeout(resolve,120)); // simulated slow external LINE verification
  return new Response(JSON.stringify({aud:'2011951537',sub:hungrySub,name:'ลูกค้าหิวทดสอบ',exp:Math.floor(Date.now()/1000)+600}),{status:200});
 }
 if(String(url)==='https://api.line.me/v2/bot/message/push'){
  lastOwnerOrderNotification=JSON.parse(init.body).messages[0].text;
  return new Response('',{status:200});
 }
 throw Error('Unexpected network request: '+url);
};
r=await call('me');assert.equal(r.data.member,null);
r=await call('auth/line','POST',{idToken:'slow-line-test-customer'});assert.equal(r.status,200);
const hungryCookie=r.cookie.split(';')[0];
r=await call('me','GET',undefined,hungryCookie);assert.equal(r.data.member.name,'ลูกค้าหิวทดสอบ');assert.equal(r.data.member.isOwner,false);
r=await call('admin/orders','GET',undefined,hungryCookie);assert.equal(r.status,403);
// Menu redemption is a distinct all-points order, not a cash discount.
db.raw.prepare("INSERT INTO points_adjustments(source_key,line_user_id,delta,reason) VALUES(?,?,?,'screenshot-migration')").run('smoke-redemption-seed',hungrySub,30);
db.raw.prepare('UPDATE members SET points=30 WHERE line_user_id=?').run(hungrySub);
const redemptionKey=crypto.randomUUID();
r=await call('orders','POST',{paymentMethod:'points',redeemOnly:true,pointsToUse:25,items:[{id:'30',qty:2}],fulfillment:'pickup',requestKey:redemptionKey},hungryCookie);
assert.equal(r.status,201);assert.equal(r.data.total,0);assert.equal(r.data.pointsUsed,25);assert.equal(r.data.pointsRemaining,5);assert.equal(r.data.paymentMethod,'points');
assert.ok(lastOwnerOrderNotification.includes('ประเภท: แลกแต้มเป็นเมนู'));
assert.ok(lastOwnerOrderNotification.includes('ใช้แลกเมนู: 25 แต้ม · ไม่ต้องรับเงิน'));
const redemptionOrderId=r.data.orderId;
r=await call('admin/orders/payment','PATCH',{id:redemptionOrderId,confirmed:true},cookie);assert.equal(r.status,409);
r=await call('orders','POST',{paymentMethod:'cash',pointsToUse:25,items:[{id:'30',qty:2}],fulfillment:'pickup',requestKey:crypto.randomUUID()},hungryCookie);
assert.equal(r.status,400); // No discount endpoint remains.
r=await call('admin/orders','PATCH',{id:redemptionOrderId,status:'cancelled'},cookie);
assert.equal(r.status,200);assert.equal(r.data.pointsRefunded,25);
r=await call('admin/orders/payment','PATCH',{id:redemptionOrderId,confirmed:true},cookie);assert.equal(r.status,409);
r=await call('points','GET',undefined,hungryCookie);assert.equal(r.data.member.points,30);
// The prior admin test marked a product unavailable; it must not block the other valid menus.
r=await call('menu');assert.equal(r.data.shopEnabled,true);
const hungryProducts=r.data.products;
for(const id of ['33','8','31'])assert.ok(hungryProducts.find(x=>x.id===id&&x.available));
r=await call('payment/config');assert.equal(r.data.qrEnabled,true);assert.equal(r.data.qrImage,'/assets/payment/shop-qr.svg');
const hungryItems=[
 {id:'33',qty:1,egg:'',eggQty:0,note:'ไม่เผ็ด'},
 {id:'8',qty:1,sweetness:'หวานน้อย'},
 {id:'31',qty:3}
];
const hungryOrderKey=crypto.randomUUID();
r=await call('orders','POST',{paymentMethod:'qr',items:hungryItems,fulfillment:'pickup',requestKey:hungryOrderKey},hungryCookie);
assert.equal(r.status,201);assert.equal(r.data.total,129);assert.equal(r.data.ownerAlertOk,true);
const hungryOrderId=r.data.orderId;
assert.ok(lastOwnerOrderNotification.includes('1× กะเพราหมู | ไม่เผ็ด'));
assert.ok(lastOwnerOrderNotification.includes('1× ชาไทยเย็น (หวานน้อย)'));
assert.ok(lastOwnerOrderNotification.includes('3× ปังสังขยาชาไทย'));
r=await call('orders','GET',undefined,hungryCookie);
const hungryOrder=r.data.orders.find(x=>x.id===hungryOrderId);
assert.ok(hungryOrder);assert.equal(hungryOrder.total,129);assert.equal(hungryOrder.items.length,3);
assert.equal(hungryOrder.payment_method,'qr');assert.equal(hungryOrder.payment_status,'unpaid');
assert.equal(hungryOrder.status,'pending');
r=await call('orders','POST',{paymentMethod:'qr',items:hungryItems,fulfillment:'pickup',requestKey:hungryOrderKey},hungryCookie);
assert.equal(r.status,200);assert.equal(r.data.reused,true);assert.equal(r.data.orderId,hungryOrderId);
// Real-world bad connectivity problem: browser loses the server response and retries
// with a fresh key (currently the client generates a fresh UUID on each click).
r=await call('orders','POST',{paymentMethod:'qr',items:hungryItems,fulfillment:'pickup',requestKey:crypto.randomUUID()},hungryCookie);
assert.equal(r.status,201);assert.notEqual(r.data.orderId,hungryOrderId);
r=await call('orders','GET',undefined,hungryCookie);
assert.equal(r.data.orders.filter(x=>x.payment_method==='qr'&&x.total===129).length,2);
console.log('HUNGRY CUSTOMER: slow mock LINE identity + 3 item/5 unit QR order 129 THB + payment pending PASSED; duplicate-order risk REPRODUCED when new request key is used after lost reply.');
let attemptedPush=false;
r=await call('admin/line/test','POST',{},cookie);assert.equal(r.status,200); // the default mock still accepts

globalThis.fetch=async url=>{
 if(String(url)==='https://api.line.me/v2/bot/message/push'){attemptedPush=true;return new Response('LINE temporarily unavailable',{status:503})}
 throw Error('Unexpected external URL');
};
const failedNotificationKey=crypto.randomUUID();
r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'30',qty:1}],fulfillment:'pickup',requestKey:failedNotificationKey},cookie);
assert.equal(r.status,201);const failedOrderId=r.data.orderId;assert.equal(attemptedPush,true);assert.equal(r.data.ownerAlertOk,false);assert.equal(r.data.shopAutoPaused,true);
assert.equal(db.raw.prepare("SELECT value FROM shop_settings WHERE key='shop_enabled'").get().value,'0');
assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_notifications WHERE delivered=0").get().n,1);
// Recover the SAME order even when a failed alert automatically disables checkout.
const ordersBeforeRetry=db.raw.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'30',qty:1}],fulfillment:'pickup',requestKey:failedNotificationKey},cookie);
assert.equal(r.status,200);assert.equal(r.data.reused,true);assert.equal(r.data.orderId,failedOrderId);
assert.equal(r.data.ownerAlertOk,false);
assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM orders").get().n,ordersBeforeRetry);
r=await call('health');assert.equal(r.data.ordersEnabled,false);
r=await call('orders','POST',{paymentMethod:'cash',items:[{id:'30',qty:1}],fulfillment:'pickup',requestKey:crypto.randomUUID()},cookie);assert.equal(r.status,503);
globalThis.fetch=realFetch;
console.log('PASS: health, 90 products reconciled to old order display, verification gate, closed checkout, origin blocking, LINE verification mock, signed cookie, total server-side 90 not 2, idempotency, owner/admin transitions, no double points, order notification fail-closed, catalog edit');

// The storefront is narrow-mobile first, including the login header and every dialog.
assert.ok(html.includes('class="topbar order-topbar"')&&html.includes('class="header-actions"'));
assert.ok(html.includes('width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'));
assert.ok(css.includes('.order-topbar{display:grid;grid-template-columns:46px minmax(0,1fr)'));
assert.ok(css.includes('.tabs{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)'));
assert.ok(css.includes('.search input{font-size:16px'));
assert.ok(css.includes('dialog{padding:16px;width:calc(100vw - 24px)'));


// Every menu option dialog allows 1-20 items; the price preview uses the exact cart pricing function.
assert.ok(html.includes('id="optionQuantityGroup"')&&html.includes('id="decreaseOptionQty"')&&html.includes('id="increaseOptionQty"'));
assert.ok(html.includes('id="optionQuantity" aria-live="polite"'));
assert.ok(appJS.includes('function setOptionQuantity(next)')&&appJS.includes('setOptionQuantity(1);'));
assert.ok(appJS.includes("$('increaseOptionQty').disabled=optionQuantity>=20"));
assert.ok(appJS.includes("const sum=costLabel(lineSubtotal(draft));"));
assert.ok(appJS.includes('qty:optionQuantity')&&appJS.includes('other.qty+=item.qty'));
assert.ok(appJS.includes('if(other.qty+item.qty>20)return toast('));
assert.ok(appJS.includes("$('egg').addEventListener('change',()=>setOptionEggQuantity(1))"));
assert.ok(css.includes('.option-quantity-controls{display:flex'));
// Verify single item and discounted pair calculations are still server-authoritative.


// Customer UX: 3 sticky main groups, focused subcategories, cross-sell prompt.
assert.ok(html.includes('id="menuGroupTabs"')&&html.includes('id="nextStepBar"'));
assert.ok(html.includes('วันนี้รับอะไรดีคะ?'));
assert.ok(html.includes('น้องชงปั่นยินดีต้อนรับค่ะ'));
assert.ok(!html.includes('วันนี้รับอะไรดีครับ?'));

assert.ok(html.includes('data-menu-group="food"')&&html.includes('data-menu-group="drinks"')&&html.includes('data-menu-group="dessert"'));
assert.ok(css.includes('.menu-explorer{position:sticky')&&css.includes('.next-step-bar{position:fixed'));
assert.ok(appJS.includes("function setMenuGroup(group,scroll=true)"));
assert.ok(appJS.includes("function suggestNextStep(product)")&&appJS.includes("suggestNextStep(state.selectedProduct);"));
assert.ok(appJS.includes("return p.drink?'drinks':'food'"));
assert.ok(appJS.includes("state.selectedCategory='ทั้งหมด';paintMenuGroupTabs();paintCategories();paintCatalog()"));
assert.ok(appJS.includes("const pendingKeyName='chongpan-v2-pending-checkout'"));
assert.ok(appJS.includes("if(r.confirmationPending){")&&appJS.includes('กำลังตรวจสอบการแจ้งร้าน'));
assert.ok(appJS.includes('ส่งออเดอร์และไปสแกนจ่าย'));

assert.ok(appJS.includes("fingerprint:payloadFingerprint")&&appJS.includes("localStorage.removeItem(pendingKeyName)"));
assert.ok(appJS.includes("new AbortController()")&&appJS.includes("Promise.race(["));

// Customer reorder uses fresh catalog, never submits directly and preserves modifiers.
assert.ok(appJS.includes('function buildRepeatBasket(order,products,currentBasket)'));
assert.ok(appJS.includes("data-repeat-order"));
assert.ok(appJS.includes("await bootMenu()"));
assert.ok(appJS.includes("('cartDialog').showModal()"));
assert.ok(appJS.includes("return true}catch(e){")&&appJS.includes("return false}}"));
assert.ok(css.includes('.order-history-actions{display:flex'));

const reorderSection=appJS.slice(appJS.indexOf('function buildRepeatBasket('),appJS.indexOf('\nasync function repeatOrder('));
assert.ok(reorderSection.startsWith('function buildRepeatBasket('));
const rerunHelper=[
 "const eggEligibleCategories=new Set(['กะเพรา','ข้าวกระเทียม']);",
 "const supportsEgg=p=>!!p&&eggEligibleCategories.has(p.category);",
 "const repeatSweetness=new Set(['','ปกติ','หวานน้อย','ไม่หวาน','ไม่เติมน้ำตาล','เติมหวานน้อย','เติมหวานปกติ']);",
 "const repeatEggTypes=new Set(['fried','omelet','creamy']);",
 "const extra=item=>(({fried:10,omelet:10,creamy:20})[item.egg]||0)*(item.eggQty||0);",
 "const keyOf=item=>JSON.stringify([item.id,item.sweetness,item.egg,item.egg?item.eggQty??1:0,item.note]);",
 reorderSection,
 "return buildRepeatBasket(order,products,currentBasket);"
].join('\n');
const repeatTest=new Function('order','products','currentBasket',rerunHelper);
const repeatProducts=[
 {id:'55',name:'ข้าวหมูกระเทียม',price:49,category:'ข้าวกระเทียม',available:true},
 {id:'8',name:'ชาไทยเย็น',price:25,category:'ชาและนม',drink:true,available:true},
 {id:'31',name:'ปังสังขยาชาไทย',price:20,category:'ขนมปัง',available:true},
 {id:'99',name:'เลิกขาย',price:39,category:'ขนมปัง',available:false}
];
const repeatSample={items:[
 {id:'55',name:'ข้าวหมูกระเทียม',price:49,qty:2,egg:'fried',eggQty:2,eggPrice:20,note:'ไม่เผ็ด'},
 {id:'8',name:'ชาไทยเย็น',price:25,qty:1,sweetness:'หวานน้อย'},
 {id:'31',name:'ปังสังขยาชาไทย',price:19,qty:3},
 {id:'99',name:'เลิกขาย',price:39,qty:1}
]};
const repeatA=repeatTest(repeatSample,repeatProducts,[]);
assert.equal(repeatA.added.length,3);
assert.equal(repeatA.skipped.length,1);
assert.equal(repeatA.repriced.length,1);
assert.equal(repeatA.basket.length,3);
assert.equal(repeatA.basket[0].eggQty,2);
assert.equal(repeatA.basket[1].sweetness,'หวานน้อย');
assert.equal(repeatA.basket[2].qty,3);
assert.equal(repeatA.basket[2].price,20);
const repeatB=repeatTest(repeatSample,repeatProducts,repeatA.basket);
assert.equal(repeatB.basket.length,3);
assert.equal(repeatB.basket[0].qty,4);
assert.equal(repeatB.basket[2].qty,6);
assert.equal(repeatA.basket[0].qty,2);
const capped=repeatTest(repeatSample,repeatProducts,[{...repeatA.basket[0],qty:20}]);
assert.ok(capped.skipped.some(s=>s.includes('เกินกำหนด')));
assert.equal(capped.basket[0].qty,20);
const invalidSweet=repeatTest({items:[{id:'8',qty:1,egg:'fried'}]},repeatProducts,[]);
assert.equal(invalidSweet.added.length,0);
assert.equal(invalidSweet.skipped.length,1);
console.log('PASS: repeat-order uses current prices, original quantity and options, stock checks, and cart limits');
