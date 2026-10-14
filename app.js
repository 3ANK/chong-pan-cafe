/* Chong & Pan ordering v2 — no real orders until SHOP_ENABLED is configured server-side. */
'use strict';
const $=id=>document.getElementById(id);
const state={products:[],categories:[],basket:[],orders:[],paymentConfig:{qrEnabled:false,qrImage:'',oaId:''},member:null,ready:false,canOrder:false,selectedCategory:'ทั้งหมด',selectedProduct:null,liffId:'',admin:false};
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
function setTab(tab){for(const t of ['menu','history'])show(t+'Panel',t===tab);document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));if(tab==='history')loadHistory()}
function paintMember(){const m=state.member;$('memberName').textContent=m?.name||'ยังไม่ได้เข้าสู่ระบบ';$('points').textContent=m?.points??'–';$('loginBtn').textContent=m?'บัญชี LINE ✓':'เข้าสู่ LINE';state.admin=!!m?.isOwner;show('adminShortcut',state.admin);paintBasket()}
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
function orderCard(o,admin=false){let items=Array.isArray(o.items)?o.items:[];return `<div class="ordercard"><div class="adminrow"><strong>ออเดอร์ #${escapeText(o.id.slice(0,8).toUpperCase())}</strong><span class="tag">${escapeText(statusName(o.status))}</span></div><p class="small">${new Date(o.created_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</p><p>${items.map(i=>escapeText(i.name)+' ×'+i.qty).join(' · ')}</p><p><strong>${fmt(o.total)}</strong> · ${o.fulfillment==='delivery'?'จัดส่ง':'รับที่ร้าน'}</p><p class="pay-label">${escapeText(paymentLabel(o))}</p>${o.payment_method==='qr'&&o.payment_status!=='verified'&&state.paymentConfig.qrEnabled?'<button type="button" class="secondary pay-slip-reopen" data-resend-slip="'+escapeText(o.id)+'">แสดง QR / ส่งสลิปให้ร้าน</button>':''}${admin?`<p class="small">${escapeText(o.display_name||'')} ${escapeText(o.delivery_address||'')}</p><div class="inline">${['accepted','preparing','ready','completed','cancelled'].filter(s=>s!==o.status).map(s=>`<button class="secondary" data-status="${s}" data-order="${escapeText(o.id)}">${escapeText(statusName(s))}</button>`).join('')}</div>`:''}</div>`}
async function loadHistory(){if(!state.member){$('orderHistory').textContent='กรุณาเข้าสู่ระบบ LINE เพื่อดูประวัติ';return}try{const r=await request('orders');state.orders=r.orders;$('orderHistory').innerHTML=r.orders.length?r.orders.map(x=>orderCard(x)).join(''):'<div class="empty">ยังไม่มีประวัติออเดอร์</div>';$('orderHistory').querySelectorAll('[data-resend-slip]').forEach(b=>b.addEventListener('click',()=>{const o=state.orders.find(x=>x.id===b.dataset.resendSlip);if(o)showQrPayment(o.id,o.total)}) )}catch(e){$('orderHistory').textContent=e.message}}

function paymentLabel(o){
 const method={cash:'เงินสด · ชำระเมื่อรับสินค้า',qr:'สแกนจ่าย',legacy:'ออเดอร์ก่อนเพิ่มตัวเลือกชำระเงิน'}[o.payment_method]||'ยังไม่ระบุวิธีจ่าย';
 return method+' · '+(o.payment_status==='verified'?'ร้านยืนยันรับเงินแล้ว':o.payment_method==='qr'?'รอร้านตรวจสอบสลิป':'ยังไม่ยืนยันรับเงิน');
}
async function bootPayments(){
 try{
  state.paymentConfig=await request('payment/config');
  $('payQrOption').disabled=!state.paymentConfig.qrEnabled;
  $('qrPayStatus').textContent=state.paymentConfig.qrEnabled?'แสดง QR หลังส่งออเดอร์ · ส่งสลิปใน LINE OA':'ยังไม่เปิดรับ QR กรุณาเลือกเงินสด';
  if(!state.paymentConfig.qrEnabled&&$('payQrOption').checked)document.querySelector('[name=paymentMethod][value=cash]').checked=true;
 }catch(e){
  state.paymentConfig={qrEnabled:false,qrImage:'',oaId:''};
  $('qrPayStatus').textContent='ไม่สามารถเชื่อมต่อการสแกนจ่าย';
 }
}
function showQrPayment(orderId,total){
 const cfg=state.paymentConfig;if(!cfg.qrEnabled||!cfg.oaId||!cfg.qrImage){alert('ยังไม่สามารถเปิด QR ร้านได้ กรุณาติดต่อร้าน');return}
 const short=String(orderId).slice(0,8).toUpperCase();
 const message='แจ้งส่งสลิปชำระเงิน ชง&ปั่น ออเดอร์ #'+short+' ยอด '+total+' บาท (กรุณากดส่งข้อความนี้และแนบรูปสลิป)';
 const link='https://line.me/R/oaMessage/'+encodeURIComponent(cfg.oaId)+'/?'+encodeURIComponent(message);
 $('paymentOrderRef').textContent='#'+short;
 $('paymentAmount').textContent=fmt(total);
 $('shopPaymentQr').src=cfg.qrImage;
 $('sendSlipLink').href=link;
 $('paymentDialog').showModal();
}
async function placeOrder(){
 if(!state.canOrder)return toast('ร้านยังไม่เปิดรับออเดอร์');
 if(!state.member)return authenticate(true);
 if(!state.basket.length)return;
 const fulfillment=$('fulfillment').value;
 const deliveryAddress=$('deliveryAddress').value.trim();
 if(fulfillment==='delivery'&&!deliveryAddress)return toast('กรุณากรอกที่อยู่จัดส่ง');
 const paymentMethod=document.querySelector('input[name="paymentMethod"]:checked')?.value||'cash';
 if(paymentMethod==='qr'&&!state.paymentConfig.qrEnabled)return toast('สแกนจ่ายยังไม่พร้อม กรุณาเลือกเงินสด');
 const items=state.basket.map(({id,qty,sweetness,egg,note})=>({id,qty,sweetness,egg,note}));
 const reqKey=crypto.randomUUID();$('placeOrder').disabled=true;
 try{
  const r=await request('orders',{method:'POST',body:JSON.stringify({items,fulfillment,deliveryAddress,paymentMethod,note:$('orderNote').value.trim(),requestKey:reqKey})});
  state.basket=[];saveBasket();paintBasket();$('cartDialog').close();
  if(r.ownerAlertOk===false){
   alert('ระบบบันทึกออเดอร์ #'+r.orderId.slice(0,8)+' แล้ว แต่แจ้งร้านไม่สำเร็จ กรุณาโทร 062-594-6399 เพื่อยืนยัน อย่าสั่งซ้ำและยังไม่ต้องโอนเงิน');
  }else{
   toast('ส่งออเดอร์สำเร็จ #'+r.orderId.slice(0,8));
  }
  setTab('history');
  if(paymentMethod==='qr'&&r.ownerAlertOk!==false)showQrPayment(r.orderId,r.total);
 }catch(e){toast(e.message)}finally{$('placeOrder').disabled=!state.canOrder}
}
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
$('lineGateRetry').addEventListener('click',async()=>{
 if(!state.ready){
  gateStatus('กำลังโหลดระบบสั่งซื้ออีกครั้ง…');
  await Promise.all([bootMenu(),bootPayments()]);
  if(!state.ready){
   gateStatus('เชื่อมต่อร้านไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วกดลองใหม่',true);
   return;
  }
 }
 await loadMember();
 if(state.member){
  clearLoginAttempt();
  showShopAfterLogin();
  return;
 }
 await authenticate(true);
});$('addSelectedItem').addEventListener('click',addItem);$('openBasket').addEventListener('click',()=>$('cartDialog').showModal());$('fulfillment').addEventListener('change',()=>show('addressLabel',$('fulfillment').value==='delivery'));$('placeOrder').addEventListener('click',placeOrder);$('closePaymentDialog').addEventListener('click',()=>$('paymentDialog').close());
$('donePaymentDialog').addEventListener('click',()=>$('paymentDialog').close());
restoreBasket();
(async()=>{
 await Promise.all([bootMenu(),bootPayments()]);
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