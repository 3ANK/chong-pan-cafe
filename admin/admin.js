/* Dedicated owner-only dashboard: every private API checks LINE identity on server. */
'use strict';
const $=id=>document.getElementById(id);
const escapeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>'฿'+Number(n||0).toLocaleString('th-TH');
const statuses={pending:'รอร้านรับ',accepted:'ร้านรับแล้ว',preparing:'กำลังทำ',ready:'พร้อมส่ง',completed:'ส่งมอบแล้ว',cancelled:'ยกเลิก'};
const nextStatuses={pending:['accepted','cancelled'],accepted:['preparing','cancelled'],preparing:['ready','cancelled'],ready:['completed','cancelled']};
const deepLinkOrderId=new URLSearchParams(location.search).get('order');
const selectedOrderId=deepLinkOrderId&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deepLinkOrderId)?deepLinkOrderId:null;
let orderRefreshTimer=null,orderVisibilityBound=false;
async function request(path,options={}){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),options.method&&options.method!=='GET'?20000:15000);
 try{
  const r=await fetch('/api/'+path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options,signal:controller.signal});
  let d;try{d=await r.json()}catch{throw Error('ระบบตอบกลับไม่ถูกต้อง กรุณาลองใหม่')}
  if(!r.ok){
   if(path.startsWith('admin/')&&r.status===403&&d.error==='เฉพาะผู้ดูแลร้าน')showAdminReconnect();
   throw Error(d.error||'เกิดข้อผิดพลาด');
  }
  return d;
 }catch(e){
  if(e?.name==='AbortError')throw Error('การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่');
  throw e;
 }finally{clearTimeout(timeout)}
}
function loginStatus(s,retry=false){$('adminLoginStatus').textContent=s;$('adminLoginRetry').hidden=!retry}
function showAdminReconnect(){
 $('adminPrivate').hidden=true;$('adminLogin').hidden=false;
 loginStatus('การเข้าสู่ระบบหลังบ้านหมดอายุหรือถูกตัดการเชื่อมต่อ กรุณาเชื่อมต่อ LINE ใหม่',true);
}
function allowed(m){
 $('adminLogin').hidden=true;$('adminPrivate').hidden=false;
 $('ownerHello').textContent='เข้าสู่ระบบหลังบ้านแล้ว · '+(m.name||'แอดมินร้าน');
 $('manageAdmins').hidden=!m.isPrimaryOwner;
 $('manageLoyverse').hidden=!m.isPrimaryOwner;
 loadOrders();loadPaymentSettings();checkReadiness();
 if(!orderRefreshTimer)orderRefreshTimer=setInterval(()=>{if(!document.hidden&&!$('adminPrivate').hidden&&!$('adminContent').querySelector('.order-actions button:disabled'))loadOrders({silent:true})},15000);
 if(!orderVisibilityBound){document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('adminPrivate').hidden)loadOrders({silent:true})});orderVisibilityBound=true}
}
async function initAdmin(userInitiated=false){
 try{
  const {member}=await request('me');
  if(member?.isOwner){allowed(member);return}
  if(member&&!member.isOwner){loginStatus('บัญชีนี้ไม่มีสิทธิ์เข้าหลังบ้าน กรุณาใช้ LINE ที่ได้รับสิทธิ์แอดมิน',false);return}
  if(!window.liff)throw Error('โหลด LINE Login ไม่สำเร็จ');
  const info=await request('loyalty/info');
  await liff.init({liffId:info.liffId});
  if(!liff.isLoggedIn()){
   loginStatus('กำลังเปิด LINE เพื่อยืนยันตัวตน…');
   if(!userInitiated&&new URL(location).searchParams.has('liff.state'))throw Error('LINE ยังไม่เชื่อมต่อ กรุณากดลองใหม่');
   liff.login({redirectUri:location.origin+'/admin/'+location.search});
   return;
  }
  const token=liff.getIDToken();if(!token)throw Error('ไม่ได้รับ LINE ID Token');
  await request('auth/line',{method:'POST',body:JSON.stringify({idToken:token})});
  const next=await request('me');
  if(!next.member?.isOwner)throw Error('บัญชี LINE นี้ไม่มีสิทธิ์จัดการร้าน');
  allowed(next.member);
 }catch(e){loginStatus(e.message,true)}
}
function isPointsRedemption(o){return !!o.isPointsRedemption||(Number(o.points_used||0)>0&&Number(o.total||0)===0)}
function paymentText(o){
 if(isPointsRedemption(o)||o.payment_method==='points')return 'แลกแต้มเป็นเมนู · ไม่ต้องรับเงิน';
 const method={cash:'เงินสด',qr:'สแกนจ่าย',legacy:'ออเดอร์ก่อนเพิ่มวิธีชำระเงิน'}[o.payment_method]||'ไม่ทราบวิธีจ่าย';
 if(o.payment_method==='cash'&&o.payment_status!=='verified')return method+' · รับเงินตอนส่งมอบ';
 if(o.payment_method==='qr'&&o.payment_status!=='verified')return method+' · ตรวจสลิปก่อนรับออเดอร์';
 return method+' · ยืนยันยอดแล้ว';
}
function orderItemSubtotal(i){
 const qty=Math.max(0,Number(i.qty)||0),price=Math.max(0,Number(i.price)||0);
 const eggExtra=i.egg?Math.max(0,Number(i.eggPrice)||0)*Math.max(0,Number(i.eggQty??1)||0):0;
 const pair=!i.egg?(String(i.id)==='30'&&price===15?25:((String(i.id)==='31'||String(i.id)==='32')&&price===20?35:null)):null;
 return pair===null?(price+eggExtra)*qty:Math.floor(qty/2)*pair+(qty%2)*price;
}
function orderCard(o){
 const eggNames={fried:'ไข่ดาว',omelet:'ไข่เจียว',creamy:'ไข่ข้น'};
 const items=(o.items||[]).map(i=>{
  const egg=i.egg?'เพิ่ม'+(eggNames[i.egg]||'ไข่')+' '+(i.eggQty??1)+' ฟอง (+'+Number(i.eggPrice||0)+' บาท)':'';
  const modifiers=[i.sweetness||'',egg,i.note||''].filter(Boolean);
  const priceInfo=isPointsRedemption(o)||o.payment_method==='points'?'รายการแลกแต้ม':'ราคา '+fmt(i.price)+' × '+Number(i.qty)+' รายการ';
  const totalInfo=isPointsRedemption(o)||o.payment_method==='points'?'แลกแต้ม':'รวม '+fmt(orderItemSubtotal(i));
  return '<li style="margin:0 0 .7rem;line-height:1.5"><div style="display:flex;align-items:baseline;gap:.75rem;justify-content:space-between"><span>'+escapeText(i.name)+'</span><strong style="white-space:nowrap">×'+Number(i.qty)+'</strong></div>'+(modifiers.length?'<div class="caption">'+modifiers.map(escapeText).join(' · ')+'</div>':'')+'<div style="display:flex;justify-content:space-between;gap:.75rem;font-size:.9em;color:#58654b"><span>'+escapeText(priceInfo)+'</span><strong style="white-space:nowrap">'+escapeText(totalInfo)+'</strong></div></li>';
 }).join('');
 const reward=Math.floor(Math.max(0,Number(o.total)||0)/25),credited=o.pointsAwarded==null?null:Number(o.pointsAwarded);
 const redeem=isPointsRedemption(o)||o.payment_method==='points';
 const pointsInfo=redeem?(o.status==='completed'?'ใช้ '+Number(o.points_used||0)+' แต้ม · ส่งมอบแล้ว':o.status==='cancelled'?'ยกเลิก · คืน '+Number(o.points_used||0)+' แต้ม':'ใช้ '+Number(o.points_used||0)+' แต้ม · รอส่งมอบ')
   :o.status==='completed'?(credited===null?'แต้มกำลังตรวจสอบ':'ได้รับ +'+credited+' แต้มแล้ว')
   :o.status==='cancelled'?'ยกเลิก · ไม่ได้รับแต้ม'+(Number(o.points_used)>0?' · คืน '+Number(o.points_used)+' แต้ม':'')
   :'รับ +'+reward+' แต้มเมื่อส่งมอบ';
 const payPending=o.payment_method==='qr'&&o.payment_status!=='verified';
 const pointsButton=o.status==='ready'?'<button type="button" class="primary award-points-button" data-complete-order="'+escapeText(o.id)+'" data-points="'+reward+'" '+(payPending?'disabled title="ต้องตรวจยอดเงินก่อนส่งมอบ"':'')+'>ส่งมอบแล้ว</button>':'';
 const actions=(nextStatuses[o.status]||[]).filter(s=>s!=='completed').map(s=>'<button type="button" class="'+(s==='cancelled'?'secondary order-cancel':'primary order-next')+'" data-status="'+s+'" data-order="'+escapeText(o.id)+'" data-payment-method="'+escapeText(o.payment_method)+'">'+escapeText(s==='accepted'?'รับออเดอร์':s==='preparing'?'เริ่มทำ':s==='ready'?'พร้อมส่ง':statuses[s]||s)+'</button>').join('');
 return '<article class="ordercard" data-order-id="'+escapeText(o.id)+'" tabindex="-1"><div class="adminrow"><strong>ออเดอร์ #'+escapeText(o.id.slice(0,8).toUpperCase())+'</strong><span class="tag">'+escapeText(statuses[o.status]||o.status)+'</span></div>'+
 '<div class="admin-order-details"><ul style="list-style:none;padding:0;margin:1rem 0">'+items+'</ul><p><strong>'+(redeem?'แลกด้วย '+Number(o.points_used||0).toLocaleString('th-TH')+' แต้ม · ไม่มียอดชำระเป็นเงิน':fmt(o.total))+'</strong> · '+(o.fulfillment==='delivery'?'จัดส่ง':'รับที่ร้าน')+(Number(o.points_used)>0&&!redeem?' · ใช้แต้ม '+Number(o.points_used).toLocaleString('th-TH')+' แต้ม':'')+'</p>'+
 '<p>ลูกค้า: '+escapeText(o.display_name||'')+' · '+escapeText(o.delivery_address||'')+'</p>'+
 '<p>หมายเหตุ: '+escapeText(o.note||'ไม่มี')+'</p></div>'+
 '<div class="payment-chip '+(o.payment_status==='verified'?'success':'warning')+'">'+escapeText(paymentText(o))+'</div>'+
 '<div class="loyalty-points '+(o.status==='completed'&&credited!==null?'awarded':'')+'">'+escapeText(pointsInfo)+'</div>'+
 (typeof window.renderLoyverseStatus==='function'?window.renderLoyverseStatus(o):'')+
 '<div class="order-actions">'+pointsButton+actions+'</div></article>';
}
async function loadOrders({silent=false}={}){
 const el=$('adminContent');
 if(silent&&el.querySelector('.order-actions button:disabled'))return;
 if(!silent)el.textContent='กำลังโหลดออเดอร์…';
 const expanded=new Set(Array.from(el.querySelectorAll('.loyverse-compact[open]')).map(d=>d.closest('[data-order-id]')?.dataset.orderId).filter(Boolean));
 try{
  const orders=(await request('admin/orders')).orders;
  el.innerHTML=orders.length?orders.map(orderCard).join(''):'<p class="empty">ยังไม่มีออเดอร์</p>';
  for(const id of expanded){const card=Array.from(el.querySelectorAll('[data-order-id]')).find(node=>node.dataset.orderId===id);card?.querySelector('.loyverse-compact')?.setAttribute('open','')}
  if(selectedOrderId){
   const focused=orders.find(o=>o.id===selectedOrderId);
   const status=$('orderFocusStatus');
   status.hidden=false;
   if(focused){
    const card=Array.from(el.querySelectorAll('[data-order-id]')).find(node=>node.dataset.orderId===selectedOrderId);
    card?.classList.add('focus-order');
    const instruction=focused.status==='completed'?(focused.payment_status!=='verified'&&!isPointsRedemption(focused)&&Number(focused.total)>0?'ตรวจยอดเงินจริง แล้วกดยืนยันรับเงินด้านล่าง':'ส่งมอบเรียบร้อยแล้ว'):focused.status==='cancelled'?'ออเดอร์ถูกยกเลิกแล้ว':'ตรวจรายละเอียด แล้วเลือกดำเนินการด้านล่าง';
    status.textContent='ออเดอร์ #'+focused.id.slice(0,8).toUpperCase()+' · '+(statuses[focused.status]||focused.status)+' — '+instruction;
    if(!silent)requestAnimationFrame(()=>card?.scrollIntoView({behavior:'smooth',block:'center'}));
   }else status.textContent='ไม่พบออเดอร์ที่เปิดจาก LINE ในรายการล่าสุด กรุณารีเฟรชหรือตรวจหมายเลขออเดอร์';
  }
 }catch(e){if(!silent)el.textContent=e.message}
}
$('adminContent').addEventListener('click',async e=>{
 const b=e.target.closest('[data-complete-order], [data-status]');if(!b)return;
 const id=b.dataset.completeOrder||b.dataset.order;
 if(b.dataset.completeOrder){
  const expected=Number(b.dataset.points)||0;
  if(!confirm('ยืนยันส่งมอบสินค้าและรับเงินแล้วใช่ไหม?'+(expected>0?' ระบบจะเพิ่ม +'+expected+' แต้มให้ลูกค้า':'')+' แต้มจะได้รับเพียงครั้งเดียวต่อออเดอร์'))return;
  b.disabled=true;
  try{
   const result=await request('admin/orders',{method:'PATCH',body:JSON.stringify({id,status:'completed'})});
   await loadOrders();
   if(Number(result.pointsAdded)>0)alert('ส่งมอบสำเร็จ และเพิ่ม +'+Number(result.pointsAdded)+' แต้มให้ลูกค้าแล้ว');
  }catch(err){
   alert('ยังยืนยันผลการส่งมอบไม่ได้: '+err.message+'\\nระบบจะโหลดสถานะล่าสุดเพื่อป้องกันการกดซ้ำ');
   await loadOrders();
  }
  return;
 }
 const status=b.dataset.status;
 if(status==='cancelled'&&!confirm('ยืนยันยกเลิกออเดอร์นี้?'))return;
 if(status==='accepted'&&b.dataset.paymentMethod==='qr'&&!confirm('ตรวจสอบสลิปใน LINE OA และยอดเงินจริงเข้าร้านแล้วใช่ไหม? กดยืนยันแล้วระบบจะรับออเดอร์'))return;
 b.disabled=true;
 try{
  if(status==='accepted'&&b.dataset.paymentMethod==='qr')await request('admin/orders/payment',{method:'PATCH',body:JSON.stringify({id,confirmed:true})});
  await request('admin/orders',{method:'PATCH',body:JSON.stringify({id,status})});
  await loadOrders();
 }catch(err){alert(err.message);await loadOrders()}
});
async function checkReadiness(){
 const el=$('readinessReport');el.hidden=false;el.textContent='กำลังตรวจ…';
 try{const r=await request('admin/readiness');el.innerHTML='<strong>'+(r.ordersEnabled?'กำลังเปิดรับออเดอร์':'ยังไม่เปิดรับออเดอร์')+'</strong><p>เมนู '+r.catalog.total+' รายการ · รอยืนยันราคา '+r.catalog.unverified+'</p><ul>'+r.checks.map(x=>'<li>'+escapeText(x.label)+' — '+(x.ok?'พร้อม ✓':'ยังไม่พร้อม')+'</li>').join('')+'</ul>'}
 catch(e){el.textContent=e.message}
}
$('refreshAdmin').addEventListener('click',loadOrders);
$('checkReadiness').addEventListener('click',checkReadiness);
$('manageCatalog').addEventListener('click',()=>window.openChongpanCatalog?.());
$('manageAdmins').addEventListener('click',async()=>{
 const panel=$('adminsPanel');panel.hidden=!panel.hidden;if(panel.hidden)return;
 panel.scrollIntoView({behavior:'smooth',block:'start'});
 await loadAdminRoster();
});
$('refreshAdmins').addEventListener('click',loadAdminRoster);
$('adminCandidates').addEventListener('click',async e=>{
 const b=e.target.closest('[data-add-admin]');if(!b)return;
 const lineUserId=b.dataset.addAdmin;
 if(!confirm('ให้ '+b.dataset.adminName+' รับแจ้งเตือนออเดอร์และเข้าหลังบ้านได้ใช่ไหม? ต้องเพิ่มเพื่อน LINE OA แล้ว'))return;
 b.disabled=true;
 try{await request('admin/admins',{method:'POST',body:JSON.stringify({lineUserId})});await loadAdminRoster();alert('เพิ่มสิทธิ์แอดมินแล้ว')}
 catch(err){alert(err.message);b.disabled=false}
});
$('currentAdmins').addEventListener('click',async e=>{
 const b=e.target.closest('[data-remove-admin]');if(!b)return;
 if(!confirm('นำ '+b.dataset.adminName+' ออกจากแอดมิน? บัญชีนี้จะไม่ได้รับแจ้งเตือนใหม่และเข้าแอดมินไม่ได้'))return;
 b.disabled=true;
 try{await request('admin/admins',{method:'DELETE',body:JSON.stringify({lineUserId:b.dataset.removeAdmin})});await loadAdminRoster()}
 catch(err){alert(err.message);b.disabled=false}
});
$('adminCandidateSearch').addEventListener('input',renderAdminRoster);
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
let adminRosterData={admins:[],members:[],limit:25};
function renderAdminRoster(){
 const q=$('adminCandidateSearch').value.trim().toLocaleLowerCase();
 const candidates=adminRosterData.members.filter(m=>(m.display_name||'').toLocaleLowerCase().includes(q)||String(m.line_user_id||'').slice(-8).toLocaleLowerCase().includes(q));
 $('adminRosterSummary').textContent='แอดมิน '+adminRosterData.admins.length+' คน · เพิ่มได้อีก '+Math.max(0,adminRosterData.limit-(adminRosterData.admins.length-1))+' คน';
 $('currentAdmins').innerHTML=adminRosterData.admins.map(m=>'<article class="ordercard"><div class="adminrow"><strong>'+escapeText(m.display_name)+(m.primary?' · เจ้าของร้าน':'')+'</strong>'+(m.primary?'':'<button type="button" class="secondary" data-remove-admin="'+escapeText(m.line_user_id)+'" data-admin-name="'+escapeText(m.display_name)+'">นำออก</button>')+'</div><p class="caption">LINE ลงท้าย '+escapeText(String(m.line_user_id).slice(-8))+'</p></article>').join('')||'<p class="empty">ไม่พบข้อมูลแอดมิน</p>';
 $('adminCandidates').innerHTML=candidates.length?candidates.map(m=>'<article class="ordercard"><div class="adminrow"><strong>'+escapeText(m.display_name||'สมาชิก LINE')+'</strong><button type="button" class="primary" data-add-admin="'+escapeText(m.line_user_id)+'" data-admin-name="'+escapeText(m.display_name||'สมาชิก LINE')+'" '+(adminRosterData.admins.length>adminRosterData.limit?'disabled':'')+'>ให้สิทธิ์แอดมิน</button></div><p class="caption">LINE ลงท้าย '+escapeText(String(m.line_user_id).slice(-8))+'</p></article>').join(''):'<p class="empty">'+(q?'ไม่พบสมาชิกที่ค้นหา':'ยังไม่มีสมาชิกที่เพิ่มเป็นแอดมินได้ · ให้แอดมินเข้าสู่ระบบ LINE ในหน้าเมนูสั่งอาหารก่อน')+'</p>';
}
async function loadAdminRoster(){
 $('adminRosterSummary').textContent='กำลังโหลด…';$('currentAdmins').textContent='';$('adminCandidates').textContent='';
 try{adminRosterData=await request('admin/admins');renderAdminRoster()}
 catch(e){$('adminRosterSummary').textContent=e.message}
}
let customerPointMembers=[];
function renderCustomerPoints(){
 const q=$('memberSearch').value.trim().toLocaleLowerCase();
 const filtered=customerPointMembers.filter(m=>(m.display_name||'').toLocaleLowerCase().includes(q)||String(m.line_user_id||'').slice(-8).toLocaleLowerCase().includes(q));
 const total=customerPointMembers.reduce((sum,m)=>sum+Math.max(0,Number(m.points)||0),0);
 $('membersSummary').textContent='สมาชิก '+customerPointMembers.length+' บัญชี · รวม '+total.toLocaleString('th-TH')+' แต้ม'+(q?' · พบ '+filtered.length+' บัญชี':'');
 $('membersContent').innerHTML=filtered.length?filtered.map(m=>{
  const id=String(m.line_user_id||'');
  return '<article class="ordercard"><div class="adminrow"><strong>'+escapeText(m.display_name||'สมาชิก LINE')+'</strong><strong>'+Math.max(0,Number(m.points)||0).toLocaleString('th-TH')+' แต้ม</strong></div><p class="caption">LINE ลงท้าย '+escapeText(id.slice(-8))+'</p></article>';
 }).join(''):'<p class="empty">'+(q?'ไม่พบลูกค้าที่ค้นหา':'ยังไม่มีลูกค้าที่เข้าสู่ระบบ LINE')+'</p>';
}
async function loadCustomerPoints(){
 $('membersContent').textContent='กำลังโหลดรายชื่อลูกค้า…';
 try{const r=await request('admin/members');customerPointMembers=Array.isArray(r.members)?r.members:[];renderCustomerPoints()}
 catch(e){$('membersSummary').textContent='';$('membersContent').textContent=e.message}
}
$('manageMembers').addEventListener('click',async()=>{
 const panel=$('membersPanel');panel.hidden=!panel.hidden;if(panel.hidden)return;
 $('memberSearch').value='';
 panel.scrollIntoView({behavior:'smooth',block:'start'});
 await loadCustomerPoints();
});
$('refreshMembers').addEventListener('click',loadCustomerPoints);
$('memberSearch').addEventListener('input',renderCustomerPoints);
$('manageLegacy').addEventListener('click',async()=>{
 const panel=$('legacyPanel');panel.hidden=!panel.hidden;if(panel.hidden)return;
 const el=$('legacyContent');el.textContent='กำลังโหลดสมาชิกเก่า…';
 try{
  const {legacy,members}=await request('admin/legacy');
  const options='<option value="">เลือกสมาชิก LINE ที่ตรวจสอบตัวตนแล้ว</option>'+members.map(m=>'<option value="'+escapeText(m.line_user_id)+'">'+escapeText(m.display_name)+' · '+Number(m.points)+' แต้ม</option>').join('');
  el.innerHTML=legacy.map(a=>'<div class="ordercard"><strong>'+escapeText(a.display_name)+' · '+Number(a.snapshot_points)+' แต้ม</strong><p>รหัสเก่า #'+escapeText(a.legacy_code)+'</p>'+(a.claimed_line_user_id?'<p>โอนแล้ว ✓</p>':'<select data-old="'+escapeText(a.legacy_code)+'">'+options+'</select><button type="button" class="secondary" data-legacy="'+escapeText(a.legacy_code)+'">ยืนยันโอนแต้ม</button>')+'</div>').join('');
  requestAnimationFrame(()=>panel.scrollIntoView({behavior:'smooth',block:'start'}));
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
$('logoutAdmin').addEventListener('click',async()=>{
 try{await request('auth/logout',{method:'POST',body:'{}'});if(window.liff){const info=await request('loyalty/info');await liff.init({liffId:info.liffId});if(liff.isLoggedIn())liff.logout();}location.replace('/admin/')}
 catch(e){alert('ออกจากระบบไม่สำเร็จ: '+e.message)}
});
$('adminLoginRetry').addEventListener('click',()=>initAdmin(true));
initAdmin();
