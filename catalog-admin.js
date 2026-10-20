/* Owner-only catalogue editor. API enforces image permissions server side. */
(() => {
 'use strict';
 const root=document.getElementById('adminCatalog');
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let records=[],filter='',canEditImages=false;
 async function api(method,path,payload){
  const res=await fetch('/api/'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
  const data=await res.json();if(!res.ok)throw Error(data.error||'ไม่สามารถบันทึกข้อมูล');return data;
 }
 const stat=()=>`<p class="admin-summary">สินค้า ${records.length} รายการ · รอยืนยันราคา ${records.filter(p=>!p.verified).length} · ไม่มีภาพ ${records.filter(p=>!p.image).length} · ยังไม่เปิดขาย ${records.filter(p=>!p.available).length}</p>`;
 const header=()=>`<div class="admin-editor-header"><h3>จัดการราคาและสินค้า</h3><button class="secondary" type="button" id="closeAdminCatalog">ปิด</button></div>
 <p class="caption">ยืนยันราคาจากหน้าร้าน/Loyverse ทีละรายการก่อนเปิดรับออเดอร์จริง รายการราคา 0 บาทยังเปิดขายไม่ได้</p>
 ${canEditImages?'<p class="caption">เจ้าของร้านสามารถเลือกรูป JPG, PNG หรือ WebP เพื่อเพิ่มหรือเปลี่ยนรูปเมนูได้ ระบบจะย่อรูปให้อัตโนมัติ</p>':''}
 <label class="admin-search">ค้นหาชื่อหรือหมวดหมู่<input type="search" id="adminFilter" placeholder="พิมพ์ชื่อเมนู…" value="${escape(filter)}"></label>
 <details class="admin-add"><summary>+ เพิ่มเมนูใหม่ (บันทึกเป็นฉบับร่าง)</summary>
 <form id="adminCreateForm"><label>ชื่อเมนู<input name="name" required maxlength="100"></label><label>หมวดหมู่<input name="category" required maxlength="70"></label>
 <label>ราคา<input name="price" type="number" min="0" max="100000" step="1" value="0" required></label>
 <label><input name="drink" type="checkbox" checked> เป็นเครื่องดื่ม</label>
 <button class="primary" type="submit">เพิ่มเป็นฉบับร่าง</button></form></details>`;
 function previewMarkup(p){
  return p.image?`<img src="${escape(p.image)}" alt="รูปเมนู${escape(p.name)}" loading="lazy">`:'<span>ยังไม่มีรูป</span>';
 }
 function imageControls(p){
  if(!canEditImages)return '';
  return `<div class="admin-image-control">
   <strong>รูปเมนู</strong>
   <div class="admin-image-preview" data-image-preview>${previewMarkup(p)}</div>
   <label class="admin-image-picker">เลือกรูป / เปลี่ยนรูป<input type="file" data-image accept="image/png,image/jpeg,image/webp"></label>
   ${p.image?'<label class="admin-image-clear"><input type="checkbox" data-clear-image> ลบรูปเดิมเมื่อบันทึก</label>':''}
   <small class="admin-image-status" data-image-status>เลือกรูป JPG, PNG หรือ WebP · ระบบย่อภาพให้อัตโนมัติ</small>
  </div>`;
 }
 function cards(){
  const q=filter.trim().toLowerCase();
  return records.filter(p=>(p.name+' '+p.category+' '+p.id).toLowerCase().includes(q)).map(p=>`
   <article class="admin-product" data-id="${escape(p.id)}">
    <div class="admin-product-top"><strong>${escape(p.name)}</strong><small>${escape(p.category)} · ${p.image?'มีรูป':'ยังไม่มีรูป'}</small></div>
    ${imageControls(p)}
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
  try{const data=await api('GET','admin/menu');records=data.products;canEditImages=!!data.canEditImages;paint()}catch(e){root.textContent=e.message;}
 }
 function showPreview(card,src){
  const box=card.querySelector('[data-image-preview]');
  if(!src){box.innerHTML='<span>รูปนี้จะถูกลบเมื่อกดบันทึก</span>';return;}
  box.innerHTML='<img src="'+escape(src)+'" alt="ตัวอย่างรูปเมนู" loading="lazy">';
 }
 function readImage(file){
  return new Promise((resolve,reject)=>{
   const url=URL.createObjectURL(file),img=new Image();
   img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
   img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'))};
   img.src=url;
  });
 }
 async function compressImage(file){
  if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw new Error('เลือกรูป JPG, PNG หรือ WebP เท่านั้น');
  if(file.size>12*1024*1024)throw new Error('ไฟล์รูปต้นฉบับใหญ่เกิน 12 MB');
  const img=await readImage(file),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('เบราว์เซอร์นี้ย่อรูปไม่ได้');
  ctx.fillStyle='#ffffff';
  for(const side of [480,384,320]){
   const scale=Math.min(1,side/Math.max(img.naturalWidth,img.naturalHeight));
   canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
   ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
   for(const type of ['image/webp','image/jpeg'])for(const quality of [.76,.68,.6]){
    const data=canvas.toDataURL(type,quality);
    if(data.length<=64000&&(data.startsWith('data:image/webp;base64,')||data.startsWith('data:image/jpeg;base64,')))return data;
   }
  }
  throw new Error('ย่อรูปแล้วยังมีขนาดใหญ่เกินไป กรุณาเลือกรูปอื่น');
 }
 root.addEventListener('input',ev=>{
  if(ev.target.id==='adminFilter'){filter=ev.target.value;document.getElementById('adminProducts').innerHTML=cards();}
 });
 root.addEventListener('change',async ev=>{
  if(ev.target.matches('[data-image]')){
   const input=ev.target,file=input.files?.[0],card=input.closest('[data-id]');
   if(!file)return;
   const status=card.querySelector('[data-image-status]'),clear=card.querySelector('[data-clear-image]');
   input.disabled=true;status.textContent='กำลังย่อรูป…';
   try{
    const data=await compressImage(file);card.dataset.pendingImage=data;
    if(clear)clear.checked=false;
    showPreview(card,data);status.textContent='รูปพร้อมบันทึก · '+Math.round(data.length/1024)+' KB';
   }catch(e){input.value='';delete card.dataset.pendingImage;status.textContent=e.message;alert(e.message)}
   finally{input.disabled=false}
  }
  if(ev.target.matches('[data-clear-image]')){
   const card=ev.target.closest('[data-id]'),p=records.find(x=>x.id===card.dataset.id);
   if(ev.target.checked){delete card.dataset.pendingImage;showPreview(card,'');card.querySelector('[data-image-status]').textContent='กดบันทึกเพื่อเอารูปออก';}
   else{showPreview(card,p?.image||'');card.querySelector('[data-image-status]').textContent='เลือกรูป JPG, PNG หรือ WebP · ระบบย่อภาพให้อัตโนมัติ';}
  }
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
  const payload={id,price,available,verified};
  if(Object.prototype.hasOwnProperty.call(el.dataset,'pendingImage'))payload.image=el.dataset.pendingImage;
  else if(el.querySelector('[data-clear-image]')?.checked)payload.image='';
  b.disabled=true;
  try{await api('PATCH','admin/menu',payload);await reload();if(window.bootMenu)await window.bootMenu();}
  catch(e){alert(e.message);b.disabled=false;}
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
