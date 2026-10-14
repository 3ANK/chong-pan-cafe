/* Owner-only catalogue editor. API enforces owner identity server side. */
(() => {
 'use strict';
 const root=document.getElementById('adminCatalog');
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let records=[],filter='';
 async function api(method,path,payload){
  const res=await fetch('/api/'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
  const data=await res.json();if(!res.ok)throw Error(data.error||'ไม่สามารถบันทึกข้อมูล');return data;
 }
 const stat=()=>`<p class="admin-summary">สินค้า ${records.length} รายการ · รอยืนยันราคา ${records.filter(p=>!p.verified).length} · ไม่มีภาพ ${records.filter(p=>!p.image).length} · ยังไม่เปิดขาย ${records.filter(p=>!p.available).length}</p>`;
 const header=()=>`<div class="admin-editor-header"><h3>จัดการราคาและสินค้า</h3><button class="secondary" type="button" id="closeAdminCatalog">ปิด</button></div>
 <p class="caption">ยืนยันราคาจากหน้าร้าน/Loyverse ทีละรายการก่อนเปิดรับออเดอร์จริง รายการราคา 0 บาทยังเปิดขายไม่ได้</p>
 <label class="admin-search">ค้นหาชื่อหรือหมวดหมู่<input type="search" id="adminFilter" placeholder="พิมพ์ชื่อเมนู…" value="${escape(filter)}"></label>
 <details class="admin-add"><summary>+ เพิ่มเมนูใหม่ (บันทึกเป็นฉบับร่าง)</summary>
 <form id="adminCreateForm"><label>ชื่อเมนู<input name="name" required maxlength="100"></label><label>หมวดหมู่<input name="category" required maxlength="70"></label>
 <label>ราคา<input name="price" type="number" min="0" max="100000" step="1" value="0" required></label>
 <label><input name="drink" type="checkbox" checked> เป็นเครื่องดื่ม</label>
 <button class="primary" type="submit">เพิ่มเป็นฉบับร่าง</button></form></details>`;
 function cards(){
  const q=filter.trim().toLowerCase();
  return records.filter(p=>(p.name+' '+p.category+' '+p.id).toLowerCase().includes(q)).map(p=>`
   <article class="admin-product" data-id="${escape(p.id)}">
    <div class="admin-product-top"><strong>${escape(p.name)}</strong><small>${escape(p.category)} · ${p.image?'มีรูป':'ยังไม่มีรูป'}</small></div>
    <div class="admin-product-edit"><label>ราคา (บาท)<input type="number" data-price min="0" max="100000" step="1" value="${Number(p.price)}"></label>
    <label class="admin-check"><input type="checkbox" data-available ${p.available?'checked':''}> เปิดขาย</label>
    <label class="admin-check"><input type="checkbox" data-verified ${p.verified?'checked':''}> ยืนยันราคาจากหน้าร้านแล้ว</label>
    <button type="button" class="secondary" data-save>บันทึก</button></div>
    ${p.price<=0?'<p class="admin-draft">ฉบับร่าง: ต้องกำหนดราคาและยืนยันก่อนเปิดขาย</p>':!p.verified?'<p class="admin-draft">ราคายังไม่ได้รับการยืนยัน</p>':''}
   </article>`).join('')||'<p class="caption">ไม่พบเมนูที่ค้นหา</p>';
 }
 function paint(){root.innerHTML=header()+stat()+'<div id="adminProducts">'+cards()+'</div>';}
 async function reload(){
  root.innerHTML='<p class="caption">กำลังโหลดรายการ…</p>';
  try{records=(await api('GET','admin/menu')).products;paint()}catch(e){root.textContent=e.message;}
 }
 root.addEventListener('input',ev=>{
  if(ev.target.id==='adminFilter'){filter=ev.target.value;document.getElementById('adminProducts').innerHTML=cards();}
 });
 root.addEventListener('click',async ev=>{
  if(ev.target.closest('#closeAdminCatalog')){root.hidden=true;return;}
  const b=ev.target.closest('[data-save]');if(!b)return;
  const el=b.closest('[data-id]'),id=el.dataset.id;
  const price=Number(el.querySelector('[data-price]').value),available=el.querySelector('[data-available]').checked,verified=el.querySelector('[data-verified]').checked;
  if(!Number.isInteger(price)||price<0||price>100000){alert('ราคาไม่ถูกต้อง');return;}
  if(available&&price<=0){alert('ยังไม่สามารถเปิดขายสินค้าราคา 0 บาท');return;}
  const p=records.find(x=>x.id===id);
  if(verified&&!p.verified&&!confirm('ยืนยันว่าตรวจสอบราคา '+p.name+' ('+price+' บาท) จากราคาขายจริงแล้ว?'))return;
  b.disabled=true;
  try{await api('PATCH','admin/menu',{id,price,available,verified});await reload();
   if(window.bootMenu)await window.bootMenu(); // optional: refresh customer view
  }catch(e){alert(e.message);b.disabled=false;}
 });
 root.addEventListener('submit',async ev=>{
  if(ev.target.id!=='adminCreateForm')return;ev.preventDefault();
  const data=new FormData(ev.target);const price=Number(data.get('price'));
  try{await api('POST','admin/menu',{name:String(data.get('name')).trim(),category:String(data.get('category')).trim(),price,drink:data.has('drink')});
   filter=String(data.get('name')).trim();await reload();
  }catch(e){alert(e.message);}
 });
 window.openChongpanCatalog=async()=>{
  if(!root.hidden){root.hidden=true;return;}
  root.hidden=false;await reload();root.scrollIntoView({behavior:'smooth',block:'start'});
 };
})();