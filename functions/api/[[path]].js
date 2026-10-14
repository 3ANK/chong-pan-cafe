/** Cloudflare Pages Function. Orders default OFF until LINE login and catalog verification are complete. */
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const fail=(error,status=400)=>json({error},status);
const text=v=>String(v??'').trim();
const safe=(v,max)=>text(v).slice(0,max);
const parseCookie=(cookie,name)=>{const p=String(cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));return p?decodeURIComponent(p.slice(name.length+1)):''};
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
async function hmac(secret,data){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(data)))}
async function session(req,env){if(!env.SESSION_SECRET)return null;try{const token=parseCookie(req.headers.get('Cookie'),'chongpan_sid');const [payload,sig]=token.split('.');if(!payload||!sig||sig!==(await hmac(env.SESSION_SECRET,payload)))return null;const data=JSON.parse(new TextDecoder().decode(unb64(payload)));return typeof data.sub==='string'&&data.exp>Date.now()?data:null}catch{return null}}
async function newCookie(env,data){const payload=b64(new TextEncoder().encode(JSON.stringify({...data,exp:Date.now()+7*86400000})));return `chongpan_sid=${payload}.${await hmac(env.SESSION_SECRET,payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`}
const owner=(s,env)=>!!s?.sub&&!!env.OWNER_LINE_USER_ID&&s.sub===env.OWNER_LINE_USER_ID;
function eggPrice(s){return({fried:10,omelet:10,creamy:20})[s]??null}
const validSweet=new Set(['','ปกติ','หวานน้อย','ไม่หวาน','ไม่เติมน้ำตาล','เติมหวานน้อย','เติมหวานปกติ']);
const validStatus=new Set(['accepted','preparing','ready','completed','cancelled']);
async function body(req){const raw=await req.text();if(raw.length>18000)throw new Error('คำขอใหญ่เกินกำหนด');try{return JSON.parse(raw)}catch{throw new Error('รูปแบบ JSON ไม่ถูกต้อง')}}
async function getOrders(db,where='',args=[]){const q=`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT 100`;const result=await db.prepare(q).bind(...args).all();const rows=result.results||[];if(!rows.length)return [];const ids=rows.map(x=>x.id);const binds=ids.map(()=>'?').join(',');const its=(await db.prepare(`SELECT * FROM order_items WHERE order_id IN (${binds})`).bind(...ids).all()).results||[];return rows.map(o=>({...o,items:its.filter(i=>i.order_id===o.id).map(i=>({id:i.catalog_id,name:i.name,qty:i.qty,price:i.unit_price,eggPrice:i.egg_price,sweetness:i.sweetness,egg:i.egg,note:i.note}))}));}

async function readiness(db,env){
 const [catalog,flag]=await Promise.all([
  db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN c.available=1 AND (c.price<=0 OR COALESCE(r.verified,0)<>1) THEN 1 ELSE 0 END) AS unverified FROM catalog c LEFT JOIN catalog_price_reviews r ON r.product_id=c.id").first(),
  db.prepare("SELECT value FROM shop_settings WHERE key='shop_enabled'").first()
 ]);
 const checks=[
  {id:'menu',label:'ยืนยันราคาสินค้าที่เปิดขายทุกเมนู',ok:Number(catalog?.unverified||0)===0},
  {id:'liff',label:'ตั้งค่า LINE Login / LIFF ID / Session',ok:!!env.LINE_CHANNEL_ID&&!!env.LIFF_ID&&!!env.SESSION_SECRET},
  {id:'liff_endpoint',label:'ยืนยันการเปลี่ยน LIFF Endpoint และทดสอบ LINE Login จริง',ok:env.LIFF_ENDPOINT_CONFIRMED==='true'},
  {id:'alert_token',label:'ตั้งค่า LINE Messaging Access Token เพื่อแจ้งร้าน',ok:!!env.LINE_MESSAGING_ACCESS_TOKEN},
  {id:'owner',label:'ตั้งค่า LINE ผู้ดูแลร้าน',ok:!!env.OWNER_LINE_USER_ID},
  {id:'shop_cloudflare',label:'Cloudflare SHOP_ENABLED=true',ok:env.SHOP_ENABLED==='true'},
  {id:'shop_database',label:'ตั้งค่าเปิดร้านในฐานข้อมูล',ok:flag?.value==='1'}
 ];
 return {ordersEnabled:checks.every(c=>c.ok),catalog:{total:Number(catalog?.total||0),unverified:Number(catalog?.unverified||0)},checks};
}
async function menu(db,env){
 const items=(await db.prepare('SELECT id,name,category,price,image,emoji,drink,available FROM catalog ORDER BY sort_order,id').all()).results||[];
 const status=await readiness(db,env);
 return {products:items.map(p=>({...p,price:Number(p.price),available:!!p.available,drink:!!p.drink})),shopEnabled:status.ordersEnabled,liffId:env.LIFF_ID||''};
}
async function authLine(req,env,db){if(!env.LINE_CHANNEL_ID||!env.SESSION_SECRET)return fail('ยังไม่ได้ตั้งค่า LINE Login',503);const {idToken}=await body(req);if(typeof idToken!=='string'||idToken.length>5000)return fail('ไม่พบ LINE ID token');const v=await fetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:idToken,client_id:env.LINE_CHANNEL_ID})});if(!v.ok)return fail('LINE ไม่ยืนยันตัวตน',401);const data=await v.json();if(data.aud!==env.LINE_CHANNEL_ID||!data.sub||!data.exp||data.exp*1000<=Date.now())return fail('LINE ID token ไม่ถูกต้อง',401);const name=safe(data.name||'สมาชิก LINE',80);await db.prepare('INSERT INTO members(line_user_id,display_name) VALUES(?,?) ON CONFLICT(line_user_id) DO UPDATE SET display_name=excluded.display_name,updated_at=CURRENT_TIMESTAMP').bind(data.sub,name).run();return json({ok:true,name},200,{'Set-Cookie':await newCookie(env,{sub:data.sub,name})})}
async function pointHistory(db, sessionData){
 const member=await db.prepare('SELECT display_name,points,created_at FROM members WHERE line_user_id=?').bind(sessionData.sub).first();
 if(!member)return fail('กรุณาเข้าสู่ LINE เพื่อดูแต้มสมาชิก',401);
 // Only read the signed-in member's transactions. Never accept a user ID from URL/body.
 const data=await db.prepare(`SELECT kind,delta,reference,created_at FROM (
  SELECT 'order' AS kind,delta,order_id AS reference,created_at FROM points_ledger WHERE line_user_id=?
  UNION ALL
  SELECT CASE WHEN reason='screenshot-migration' THEN 'legacy' ELSE 'adjustment' END AS kind,
    delta, '' AS reference,created_at FROM points_adjustments WHERE line_user_id=?
 ) ORDER BY created_at DESC LIMIT 100`).bind(sessionData.sub,sessionData.sub).all();
 return json({member:{name:member.display_name,points:Number(member.points),joinedAt:member.created_at},
  history:(data.results||[]).map(t=>({kind:t.kind,delta:Number(t.delta),orderId:t.kind==='order'?t.reference:null,createdAt:t.created_at})),
  policy:{bahtPerPoint:25,awardWhen:'completed',fractionalCarry:false},
  rewardsEnabled:false});
}
async function createOrder(req,env,db,s){if(!s)return fail('กรุณาเข้าสู่ LINE',401);const config=await menu(db,env);if(!config.shopEnabled)return fail('ร้านยังไม่เปิดรับออเดอร์ผ่านระบบใหม่',503);const data=await body(req);if(!Array.isArray(data.items)||!data.items.length||data.items.length>35)return fail('จำนวนรายการไม่ถูกต้อง');if(!['pickup','delivery'].includes(data.fulfillment))return fail('วิธีรับอาหารไม่ถูกต้อง');const address=safe(data.deliveryAddress,500);if(data.fulfillment==='delivery'&&!address)return fail('โปรดระบุที่อยู่จัดส่ง');const requestKey=text(data.requestKey);if(!/^[0-9a-fA-F-]{36}$/.test(requestKey))return fail('รหัสคำขอไม่ถูกต้อง');const existing=await db.prepare('SELECT id,total FROM orders WHERE line_user_id=? AND request_key=?').bind(s.sub,requestKey).first();if(existing)return json({orderId:existing.id,total:existing.total,reused:true});const stock=new Map(config.products.map(p=>[p.id,p]));const validated=[];let total=0;for(const raw of data.items){const p=stock.get(String(raw?.id));const qty=Number(raw?.qty);if(!p||!p.available||p.price<=0||!Number.isInteger(qty)||qty<1||qty>20)return fail('เมนูหรือจำนวนสินค้าไม่ถูกต้อง');const sweetness=safe(raw.sweetness,40);const egg=safe(raw.egg,20);if(!validSweet.has(sweetness)||(sweetness&&!p.drink))return fail('ตัวเลือกความหวานไม่ถูกต้อง');const extra=egg?eggPrice(egg):0;if(extra===null||(egg&&p.category!=='กะเพรา'))return fail('ตัวเลือกไข่ไม่ถูกต้อง');const item={id:p.id,name:p.name,qty,price:p.price,egg,sweetness,note:safe(raw.note,140),extra};const pair=extra===0?(p.id==='30'&&p.price===15?25:(p.id==='31'||p.id==='32')&&p.price===20?35:null):null;
 total+=pair===null?(p.price+extra)*qty:Math.floor(qty/2)*pair+(qty%2)*p.price;
 validated.push(item)}if(total<0||total>200000)return fail('ยอดสั่งซื้อเกินกำหนด');const id=crypto.randomUUID();const name=safe(s.name||'สมาชิก LINE',80);const steps=[db.prepare('INSERT INTO orders(id,request_key,line_user_id,display_name,fulfillment,delivery_address,note,total,status) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,requestKey,s.sub,name,data.fulfillment,address,safe(data.note,300),total,'pending'),...validated.map(i=>db.prepare('INSERT INTO order_items(id,order_id,catalog_id,name,unit_price,egg_price,qty,sweetness,egg,note) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,i.id,i.name,i.price,i.extra,i.qty,i.sweetness,i.egg,i.note))];try{await db.batch(steps)}catch(e){const old=await db.prepare('SELECT id,total FROM orders WHERE line_user_id=? AND request_key=?').bind(s.sub,requestKey).first();if(old)return json({orderId:old.id,total:old.total,reused:true});throw e}if(env.LINE_MESSAGING_ACCESS_TOKEN&&env.OWNER_LINE_USER_ID){try{await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{Authorization:`Bearer ${env.LINE_MESSAGING_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({to:env.OWNER_LINE_USER_ID,messages:[{type:'text',text:`มีออเดอร์ใหม่ #${id.slice(0,8)}\nยอด ${total} บาท\n${validated.map(i=>`${i.qty}× ${i.name}`).join('\n')}`.slice(0,4800)}]})})}catch{/* Order persists even if LINE alert fails. */}}return json({orderId:id,total},201)}
// Balances comprise points from completed orders and explicitly approved, idempotent adjustments.
function refreshPoints(db,userId){return db.prepare(`UPDATE members SET points =
  (SELECT COALESCE(SUM(delta),0) FROM points_ledger WHERE line_user_id=?) +
  (SELECT COALESCE(SUM(delta),0) FROM points_adjustments WHERE line_user_id=?),
  updated_at=CURRENT_TIMESTAMP WHERE line_user_id=?`).bind(userId,userId,userId)}
async function legacyList(db){
  const [legacy,members]=await Promise.all([
    db.prepare('SELECT legacy_code,display_name,snapshot_points,claimed_line_user_id,claimed_at FROM legacy_accounts ORDER BY imported_at,legacy_code').all(),
    db.prepare('SELECT line_user_id,display_name,points FROM members ORDER BY created_at DESC LIMIT 300').all()
  ]);
  return json({legacy:legacy.results||[],members:members.results||[]});
}
// Never auto-match by public display name or 8-character screenshot code.
async function assignLegacy(req,db,ownerSession){
  const data=await body(req);
  const code=safe(data.legacyCode,8).toUpperCase();
  const userId=safe(data.lineUserId,100);
  if(!/^[A-F0-9]{8}$/.test(code)||!/^U[a-f0-9]{32}$/i.test(userId)||data.ownerVerified!==true)
    return fail('ต้องตรวจสอบ LINE ผู้รับและยืนยันตัวตนจากเจ้าของร้านก่อน',400);
  const [old,member]=await Promise.all([
    db.prepare('SELECT legacy_code,snapshot_points,claimed_line_user_id FROM legacy_accounts WHERE legacy_code=?').bind(code).first(),
    db.prepare('SELECT line_user_id,display_name FROM members WHERE line_user_id=?').bind(userId).first()
  ]);
  if(!old)return fail('ไม่พบบัญชีเก่าจากภาพ',404);
  if(!member)return fail('ลูกค้าต้องเข้าสู่ LINE บนระบบใหม่ก่อน',404);
  if(old.claimed_line_user_id)return fail(old.claimed_line_user_id===userId?'แต้มบัญชีนี้โอนแล้ว':'บัญชีเก่านี้ถูกโอนให้บัญชีอื่นแล้ว',409);
  const prior=await db.prepare('SELECT legacy_code FROM legacy_accounts WHERE claimed_line_user_id=?').bind(userId).first();
  if(prior)return fail('บัญชี LINE นี้เคยได้รับแต้มจากสมาชิกเก่าแล้ว',409);
  // Atomic batch: an assignment can only produce one matching points adjustment.
  try {
    await db.batch([
      db.prepare('UPDATE legacy_accounts SET claimed_line_user_id=?,claimed_at=CURRENT_TIMESTAMP,claimed_by=? WHERE legacy_code=? AND claimed_line_user_id IS NULL').bind(userId,ownerSession.sub,code),
      db.prepare(`INSERT OR IGNORE INTO points_adjustments(source_key,line_user_id,delta,reason)
        SELECT 'legacy:'||legacy_code,claimed_line_user_id,snapshot_points,'screenshot-migration'
        FROM legacy_accounts WHERE legacy_code=? AND claimed_line_user_id=?`).bind(code,userId),
      refreshPoints(db,userId)
    ]);
  } catch(e){return fail('จับคู่ซ้ำหรือข้อมูลขัดแย้ง กรุณาตรวจสอบก่อนทำอีกครั้ง',409)}
  const ok=await db.prepare('SELECT claimed_line_user_id FROM legacy_accounts WHERE legacy_code=?').bind(code).first();
  if(ok?.claimed_line_user_id!==userId)return fail('มีการย้ายแต้มนี้ให้ผู้อื่นแล้ว',409);
  const bal=await db.prepare('SELECT points FROM members WHERE line_user_id=?').bind(userId).first();
  return json({ok:true,legacyCode:code,pointsTransferred:old.snapshot_points,currentPoints:bal?.points});
}
async function updateOrder(req,db){const d=await body(req);if(typeof d.id!=='string'||!validStatus.has(d.status))return fail('ข้อมูลสถานะไม่ถูกต้อง');const o=await db.prepare('SELECT id,status,line_user_id,total FROM orders WHERE id=?').bind(d.id).first();if(!o)return fail('ไม่พบออเดอร์',404);if(o.status==='completed'||o.status==='cancelled')return fail('ออเดอร์ถูกปิดแล้ว',409);const allowed={pending:['accepted','cancelled'],accepted:['preparing','ready','cancelled'],preparing:['ready','cancelled'],ready:['completed','cancelled']};if(!allowed[o.status]?.includes(d.status))return fail('ลำดับสถานะไม่ถูกต้อง',409);if(d.status==='completed'){const pts=Math.floor(o.total/25);const id=crypto.randomUUID();await db.batch([db.prepare("UPDATE orders SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=? AND status='ready'").bind(o.id),db.prepare('INSERT OR IGNORE INTO points_ledger(id,order_id,line_user_id,delta) VALUES(?,?,?,?)').bind(id,o.id,o.line_user_id,pts),refreshPoints(db,o.line_user_id)]);return json({ok:true,pointsAdded:pts})}await db.prepare('UPDATE orders SET status=? WHERE id=? AND status=?').bind(d.status,o.id,o.status).run();return json({ok:true})}
async function listAdminMenu(db){
 const r=await db.prepare("SELECT c.id,c.name,c.category,c.price,c.image,c.available,c.drink,COALESCE(pr.verified,0) AS verified,pr.source FROM catalog c LEFT JOIN catalog_price_reviews pr ON pr.product_id=c.id ORDER BY c.sort_order,c.id").all();
 const products=r.results||[];
 return json({products,pending:products.filter(p=>!p.verified).length,draft:products.filter(p=>p.price<=0).length,missingImages:products.filter(p=>!p.image).length});
}
async function updateMenu(req,db){
 const d=await body(req);
 if(typeof d.id!=='string'||!Number.isInteger(d.price)||d.price<0||d.price>100000||typeof d.available!=='boolean'||(d.verified!==undefined&&typeof d.verified!=='boolean'))return fail('ข้อมูลสินค้าไม่ถูกต้อง');
 if(d.available&&d.price<=0)return fail('ต้องกำหนดราคาก่อนเปิดขาย',400);
 const prev=await db.prepare('SELECT price FROM catalog WHERE id=?').bind(d.id).first();
 if(!prev)return fail('ไม่พบเมนู',404);
 // A price edit revokes previous verification unless explicitly reapproved.
 const verified=d.verified===true?1:d.verified===false?0:(prev.price===d.price?null:0);
 const steps=[db.prepare('UPDATE catalog SET price=?,available=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(d.price,d.available?1:0,d.id)];
 if(verified!==null)steps.push(db.prepare("INSERT INTO catalog_price_reviews(product_id,source,verified,reviewed_at) VALUES(?,'owner-review',?,CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END) ON CONFLICT(product_id) DO UPDATE SET source='owner-review',verified=excluded.verified,reviewed_at=excluded.reviewed_at").bind(d.id,verified,verified));
 await db.batch(steps);
 return json({ok:true,verified:verified===null?undefined:!!verified});
}
async function createMenu(req,db){
 const d=await body(req),name=safe(d.name,100),category=safe(d.category,70),price=d.price;
 if(!name||!category||typeof d.drink!=='boolean'||!Number.isInteger(price)||price<0||price>100000)return fail('กรุณาระบุชื่อ หมวดหมู่ และราคาที่ถูกต้อง',400);
 if((await db.prepare('SELECT id FROM catalog WHERE name=?').bind(name).first()))return fail('มีชื่อเมนูนี้แล้ว',409);
 const id=crypto.randomUUID(),emoji=d.drink?'🥤':'🍽️';
 await db.batch([
  db.prepare('INSERT INTO catalog(id,name,category,price,image,emoji,drink,available,sort_order) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,name,category,price,'',emoji,d.drink?1:0,0,1000),
  db.prepare("INSERT INTO catalog_price_reviews(product_id,source,verified) VALUES(?,'owner-added-pending-review',0)").bind(id)
 ]);
 return json({ok:true,id,draft:true},201);
}
export async function onRequest({request,env}){const path=new URL(request.url).pathname.replace(/^\/api\/?/,'');const method=request.method.toUpperCase();const db=env.DB;if(!db)return fail('ยังไม่ได้ผูกฐานข้อมูล D1',503);if(!['GET','HEAD'].includes(method)){const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return fail('Origin ไม่ได้รับอนุญาต',403)}try{if(path==='health'&&method==='GET')return json({ok:true,service:'chongpan-ordering-v2',ordersEnabled:(await menu(db,env)).shopEnabled,db:true});if(path==='menu'&&method==='GET')return json(await menu(db,env));if(path==='loyalty/info'&&method==='GET')return json({liffId:env.LIFF_ID||'',policy:{bahtPerPoint:25,awardWhen:'completed',fractionalCarry:false},rewardsEnabled:false});if(path==='auth/line'&&method==='POST')return authLine(request,env,db);const s=await session(request,env);if(path==='points'&&method==='GET'){if(!s)return fail('กรุณาเข้าสู่ LINE เพื่อดูแต้มสมาชิก',401);return pointHistory(db,s)}if(path==='me'&&method==='GET'){if(!s)return json({member:null});const m=await db.prepare('SELECT display_name,points FROM members WHERE line_user_id=?').bind(s.sub).first();return json({member:{name:m?.display_name||s.name,points:m?.points||0,isOwner:owner(s,env)}})}if(path==='orders'&&method==='GET'){if(!s)return fail('กรุณาเข้าสู่ LINE',401);return json({orders:await getOrders(db,'WHERE line_user_id=?',[s.sub])})}if(path==='orders'&&method==='POST')return createOrder(request,env,db,s);if(path.startsWith('admin/')){if(!owner(s,env))return fail('เฉพาะผู้ดูแลร้าน',403);if(path==='admin/readiness'&&method==='GET')return json(await readiness(db,env));if(path==='admin/orders'&&method==='GET')return json({orders:await getOrders(db)});if(path==='admin/orders'&&method==='PATCH')return updateOrder(request,db);if(path==='admin/menu'&&method==='GET')return listAdminMenu(db);if(path==='admin/menu'&&method==='PATCH')return updateMenu(request,db);if(path==='admin/menu'&&method==='POST')return createMenu(request,db);if(path==='admin/legacy'&&method==='GET')return legacyList(db);if(path==='admin/legacy/assign'&&method==='POST')return assignLegacy(request,db,s)}return fail('ไม่พบ API',404)}catch(e){if(e instanceof Error&&['รูปแบบ JSON ไม่ถูกต้อง','คำขอใหญ่เกินกำหนด'].includes(e.message))return fail(e.message);return fail('ระบบมีปัญหาชั่วคราว',500)}}