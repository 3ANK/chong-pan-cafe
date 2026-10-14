/* Chong & Pan ordering v2 — no real orders until SHOP_ENABLED is configured server-side. */
'use strict';
const $=id=>document.getElementById(id);
const state={products:[],categories:[],basket:[],member:null,ready:false,canOrder:false,selectedCategory:'ทั้งหมด',selectedProduct:null,liffId:'',admin:false};
const fmt=n=>'฿'+Number(n||0).toLocaleString('th-TH');
const escapeText=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show=(id,visible)=>$(id).hidden=!visible;
let timer;
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(timer);timer=setTimeout(()=>$('toast').style.display='none',3800)}
async function request(path,opts={}){const r=await fetch('/api/'+path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});let j;try{j=await r.json()}catch{throw Error('ระบบตอบกลับไม่ถูกต้อง')}if(!r.ok)throw Error(j.error||'ระบบขัดข้อง');return j}
function keyOf(item){return JSON.stringify([item.id,item.sweetness,item.egg,item.note])}
function extra(item){return ({fried:10,omelet:10,creamy:20})[item.egg]||0}
function breadPair(it){
 if(it.id==='30'&&it.price===15)return 25;
 if((it.id==='31'||it.id==='32')&&it.price===20)return 35;
 return null;
}
function lineSubtotal(it){
 const pair=!it.egg?breadPair(it):null;
 return pair===null?(it.price+extra(it))*it.qty:Math.floor(it.qty/2)*pair+(it.qty%2)*it.price;
}
function subTotal(){return state.basket.reduce((sum,it)=>sum+lineSubtotal(it),0)}
function saveBasket(){try{localStorage.setItem('chongpan-v2-basket',JSON.stringify(state.basket))}catch{}}
function restoreBasket(){try{const v=JSON.parse(localStorage.getItem('chongpan-v2-basket')||'[]');if(Array.isArray(v))state.basket=v.filter(it=>it&&Number.isInteger(it.qty)&&it.qty>0).slice(0,70)}catch{}}
function menuGroups(){const q=$('search').value.trim().toLowerCase();const valid=state.products.filter(p=>(state.selectedCategory==='ทั้งหมด'||p.category===state.selectedCategory)&&(!q||p.name.toLowerCase().includes(q)));const groups={};for(const p of valid)(groups[p.category]||=[]).push(p);return groups}
function paintCategories(){const cs=['ทั้งหมด',...new Set(state.products.map(p=>p.category))];$('categories').innerHTML=cs.map(c=>`<button data-cat="${escapeText(c)}" class="${c===state.selectedCategory?'selected':''}">${escapeText(c)}</button>`).join('');$('categories').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{state.selectedCategory=b.dataset.cat;paintCategories();paintCatalog()}))}
function paintCatalog(){const g=menuGroups();const html=Object.entries(g).map(([cat,products])=>`<div class="sectiontitle"><h2>${escapeText(cat)}</h2><small>${products.length} รายการ</small></div>${products.map(p=>`<article class="item"><div class="productart">${p.image?`<img loading="lazy" src="${escapeText(p.image)}" alt="${escapeText(p.name)}">`:escapeText(p.emoji||'🥤')}</div><div class="itembody"><div class="itemtitle">${escapeText(p.name)}</div><div class="price">${p.price>0?fmt(p.price):'รอยืนยันราคา'}</div><div class="small">${p.price<=0?'รอกำหนดราคา':!p.available?'ยังไม่เปิดขาย':'เลือกตัวเลือกได้'}${p.id==='30'&&p.price===15?' · 2 ชิ้น 25 บาท':(p.id==='31'||p.id==='32')&&p.price===20?' · 2 ชิ้น 35 บาท':''}</div></div><button class="add" data-add="${escapeText(p.id)}" ${!p.available||p.price<=0?'disabled':''}>เพิ่ม +</button></article>`).join('')}`).join('');$('catalog').innerHTML=html||'<p class="empty">ไม่พบเมนูที่ค้นหา</p>';$('catalog').querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>openOption(b.dataset.add)))}
function openOption(id){const p=state.products.find(p=>p.id===id);if(!p||!p.available||p.price<=0)return;state.selectedProduct=p;$('optionTitle').textContent=p.name+' · '+fmt(p.price)+(p.id==='30'&&p.price===15?' · 2 ชิ้น 25 บาท':(p.id==='31'||p.id==='32')&&p.price===20?' · 2 ชิ้น 35 บาท':'');show('sweetnessGroup',!!p.drink);show('eggGroup',p.category==='กะเพรา');$('itemNote').value='';$('sweetness').value='ปกติ';$('egg').value='';$('optionDialog').showModal()}
function addItem(){const p=state.selectedProduct;if(!p)return;const item={id:p.id,name:p.name,price:p.price,qty:1,sweetness:p.drink?$('sweetness').value:'',egg:p.category==='กะเพรา'?$('egg').value:'',note:$('itemNote').value.trim()};const other=state.basket.find(x=>keyOf(x)===keyOf(item));if(other)other.qty=Math.min(other.qty+1,20);else state.basket.push(item);saveBasket();paintBasket();$('optionDialog').close();toast('เพิ่ม '+p.name+' ลงตะกร้าแล้ว')}
function paintBasket(){const count=state.basket.reduce((n,it)=>n+it.qty,0);show('basketBar',count>0);$('basketLabel').textContent=count+' รายการ';$('basketTotal').textContent=subTotal().toLocaleString('th-TH');$('cartSum').textContent=fmt(subTotal());$('cartItems').innerHTML=state.basket.map((it,i)=>`<div class="cartline"><div><strong>${escapeText(it.name)}</strong><br><small>${escapeText([it.sweetness,it.egg?({fried:'ไข่ดาว',omelet:'ไข่เจียว',creamy:'ไข่ข้น'})[it.egg]:'',it.note].filter(Boolean).join(' · '))}</small><div>${fmt(lineSubtotal(it))}</div></div><div class="cartbuttons"><button data-qty="${i}" data-step="-1" aria-label="ลดจำนวน">−</button>${it.qty}<button data-qty="${i}" data-step="1" aria-label="เพิ่มจำนวน">+</button></div></div>`).join('')||'<p class="empty">ตะกร้าว่าง</p>';for(const b of $('cartItems').querySelectorAll('[data-qty]'))b.addEventListener('click',()=>{const i=Number(b.dataset.qty);state.basket[i].qty+=Number(b.dataset.step);if(state.basket[i].qty<1)state.basket.splice(i,1);if(state.basket[i]?.qty>20)state.basket[i].qty=20;saveBasket();paintBasket()});$('placeOrder').disabled=!state.canOrder||!state.member||!count;$('checkoutHint').textContent=!state.canOrder?'ระบบทดลอง ยังไม่เปิดรับออเดอร์จริง':!state.member?'เข้าสู่ LINE ก่อนยืนยันออเดอร์':'ตรวจสอบราคาและรายละเอียดให้ถูกต้องก่อนสั่ง'}
function setTab(tab){for(const t of ['menu','history','admin'])show(t+'Panel',t===tab);document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));if(tab==='history')loadHistory();if(tab==='admin')loadAdmin()}
function paintMember(){const m=state.member;$('memberName').textContent=m?.name||'ยังไม่ได้เข้าสู่ระบบ';$('points').textContent=m?.points??'–';$('loginBtn').textContent=m?'บัญชี LINE ✓':'เข้าสู่ LINE';state.admin=!!m?.isOwner;show('adminTab',state.admin);paintBasket()}
const loginAttemptKey='chongpan-v2-line-login-attempt';
let lineAuthBusy=false;
function loginWasAttempted(){try{return sessionStorage.getItem(loginAttemptKey)==='1'}catch{return false}}
function markLoginAttempt(){try{sessionStorage.setItem(loginAttemptKey,'1')}catch{}}
function clearLoginAttempt(){try{sessionStorage.removeItem(loginAttemptKey)}catch{}}
function gateStatus(message,retry=false){
 $('lineGateStatus').textContent=message;
 $('lineGateRetry').hidden=!retry;
}
function showShopAfterLogin(){
 if(!state.member)return;
 $('lineGate').hidden=true;
 $('shopShell').hidden=false;
 document.body.classList.remove('line-auth-pending');
 paintBasket();
}
async function authenticate(userInitiated=false){
 if(lineAuthBusy)return;
 lineAuthBusy=true;
 gateStatus('กำลังเชื่อมต่อบัญชี LINE…');
 try{
  if(!state.liffId)throw Error('ยังไม่พร้อมเชื่อมต่อ LINE กรุณาลองใหม่');
  if(!window.liff)throw Error('ไม่สามารถโหลดระบบ LINE Login ได้ กรุณาลองใหม่');
  await liff.init({liffId:state.liffId});
  if(!liff.isLoggedIn()){
   if(loginWasAttempted()&&!userInitiated)throw Error('ยังไม่ได้ยืนยันการเชื่อมต่อ LINE กรุณากดปุ่มด้านล่างเพื่อลองอีกครั้ง');
   markLoginAttempt();
   gateStatus('กำลังเปิดหน้าขออนุญาตเชื่อมต่อ LINE…');
   liff.login({redirectUri:location.origin+location.pathname});
   return;
  }
  const idToken=liff.getIDToken();
  if(!idToken)throw Error('ไม่พบข้อมูลบัญชี LINE กรุณากดเชื่อมต่ออีกครั้ง');
  await request('auth/line',{method:'POST',body:JSON.stringify({idToken})});
  await loadMember();
  if(!state.member)throw Error('เข้าสู่ระบบยังไม่สำเร็จ กรุณาลองใหม่');
  clearLoginAttempt();
  showShopAfterLogin();
 }catch(e){
  gateStatus((e?.message||'เชื่อมต่อบัญชี LINE ไม่สำเร็จ')+' · กรุณาลองใหม่',true);
 }finally{
  lineAuthBusy=false;
 }
}
async function loadMember(){try{const m=await request('me');state.member=m.member}catch{state.member=null}paintMember()}
function statusName(s){return ({pending:'รอร้านรับ',accepted:'ร้านรับแล้ว',preparing:'กำลังทำ',ready:'พร้อมรับ / ส่ง',completed:'ส่งมอบแล้ว',cancelled:'ยกเลิก'})[s]||s}
function orderCard(o,admin=false){let items=Array.isArray(o.items)?o.items:[];return `<div class="ordercard"><div class="adminrow"><strong>ออเดอร์ #${escapeText(o.id.slice(0,8).toUpperCase())}</strong><span class="tag">${escapeText(statusName(o.status))}</span></div><p class="small">${new Date(o.created_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</p><p>${items.map(i=>escapeText(i.name)+' ×'+i.qty).join(' · ')}</p><p><strong>${fmt(o.total)}</strong> · ${o.fulfillment==='delivery'?'จัดส่ง':'รับที่ร้าน'}</p>${admin?`<p class="small">${escapeText(o.display_name||'')} ${escapeText(o.delivery_address||'')}</p><div class="inline">${['accepted','preparing','ready','completed','cancelled'].filter(s=>s!==o.status).map(s=>`<button class="secondary" data-status="${s}" data-order="${escapeText(o.id)}">${escapeText(statusName(s))}</button>`).join('')}</div>`:''}</div>`}
async function loadHistory(){if(!state.member){$('orderHistory').textContent='กรุณาเข้าสู่ระบบ LINE เพื่อดูประวัติ';return}try{const r=await request('orders');$('orderHistory').innerHTML=r.orders.length?r.orders.map(x=>orderCard(x)).join(''):'<div class="empty">ยังไม่มีประวัติออเดอร์</div>'}catch(e){$('orderHistory').textContent=e.message}}
async function loadAdmin(){if(!state.admin)return;try{const r=await request('admin/orders');$('adminContent').innerHTML=r.orders.length?r.orders.map(o=>orderCard(o,true)).join(''):'<p class="empty">ยังไม่มีออเดอร์</p>';$('adminContent').querySelectorAll('[data-status]').forEach(b=>b.addEventListener('click',()=>changeStatus(b.dataset.order,b.dataset.status)))}catch(e){$('adminContent').textContent=e.message}}
async function changeStatus(id,status){if(status==='cancelled'&&!confirm('ยกเลิกออเดอร์นี้?'))return;try{await request('admin/orders',{method:'PATCH',body:JSON.stringify({id,status})});toast('อัปเดตสถานะเรียบร้อย');await loadAdmin()}catch(e){toast(e.message)}}
async function manageLegacy(){
 if(!state.admin)return;
 show('legacyPanel',true);
 const el=$('legacyContent');el.textContent='กำลังโหลดสมาชิกเก่า…';
 try{
  const {legacy,members}=await request('admin/legacy');
  const options='<option value="">เลือก LINE ที่ตรวจสอบตัวตนแล้ว</option>'+members.map(m=>`<option value="${escapeText(m.line_user_id)}">${escapeText(m.display_name)} · ${escapeText(m.line_user_id.slice(-8))} · ${m.points} แต้ม</option>`).join('');
  el.innerHTML=`<p class="small">เหลือ ${legacy.filter(a=>!a.claimed_line_user_id).length} บัญชีจาก ${legacy.length} บัญชี · LINE เข้าสู่ระบบใหม่แล้ว ${members.length} คน</p>` +legacy.map(a=>`<div class="ordercard"><div class="adminrow"><strong>${escapeText(a.display_name)}</strong><strong>${Number(a.snapshot_points)} แต้ม</strong></div><p class="small">รหัสเก่า #${escapeText(a.legacy_code)}</p>${a.claimed_line_user_id?`<p class="small">โอนแล้ว ✓ · LINE ลงท้าย ${escapeText(a.claimed_line_user_id.slice(-8))}</p>`:`<label>จับคู่กับ LINE ที่ยืนยันแล้ว<select data-legacy-target="${escapeText(a.legacy_code)}">${options}</select></label><button type="button" class="secondary" data-legacy-assign="${escapeText(a.legacy_code)}" ${!members.length?'disabled':''}>ยืนยันโอนแต้มครั้งเดียว</button>`}</div>`).join('');
  el.querySelectorAll('[data-legacy-assign]').forEach(b=>b.addEventListener('click',async()=>{
   const legacyCode=b.dataset.legacyAssign;
   const select=el.querySelector(`[data-legacy-target="${legacyCode}"]`);
   const lineUserId=select?.value;
   if(!lineUserId)return toast('ต้องเลือก LINE ของลูกค้าที่ตรวจสอบตัวตนแล้ว');
   const member=members.find(m=>m.line_user_id===lineUserId);const account=legacy.find(a=>a.legacy_code===legacyCode);
   if(!confirm(`ยืนยันว่าคุณตรวจสอบตัวตนลูกค้าแล้ว?\nโอนแต้ม ${account.snapshot_points} แต้ม จาก ${account.display_name} (#${legacyCode}) ไปยัง LINE ${member.display_name} (${lineUserId.slice(-8)})\nการดำเนินการนี้ย้อนกลับไม่ได้จากหน้านี้`))return;
   b.disabled=true;
   try {const r=await request('admin/legacy/assign',{method:'POST',body:JSON.stringify({legacyCode,lineUserId,ownerVerified:true})});toast('โอน '+r.pointsTransferred+' แต้มสำเร็จ');await manageLegacy();await loadMember()}
   catch(e){toast(e.message);b.disabled=false}
  }));
 }catch(e){el.textContent=e.message}
}
async function manageCatalog(){if(!state.admin)return;try{const r=await request('menu');const list=r.products.map(p=>`${p.id}. ${p.name} (${p.price} บาท) ${p.available?'ขาย':'หมด'}`).join('\n');const input=prompt('จัดการเมนู: กรอกรหัสสินค้า (ดูรายการที่แนบในข้อความนี้)',list.slice(0,850));if(!input)return;const product=r.products.find(p=>p.id===input.trim());if(!product)return toast('ไม่พบรหัสสินค้า');const priceText=prompt('แก้ราคาบาท (พิมพ์ราคาเดิมถ้าไม่เปลี่ยน)',String(product.price));if(priceText===null)return;const price=Number(priceText);if(!Number.isInteger(price)||price<0||price>100000)return toast('ราคาไม่ถูกต้อง');const available=confirm('เปิดขาย '+product.name+'? กด OK=เปิดขาย / Cancel=หมด');await request('admin/menu',{method:'PATCH',body:JSON.stringify({id:product.id,price,available})});toast('บันทึกข้อมูลเมนูแล้ว');await bootMenu()}catch(e){toast(e.message)}}
async function placeOrder(){if(!state.canOrder)return toast('ระบบทดลองยังไม่เปิดรับออเดอร์');if(!state.member)return authenticate();if(!state.basket.length)return;const fulfillment=$('fulfillment').value;const deliveryAddress=$('deliveryAddress').value.trim();if(fulfillment==='delivery'&&!deliveryAddress)return toast('กรุณากรอกที่อยู่จัดส่ง');const items=state.basket.map(({id,qty,sweetness,egg,note})=>({id,qty,sweetness,egg,note}));const reqKey=crypto.randomUUID();$('placeOrder').disabled=true;try{const r=await request('orders',{method:'POST',body:JSON.stringify({items,fulfillment,deliveryAddress,note:$('orderNote').value.trim(),requestKey:reqKey})});state.basket=[];saveBasket();paintBasket();$('cartDialog').close();if(r.ownerAlertOk===false){alert('บันทึกออเดอร์ #'+r.orderId.slice(0,8)+' แล้ว แต่ระบบแจ้งร้านไม่สำเร็จ กรุณาโทรยืนยันกับร้านที่ 062-594-6399 ก่อนชำระเงิน และอย่าสั่งซ้ำ');}else{toast('ส่งออเดอร์สำเร็จ #'+r.orderId.slice(0,8));}setTab('history')}catch(e){toast(e.message)}finally{$('placeOrder').disabled=!state.canOrder}}
async function bootMenu(){try{const r=await request('menu');state.products=r.products;
  // The stored cart is an untrusted snapshot: use the current catalogue name and price.
  const current=new Map(state.products.map(p=>[p.id,p]));
  state.basket=state.basket.map(it=>{
   const p=current.get(it.id);
   if(!p||!p.available||p.price<=0)return null;
   return {...it,name:p.name,price:p.price,egg:p.category==='กะเพรา'?it.egg:'',sweetness:p.drink?it.sweetness:''};
  }).filter(Boolean);saveBasket();
  state.liffId=r.liffId||'';state.canOrder=!!r.shopEnabled;show('legacyCheckout',!state.canOrder);$('statusBanner').className='notice '+(state.canOrder?'ok':'warn');$('statusBanner').textContent=state.canOrder?'พร้อมรับออเดอร์ผ่าน LINE':'ระบบใหม่อยู่ระหว่างทดสอบ · ยังไม่รับออเดอร์จริง · ราคาอ้างอิงจากข้อมูลเดิม';state.ready=true;paintCategories();paintCatalog();paintBasket()}catch(e){$('statusBanner').className='notice warn';$('statusBanner').textContent='เชื่อมต่อเมนูไม่สำเร็จ';$('catalog').innerHTML='<p class="empty">'+escapeText(e.message)+'</p>'}}
$('search').addEventListener('input',paintCatalog);document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));$('loginBtn').addEventListener('click',()=>authenticate(true));
$('lineGateRetry').addEventListener('click',()=>authenticate(true));$('addSelectedItem').addEventListener('click',addItem);$('openBasket').addEventListener('click',()=>$('cartDialog').showModal());$('fulfillment').addEventListener('change',()=>show('addressLabel',$('fulfillment').value==='delivery'));$('placeOrder').addEventListener('click',placeOrder);$('refreshAdmin').addEventListener('click',loadAdmin);$('manageCatalog').addEventListener('click',()=>window.openChongpanCatalog?.());$('manageLegacy').addEventListener('click',manageLegacy);
$('testLineAlert').addEventListener('click',async()=>{
 if(!confirm('ส่งข้อความทดสอบไปยัง LINE เจ้าของร้านตอนนี้? ไม่มีการสร้างออเดอร์หรือหักแต้ม'))return;
 const button=$('testLineAlert');button.disabled=true;
 try{
  const r=await request('admin/line/test',{method:'POST',body:'{}'});
  if(r.acceptedByLine)alert('LINE รับคำขอแจ้งเตือนทดสอบแล้ว กรุณาตรวจโทรศัพท์เจ้าของร้านว่าได้รับข้อความจริง');
 }catch(e){toast('ทดสอบ LINE ไม่สำเร็จ: '+e.message)}
 finally{button.disabled=false}
});
$('toggleShop').addEventListener('click',async()=>{
 try{
  const current=await request('admin/readiness');
  const live=current.checks.find(x=>x.id==='shop_database')?.ok;
  if(live){
   if(!confirm('ปิดรับออเดอร์ระบบใหม่ทันที? ออเดอร์เดิมยังอยู่ในระบบ'))return;
   await request('admin/shop',{method:'POST',body:JSON.stringify({enabled:false})});
   toast('ปิดรับออเดอร์ระบบใหม่แล้ว');
  }else{
   const blockers=current.checks.filter(x=>x.id!=='shop_database'&&!x.ok);
   if(blockers.length){toast('ยังเปิดร้านไม่ได้ กรุณาตรวจความพร้อมก่อน');$('checkReadiness').click();return}
   if(!confirm('ยืนยันว่าได้ทดสอบ LINE Login, การแจ้งออเดอร์ และราคาเมนูจริงครบแล้ว? เปิดรับออเดอร์ใหม่ทันที'))return;
   await request('admin/shop',{method:'POST',body:JSON.stringify({enabled:true,ownerConfirmed:true})});
   toast('เปิดรับออเดอร์ระบบใหม่เรียบร้อย');
  }
  await bootMenu();$('checkReadiness').click();
 }catch(e){toast(e.message)}
});
$('checkReadiness').addEventListener('click',async()=>{
 const el=$('readinessReport');el.hidden=false;el.textContent='กำลังตรวจสอบความพร้อม…';
 try{
  const r=await request('admin/readiness');
  el.innerHTML='<strong>สถานะระบบ: '+(r.ordersEnabled?'พร้อมเปิดรับออเดอร์':'ยังไม่พร้อม')+'</strong><p>สินค้า '+r.catalog.total+' รายการ · รอยืนยันราคา '+r.catalog.unverified+' รายการ</p><ul>'+
   r.checks.map(x=>'<li>'+escapeText(x.label)+' — '+(x.ok?'พร้อม ✓':'ยังไม่พร้อม')+'</li>').join('')+'</ul><p class="caption">ต้องทดสอบ LINE Login และข้อความแจ้งออเดอร์ถึงมือถือเจ้าของร้านจริงก่อนเปิดรับออเดอร์</p>';
 }catch(e){el.textContent=e.message}
});
restoreBasket();
(async()=>{
 await bootMenu();
 if(!state.ready){
  gateStatus('ไม่สามารถโหลดรายการสินค้าได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',true);
  return;
 }
 await loadMember();
 if(state.member){
  clearLoginAttempt();
  showShopAfterLogin();
  return;
 }
 await authenticate(false);
})();