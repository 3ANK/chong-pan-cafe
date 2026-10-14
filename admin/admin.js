/* Dedicated owner-only dashboard: every private API checks LINE identity on server. */
'use strict';
const $=id=>document.getElementById(id);
const escapeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>'฿'+Number(n||0).toLocaleString('th-TH');
const statuses={pending:'รอร้านรับ',accepted:'ร้านรับแล้ว',preparing:'กำลังทำ',ready:'พร้อมรับ/ส่ง',completed:'ส่งมอบแล้ว',cancelled:'ยกเลิก'};
const nextStatuses={pending:['accepted','cancelled'],accepted:['preparing','ready','cancelled'],preparing:['ready','cancelled'],ready:['completed','cancelled']};
async function request(path,options={}){
 const r=await fetch('/api/'+path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});
 const d=await r.json();if(!r.ok)throw Error(d.error||'เกิดข้อผิดพลาด');return d;
}
function loginStatus(s,retry=false){$('adminLoginStatus').textContent=s;$('adminLoginRetry').hidden=!retry}
function allowed(m){
 $('adminLogin').hidden=true;$('adminPrivate').hidden=false;
 $('ownerHello').textContent='เข้าสู่ระบบหลังบ้านแล้ว · '+(m.name||'เจ้าของร้าน');
 loadOrders();loadPaymentSettings();checkReadiness();
}
async function initAdmin(userInitiated=false){
 try{
  const {member}=await request('me');
  if(member?.isOwner){allowed(member);return}
  if(member&&!member.isOwner){loginStatus('บัญชีนี้ไม่มีสิทธิ์เข้าหลังบ้าน กรุณาใช้ LINE ของเจ้าของร้าน',false);return}
  if(!window.liff)throw Error('โหลด LINE Login ไม่สำเร็จ');
  const info=await request('loyalty/info');
  await liff.init({liffId:info.liffId});
  if(!liff.isLoggedIn()){
   loginStatus('กำลังเปิด LINE เพื่อยืนยันตัวตน…');
   if(!userInitiated&&new URL(location).searchParams.has('liff.state'))throw Error('LINE ยังไม่เชื่อมต่อ กรุณากดลองใหม่');
   liff.login({redirectUri:location.origin+'/admin/'});
   return;
  }
  const token=liff.getIDToken();if(!token)throw Error('ไม่ได้รับ LINE ID Token');
  await request('auth/line',{method:'POST',body:JSON.stringify({idToken:token})});
  const next=await request('me');
  if(!next.member?.isOwner)throw Error('บัญชี LINE นี้ไม่มีสิทธิ์จัดการร้าน');
  allowed(next.member);
 }catch(e){loginStatus(e.message,true)}
}
function paymentText(o){
 const method={cash:'เงินสด',qr:'สแกนจ่าย',legacy:'ออเดอร์ก่อนเพิ่มวิธีชำระเงิน'}[o.payment_method]||'ไม่ทราบวิธีจ่าย';
 const verified=o.payment_status==='verified';
 return method+' · '+(verified?'ร้านยืนยันรับเงินจริงแล้ว':o.payment_method==='qr'?'รอตรวจสลิปและยอดรับเงิน':'ยังไม่ได้ยืนยันรับเงิน');
}
function orderCard(o){
 const items=(o.items||[]).map(i=>escapeText(i.name)+' ×'+Number(i.qty)).join(' · ');
 const options=(nextStatuses[o.status]||[]).map(s=>'<button class="secondary" type="button" data-status="'+s+'" data-order="'+escapeText(o.id)+'">'+escapeText(statuses[s]||s)+'</button>').join('');
 const payButton=o.payment_status!=='verified'&&o.status!=='cancelled'?
 '<button type="button" class="primary payment-verify" data-confirm-pay="'+escapeText(o.id)+'">ยืนยันว่าได้รับเงินจริงแล้ว</button>':'';
 return '<article class="ordercard"><div class="adminrow"><strong>ออเดอร์ #'+escapeText(o.id.slice(0,8).toUpperCase())+'</strong><span class="tag">'+escapeText(statuses[o.status]||o.status)+'</span></div>'+
 '<div class="admin-order-details"><p>'+items+'</p><p><strong>'+fmt(o.total)+'</strong> · '+(o.fulfillment==='delivery'?'จัดส่ง':'รับที่ร้าน')+'</p>'+
 '<p>ลูกค้า: '+escapeText(o.display_name||'')+' · '+escapeText(o.delivery_address||'')+'</p>'+
 '<p>หมายเหตุ: '+escapeText(o.note||'ไม่มี')+'</p></div>'+
 '<div class="payment-chip '+(o.payment_status==='verified'?'success':'warning')+'">'+escapeText(paymentText(o))+'</div>'+
 '<div>'+payButton+'</div><div class="inline">'+options+'</div></article>';
}
async function loadOrders(){
 const el=$('adminContent');el.textContent='กำลังโหลดออเดอร์…';
 try{const orders=(await request('admin/orders')).orders;el.innerHTML=orders.length?orders.map(orderCard).join(''):'<p class="empty">ยังไม่มีออเดอร์</p>'}
 catch(e){el.textContent=e.message}
}
$('adminContent').addEventListener('click',async e=>{
 const b=e.target.closest('[data-confirm-pay], [data-status]');if(!b)return;
 const id=b.dataset.confirmPay||b.dataset.order;
 if(b.dataset.confirmPay){
  if(!confirm('คุณตรวจสอบสลิปใน LINE OA และตรวจยอดเงินจริงเข้าร้านแล้วใช่หรือไม่? ห้ามกดยืนยันจากภาพสลิปอย่างเดียวหากยอดไม่เข้า'))return;
  b.disabled=true;
  try{await request('admin/orders/payment',{method:'PATCH',body:JSON.stringify({id,confirmed:true})});await loadOrders()}catch(err){alert(err.message);b.disabled=false}
 }else{
  const status=b.dataset.status;
  if(status==='cancelled'&&!confirm('ยืนยันยกเลิกออเดอร์นี้?'))return;
  b.disabled=true;
  try{await request('admin/orders',{method:'PATCH',body:JSON.stringify({id,status})});await loadOrders()}catch(err){alert(err.message);b.disabled=false}
 }
});
async function checkReadiness(){
 const el=$('readinessReport');el.hidden=false;el.textContent='กำลังตรวจ…';
 try{const r=await request('admin/readiness');el.innerHTML='<strong>'+(r.ordersEnabled?'กำลังเปิดรับออเดอร์':'ยังไม่เปิดรับออเดอร์')+'</strong><p>เมนู '+r.catalog.total+' รายการ · รอยืนยันราคา '+r.catalog.unverified+'</p><ul>'+r.checks.map(x=>'<li>'+escapeText(x.label)+' — '+(x.ok?'พร้อม ✓':'ยังไม่พร้อม')+'</li>').join('')+'</ul>'}
 catch(e){el.textContent=e.message}
}
$('refreshAdmin').addEventListener('click',loadOrders);
$('checkReadiness').addEventListener('click',checkReadiness);
$('manageCatalog').addEventListener('click',()=>window.openChongpanCatalog?.());
$('testLineAlert').addEventListener('click',async()=>{
 if(!confirm('ส่งข้อความทดสอบไปยัง LINE เจ้าของร้าน?'))return;
 try{const r=await request('admin/line/test',{method:'POST',body:'{}'});if(r.acceptedByLine)alert('LINE รับคำขอแล้ว ตรวจมือถือเจ้าของร้านอีกครั้ง')}catch(e){alert(e.message)}
});
$('toggleShop').addEventListener('click',async()=>{
 try{
  const s=await request('admin/readiness');
  const on=!!s.checks.find(x=>x.id==='shop_database')?.ok;
  if(on){if(!confirm('ปิดรับออเดอร์ระบบใหม่ทันที?'))return;await request('admin/shop',{method:'POST',body:JSON.stringify({enabled:false})})}
  else{if(s.checks.filter(x=>x.id!=='shop_database'&&!x.ok).length){await checkReadiness();alert('ยังไม่ผ่านเงื่อนไขเปิดรับออเดอร์');return}if(!confirm('เปิดรับออเดอร์ใหม่จริง และยืนยันว่าทดสอบแล้ว?'))return;await request('admin/shop',{method:'POST',body:JSON.stringify({enabled:true,ownerConfirmed:true})})}
  await checkReadiness();
 }catch(e){alert(e.message)}
});
$('manageLegacy').addEventListener('click',async()=>{
 const panel=$('legacyPanel');panel.hidden=!panel.hidden;if(panel.hidden)return;
 const el=$('legacyContent');el.textContent='กำลังโหลดสมาชิกเก่า…';
 try{
  const {legacy,members}=await request('admin/legacy');
  const options='<option value="">เลือกสมาชิก LINE ที่ตรวจสอบตัวตนแล้ว</option>'+members.map(m=>'<option value="'+escapeText(m.line_user_id)+'">'+escapeText(m.display_name)+' · '+Number(m.points)+' แต้ม</option>').join('');
  el.innerHTML=legacy.map(a=>'<div class="ordercard"><strong>'+escapeText(a.display_name)+' · '+Number(a.snapshot_points)+' แต้ม</strong><p>รหัสเก่า #'+escapeText(a.legacy_code)+'</p>'+(a.claimed_line_user_id?'<p>โอนแล้ว ✓</p>':'<select data-old="'+escapeText(a.legacy_code)+'">'+options+'</select><button type="button" class="secondary" data-legacy="'+escapeText(a.legacy_code)+'">ยืนยันโอนแต้ม</button>')+'</div>').join('');
  el.querySelectorAll('[data-legacy]').forEach(b=>b.addEventListener('click',async()=>{
   const code=b.dataset.legacy,id=el.querySelector('[data-old="'+code+'"]')?.value;
   if(!id)return alert('เลือกบัญชี LINE ก่อน');
   if(!confirm('ยืนยันว่าตรวจสอบตัวตนลูกค้าและบัญชี LINE แล้ว? การโอนแต้มทำได้ครั้งเดียว'))return;
   b.disabled=true;
   try{await request('admin/legacy/assign',{method:'POST',body:JSON.stringify({legacyCode:code,lineUserId:id,ownerVerified:true})});panel.hidden=true;$('manageLegacy').click()}catch(e){alert(e.message);b.disabled=false}
  }));
 }catch(e){el.textContent=e.message}
});
async function loadPaymentSettings(){
 try{const s=await request('admin/payment/config');$('oaId').value=s.oaId||'';$('qrPath').value=s.qrImage||'';
 $('paymentSettingsStatus').textContent=s.qrEnabled?'สแกนจ่ายเปิดใช้งานแล้ว':'สแกนจ่ายยังไม่พร้อม (เงินสดใช้งานได้)';
 }catch(e){$('paymentSettingsStatus').textContent=e.message}
}
$('paymentSettingsForm').addEventListener('submit',async e=>{
 e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;
 try{const s=await request('admin/payment/config',{method:'POST',body:JSON.stringify({oaId:$('oaId').value.trim(),qrPath:$('qrPath').value.trim()})});$('paymentSettingsStatus').textContent=s.qrEnabled?'บันทึกแล้ว: สแกนจ่ายพร้อมแสดง QR':'บันทึกแล้ว: สแกนจ่ายยังปิดอยู่จนกว่ารูป QR และ LINE OA ID จะครบ'}
 catch(err){alert(err.message)}finally{b.disabled=false}
});
$('adminLoginRetry').addEventListener('click',()=>initAdmin(true));
initAdmin();
