const BASE='https://api.loyverse.com/v1.0/';
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(s);
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const setting=async(db,key)=>(await db.prepare('SELECT value FROM shop_settings WHERE key=?').bind(key).first())?.value;
const put=(db,key,value)=>db.prepare('INSERT INTO shop_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value).run();
async function cryptKey(env){if(!env.SESSION_SECRET)throw Error('ระบบยังไม่มีคีย์เข้ารหัส');return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('loyverse-token:'+env.SESSION_SECRET)),{name:'AES-GCM'},false,['encrypt','decrypt'])}
async function encrypt(value,env){const iv=crypto.getRandomValues(new Uint8Array(12));const out=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await cryptKey(env),new TextEncoder().encode(value)));return JSON.stringify({iv:Array.from(iv),data:Array.from(out)})}
async function tokenFor(db,env){if(env.LOYVERSE_ACCESS_TOKEN)return env.LOYVERSE_ACCESS_TOKEN;const raw=await setting(db,'loyverse_token_encrypted');if(!raw)return '';const v=JSON.parse(raw);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(v.iv)},await cryptKey(env),new Uint8Array(v.data)))}
async function api(token,path,body){
 const r=await fetch(BASE+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
 if(!r.ok){const e=Error(r.status===401||r.status===403?'สิทธิ์ Loyverse ไม่พร้อม กรุณาตรวจ Access Token และสิทธิ์ API':'Loyverse ตอบกลับ HTTP '+r.status);e.http=r.status;throw e}
 return r.json();
}
async function list(token,path,key){let rows=[],cursor='';for(let n=0;n<20;n++){const data=await api(token,path+'?limit=250'+(cursor?'&cursor='+encodeURIComponent(cursor):''));rows.push(...(data[key]||[]));cursor=data.cursor;if(!cursor)return rows.filter(x=>!x.deleted_at)}throw Error('รายการ Loyverse มีมากเกินขอบเขต กรุณาติดต่อผู้ดูแล')}
async function catalog(token){
 const [stores,payments,items,discounts]=await Promise.all([list(token,'stores','stores'),list(token,'payment_types','payment_types'),list(token,'items','items'),list(token,'discounts','discounts')]);
 const variants=items.flatMap(i=>(i.variants||[]).filter(v=>!v.deleted_at).map(v=>({id:v.variant_id||v.id,name:i.item_name,options:[v.option1_value,v.option2_value,v.option3_value].filter(Boolean).join(' / '),price:v.default_price,taxIds:i.tax_ids||[]})));
 return {stores:stores.map(s=>({id:s.id,name:s.name})),payments:payments.map(p=>({id:p.id,name:p.name,type:p.type})),variants,discounts:discounts.filter(d=>d.type==='VARIABLE_AMOUNT').map(d=>({id:d.id,name:d.name}))};
}
async function configFor(db){try{return JSON.parse(await setting(db,'loyverse_config')||'{}')}catch{return {}}}
const norm=s=>String(s||'').normalize('NFC').replace(/\s+/g,'').toLowerCase();
export async function loyverseSettings(req,env,db){
 try{
  if(req.method==='POST'){
   const d=await req.json();
   if(d.action==='connect'){
    if(typeof d.token!=='string'||d.token.length<10||d.token.length>4000)return response({error:'กรอก Access Token ให้ถูกต้อง'},400);
    const options=await catalog(d.token);await put(db,'loyverse_token_encrypted',await encrypt(d.token,env));
    // A different account must be configured explicitly before any automatic sales are sent.
    await put(db,'loyverse_config','{}');return response({ok:true,connected:true,options,config:{}});
   }
   const token=await tokenFor(db,env);if(!token)return response({error:'เชื่อม Access Token ก่อน'},409);
   const options=await catalog(token);const valid=new Set(options.variants.map(x=>x.id));
   if(!options.stores.some(x=>x.id===d.storeId)||!options.payments.some(x=>x.id===d.cashId&&x.type==='CASH')||(d.qrId&&!options.payments.some(x=>x.id===d.qrId))||(d.discountId&&!options.discounts.some(x=>x.id===d.discountId)))return response({error:'เลือกร้าน วิธีรับเงิน และส่วนลดให้ถูกต้อง'},400);
   const mappings=d.mappings;
   if(!mappings||typeof mappings!=='object'||Array.isArray(mappings)||Object.entries(mappings).some(([k,v])=>k.length>80||!uuid(v)||!valid.has(v)))return response({error:'คู่เมนูไม่ถูกต้อง'},400);
   const known=new Set(((await db.prepare('SELECT id FROM catalog').all()).results||[]).map(x=>x.id));
   if(Object.keys(mappings).some(k=>!known.has(k)))return response({error:'ไม่พบเมนูในเว็บ'},400);
   const config={enabled:d.enabled===true,storeId:d.storeId,cashId:d.cashId,qrId:d.qrId||'',discountId:d.discountId||'',mappings};
   await put(db,'loyverse_config',JSON.stringify(config));return response({ok:true,config});
  }
  const token=await tokenFor(db,env),config=await configFor(db);
  const products=(await db.prepare('SELECT id,name,category FROM catalog ORDER BY sort_order,id').all()).results||[];
  if(!token)return response({connected:false,config,products});
  const options=await catalog(token);const suggestions={};
  for(const p of products){const matches=options.variants.filter(v=>norm(v.name)===norm(p.name)&&!v.options);if(matches.length===1)suggestions[p.id]=matches[0].id}
  return response({connected:true,config,products,options,suggestions});
 }catch(e){return response({error:e.http?e.message:'เชื่อม Loyverse ไม่สำเร็จ กรุณาตรวจสิทธิ์หรือทดลองใหม่'},502)}
}
export function buildReceipt(order,items,config){
 if(order.status!=='completed'||order.payment_status!=='verified'||Number(order.total)<=0||Number(order.points_used)>0)throw Error('ส่งได้เฉพาะออเดอร์เงินที่ส่งมอบและยืนยันรับเงินแล้ว');
 const payment=order.payment_method==='cash'?config.cashId:order.payment_method==='qr'?config.qrId:null;
 if(!uuid(config.storeId)||!uuid(payment))throw Error('ยังไม่ได้จับคู่ร้านหรือวิธีรับเงิน');
 const lines=[];
 for(const i of items){
  const variant=config.mappings?.[i.catalog_id];if(!uuid(variant))throw Error('ยังไม่จับคู่เมนู '+i.name);
  lines.push({variant_id:variant,quantity:i.qty,price:i.unit_price,line_taxes:[],line_discounts:[],line_modifiers:[],line_note:[i.sweetness,i.note].filter(Boolean).join(' · ')});
  if(i.egg){const egg=config.eggMappings?.[i.egg];if(!uuid(egg))throw Error('ยังไม่จับคู่ไข่เพิ่มเติม');lines.push({variant_id:egg,quantity:i.qty*(i.egg_qty||1),price:i.egg_price/(i.egg_qty||1),line_taxes:[],line_discounts:[],line_modifiers:[]})}
 }
 const subtotal=lines.reduce((n,l)=>n+l.quantity*l.price,0),discount=subtotal-Number(order.total);
 if(discount<0||!Number.isFinite(discount)||!lines.length)throw Error('ยอดรายการไม่ตรงกับยอดออเดอร์');
 if(discount>0&&!uuid(config.discountId))throw Error('ออเดอร์มีส่วนลด ต้องจับคู่ส่วนลดจำนวนเงินก่อน');
 const date=new Date(String(order.completed_at||order.created_at).replace(' ','T')+(String(order.completed_at||order.created_at).endsWith('Z')?'':'Z')).toISOString();
 return {store_id:config.storeId,order:'CHONGPAN-'+order.id,source:'ChongPan LINE',receipt_date:date,note:'ออเดอร์เว็บ #'+order.id+' · '+(order.fulfillment==='delivery'?'จัดส่ง':'รับที่ร้าน'),line_items:lines,...(discount>0?{total_discounts:[{id:config.discountId,scope:'RECEIPT',money_amount:discount}]}:{}),payments:[{payment_type_id:payment,money_amount:Number(order.total),paid_at:date}]};
}
export async function syncLoyverse(db,env,id){
 const order=await db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
 if(!order||order.status!=='completed'||order.payment_status!=='verified'||Number(order.total)<=0||Number(order.points_used)>0)return {status:'ineligible'};
 await db.prepare('INSERT OR IGNORE INTO loyverse_sync(order_id) VALUES(?)').bind(id).run();
 const saved=await db.prepare('SELECT * FROM loyverse_sync WHERE order_id=?').bind(id).first();if(saved.status==='synced'||saved.status==='review')return saved;
 const config=await configFor(db);
 const update=async(status,message='',number='')=>{await db.prepare('UPDATE loyverse_sync SET status=?,message=?,receipt_number=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=?').bind(status,message,number,id).run();return {status,message,receipt_number:number}};
 let token;try{token=await tokenFor(db,env)}catch{return update('blocked','อ่านข้อมูลเชื่อมต่อไม่ได้ กรุณาเชื่อมใหม่')}
 if(!token||!config.enabled){if(['sending','unknown','preparing'].includes(saved.status))return saved;return update('blocked','รอเชื่อมต่อและเปิดใช้งาน Loyverse')}
 // An unresolved POST can only be reconciled by looking up its stable external order reference.
 if(['sending','unknown','preparing'].includes(saved.status)){
  try{const found=(await api(token,'receipts?order='+encodeURIComponent('CHONGPAN-'+id)+'&store_id='+encodeURIComponent(config.storeId)+'&limit=250')).receipts||[];
   const matches=found.filter(x=>x.order==='CHONGPAN-'+id&&x.store_id===config.storeId);
   if(matches.length===1&&Math.abs(Number(matches[0].total_money)-Number(order.total))<0.01)return update('synced','',matches[0].receipt_number);
   return {status:'unknown',message:'ยังยืนยันผลไม่ได้ ตรวจใบเสร็จใน Loyverse ก่อน ห้ามส่งซ้ำ'};
  }catch{return {status:'unknown',message:'ตรวจใบเสร็จใน Loyverse ไม่สำเร็จ ยังไม่ส่งซ้ำ'}}
 }
 let attempted=false;
 const claim=await db.prepare("UPDATE loyverse_sync SET status='preparing',message='',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status IN ('pending','blocked','error')").bind(id).run();
 if(!claim.meta?.changes)return {status:'busy'};
 try{
  const rows=(await db.prepare('SELECT * FROM order_items WHERE order_id=?').bind(id).all()).results||[];
  const eggs=(await db.prepare("SELECT id,name FROM catalog WHERE name IN ('ไข่ดาว','ไข่เจียว','ไข่ข้น')").all()).results||[];
  config.eggMappings=Object.fromEntries(['fried','omelet','creamy'].map((k,n)=>[k,config.mappings?.[eggs.find(x=>x.name===['ไข่ดาว','ไข่เจียว','ไข่ข้น'][n])?.id]]));
  const payload=buildReceipt(order,rows,config);
  const existing=(await api(token,'receipts?order='+encodeURIComponent(payload.order)+'&store_id='+encodeURIComponent(config.storeId)+'&limit=250')).receipts||[];
  const matches=existing.filter(x=>x.order===payload.order&&x.store_id===config.storeId);
  if(matches.length){if(matches.length===1&&Math.abs(Number(matches[0].total_money)-Number(order.total))<0.01)return update('synced','',matches[0].receipt_number);return update('review','พบใบเสร็จซ้ำหรือยอดไม่ตรง กรุณาตรวจ Loyverse')}
  await update('sending','กำลังส่ง กรุณาอย่าบันทึกยอดซ้ำใน POS');
  let receipt;
  attempted=true;
  try{receipt=await api(token,'receipts',payload)}catch(e){return update(e.http&&e.http>=400&&e.http<500&&e.http!==408?'error':'unknown',e.http?e.message:'ยังยืนยันผลไม่ได้ กรุณาตรวจใบเสร็จใน Loyverse ก่อนส่งซ้ำ')}
  if(!receipt.receipt_number||Math.abs(Number(receipt.total_money)-Number(order.total))>=0.01)return update('review','ใบเสร็จตอบกลับไม่ครบหรือยอดไม่ตรง กรุณาตรวจ Loyverse',receipt.receipt_number||'');
  return await update('synced','',receipt.receipt_number);
 }catch(e){if(attempted)return update('unknown','ส่งคำขอแล้ว แต่ยังยืนยันการบันทึกไม่ได้ กรุณาตรวจ Loyverse ก่อน');return update('blocked',e.http?e.message:(e.message?.startsWith('ยัง')||e.message?.startsWith('ออเดอร์')||e.message?.startsWith('ยอด')||e.message?.startsWith('ส่งได้')?e.message:'เตรียมยอดขายไม่สำเร็จ กรุณาตรวจการเชื่อมต่อ'))}
}
export async function loyverseSyncRoute(req,env,db){let d;try{d=await req.json()}catch{return response({error:'ข้อมูลไม่ถูกต้อง'},400)}if(typeof d.id!=='string')return response({error:'ระบุออเดอร์'},400);return response(await syncLoyverse(db,env,d.id))}
