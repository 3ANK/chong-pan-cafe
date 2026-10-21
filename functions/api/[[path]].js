import {loyverseSettings,loyverseSyncRoute,syncLoyverse} from '../_lib/loyverse.mjs';
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
const primaryOwner=(s,env)=>!!s?.sub&&!!env.OWNER_LINE_USER_ID&&s.sub===env.OWNER_LINE_USER_ID;
async function adminLineUserIds(db,env){
 const rows=(await db.prepare('SELECT line_user_id FROM shop_admins ORDER BY created_at,line_user_id').all()).results||[];
 return [...new Set([env.OWNER_LINE_USER_ID,...rows.map(r=>r.line_user_id)].filter(Boolean))];
}
async function isAdmin(s,env,db){
 if(primaryOwner(s,env))return true;
 if(!s?.sub)return false;
 return !!await db.prepare('SELECT 1 AS ok FROM shop_admins WHERE line_user_id=?').bind(s.sub).first();
}
function eggPrice(s){return({fried:10,omelet:10,creamy:20})[s]??null}
const eggNames={fried:'ไข่ดาว',omelet:'ไข่เจียว',creamy:'ไข่ข้น'};
const eggEligibleCategories=new Set(['กะเพรา','ข้าวกระเทียม']);
const validSweet=new Set(['','ปกติ','หวานน้อย','ไม่หวาน','ไม่เติมน้ำตาล','เติมหวานน้อย','เติมหวานปกติ']);
const validStatus=new Set(['accepted','preparing','ready','completed','cancelled']);
async function body(req,maxChars=18000){const raw=await req.text();if(raw.length>maxChars)throw new Error('คำขอใหญ่เกินกำหนด');try{return JSON.parse(raw)}catch{throw new Error('รูปแบบ JSON ไม่ถูกต้อง')}}
async function getOrders(db,where='',args=[]){const q=`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT 100`;const result=await db.prepare(q).bind(...args).all();const rows=result.results||[];if(!rows.length)return [];const ids=rows.map(x=>x.id);const binds=ids.map(()=>'?').join(',');const [itemResult,pointsResult]=await Promise.all([
 db.prepare(`SELECT * FROM order_items WHERE order_id IN (${binds})`).bind(...ids).all(),
 db.prepare(`SELECT order_id,delta FROM points_ledger WHERE order_id IN (${binds})`).bind(...ids).all()
]);
const its=itemResult.results||[],grants=pointsResult.results||[];
const syncs=(await db.prepare(`SELECT order_id,status,receipt_number,message FROM loyverse_sync WHERE order_id IN (${binds})`).bind(...ids).all()).results||[];
const awardedPoints=new Map(grants.map(x=>[x.order_id,Number(x.delta)]));
return rows.map(o=>({...o,loyverse:syncs.find(x=>x.order_id===o.id)||null,isPointsRedemption:Number(o.points_used||0)>0&&Number(o.total||0)===0,pointsAwarded:awardedPoints.has(o.id)?awardedPoints.get(o.id):null,
 items:its.filter(i=>i.order_id===o.id).map(i=>({id:i.catalog_id,name:i.name,qty:i.qty,price:i.unit_price,eggPrice:i.egg_price,sweetness:i.sweetness,egg:i.egg,eggQty:i.egg_qty,note:i.note}))}));}

const safeQrPath=s=>/^\/assets\/payment\/[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp|svg)$/i.test(s);
const safeOaId=s=>/^@[A-Za-z0-9._-]{3,40}$/.test(s);
async function paymentConfig(db,env){
 const results=(await db.prepare("SELECT key,value FROM shop_settings WHERE key IN ('payment_qr_path','line_oa_basic_id')").all()).results||[];
 const settings=Object.fromEntries(results.map(x=>[x.key,x.value]));
 const qrPath=safeQrPath(settings.payment_qr_path||'')?settings.payment_qr_path:'';
 const oaId=safeOaId(settings.line_oa_basic_id||'')?settings.line_oa_basic_id:'';
 return {cashEnabled:true,qrEnabled:env.PAYMENT_QR_READY==='true'&&!!qrPath&&!!oaId,qrImage:qrPath,oaId};
}
async function setPaymentConfig(req,db,env){
 const d=await body(req);
 const qrPath=text(d.qrPath),oaId=text(d.oaId);
 if((qrPath&&!safeQrPath(qrPath))||(oaId&&!safeOaId(oaId)))return fail('ระบุไฟล์ QR ใต้ /assets/payment/ และ LINE OA ID ที่ขึ้นต้น @ ให้ถูกต้อง');
 await db.batch([
  db.prepare("INSERT INTO shop_settings(key,value) VALUES('payment_qr_path',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(qrPath),
  db.prepare("INSERT INTO shop_settings(key,value) VALUES('line_oa_basic_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(oaId)
 ]);
 return json({ok:true,...await paymentConfig(db,env)});
}
async function confirmPayment(req,db){
 const d=await body(req);
 if(typeof d.id!=='string'||d.confirmed!==true)return fail('กรุณาระบุออเดอร์และยืนยันว่าตรวจสอบการรับเงินจริงแล้ว');
 const item=await db.prepare('SELECT id,status,payment_status,payment_method,total FROM orders WHERE id=?').bind(d.id).first();
 if(!item)return fail('ไม่พบออเดอร์',404);
 if(item.status==='cancelled')return fail('ไม่สามารถยืนยันชำระเงินของออเดอร์ที่ยกเลิก',409);
 if(item.payment_method==='points'||Number(item.total)<=0)return fail('ออเดอร์นี้ไม่มียอดเงินที่ต้องรับ',409);
 if(item.payment_status==='verified')return json({ok:true,alreadyVerified:true});
 await db.prepare("UPDATE orders SET payment_status='verified' WHERE id=? AND payment_status='unpaid'").bind(d.id).run();
 return json({ok:true,paymentStatus:'verified'});
}

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
  const history=await db.prepare(`SELECT kind,delta,reference,created_at FROM (
    SELECT 'order' AS kind,delta,order_id AS reference,created_at FROM points_ledger WHERE line_user_id=?
    UNION ALL
    SELECT CASE
      WHEN reason='screenshot-migration' THEN 'legacy'
      WHEN reason='order-redemption' THEN 'redemption'
      WHEN reason='order-redemption-refund' THEN 'refund'
      ELSE 'adjustment' END AS kind,
      delta,
      CASE WHEN reason='order-redemption' THEN substr(source_key,14)
           WHEN reason='order-redemption-refund' THEN substr(source_key,21)
           ELSE '' END AS reference,created_at
    FROM points_adjustments WHERE line_user_id=? AND reason<>'reward-redemption'
  ) ORDER BY created_at DESC LIMIT 100`).bind(sessionData.sub,sessionData.sub).all();
  return json({
   member:{name:member.display_name,points:Number(member.points),joinedAt:member.created_at},
   history:(history.results||[]).map(t=>({kind:t.kind,delta:Number(t.delta),orderId:t.reference||null,createdAt:t.created_at})),
   policy:{bahtPerPoint:25,awardWhen:'completed',fractionalCarry:false}
  });
}
async function createOrder(req,env,db,s){
 if(!s)return fail('กรุณาเข้าสู่ LINE',401);
 const data=await body(req);
 const requestKey=text(data.requestKey);
 if(!/^[0-9a-fA-F-]{36}$/.test(requestKey))return fail('รหัสคำขอไม่ถูกต้อง');
 const existing=await db.prepare('SELECT id,total,points_used,payment_method FROM orders WHERE line_user_id=? AND request_key=?').bind(s.sub,requestKey).first();
 if(existing){
  const delivery=await db.prepare('SELECT delivered FROM order_notifications WHERE order_id=?').bind(existing.id).first();
  const balance=await db.prepare('SELECT points FROM members WHERE line_user_id=?').bind(s.sub).first();
  return json({orderId:existing.id,total:existing.total,pointsUsed:Number(existing.points_used||0),pointsRemaining:Number(balance?.points||0),paymentMethod:existing.payment_method,reused:true,
   ownerAlertOk:delivery?.delivered===1,confirmationPending:!delivery});
 }
 const config=await menu(db,env);
 if(!config.shopEnabled)return fail('ร้านยังไม่เปิดรับออเดอร์ผ่านระบบใหม่',503);
 const redeemOnly=data.redeemOnly===true;
 const requestedPayment=redeemOnly?'points':(data.paymentMethod===undefined?'cash':data.paymentMethod);
 if(redeemOnly&&data.paymentMethod!=='points')return fail('ข้อมูลการแลกแต้มไม่ถูกต้อง กรุณาเริ่มจากหน้าแลกเมนู');
 if(!redeemOnly&&Number(data.pointsToUse||0)>0)return fail('แต้มใช้แลกเป็นเมนูได้จากหน้าแลกแต้ม กรุณาโหลดหน้าเว็บใหม่');
 if(!redeemOnly&&!['cash','qr'].includes(requestedPayment))return fail('กรุณาเลือกชำระเงินสดหรือสแกนจ่าย');
 if(!Array.isArray(data.items)||!data.items.length||data.items.length>35)return fail('จำนวนรายการไม่ถูกต้อง');
 if(!['pickup','delivery'].includes(data.fulfillment))return fail('วิธีรับอาหารไม่ถูกต้อง');
 const address=safe(data.deliveryAddress,500);
 if(data.fulfillment==='delivery'&&!address)return fail('โปรดระบุที่อยู่จัดส่ง');
 const stock=new Map(config.products.map(p=>[p.id,p])),validated=[];
 let subtotal=0;
 for(const raw of data.items){
  const p=stock.get(String(raw?.id)),qty=Number(raw?.qty);
  if(!p||!p.available||p.price<=0||!Number.isInteger(qty)||qty<1||qty>20)return fail('เมนูหรือจำนวนสินค้าไม่ถูกต้อง');
  const sweetness=safe(raw.sweetness,40),egg=safe(raw.egg,20);
  if(!validSweet.has(sweetness)||(sweetness&&!p.drink))return fail('ตัวเลือกความหวานไม่ถูกต้อง');
  const baseEggPrice=egg?eggPrice(egg):0,eggQty=raw.eggQty===undefined?(egg?1:0):raw.eggQty;
  if(baseEggPrice===null||(egg&&!eggEligibleCategories.has(p.category))||!Number.isInteger(eggQty)||eggQty<0||eggQty>5||(egg&&eggQty===0)||(!egg&&eggQty!==0))return fail('ตัวเลือกหรือจำนวนไข่ไม่ถูกต้อง');
  const extra=baseEggPrice*eggQty;
  const item={id:p.id,name:p.name,qty,price:p.price,egg,eggQty,sweetness,note:safe(raw.note,140),extra};
  const pair=extra===0?(p.id==='30'&&p.price===15?25:(p.id==='31'||p.id==='32')&&p.price===20?35:null):null;
  subtotal+=pair===null?(p.price+extra)*qty:Math.floor(qty/2)*pair+(qty%2)*p.price;
  validated.push(item);
 }
 if(subtotal<0||subtotal>200000)return fail('ยอดสั่งซื้อเกินกำหนด');
 const pointsUsed=redeemOnly?subtotal:0;
 const total=subtotal-pointsUsed,paymentSettings=await paymentConfig(db,env);
 const paymentMethod=redeemOnly?'points':requestedPayment,storedPaymentMethod=redeemOnly?'cash':requestedPayment;
 if(total>0&&paymentMethod==='qr'&&!paymentSettings.qrEnabled)return fail('ยังไม่เปิดสแกนจ่าย กรุณาเลือกเงินสด',409);
 const id=crypto.randomUUID(),name=safe(s.name||'สมาชิก LINE',80),note=safe(data.note,300);
 const orderInsert=db.prepare('INSERT INTO orders(id,request_key,line_user_id,display_name,fulfillment,delivery_address,note,total,points_used,status,payment_method,payment_status) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ?=0 OR COALESCE((SELECT points FROM members WHERE line_user_id=?),0)>=?')
  .bind(id,requestKey,s.sub,name,data.fulfillment,address,note,total,pointsUsed,'pending',storedPaymentMethod,total===0?'verified':'unpaid',pointsUsed,s.sub,pointsUsed);
 const steps=[
  orderInsert,
  db.prepare("INSERT OR IGNORE INTO points_adjustments(source_key,line_user_id,delta,reason) SELECT 'order-points:'||id,line_user_id,-points_used,'order-redemption' FROM orders WHERE id=? AND points_used>0").bind(id),
  refreshPoints(db,s.sub),
  ...validated.map(i=>db.prepare('INSERT INTO order_items(id,order_id,catalog_id,name,unit_price,egg_price,qty,sweetness,egg,egg_qty,note) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=?)').bind(crypto.randomUUID(),id,i.id,i.name,i.price,i.extra,i.qty,i.sweetness,i.egg,i.eggQty,i.note,id))
 ];
 try{await db.batch(steps)}catch(e){
  const old=await db.prepare('SELECT id,total,points_used,payment_method FROM orders WHERE line_user_id=? AND request_key=?').bind(s.sub,requestKey).first();
  if(old)return json({orderId:old.id,total:old.total,pointsUsed:Number(old.points_used||0),paymentMethod:old.payment_method,reused:true});
  if(pointsUsed){
   const current=await db.prepare('SELECT points FROM members WHERE line_user_id=?').bind(s.sub).first();
   if(Number(current?.points||0)<pointsUsed)return fail('แต้มคงเหลือไม่พอ กรุณาอัปเดตยอดแล้วลองใหม่',409);
  }
  throw e;
 }
 const created=await db.prepare('SELECT id,total,points_used,payment_method FROM orders WHERE id=?').bind(id).first();
 if(!created)return fail('แต้มคงเหลือไม่พอ กรุณาอัปเดตยอดแล้วลองใหม่',409);
 const balance=await db.prepare('SELECT points FROM members WHERE line_user_id=?').bind(s.sub).first();
 let alertOk=false;
 try{
  const lines=validated.map(i=>i.qty+'× '+i.name+(i.sweetness?' ('+i.sweetness+')':'')+(i.egg?' +'+eggNames[i.egg]+' '+i.eggQty+' ฟอง/จาน (+'+i.extra+' บาท/จาน)':'')+(i.note?' | '+i.note:''));
  const msg=['มีออเดอร์ใหม่ #'+id.slice(0,8),
   ...(redeemOnly?['ประเภท: แลกแต้มเป็นเมนู']:[]),
   'ลูกค้า: '+name,...(redeemOnly?[]:['ยอดชำระ: '+total+' บาท']),
   ...(pointsUsed?['ใช้แลกเมนู: '+pointsUsed+' แต้ม · ไม่ต้องรับเงิน']:[]),
   'ชำระเงิน: '+(paymentMethod==='points'?'แลกแต้ม · ไม่ต้องรับเงิน':paymentMethod==='qr'?'สแกน QR · รอตรวจสลิปใน LINE OA':'เงินสด · รอรับเงินจริง'),
   'วิธีรับ: '+(data.fulfillment==='delivery'?'จัดส่ง':'รับที่ร้าน'),
   ...(data.fulfillment==='delivery'?['ที่อยู่: '+address]:[]),
   ...(data.note?['หมายเหตุ: '+note]:[]),...lines].join('\n').slice(0,4350)+
   '\n\n📲 กดรับ / จัดการออเดอร์นี้:\nhttps://chongpan-ordering-v2.pages.dev/admin/?order='+encodeURIComponent(id);
  const recipients=await adminLineUserIds(db,env);
  const results=await Promise.all(recipients.map(async to=>{
   try{
    const push=await fetch('https://api.line.me/v2/bot/message/push',{
     method:'POST',headers:{Authorization:'Bearer '+env.LINE_MESSAGING_ACCESS_TOKEN,'Content-Type':'application/json'},
     body:JSON.stringify({to,messages:[{type:'text',text:msg}]}),signal:AbortSignal.timeout(8000)
    });
    return push.ok;
   }catch{return false}
  }));
  alertOk=recipients.length>0&&results.every(Boolean);
 }catch{/* Order is saved even if a LINE notification fails. */}
 await db.prepare('INSERT INTO order_notifications(order_id,delivered) VALUES(?,?)').bind(id,alertOk?1:0).run();
 if(!alertOk){
  await db.prepare("UPDATE shop_settings SET value='0' WHERE key='shop_enabled'").run();
  return json({orderId:id,total,pointsUsed,pointsRemaining:Number(balance?.points||0),paymentMethod,ownerAlertOk:false,shopAutoPaused:true},201);
 }
 return json({orderId:id,total,pointsUsed,pointsRemaining:Number(balance?.points||0),paymentMethod,ownerAlertOk:true},201);
}
function refreshPoints(db,userId){return db.prepare(`UPDATE members SET points =
  (SELECT COALESCE(SUM(delta),0) FROM points_ledger WHERE line_user_id=?) +
  (SELECT COALESCE(SUM(delta),0) FROM points_adjustments WHERE line_user_id=?),
  updated_at=CURRENT_TIMESTAMP WHERE line_user_id=?`).bind(userId,userId,userId)}
async function listAdminMembers(db){
 const r=await db.prepare('SELECT line_user_id,display_name,points FROM members ORDER BY points DESC,display_name').all();
 return json({members:(r.results||[]).map(m=>({...m,points:Number(m.points||0)}))});
}
async function adminRoster(db,env){
 const root=await db.prepare('SELECT line_user_id,display_name FROM members WHERE line_user_id=?').bind(env.OWNER_LINE_USER_ID||'').first();
 const extra=(await db.prepare('SELECT a.line_user_id,m.display_name,a.created_at FROM shop_admins a LEFT JOIN members m ON m.line_user_id=a.line_user_id ORDER BY a.created_at,a.line_user_id').all()).results||[];
 const admins=[...(env.OWNER_LINE_USER_ID?[{line_user_id:env.OWNER_LINE_USER_ID,display_name:root?.display_name||'เจ้าของร้าน',primary:true}]:[]),...extra.map(a=>({...a,display_name:a.display_name||'สมาชิก LINE',primary:false}))];
 const excluded=[...new Set([env.OWNER_LINE_USER_ID,...extra.map(a=>a.line_user_id)].filter(Boolean))];
 const members=excluded.length
  ?(await db.prepare('SELECT line_user_id,display_name FROM members WHERE line_user_id NOT IN ('+excluded.map(()=>'?').join(',')+') ORDER BY display_name').bind(...excluded).all()).results||[]
  :(await db.prepare('SELECT line_user_id,display_name FROM members ORDER BY display_name').all()).results||[];
 return json({admins,members,limit:25,canAdd:extra.length<25});
}
async function addAdmin(req,db,sessionData,env){
 const d=await body(req),id=text(d.lineUserId);
 if(!/^U[a-f0-9]{32}$/i.test(id))return fail('LINE User ID ไม่ถูกต้อง',400);
 if(id===env.OWNER_LINE_USER_ID)return json({ok:true,alreadyPrimary:true});
 const member=await db.prepare('SELECT line_user_id FROM members WHERE line_user_id=?').bind(id).first();
 if(!member)return fail('ยังไม่พบสมาชิกนี้ ให้แอดมินคนนั้นเข้าสู่ระบบ LINE ในหน้าเมนูสั่งอาหารก่อน',404);
 const current=await db.prepare('SELECT line_user_id FROM shop_admins WHERE line_user_id=?').bind(id).first();
 if(current)return json({ok:true,alreadyAdmin:true});
 const count=await db.prepare('SELECT COUNT(*) AS total FROM shop_admins').first();
 if(Number(count?.total||0)>=25)return fail('เพิ่มแอดมินได้สูงสุด 25 คน ไม่นับเจ้าของร้าน',409);
 await db.prepare('INSERT INTO shop_admins(line_user_id,added_by) VALUES(?,?)').bind(id,sessionData.sub).run();
 return json({ok:true});
}
async function removeAdmin(req,db,env){
 const d=await body(req),id=text(d.lineUserId);
 if(!/^U[a-f0-9]{32}$/i.test(id)||id===env.OWNER_LINE_USER_ID)return fail('ระบุบัญชีแอดมินที่ต้องการนำออกให้ถูกต้อง',400);
 await db.prepare('DELETE FROM shop_admins WHERE line_user_id=?').bind(id).run();
 return json({ok:true});
}
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
async function updateOrder(req,db){const d=await body(req);if(typeof d.id!=='string'||!validStatus.has(d.status))return fail('ข้อมูลสถานะไม่ถูกต้อง');const o=await db.prepare('SELECT id,status,line_user_id,total,payment_method,payment_status FROM orders WHERE id=?').bind(d.id).first();if(!o)return fail('ไม่พบออเดอร์',404);if(o.status==='completed'||o.status==='cancelled')return fail('ออเดอร์ถูกปิดแล้ว',409);const allowed={pending:['accepted','cancelled'],accepted:['preparing','cancelled'],preparing:['ready','cancelled'],ready:['completed','cancelled']};if(!allowed[o.status]?.includes(d.status))return fail('ลำดับสถานะไม่ถูกต้อง',409);if(d.status==='accepted'&&o.payment_method==='qr'&&o.payment_status!=='verified')return fail('ตรวจสลิปและยืนยันยอดเงินจริงก่อนรับออเดอร์',409);if(d.status==='completed'&&o.payment_method==='qr'&&o.payment_status!=='verified')return fail('สแกนจ่ายยังไม่ผ่านการตรวจสลิป/การรับเงินจริง',409);if(d.status==='completed'){const pts=Math.floor(o.total/25);const id=crypto.randomUUID();const steps=[db.prepare("UPDATE orders SET status='completed',completed_at=CURRENT_TIMESTAMP,payment_status=CASE WHEN payment_method='cash' AND total>0 THEN 'verified' ELSE payment_status END WHERE id=? AND status='ready'").bind(o.id)];if(pts>0)steps.push(db.prepare('INSERT OR IGNORE INTO points_ledger(id,order_id,line_user_id,delta) VALUES(?,?,?,?)').bind(id,o.id,o.line_user_id,pts));steps.push(refreshPoints(db,o.line_user_id));await db.batch(steps);return json({ok:true,pointsAdded:pts})}if(d.status==='cancelled'){
 await db.batch([
  db.prepare('UPDATE orders SET status=? WHERE id=? AND status=?').bind(d.status,o.id,o.status),
  db.prepare("INSERT OR IGNORE INTO points_adjustments(source_key,line_user_id,delta,reason) SELECT 'order-points-refund:'||id,line_user_id,points_used,'order-redemption-refund' FROM orders WHERE id=? AND status='cancelled' AND points_used>0").bind(o.id),
  refreshPoints(db,o.line_user_id)
 ]);
 const refund=await db.prepare("SELECT delta FROM points_adjustments WHERE source_key=?").bind('order-points-refund:'+o.id).first();
 return json({ok:true,pointsRefunded:Number(refund?.delta||0)});
 }
 await db.prepare('UPDATE orders SET status=? WHERE id=? AND status=?').bind(d.status,o.id,o.status).run();return json({ok:true})}
const validMenuImage=s=>s===''||/^\/assets\/products\/[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp)$/i.test(s)||/^data:image\/(?:webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(s);
async function listAdminMenu(db,canEditImages=false){
 const r=await db.prepare("SELECT c.id,c.name,c.category,c.price,c.image,c.available,c.drink,COALESCE(pr.verified,0) AS verified,pr.source FROM catalog c LEFT JOIN catalog_price_reviews pr ON pr.product_id=c.id ORDER BY c.sort_order,c.id").all();
 const products=r.results||[];
 return json({products,pending:products.filter(p=>!p.verified).length,draft:products.filter(p=>p.price<=0).length,missingImages:products.filter(p=>!p.image).length,canEditImages});
}
async function updateMenu(req,db,s,env){
 const d=await body(req,75000);
 const hasImage=Object.prototype.hasOwnProperty.call(d,'image');
 if(typeof d.id!=='string'||!Number.isInteger(d.price)||d.price<0||d.price>100000||typeof d.available!=='boolean'||(d.verified!==undefined&&typeof d.verified!=='boolean'))return fail('ข้อมูลสินค้าไม่ถูกต้อง');
 if(d.available&&d.price<=0)return fail('ต้องกำหนดราคาก่อนเปิดขาย',400);
 if(hasImage&&(!primaryOwner(s,env)))return fail('เฉพาะเจ้าของร้านเท่านั้นที่เพิ่มหรือแก้รูปเมนูได้',403);
 if(hasImage&&(typeof d.image!=='string'||d.image.length>64000||!validMenuImage(d.image)))return fail('ไฟล์รูปไม่ถูกต้อง หรือมีขนาดใหญ่เกินไป กรุณาเลือกรูป JPG/PNG/WebP ใหม่',400);
 const prev=await db.prepare('SELECT price FROM catalog WHERE id=?').bind(d.id).first();
 if(!prev)return fail('ไม่พบเมนู',404);
 // A price edit revokes previous verification unless explicitly reapproved.
 const verified=d.verified===true?1:d.verified===false?0:(prev.price===d.price?null:0);
 const steps=[db.prepare('UPDATE catalog SET price=?,available=?,image=COALESCE(?,image),updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(d.price,d.available?1:0,hasImage?d.image:null,d.id)];
 if(verified!==null)steps.push(db.prepare("INSERT INTO catalog_price_reviews(product_id,source,verified,reviewed_at) VALUES(?,'owner-review',?,CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END) ON CONFLICT(product_id) DO UPDATE SET source='owner-review',verified=excluded.verified,reviewed_at=excluded.reviewed_at").bind(d.id,verified,verified));
 await db.batch(steps);
 return json({ok:true,verified:verified===null?undefined:!!verified,imageUpdated:hasImage});
}
async function testOwnerLinePush(env,db){
 if(!env.LINE_MESSAGING_ACCESS_TOKEN||!env.OWNER_LINE_USER_ID)return fail('ยังไม่ได้ตั้งค่า LINE Messaging API หรือบัญชีผู้รับ',409);
 const recipients=await adminLineUserIds(db,env);
 const now=new Date().toLocaleString('th-TH',{timeZone:'Asia/Bangkok'});
 const message='ทดสอบระบบแจ้งออเดอร์ร้านชง&ปั่น\n'+now+'\nข้อความนี้เป็นการทดสอบ ไม่ใช่ออเดอร์จริง';
 const results=await Promise.all(recipients.map(async to=>{
  try{return (await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{Authorization:'Bearer '+env.LINE_MESSAGING_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({to,messages:[{type:'text',text:message}]}),signal:AbortSignal.timeout(8000)})).ok}catch{return false}
 }));
 const sent=results.filter(Boolean).length;
 if(sent!==recipients.length)return fail('LINE รับข้อความทดสอบ '+sent+' จาก '+recipients.length+' บัญชี กรุณาตรวจว่าทุกแอดมินเพิ่มเพื่อน LINE OA แล้ว',502);
 return json({ok:true,acceptedByLine:true,confirmOnPhone:true,recipients:sent});
}
async function setShop(req,env,db){
 const d=await body(req);
 if(typeof d.enabled!=='boolean')return fail('กรุณาระบุสถานะเปิดร้าน');
 if(!d.enabled){
  await db.prepare("UPDATE shop_settings SET value='0' WHERE key='shop_enabled'").run();
  return json({ok:true,shopEnabled:false});
 }
 if(d.ownerConfirmed!==true)return fail('เจ้าของร้านต้องยืนยันการทดสอบระบบก่อนเปิดขาย',400);
 const st=await readiness(db,env);
 const blocked=st.checks.filter(x=>x.id!=='shop_database'&&!x.ok);
 if(blocked.length)return fail('ยังเปิดร้านไม่ได้: '+blocked.map(x=>x.label).join(', '),409);
 await db.prepare("UPDATE shop_settings SET value='1' WHERE key='shop_enabled'").run();
 return json({ok:true,shopEnabled:(await readiness(db,env)).ordersEnabled});
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
export async function onRequest({request,env,waitUntil}){const path=new URL(request.url).pathname.replace(/^\/api\/?/,'');const method=request.method.toUpperCase();const db=env.DB;if(!db)return fail('ยังไม่ได้ผูกฐานข้อมูล D1',503);if(!['GET','HEAD'].includes(method)){const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return fail('Origin ไม่ได้รับอนุญาต',403)}try{if(path==='health'&&method==='GET')return json({ok:true,service:'chongpan-ordering-v2',ordersEnabled:(await menu(db,env)).shopEnabled,db:true});if(path==='menu'&&method==='GET')return json(await menu(db,env));if(path==='loyalty/info'&&method==='GET')return json({liffId:env.LIFF_ID||'',policy:{bahtPerPoint:25,awardWhen:'completed',fractionalCarry:false}});if(path==='payment/config'&&method==='GET')return json(await paymentConfig(db,env));if(path==='auth/line'&&method==='POST')return authLine(request,env,db);if(path==='auth/logout'&&method==='POST')return json({ok:true},200,{'Set-Cookie':'chongpan_sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});const s=await session(request,env);if(path==='points'&&method==='GET'){if(!s)return fail('กรุณาเข้าสู่ LINE เพื่อดูแต้มสมาชิก',401);return pointHistory(db,s)}if(path==='me'&&method==='GET'){if(!s)return json({member:null});const m=await db.prepare('SELECT display_name,points FROM members WHERE line_user_id=?').bind(s.sub).first();return json({member:{name:m?.display_name||s.name,points:m?.points||0,isOwner:await isAdmin(s,env,db),isPrimaryOwner:primaryOwner(s,env)}})}if(path==='orders'&&method==='GET'){if(!s)return fail('กรุณาเข้าสู่ LINE',401);return json({orders:await getOrders(db,'WHERE line_user_id=?',[s.sub])})}if(path==='orders'&&method==='POST')return createOrder(request,env,db,s);if(path.startsWith('admin/')){if(!await isAdmin(s,env,db))return fail('เฉพาะผู้ดูแลร้าน',403);if(path==='admin/admins'){if(!primaryOwner(s,env))return fail('เฉพาะเจ้าของร้านเท่านั้นที่จัดการสิทธิ์แอดมินได้',403);if(method==='GET')return adminRoster(db,env);if(method==='POST')return addAdmin(request,db,s,env);if(method==='DELETE')return removeAdmin(request,db,env)}if(path==='admin/loyverse'&&['GET','POST'].includes(method)){if(!primaryOwner(s,env))return fail('เฉพาะเจ้าของร้านที่ตั้งค่า Loyverse ได้',403);return loyverseSettings(request,env,db)}if(path==='admin/loyverse/sync'&&method==='POST')return loyverseSyncRoute(request,env,db);if(path==='admin/readiness'&&method==='GET')return json(await readiness(db,env));if(path==='admin/payment/config'&&method==='GET')return json(await paymentConfig(db,env));if(path==='admin/payment/config'&&method==='POST')return setPaymentConfig(request,db,env);if(path==='admin/orders/payment'&&method==='PATCH'){const copy=request.clone();const result=await confirmPayment(request,db);if(result.ok){const d=await copy.json();const task=syncLoyverse(db,env,d.id).catch(()=>{});if(waitUntil)waitUntil(task);else await task}return result;}if(path==='admin/line/test'&&method==='POST')return testOwnerLinePush(env,db);if(path==='admin/shop'&&method==='POST')return setShop(request,env,db);if(path==='admin/orders'&&method==='GET')return json({orders:await getOrders(db)});if(path==='admin/orders'&&method==='PATCH'){const copy=request.clone();const result=await updateOrder(request,db);if(result.ok){const d=await copy.json();if(d.status==='completed'){const task=syncLoyverse(db,env,d.id).catch(()=>{});if(waitUntil)waitUntil(task);else await task}}return result;}if(path==='admin/menu'&&method==='GET')return listAdminMenu(db,primaryOwner(s,env));if(path==='admin/menu'&&method==='PATCH')return updateMenu(request,db,s,env);if(path==='admin/menu'&&method==='POST')return createMenu(request,db);if(path==='admin/members'&&method==='GET')return listAdminMembers(db);if(path==='admin/legacy'&&method==='GET')return legacyList(db);if(path==='admin/legacy/assign'&&method==='POST')return assignLegacy(request,db,s)}return fail('ไม่พบ API',404)}catch(e){if(e instanceof Error&&['รูปแบบ JSON ไม่ถูกต้อง','คำขอใหญ่เกินกำหนด'].includes(e.message))return fail(e.message);return fail('ระบบมีปัญหาชั่วคราว',500)}}