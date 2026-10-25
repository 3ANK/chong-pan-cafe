/* Chong & Pan ordering v2 — no real orders until SHOP_ENABLED is configured server-side. */
'use strict';
const $=id=>document.getElementById(id);
const state={products:[],categories:[],basket:[],orders:[],paymentConfig:{qrEnabled:false,qrImage:'',oaId:''},member:null,pointsToUse:0,usePoints:false,redeemMode:new URLSearchParams(location.search).get('redeem')==='1',ready:false,canOrder:false,selectedCategory:'ทั้งหมด',selectedRiceCategory:'ทั้งหมด',selectedGroup:'food',selectedProduct:null,liffId:'',admin:false};
const fmt=n=>'฿'+Number(n||0).toLocaleString('th-TH');
const costLabel=n=>state.redeemMode?Number(n||0).toLocaleString('th-TH')+' แต้ม':fmt(n);
const escapeText=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show=(id,visible)=>$(id).hidden=!visible;
let timer;
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(timer);timer=setTimeout(()=>$('toast').style.display='none',3800)}
let checkoutMessageOverride='';
function checkoutStatus(message,error=false){const el=$('checkoutHint');if(!el)return;el.textContent=message;el.classList.toggle('checkout-error',error);el.setAttribute('role',error?'alert':'status')}
async function request(path,opts={}){
 const controller=new AbortController();
 const duration=path==='orders'&&opts.method==='POST'?20000:15000;
 const timeout=setTimeout(()=>controller.abort(),duration);
 try{
  const r=await fetch('/api/'+path,{credentials:'same-origin',...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})},signal:controller.signal});
  let j;try{j=await r.json()}catch{throw Error('ระบบตอบกลับไม่ถูกต้อง')}
  if(!r.ok)throw Error(j.error||'ระบบขัดข้อง');
  return j;
 }catch(e){if(e?.name==='AbortError')throw Error('การเชื่อมต่อช้าเกินไป กรุณาลองอีกครั้ง');if(e instanceof TypeError)throw Error(navigator.onLine===false?'ไม่มีอินเทอร์เน็ต กรุณาเชื่อมต่อแล้วลองอีกครั้ง':'เชื่อมต่อระบบไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง');throw e}
 finally{clearTimeout(timeout)}
}
const eggEligibleCategories=new Set(['ข้าวกระเพรา','กะเพรา','ข้าวกระเทียม']);
const supportsEgg=p=>!!p&&eggEligibleCategories.has(p.category);
function keyOf(item){return JSON.stringify([item.id,item.sweetness,item.egg,item.egg?item.eggQty??1:0,item.note])}
function extra(item){return (({fried:10,omelet:10,creamy:20})[item.egg]||0)*(item.egg?(item.eggQty??1):0)}
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
// Every catalog item belongs to exactly one main group. New categories fall back by product type.
const riceCategories=new Set(['ข้าวกระเพรา','ข้าวผัด','ข้าวกระเทียม','ข้าวไข่','ข้าวต้ม','ข้าวสั่งแยก','ข้าวและไข่สั่งแยก','เทอริยากิ']);
const riceCategoryOrder=['ข้าวกระเพรา','ข้าวผัด','ข้าวกระเทียม','ข้าวไข่','ข้าวต้ม','ข้าวสั่งแยก','เทอริยากิ','ข้าวและไข่สั่งแยก'];
const riceGroupCategory='__rice__';
const menuGroupCategories={
 food:new Set(['ข้าว','ข้าวกระเพรา','ข้าวผัด','ข้าวกระเทียม','ข้าวไข่','ข้าวต้ม','ไข่สั่งแยก','ข้าวสั่งแยก','ข้าวและไข่สั่งแยก','เทอริยากิ','ส้มตำ','สปาเก็ตตี้']),
 drinks:new Set(['กาแฟ','ชาและนม','มัทฉะ','ผลไม้สดปั่น','โซดา','น้ำผลไม้','น้ำปั่น','ท็อปปิง','น้ำเปล่า/น้ำอัดลม']),
 dessert:new Set(['ขนมปัง','ดิปสังขยา','ดิปและของทานเล่น'])
};
function groupForProduct(p){
 if(menuGroupCategories.food.has(p.category))return 'food';
 if(menuGroupCategories.drinks.has(p.category))return 'drinks';
 if(menuGroupCategories.dessert.has(p.category)||/ขนม|สังขยา|เบเกอรี/.test(p.category))return 'dessert';
 return p.drink?'drinks':'food';
}
function menuGroups(){
 const q=$('search').value.trim().toLowerCase();
 const valid=state.products.filter(p=>{
  if(!(q?p.name.toLowerCase().includes(q):groupForProduct(p)===state.selectedGroup))return false;
  if(state.selectedCategory==='ทั้งหมด')return true;
  if(state.selectedGroup==='food'&&state.selectedCategory===riceGroupCategory){
   return riceCategories.has(p.category)&&(state.selectedRiceCategory==='ทั้งหมด'||p.category===state.selectedRiceCategory);
  }
  return p.category===state.selectedCategory;
 });
 const groups={};for(const p of valid)(groups[p.category]||=[]).push(p);
 const rank=c=>c==='ข้าวกระเพรา'||c==='กะเพรา'?-1:c==='ข้าวและไข่สั่งแยก'?1:0;
 return Object.fromEntries(Object.entries(groups).sort(([a],[b])=>rank(a)-rank(b)));
}
function paintMenuGroupTabs(){
 const searching=!!$('search').value.trim();
 document.querySelectorAll('[data-menu-group]').forEach(b=>{
  const selected=!searching&&b.dataset.menuGroup===state.selectedGroup;
  b.classList.toggle('selected',selected);
  b.setAttribute('aria-pressed',String(selected));
 });
 $('categoryHint').textContent=searching?'ผลการค้นหาทุกหมวด':state.selectedGroup==='food'
  ?state.selectedCategory===riceGroupCategory?'เลือกเมนูย่อยในหมวดข้าว':'เลือกหมวดอาหาร'
  :'เลือกหมวดย่อย';
}
function paintCategories(){
 const q=$('search').value.trim().toLowerCase();
 const products=state.products.filter(p=>q?p.name.toLowerCase().includes(q):groupForProduct(p)===state.selectedGroup);
 const availableCategories=[...new Set(products.map(p=>p.category))];
 const isFood=state.selectedGroup==='food'&&!q;
 const riceSubs=riceCategoryOrder.filter(c=>availableCategories.includes(c));
 const preferredFoodOrder=['สปาเก็ตตี้','ส้มตำ'];
 const otherFood=[...preferredFoodOrder.filter(c=>availableCategories.includes(c)),...availableCategories.filter(c=>!riceCategories.has(c)&&!preferredFoodOrder.includes(c))];
 const mainCategories=isFood
  ?['ทั้งหมด',...(riceSubs.length?[riceGroupCategory]:[]),...otherFood]
  :['ทั้งหมด',...availableCategories];
 if(!mainCategories.includes(state.selectedCategory))state.selectedCategory='ทั้งหมด';
 if(state.selectedCategory===riceGroupCategory&&!riceSubs.includes(state.selectedRiceCategory))state.selectedRiceCategory='ทั้งหมด';
 const mascotPoses={'กาแฟ':0,'ชาและนม':1,'มัทฉะ':2,'ผลไม้สดปั่น':3,'ข้าวกระเพรา':4,'ส้มตำ':5,'สปาเก็ตตี้':4,'ข้าวกระเทียม':4,'ข้าวไข่':4,'ไข่สั่งแยก':4,'ข้าวสั่งแยก':4,'ขนมปัง':6,'ดิปสังขยา':6,'ท็อปปิง':6,'โซดา':7,'น้ำผลไม้':7,'น้ำปั่น':3};
 const mascotFor=category=>{
  if(Object.prototype.hasOwnProperty.call(mascotPoses,category))return mascotPoses[category];
  if(/กาแฟ/.test(category))return 0;
  if(/มัทฉะ/.test(category))return 2;
  if(/ส้มตำ/.test(category))return 5;
  if(/ชา|นม/.test(category))return 1;
  if(/ผลไม้|น้ำปั่น/.test(category))return 3;
  if(/โซดา|น้ำผลไม้/.test(category))return 7;
  if(/ขนม|สังขยา|ท็อปปิง/.test(category))return 6;
  if(/อาหาร|กะเพรา|สปาเก็ตตี้|ข้าว|ไข่/.test(category))return 4;
  return -1;
 };
 const button=(category,label,selected,mascot=true)=>{
  const pose=mascot?mascotFor(category):-1,icon=pose<0?'':`<span class="category-mascot pose-${pose}" aria-hidden="true"></span>`;
  return `<button type="button" data-cat="${escapeText(category)}" class="${selected?'selected':''}" aria-pressed="${selected}">${icon}<span>${escapeText(label)}</span></button>`;
 };
 $('categories').classList.toggle('food-categories',isFood);
 if(isFood){
  const main=mainCategories.map(c=>button(c,c===riceGroupCategory?'ข้าว':c,c===state.selectedCategory,false)).join('');
  const sub=state.selectedCategory===riceGroupCategory
   ?`<div class="food-category-row food-rice-subcategories"><small>เมนูข้าว</small>${button('ทั้งหมด','ทั้งหมด',state.selectedRiceCategory==='ทั้งหมด',false)}${riceSubs.map(c=>button(c,c,c===state.selectedRiceCategory,false)).join('')}</div>`
   :'';
  $('categories').innerHTML=`<div class="food-category-row">${main}</div>${sub}`;
 }else{
  $('categories').innerHTML=mainCategories.map(c=>{
   const pose=c==='ทั้งหมด'?-1:mascotFor(c),icon=pose<0?'':`<span class="category-mascot pose-${pose}" aria-hidden="true"></span>`;
   return `<button type="button" data-cat="${escapeText(c)}" class="${c===state.selectedCategory?'selected':''}" aria-pressed="${c===state.selectedCategory}">${icon}<span>${escapeText(c)}</span></button>`;
  }).join('');
 }
 $('categories').querySelectorAll('button[data-cat]').forEach(b=>b.addEventListener('click',()=>{
  const category=b.dataset.cat;
  if(isFood&&b.closest('.food-rice-subcategories')){
   state.selectedRiceCategory=category;
  }else{
   state.selectedCategory=category;
   state.selectedRiceCategory='ทั้งหมด';
  }
  paintMenuGroupTabs();paintCategories();paintCatalog();
 }));
}
function setMenuGroup(group,scroll=true){
 if(!menuGroupCategories[group])return;
 state.selectedGroup=group;state.selectedCategory='ทั้งหมด';$('search').value='';
 hideNextStep();paintMenuGroupTabs();paintCategories();paintCatalog();
 if(scroll){document.activeElement?.blur?.();$('menuExplorer').scrollIntoView({behavior:'smooth',block:'start'});}
}
function hideNextStep(){show('nextStepBar',false)}
let nextStepTarget='drinks';
function suggestNextStep(product){
 const group=groupForProduct(product);
 nextStepTarget=group==='food'?'drinks':group==='drinks'?'dessert':'';
 if(!nextStepTarget){hideNextStep();return}
 $('nextStepLabel').textContent='เพิ่ม '+product.name+' แล้ว';
 $('nextStepButton').textContent=nextStepTarget==='drinks'?'🥤 เลือกเครื่องดื่มต่อ →':'🍞 เลือกขนมต่อ →';
 show('nextStepBar',true);
}
function paintCatalog(){
 const groups=menuGroups();
 const html=Object.entries(groups).map(([category,products])=>{
  const cards=products.map(p=>{
   const hint=p.price<=0?'รอกำหนดราคา'
    :!p.available?'ยังไม่เปิดขาย'
    :state.redeemMode?'ราคาที่แสดงคือแต้มที่ใช้แลก'
    :p.drink?'เลือกระดับความหวานได้'
    :supportsEgg(p)?'เพิ่มไข่ดาว ไข่เจียว หรือไข่ข้นได้':'';
   const deal=p.id==='30'&&p.price===15
    ?'2 ชิ้น '+(state.redeemMode?'25 แต้ม':'25 บาท')
    :((p.id==='31'||p.id==='32')&&p.price===20)
     ?'2 ชิ้น '+(state.redeemMode?'35 แต้ม':'35 บาท'):'';
   const details=[hint,deal].filter(Boolean).join(' · ');
   const image=p.image
    ?`<img loading="lazy" src="${escapeText(p.image)}" alt="${escapeText(p.name)}">`
    :escapeText(p.emoji||'🥤');
   return `<article class="item"><div class="productart">${image}</div><div class="itembody"><div class="itemtitle">${escapeText(p.name)}</div><div class="price">${p.price>0?costLabel(p.price):'รอยืนยันราคา'}</div>${details?`<div class="small">${escapeText(details)}</div>`:''}</div><button class="add" data-add="${escapeText(p.id)}" ${!p.available||p.price<=0?'disabled':''}>${state.redeemMode?'เลือกเมนู':'เพิ่ม +'}</button></article>`;
  }).join('');
  return `<div class="sectiontitle"><h2>${escapeText(category)}</h2><small>${products.length} รายการ</small></div>${cards}`;
 }).join('');
 $('catalog').innerHTML=html||'<p class="empty">ไม่พบเมนูที่ค้นหา</p>';
 $('catalog').querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>openOption(b.dataset.add)));
}
let optionQuantity=1;
let optionEggQuantity=1;
const proteinChoiceIds=new Set(['45','rice-porridge']);
const needsProteinChoice=p=>!!p&&proteinChoiceIds.has(String(p.id));
function selectedOptionItem(){
 const p=state.selectedProduct;
 if(!p)return null;
 const protein=needsProteinChoice(p)?$('protein').value:'';
 const orderNote=[protein?'เลือกเนื้อสัตว์: '+protein:'',$('itemNote').value.trim()].filter(Boolean).join(' | ').slice(0,140);
 return {id:p.id,name:p.name,price:p.price,qty:optionQuantity,sweetness:p.drink?$('sweetness').value:'',egg:supportsEgg(p)?$('egg').value:'',eggQty:supportsEgg(p)&&$('egg').value?optionEggQuantity:0,note:orderNote};
}
function paintOptionQuantity(){
 const draft=selectedOptionItem();
 if(!draft)return;
 $('optionQuantity').textContent=String(optionQuantity);
 show('eggQuantityGroup',!!draft.egg);
 $('eggQuantity').textContent=String(draft.eggQty||1);
 $('decreaseEggQty').disabled=!draft.egg||draft.eggQty<=1;
 $('increaseEggQty').disabled=!draft.egg||draft.eggQty>=5;
 $('decreaseOptionQty').disabled=optionQuantity<=1;
 $('increaseOptionQty').disabled=optionQuantity>=20;
 const sum=costLabel(lineSubtotal(draft));
 $('optionQuantityPrice').textContent='รวม '+sum;
 $('addSelectedItem').textContent=(state.redeemMode?'เลือกเมนู ':'ใส่ตะกร้า ')+optionQuantity+' รายการ · '+sum;
}
function setOptionEggQuantity(next){
 optionEggQuantity=Math.max(1,Math.min(5,Math.trunc(Number(next)||1)));
 paintOptionQuantity();
}
function setOptionQuantity(next){
 optionQuantity=Math.max(1,Math.min(20,Math.trunc(Number(next)||1)));
 paintOptionQuantity();
}
function openOption(id){
 const p=state.products.find(p=>p.id===id);
 if(!p||!p.available||p.price<=0)return;
 state.selectedProduct=p;
 $('optionTitle').textContent=p.name+' · '+costLabel(p.price)+(state.redeemMode?'':(p.id==='30'&&p.price===15?' · 2 ชิ้น 25 บาท':(p.id==='31'||p.id==='32')&&p.price===20?' · 2 ชิ้น 35 บาท':''));
 const eggUnit=state.redeemMode?'แต้ม':'บาท';
 for(const o of $('egg').options){if(!o.value)o.textContent='ไม่เพิ่มไข่';else{o.textContent=({fried:'ไข่ดาว',omelet:'ไข่เจียว',creamy:'ไข่ข้น'})[o.value]+' +'+({fried:10,omelet:10,creamy:20})[o.value]+' '+eggUnit}}
 show('sweetnessGroup',!!p.drink);
 show('eggGroup',supportsEgg(p));
 show('proteinGroup',needsProteinChoice(p));
 $('protein').value='หมู';
 $('itemNote').value='';
 $('sweetness').value='ปกติ';
 $('egg').value='';
 optionEggQuantity=1;
 setOptionQuantity(1);
 $('optionDialog').showModal();
}
function addItem(){
 const item=selectedOptionItem();
 if(!item||!Number.isInteger(item.qty)||item.qty<1||item.qty>20||item.egg&&(item.eggQty<1||item.eggQty>5))return;
 const other=state.basket.find(x=>keyOf(x)===keyOf(item));
 if(other){
  if(other.qty+item.qty>20)return toast('จำนวนเมนูที่มีตัวเลือกเหมือนกันรวมได้สูงสุด 20 รายการ กรุณาลดจำนวนก่อน');
  other.qty+=item.qty;
 }else{
  state.basket.push(item);
 }
 saveBasket();
 paintBasket();
 $('optionDialog').close();
 suggestNextStep(state.selectedProduct);
 toast('เพิ่ม '+item.name+' '+item.qty+' รายการลงตะกร้าแล้ว');
}
function pointsUsedForOrder(){return state.redeemMode?subTotal():0}
function syncPointSpendUi(){
 const balance=Math.max(0,Number(state.member?.points)||0),total=subTotal(),used=pointsUsedForOrder();
 show('regularPointsControls',false);show('redemptionPointsDetails',state.redeemMode);
 show('paymentSelector',!state.redeemMode);show('cashPaymentHelp',!state.redeemMode);show('cartTotalDueRow',!state.redeemMode);
 $('cartSumLabel').textContent=state.redeemMode?'มูลค่าเมนูที่แลก':'รวมสินค้า';
 $('cartSum').textContent=costLabel(total);
 $('cartTotalDueLabel').textContent=state.redeemMode?'แต้มที่ใช้แลก':'ยอดชำระ';
 $('cartTotalDue').textContent=state.redeemMode?used.toLocaleString('th-TH')+' แต้ม':fmt(total);
 $('pointsAvailableText').textContent='แต้มคงเหลือ '+balance.toLocaleString('th-TH')+' แต้ม';
 $('cartPointsUsed').textContent=used.toLocaleString('th-TH')+' แต้ม';
 $('pointsRemainingAfter').textContent=Math.max(0,balance-used).toLocaleString('th-TH')+' แต้ม';
 $('placeOrder').textContent=state.redeemMode?'ยืนยันแลกเมนู':'ยืนยันสั่งอาหาร';
 $('placeOrder').disabled=!state.canOrder||!state.member||!state.basket.length||(state.redeemMode&&balance<used);
 if(!checkoutMessageOverride){
  if(!state.canOrder)checkoutStatus('ร้านยังไม่เปิดรับออเดอร์ในขณะนี้');
  else if(!state.member)checkoutStatus('เข้าสู่ LINE ก่อนยืนยันออเดอร์');
  else if(state.redeemMode&&balance<used)checkoutStatus('แต้มไม่พอสำหรับเมนูที่เลือก · ต้องใช้ '+used.toLocaleString('th-TH')+' แต้ม');
  else checkoutStatus(state.redeemMode?'ตรวจสอบเมนูและแต้มที่จะใช้แลกก่อนยืนยัน':'ตรวจสอบรายการก่อนยืนยันออเดอร์');
 }
}
function paintBasket(){
 const count=state.basket.reduce((n,it)=>n+it.qty,0);
 show('basketBar',count>0);
 $('basketLabel').textContent=count+' รายการ';
 $('basketTotal').textContent=subTotal().toLocaleString('th-TH');
 $('basketTotalUnit').textContent=state.redeemMode?'แต้ม':'บาท';
 $('cartSum').textContent=costLabel(subTotal());
 $('cartItems').innerHTML=state.basket.map((it,i)=>'<div class="cartline"><div><strong>'+escapeText(it.name)+'</strong><br><small>'+escapeText([it.sweetness,it.egg?({fried:'ไข่ดาว',omelet:'ไข่เจียว',creamy:'ไข่ข้น'})[it.egg]+' '+(it.eggQty??1)+' ฟอง/จาน':'',it.note].filter(Boolean).join(' · '))+'</small><div>'+costLabel(lineSubtotal(it))+'</div></div><div class="cartbuttons"><button data-qty="'+i+'" data-step="-1" aria-label="ลดจำนวน">−</button>'+it.qty+'<button data-qty="'+i+'" data-step="1" aria-label="เพิ่มจำนวน">+</button></div></div>').join('')||'<p class="empty">ตะกร้าว่าง</p>';
 for(const b of $('cartItems').querySelectorAll('[data-qty]'))b.addEventListener('click',()=>{const i=Number(b.dataset.qty);state.basket[i].qty+=Number(b.dataset.step);if(state.basket[i].qty<1)state.basket.splice(i,1);if(state.basket[i]?.qty>20)state.basket[i].qty=20;saveBasket();paintBasket()});
 syncPointSpendUi();
 $('placeOrder').disabled=!state.canOrder||!state.member||!count||(state.redeemMode&&Number(state.member?.points||0)<subTotal());
 show('redemptionBanner',state.redeemMode);
 if(!checkoutMessageOverride&&!state.redeemMode)checkoutStatus(!state.canOrder?'ระบบทดลอง ยังไม่เปิดรับออเดอร์จริง':!state.member?'เข้าสู่ LINE ก่อนยืนยันออเดอร์':'ตรวจสอบราคาและยอดชำระก่อนสั่ง');
}
function setTab(tab){hideNextStep();for(const t of ['menu','history'])show(t+'Panel',t===tab);document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));if(tab==='history')loadHistory()}
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
  await Promise.race([
   liff.init({liffId:state.liffId}),
   new Promise((_,reject)=>setTimeout(()=>reject(Error('LINE เชื่อมต่อช้าเกินไป กรุณากดเชื่อมต่ออีกครั้ง')),18000))
  ]);
  if(!liff.isLoggedIn()){
   if(loginWasAttempted()&&!userInitiated)throw Error('ยังไม่ได้ยืนยันการเชื่อมต่อ LINE กรุณากดปุ่มด้านล่างเพื่อลองอีกครั้ง');
   markLoginAttempt();
   gateStatus('กำลังเปิดหน้าขออนุญาตเชื่อมต่อ LINE…');
   liff.login({redirectUri:location.origin+location.pathname+(state.redeemMode?'?redeem=1':'')});
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
const historyEggNames={fried:'ไข่ดาว',omelet:'ไข่เจียว',creamy:'ไข่ข้น'};
function historyItemLabel(i){
 const info=[];
 if(i.sweetness)info.push(i.sweetness);
 if(i.egg)info.push((historyEggNames[i.egg]||'ไข่')+' '+(Number(i.eggQty)>0?Number(i.eggQty):1)+' ฟอง/จาน');
 if(i.note)info.push(String(i.note));
 return String(i.name||'สินค้าเก่า')+' ×'+i.qty+(info.length?' ('+info.join(' · ')+')':'');
}
function orderCard(o,admin=false){
 const items=Array.isArray(o.items)?o.items:[];
 const itemLines=items.map(i=>'<span class="history-line">'+escapeText(historyItemLabel(i))+'</span>').join('');
 const repeatButton=!admin?'<button type="button" class="primary reorder-button" data-repeat-order="'+escapeText(o.id)+'">↻ สั่งซื้อซ้ำ</button>':'';
 const slipButton=o.payment_method==='qr'&&o.payment_status!=='verified'&&state.paymentConfig.qrEnabled?
 '<button type="button" class="secondary pay-slip-reopen" data-resend-slip="'+escapeText(o.id)+'">แสดง QR / ส่งสลิปให้ร้าน</button>':'';
 const adminTools=admin?'<p class="small">'+escapeText(o.display_name||'')+' '+escapeText(o.delivery_address||'')+'</p><div class="inline">'+['accepted','preparing','ready','completed','cancelled'].filter(s=>s!==o.status).map(s=>'<button class="secondary" data-status="'+s+'" data-order="'+escapeText(o.id)+'">'+escapeText(statusName(s))+'</button>').join('')+'</div>':'';
 return '<div class="ordercard"><div class="adminrow"><strong>ออเดอร์ #'+escapeText(o.id.slice(0,8).toUpperCase())+'</strong><span class="tag">'+escapeText(statusName(o.status))+'</span></div>'+
 '<p class="small">'+new Date(o.created_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})+'</p>'+
 '<p class="history-items">'+itemLines+'</p>'+
 '<p><strong>'+(o.isPointsRedemption||o.payment_method==='points'?'แลกด้วย '+Number(o.points_used||0).toLocaleString('th-TH')+' แต้ม':fmt(o.total))+'</strong> · '+(o.fulfillment==='delivery'?'จัดส่ง':'รับที่ร้าน')+(Number(o.points_used)>0&&o.payment_method!=='points'?' · ใช้แต้ม '+Number(o.points_used).toLocaleString('th-TH')+' แต้ม':'')+'</p>'+
 '<p class="pay-label">'+escapeText(paymentLabel(o))+'</p>'+
 '<div class="order-history-actions">'+repeatButton+slipButton+'</div>'+adminTools+'</div>';
}
const repeatSweetness=new Set(['','ปกติ','หวานน้อย','ไม่หวาน','ไม่เติมน้ำตาล','เติมหวานน้อย','เติมหวานปกติ']);
const repeatEggTypes=new Set(['fried','omelet','creamy']);
function buildRepeatBasket(order,products,currentBasket){
 const catalog=new Map(products.map(p=>[String(p.id),p]));
 const basket=currentBasket.map(item=>({...item}));
 const added=[],skipped=[],repriced=[];
 for(const old of Array.isArray(order.items)?order.items:[]){
  const p=catalog.get(String(old.id));
  const label=String(old.name||'สินค้าเก่า');
  const qty=Number(old.qty);
  if(!p||!p.available||p.price<=0||!Number.isInteger(qty)||qty<1||qty>20){
   skipped.push(label+' (ไม่พร้อมจำหน่ายหรือจำนวนไม่ถูกต้อง)');continue;
  }
  const egg=String(old.egg||'');
  const eggQty=egg?(old.eggQty==null||Number(old.eggQty)===0?1:Number(old.eggQty)):0;
  const sweetness=p.drink?String(old.sweetness||'ปกติ'):'';
  if((egg&&(!supportsEgg(p)||!repeatEggTypes.has(egg)||!Number.isInteger(eggQty)||eggQty<1||eggQty>5))
     ||!repeatSweetness.has(sweetness)){
   skipped.push(label+' (ตัวเลือกเดิมใช้ไม่ได้แล้ว)');continue;
  }
  const it={id:String(p.id),name:p.name,price:p.price,qty,sweetness,egg,eggQty,note:String(old.note||'').slice(0,140)};
  const same=basket.find(x=>keyOf(x)===keyOf(it));
  if((same&&same.qty+qty>20)||(!same&&basket.length>=35)){
   skipped.push(label+' (จำนวนในตะกร้าเกินกำหนด)');continue;
  }
  if(Number(old.price)!==Number(p.price)||Number(old.eggPrice||0)!==extra(it))repriced.push(p.name);
  if(same)same.qty+=qty;else basket.push(it);
  added.push(it);
 }
 return {basket,added,skipped,repriced};
}
async function repeatOrder(id,button){
 if(!state.member)return toast('กรุณาเข้าสู่ LINE ก่อนสั่งซื้อซ้ำ');
 const order=state.orders.find(o=>o.id===id);if(!order)return toast('ไม่พบออเดอร์นี้ กรุณาโหลดประวัติใหม่');
 const warnings=[];
 if(['pending','accepted','preparing','ready'].includes(order.status))warnings.push('ออเดอร์นี้ยังอยู่ระหว่างดำเนินการ โปรดตรวจสอบก่อนสั่งซ้ำ');
 if(state.basket.length)warnings.push('ตะกร้าปัจจุบันมีสินค้าอยู่แล้ว ระบบจะเพิ่มรายการใหม่โดยไม่ลบสินค้าเดิม');
 if(warnings.length&&!confirm(warnings.join('\n\n')+'\n\nนำรายการจากออเดอร์นี้มาใส่ตะกร้าใช่หรือไม่? (ยังไม่ส่งออเดอร์)'))return;
 button.disabled=true;
 try{
  if(!(await bootMenu()))throw Error('ตรวจเมนูและราคาล่าสุดไม่ได้ กรุณาลองใหม่');
  const plan=buildRepeatBasket(order,state.products,state.basket);
  if(!plan.added.length){
   alert('ยังสั่งซ้ำไม่ได้: '+(plan.skipped.slice(0,4).join(', ')||'ไม่มีรายการที่สั่งได้'));
   return;
  }
  if(plan.skipped.length||plan.repriced.length){
   let msg='พบรายการที่ต้องตรวจสอบก่อนสั่งซ้ำ:\n';
   if(plan.skipped.length)msg+='• ไม่ได้เพิ่ม '+plan.skipped.length+' รายการ: '+plan.skipped.slice(0,3).join(', ')+'\n';
   if(plan.repriced.length)msg+='• ราคาหรือตัวเลือกเปลี่ยน: '+[...new Set(plan.repriced)].slice(0,4).join(', ')+'\n';
   if(!confirm(msg+'\nต้องการเพิ่มเฉพาะ '+plan.added.length+' รายการที่พร้อมขายลงตะกร้าหรือไม่?'))return;
  }
  state.basket=plan.basket;saveBasket();paintBasket();setTab('menu');
  $('cartDialog').showModal();
  $('checkoutHint').textContent='สั่งซ้ำจากประวัติแล้ว กรุณาตรวจสอบสินค้า จำนวน ราคา และวิธีรับอาหารก่อนกดยืนยัน';
  toast('เพิ่มรายการจากออเดอร์เดิมลงตะกร้าแล้ว · ยังไม่ได้สั่งจริง');
 }catch(e){toast('สั่งซ้ำไม่สำเร็จ · '+(e.message||'กรุณาลองใหม่'))}
 finally{button.disabled=false}
}
let historyLoading=false;
async function loadHistory({silent=false}={}){
 if(!state.member){$('orderHistory').textContent='กรุณาเข้าสู่ระบบ LINE เพื่อดูประวัติ';return}
 if(historyLoading)return;
 if(silent&&$('orderHistory').contains(document.activeElement))return;
 historyLoading=true;
 try{
  const r=await request('orders');state.orders=r.orders;
  $('orderHistory').innerHTML=r.orders.length?r.orders.map(x=>orderCard(x)).join(''):'<div class="empty">ยังไม่มีประวัติออเดอร์</div>';
  $('orderHistory').querySelectorAll('[data-resend-slip]').forEach(b=>b.addEventListener('click',()=>{
   const o=state.orders.find(x=>x.id===b.dataset.resendSlip);if(o)showQrPayment(o.id,o.total);
  }));
  $('orderHistory').querySelectorAll('[data-repeat-order]').forEach(b=>b.addEventListener('click',()=>repeatOrder(b.dataset.repeatOrder,b)));
 }catch(e){if(!silent)$('orderHistory').textContent=e.message}
 finally{historyLoading=false}
}

function paymentLabel(o){
 if(o.isPointsRedemption||o.payment_method==='points')return 'แลกเมนูด้วยแต้ม · ไม่ต้องจ่ายเงินเพิ่ม';
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
 const link='https://line.me/R/oaMessage/'+encodeURIComponent(cfg.oaId); // Open LINE OA chat only, without any pre-filled or copied text.
 $('paymentOrderRef').textContent='#'+short;
 $('paymentAmount').textContent=fmt(total);
 $('shopPaymentQr').src=cfg.qrImage;
 $('sendSlipLink').href=link;
 $('paymentDialog').showModal();
}
async function placeOrder(){
 if(!state.canOrder){checkoutStatus('ร้านยังไม่เปิดรับออเดอร์ในขณะนี้ กรุณาติดต่อร้าน',true);return}
 if(!state.member){checkoutStatus('กรุณาเข้าสู่ระบบ LINE ก่อนยืนยันออเดอร์',true);return authenticate(true)}
 if(!state.basket.length){checkoutStatus('ยังไม่มีสินค้าในตะกร้า',true);return}
 const fulfillment=$('fulfillment').value,deliveryAddress=$('deliveryAddress').value.trim();
 if(fulfillment==='delivery'&&!deliveryAddress){checkoutStatus('กรุณากรอกที่อยู่จัดส่งก่อนส่งออเดอร์',true);$('deliveryAddress').focus();return}
 const redeemOnly=state.redeemMode;
 const paymentMethod=redeemOnly?'points':(document.querySelector('input[name="paymentMethod"]:checked')?.value||'cash');
 const pointsToUse=redeemOnly?subTotal():0,payable=subTotal()-pointsToUse;
 if(redeemOnly&&Number(state.member?.points||0)<pointsToUse){checkoutStatus('แต้มคงเหลือไม่พอสำหรับเมนูที่เลือก กรุณาอัปเดตยอดแต้ม',true);return}
 if(paymentMethod==='qr'&&payable>0&&!state.paymentConfig.qrEnabled){checkoutStatus('สแกนจ่ายยังไม่พร้อม กรุณาเลือกเงินสดหรือติดต่อร้าน',true);return}
 const items=state.basket.map(({id,qty,sweetness,egg,eggQty,note})=>({id,qty,sweetness,egg,eggQty:egg?(eggQty??1):0,note}));
 const payloadFingerprint=JSON.stringify({items,fulfillment,deliveryAddress,paymentMethod,redeemOnly,pointsToUse,note:$('orderNote').value.trim()});
 const pendingKeyName='chongpan-v2-pending-checkout';
 let previous=null;try{previous=JSON.parse(localStorage.getItem(pendingKeyName)||'null')}catch{}
 const reqKey=previous?.fingerprint===payloadFingerprint&&/^[0-9a-f-]{36}$/i.test(previous.key)?previous.key:crypto.randomUUID();
 try{localStorage.setItem(pendingKeyName,JSON.stringify({key:reqKey,fingerprint:payloadFingerprint}))}catch{}
 try{sessionStorage.setItem('chongpan-v2-pending-checkout-details',JSON.stringify({key:reqKey,fingerprint:payloadFingerprint,savedAt:Date.now(),payload:{items,fulfillment,deliveryAddress,paymentMethod,redeemOnly,pointsToUse,note:$('orderNote').value.trim()},basket:state.basket}))}catch{}
 checkoutMessageOverride='กำลังส่งคำสั่งซื้อ กรุณารอสักครู่และอย่ากดซ้ำ';
 checkoutStatus(checkoutMessageOverride);$('placeOrder').disabled=true;
 try{
  const r=await request('orders',{method:'POST',body:JSON.stringify({items,fulfillment,deliveryAddress,paymentMethod,redeemOnly,pointsToUse,note:$('orderNote').value.trim(),requestKey:reqKey})});
  try{localStorage.removeItem(pendingKeyName);sessionStorage.removeItem('chongpan-v2-pending-checkout-details')}catch{}
  checkoutMessageOverride='';
  state.basket=[];state.usePoints=false;state.pointsToUse=0;
  if(state.member&&Number.isFinite(Number(r.pointsRemaining)))state.member.points=Number(r.pointsRemaining);
  saveBasket();paintBasket();paintMember();$('cartDialog').close();
  if(r.confirmationPending){
   alert('บันทึกออเดอร์ #'+r.orderId.slice(0,8)+' แล้ว ขณะนี้กำลังตรวจสอบการแจ้งร้าน กรุณารอร้านยืนยัน และยังไม่ต้องโอนเงิน อย่าสั่งซ้ำ');
  }else if(r.ownerAlertOk!==true){
   alert('ระบบบันทึกออเดอร์ #'+r.orderId.slice(0,8)+' แล้ว แต่แจ้งร้านไม่สำเร็จ กรุณาโทร 062-594-6399 เพื่อยืนยัน อย่าสั่งซ้ำและยังไม่ต้องโอนเงิน');
  }else{
   toast((redeemOnly?'แลกเมนูสำเร็จ #':'ส่งออเดอร์สำเร็จ #')+r.orderId.slice(0,8)+(Number(r.pointsUsed)>0?' · ใช้ '+Number(r.pointsUsed)+' แต้ม':''));
  }
  setTab('history');
  if(r.paymentMethod==='qr'&&Number(r.total)>0&&r.ownerAlertOk===true)showQrPayment(r.orderId,r.total);
 }catch(e){checkoutMessageOverride='ส่งออเดอร์ยังไม่สำเร็จ: '+e.message+'. หากไม่แน่ใจว่าระบบได้รับออเดอร์หรือไม่ ให้ลองกดอีกครั้งด้วยรายการเดิม ระบบจะตรวจคำขอเดิมและป้องกันการสร้างซ้ำ';}
 finally{$('placeOrder').disabled=!state.canOrder;paintBasket();if(checkoutMessageOverride)checkoutStatus(checkoutMessageOverride,true)}
}
function restorePendingCheckout(){
 try{
  const raw=sessionStorage.getItem('chongpan-v2-pending-checkout-details');if(!raw)return false;
  const x=JSON.parse(raw),p=x?.payload;
  if(!p||!Array.isArray(p.items)||!Array.isArray(x.basket)||!/^([0-9a-f-]{36})$/i.test(x.key||''))return false;
  const expected=JSON.stringify({items:p.items,fulfillment:p.fulfillment,deliveryAddress:p.deliveryAddress,paymentMethod:p.paymentMethod,redeemOnly:p.redeemOnly,pointsToUse:p.pointsToUse,note:p.note});
  if(x.fingerprint!==expected)return false;
  const basket=x.basket.filter(it=>it&&typeof it.id==='string'&&Number.isInteger(it.qty)&&it.qty>0&&typeof it.name==='string'&&Number.isFinite(Number(it.price))).slice(0,70);
  if(!basket.length)return false;
  state.basket=basket;
  if(['pickup','delivery'].includes(p.fulfillment))$('fulfillment').value=p.fulfillment;
  $('deliveryAddress').value=String(p.deliveryAddress||'').slice(0,500);
  $('orderNote').value=String(p.note||'').slice(0,300);
  const method=document.querySelector('input[name="paymentMethod"][value="'+(p.paymentMethod==='qr'?'qr':'cash')+'"]');
  if(method)method.checked=true;
  show('addressLabel',$('fulfillment').value==='delivery');
  if(state.member)paintMember();else paintBasket();
  toast('กู้คืนรายการสั่งซื้อที่ส่งค้างไว้แล้ว · กรุณาเปิดตะกร้าเพื่อลองส่งรายการเดิม');
  return true;
 }catch{return false}
}
async function bootMenu(){try{const r=await request('menu');state.products=r.products;
  // The stored cart is an untrusted snapshot: use the current catalogue name and price.
  const current=new Map(state.products.map(p=>[p.id,p]));
  state.basket=state.basket.map(it=>{
   const p=current.get(it.id);
   if(!p||!p.available||p.price<=0)return null;
   return {...it,name:p.name,price:p.price,egg:supportsEgg(p)?it.egg:'',sweetness:p.drink?it.sweetness:''};
  }).filter(Boolean);saveBasket();
  restorePendingCheckout();saveBasket();
  state.liffId=r.liffId||'';state.canOrder=!!r.shopEnabled;show('legacyCheckout',!state.canOrder);$('statusBanner').className='notice '+(state.canOrder?'ok':'warn');$('statusBanner').textContent=state.canOrder?'พร้อมรับออเดอร์ผ่าน LINE':'ระบบใหม่อยู่ระหว่างทดสอบ · ยังไม่รับออเดอร์จริง · ราคาอ้างอิงจากข้อมูลเดิม';state.ready=true;paintMenuGroupTabs();paintCategories();paintCatalog();paintBasket();return true}catch(e){$('statusBanner').className='notice warn';$('statusBanner').textContent='เชื่อมต่อเมนูไม่สำเร็จ';$('catalog').innerHTML='<p class="empty">'+escapeText(e.message)+'</p>';return false}}
$('search').addEventListener('input',()=>{state.selectedCategory='ทั้งหมด';paintMenuGroupTabs();paintCategories();paintCatalog()});
document.querySelectorAll('[data-menu-group]').forEach(b=>b.addEventListener('click',()=>setMenuGroup(b.dataset.menuGroup)));
$('nextStepButton').addEventListener('click',()=>setMenuGroup(nextStepTarget));
$('nextStepDismiss').addEventListener('click',hideNextStep);document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));$('loginBtn').addEventListener('click',()=>authenticate(true));
$('lineGateRetry').addEventListener('click',async()=>{
 const retryStatus=$('lineGateStatus').textContent||'';
 if(!state.ready||/Invalid LIFF ID/i.test(retryStatus)){
  state.ready=false;
  gateStatus('กำลังโหลดค่า LINE ล่าสุด…');
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
});$('decreaseOptionQty').addEventListener('click',()=>setOptionQuantity(optionQuantity-1));
$('increaseOptionQty').addEventListener('click',()=>setOptionQuantity(optionQuantity+1));
$('egg').addEventListener('change',()=>setOptionEggQuantity(1));
$('decreaseEggQty').addEventListener('click',()=>setOptionEggQuantity(optionEggQuantity-1));
$('increaseEggQty').addEventListener('click',()=>setOptionEggQuantity(optionEggQuantity+1));
$('addSelectedItem').addEventListener('click',addItem);$('openBasket').addEventListener('click',()=>{hideNextStep();checkoutMessageOverride='';$('cartDialog').showModal();paintBasket();void bootPayments()});$('fulfillment').addEventListener('change',()=>show('addressLabel',$('fulfillment').value==='delivery'));document.querySelectorAll('input[name="paymentMethod"]').forEach(el=>el.addEventListener('change',()=>{
 $('placeOrder').textContent=el.value==='qr'?'ส่งออเดอร์และไปสแกนจ่าย':'ยืนยันสั่งอาหาร';
}));

$('placeOrder').addEventListener('click',placeOrder);$('closePaymentDialog').addEventListener('click',()=>$('paymentDialog').close());
$('donePaymentDialog').addEventListener('click',()=>$('paymentDialog').close());
restoreBasket();
setInterval(()=>{if(!document.hidden&&!$('historyPanel').hidden)loadHistory({silent:true})},20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('historyPanel').hidden)loadHistory({silent:true})});
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
