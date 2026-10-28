/* Owner-only catalogue editor. API enforces image permissions server side. */
(() => {
 'use strict';
 const root=document.getElementById('adminCatalog');
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let records=[],filter='',canEditImages=false,categoryFilter='',statusFilter='',catalogPage=1;
 const pageSize=10;
 async function api(method,path,payload){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  try{
   const res=await fetch('/api/'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{}),signal:controller.signal});
   let data;try{data=await res.json()}catch{throw Error('ระบบตอบกลับไม่ถูกต้อง กรุณาลองใหม่')}
   if(!res.ok)throw Error(data.error||'ไม่สามารถบันทึกข้อมูล');
   return data;
  }catch(e){if(e?.name==='AbortError')throw Error('การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองบันทึกอีกครั้ง');if(e instanceof TypeError)throw Error(navigator.onLine===false?'ไม่มีอินเทอร์เน็ต กรุณาเชื่อมต่อแล้วลองบันทึก':'เชื่อมต่อระบบไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองบันทึก');throw e}
  finally{clearTimeout(timeout)}
 }
 const stat=()=>`<p class="admin-summary">สินค้า ${records.length} รายการ · รอยืนยันราคา ${records.filter(p=>!p.verified).length} · ไม่มีภาพ ${records.filter(p=>!p.image).length} · ยังไม่เปิดขาย ${records.filter(p=>!p.available).length}</p>`;
 const header=()=>`<div class="admin-editor-header"><h3>จัดการราคาและสินค้า</h3><button class="secondary" type="button" id="closeAdminCatalog">ปิด</button></div>
 <p class="caption">แก้ราคาแล้วกดบันทึกเฉพาะแถว · กด “รูปและรายละเอียด” เมื่อต้องการแก้รูปหรือหมวด</p>
 
 <div class="catalog-toolbar"><label class="admin-search">ค้นหาชื่อหรือหมวดหมู่<input type="search" id="adminFilter" placeholder="พิมพ์ชื่อเมนู…" value="${escape(filter)}"></label>
 <div class="catalog-filters"><label>หมวด<select id="adminCategoryFilter"><option value="">ทุกหมวด</option>${[...new Set(records.map(p=>p.category))].sort((a,b)=>a.localeCompare(b,'th')).map(c=>'<option value="'+escape(c)+'"'+(categoryFilter===c?' selected':'')+'>'+escape(c)+'</option>').join('')}</select></label><label>สถานะ<select id="adminStatusFilter"><option value="">ทั้งหมด</option>${[['unverified','รอยืนยันราคา'],['missing','ไม่มีรูป'],['unavailable','ปิดขาย'],['draft','ราคา 0 บาท']].map(([v,n])=>'<option value="'+v+'"'+(statusFilter===v?' selected':'')+'>'+n+'</option>').join('')}</select></label><button type="button" class="secondary" id="clearCatalogFilters">ล้างตัวกรอง</button></div><p id="catalogVisibleCount" class="caption" role="status"></p><div class="catalog-pagination" data-catalog-pager></div></div>
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

 function productCard(p){
  return '<article class="admin-product catalog-row" data-id="'+escape(p.id)+'"><div class="catalog-row-head"><div class="catalog-thumb">'+previewMarkup(p)+'</div><div class="catalog-product-title"><strong>'+escape(p.name)+'</strong><small>'+escape(p.category)+' · '+(p.available?'เปิดขาย':'ปิดขาย')+(!p.verified?' · รอยืนยันราคา':'')+'</small></div></div>'+
  '<div class="admin-product-edit catalog-quick-edit"><label>ราคา (บาท)<input aria-label="ราคา '+escape(p.name)+'" type="number" data-price min="0" max="100000" step="1" value="'+Number(p.price)+'"></label><label class="admin-check"><input type="checkbox" data-available '+(p.available?'checked':'')+'> เปิดขาย</label><button type="button" class="primary" data-save>บันทึก</button></div>'+
  '<p class="catalog-save-status caption" data-save-status role="status"></p><details class="catalog-product-details"><summary>รูปและรายละเอียด'+(!p.verified?' · รอยืนยันราคา':'')+'</summary>'+
  (canEditImages?'<label class="admin-category-edit">หมวดหมู่<input type="text" data-category maxlength="70" value="'+escape(p.category)+'"></label>':'')+
  '<label class="admin-check"><input type="checkbox" data-verified '+(p.verified?'checked':'')+'> ยืนยันราคาจากหน้าร้านแล้ว</label>'+imageControls(p)+
  (p.price<=0?'<p class="admin-draft">ฉบับร่าง: ต้องกำหนดราคาและยืนยันก่อนเปิดขาย</p>':'')+(canEditImages?'<div class="catalog-delete-area"><button type="button" class="catalog-delete" data-delete aria-label="ลบเมนู '+escape(p.name)+'">ลบเมนู</button></div>':'')+'</details></article>';
 }
 function cards(){return records.map(productCard).join('')}

 function matchingRecords(){
  const q=filter.trim().toLowerCase();
  return records.filter(p=>(p.name+' '+p.category+' '+p.id).toLowerCase().includes(q)&&(!categoryFilter||p.category===categoryFilter)&&
   (!statusFilter||statusFilter==='unverified'&&!p.verified||statusFilter==='missing'&&!p.image||statusFilter==='unavailable'&&!p.available||statusFilter==='draft'&&p.price<=0));
 }
 function applyFilters(){
  const matches=matchingRecords(),pages=Math.max(1,Math.ceil(matches.length/pageSize));
  catalogPage=Math.max(1,Math.min(catalogPage,pages));
  const start=(catalogPage-1)*pageSize,ids=new Set(matches.slice(start,start+pageSize).map(p=>String(p.id)));
  root.querySelectorAll('.catalog-row').forEach(el=>{el.hidden=!ids.has(el.dataset.id)});
  document.getElementById('catalogVisibleCount').textContent=matches.length?'แสดง '+(start+1)+'–'+Math.min(start+pageSize,matches.length)+' จาก '+matches.length+' เมนูที่พบ · ทั้งหมด '+records.length+' เมนู':'ไม่พบเมนูตามตัวกรอง';
  const pager='<button type="button" class="secondary" data-catalog-page="-1"'+(catalogPage===1?' disabled':'')+'>‹ ก่อนหน้า</button><span>หน้า '+catalogPage+' / '+pages+'</span><button type="button" class="secondary" data-catalog-page="1"'+(catalogPage===pages?' disabled':'')+'>ถัดไป ›</button>';
  root.querySelectorAll('[data-catalog-pager]').forEach(el=>el.innerHTML=pager);
 }
 function paint(){root.innerHTML=header()+stat()+'<div id="adminProducts">'+cards()+'</div><div class="catalog-pagination" data-catalog-pager></div>';applyFilters()}
 function hasUnsaved(){return !!root.querySelector('[data-dirty="true"],[data-saving="true"]')}
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
  if(ev.target.id==='adminFilter'){filter=ev.target.value;catalogPage=1;applyFilters();}
 });
 root.addEventListener('input',ev=>{const card=ev.target.closest('.catalog-row');if(card){card.dataset.dirty='true';card.querySelector('[data-save-status]').textContent='แก้ไขแล้ว · ยังไม่ได้บันทึก'}});
 root.addEventListener('change',async ev=>{
  if(ev.target.id==='adminCategoryFilter'){categoryFilter=ev.target.value;catalogPage=1;applyFilters();return}
  if(ev.target.id==='adminStatusFilter'){statusFilter=ev.target.value;catalogPage=1;applyFilters();return}
  const changedCard=ev.target.closest('.catalog-row');if(changedCard){changedCard.dataset.dirty='true';changedCard.querySelector('[data-save-status]').textContent='แก้ไขแล้ว · ยังไม่ได้บันทึก'}

  if(ev.target.matches('[data-image]')){
   const input=ev.target,file=input.files?.[0],card=input.closest('[data-id]');
   if(!file)return;
   const status=card.querySelector('[data-image-status]'),clear=card.querySelector('[data-clear-image]');
   input.disabled=true;card.querySelector('[data-save]').disabled=true;status.textContent='กำลังย่อรูป…';
   try{
    const data=await compressImage(file);card.dataset.pendingImage=data;
    if(clear)clear.checked=false;
    showPreview(card,data);status.textContent='รูปพร้อมบันทึก · '+Math.round(data.length/1024)+' KB';
   }catch(e){input.value='';delete card.dataset.pendingImage;status.textContent=e.message;alert(e.message)}
   finally{input.disabled=false;card.querySelector('[data-save]').disabled=false}
  }
  if(ev.target.matches('[data-clear-image]')){
   const card=ev.target.closest('[data-id]'),p=records.find(x=>String(x.id)===card.dataset.id);
   if(ev.target.checked){delete card.dataset.pendingImage;showPreview(card,'');card.querySelector('[data-image-status]').textContent='กดบันทึกเพื่อเอารูปออก';}
   else{showPreview(card,p?.image||'');card.querySelector('[data-image-status]').textContent='เลือกรูป JPG, PNG หรือ WebP · ระบบย่อภาพให้อัตโนมัติ';}
  }
 });
 root.addEventListener('click',async ev=>{
  const pageButton=ev.target.closest('[data-catalog-page]');
  if(pageButton){if(pageButton.disabled)return;catalogPage+=Number(pageButton.dataset.catalogPage);applyFilters();root.querySelector('.catalog-toolbar').scrollIntoView({behavior:'smooth',block:'start'});return;}
  if(ev.target.closest('#closeAdminCatalog')){if(hasUnsaved()&&!confirm('มีรายการที่ยังไม่บันทึก ต้องการปิดและทิ้งการแก้ไขหรือไม่?'))return;root.hidden=true;return;}
  if(ev.target.closest('#clearCatalogFilters')){filter='';categoryFilter='';statusFilter='';catalogPage=1;root.querySelector('#adminFilter').value='';root.querySelector('#adminCategoryFilter').value='';root.querySelector('#adminStatusFilter').value='';applyFilters();return;}
  const remove=ev.target.closest('[data-delete]');
  if(remove){
   const card=remove.closest('[data-id]'),id=card.dataset.id,p=records.find(x=>String(x.id)===id);
   if(!p||card.dataset.saving==='true'||card.querySelector('[data-image]:disabled'))return;
   if(!confirm('ลบเมนู “'+p.name+'” ออกจากระบบสั่งอาหารหรือไม่?\nเมนูจะหายจากหน้าลูกค้าและหลังบ้าน ประวัติออเดอร์เดิมยังอยู่\nการลบนี้ไม่สามารถยกเลิกได้'))return;
   const confirmation=prompt('ยืนยันอีกครั้ง: พิมพ์คำว่า ลบ เพื่อลบเมนู “'+p.name+'”\nกดยกเลิกหากไม่ต้องการลบ','');
   if(confirmation?.trim()!=='ลบ')return;
   const controls=[...card.querySelectorAll('input,button')];controls.forEach(c=>c.disabled=true);card.dataset.saving='true';
   card.querySelector('[data-save-status]').textContent='กำลังลบเมนู…';
   try{
    await api('DELETE','admin/menu',{id,confirmed:true});
    records=records.filter(x=>String(x.id)!==id);card.remove();
    const stats=root.querySelector('.admin-summary');if(stats)stats.outerHTML=stat();
    applyFilters();document.getElementById('catalogVisibleCount').textContent+=' · ลบ “'+p.name+'” แล้ว';
    if(window.bootMenu)window.bootMenu().catch(()=>{});
   }catch(e){card.querySelector('[data-save-status]').textContent='ลบไม่สำเร็จ: '+e.message;controls.forEach(c=>c.disabled=false);delete card.dataset.saving;}
   return;
  }
  const b=ev.target.closest('[data-save]');if(!b)return;
  const el=b.closest('[data-id]'),id=el.dataset.id;
  const price=Number(el.querySelector('[data-price]').value),available=el.querySelector('[data-available]').checked,verified=el.querySelector('[data-verified]').checked;
  if(!Number.isInteger(price)||price<0||price>100000){alert('ราคาไม่ถูกต้อง');return;}
  if(available&&price<=0){alert('ยังไม่สามารถเปิดขายสินค้าราคา 0 บาท');return;}
  const p=records.find(x=>String(x.id)===id);
  if(verified&&!p.verified&&!confirm('ยืนยันว่าตรวจสอบราคา '+p.name+' ('+price+' บาท) จากราคาขายจริงแล้ว?'))return;
  const payload={id,price,available,verified};
  const category=el.querySelector('[data-category]');
  if(category)payload.category=category.value.trim();
  if(Object.prototype.hasOwnProperty.call(el.dataset,'pendingImage'))payload.image=el.dataset.pendingImage;
  else if(el.querySelector('[data-clear-image]')?.checked)payload.image='';
  const controls=[...el.querySelectorAll('input,button')];controls.forEach(c=>c.disabled=true);el.dataset.saving='true';
  try{
   await api('PATCH','admin/menu',payload);
   Object.assign(p,payload);delete el.dataset.dirty;delete el.dataset.saving;
   const open=el.querySelector('details').open;
   const holder=document.createElement('div');holder.innerHTML=productCard(p);const fresh=holder.firstElementChild;
   fresh.querySelector('details').open=open;el.replaceWith(fresh);fresh.querySelector('[data-save-status]').textContent='บันทึกแล้ว ✓';
   fresh.querySelector('[data-save]').focus();
   const stats=root.querySelector('.admin-summary');if(stats)stats.outerHTML=stat();
   applyFilters();if(window.bootMenu)window.bootMenu().catch(()=>{});
  }catch(e){el.querySelector('[data-save-status]').textContent='บันทึกไม่สำเร็จ: '+e.message;alert(e.message);controls.forEach(c=>c.disabled=false);delete el.dataset.saving;}
 });
 root.addEventListener('submit',async ev=>{
  if(ev.target.id!=='adminCreateForm')return;ev.preventDefault();
  if(hasUnsaved()&&!confirm('มีเมนูที่แก้ค้างไว้ การเพิ่มเมนูใหม่จะโหลดรายการใหม่และทิ้งค่าที่ยังไม่บันทึก ต้องการทำต่อหรือไม่?'))return;
  const data=new FormData(ev.target);const price=Number(data.get('price'));
  try{await api('POST','admin/menu',{name:String(data.get('name')).trim(),category:String(data.get('category')).trim(),price,drink:data.has('drink')});
   filter=String(data.get('name')).trim();categoryFilter='';statusFilter='';catalogPage=1;await reload();
  }catch(e){alert(e.message);}
 });
 window.addEventListener('beforeunload',e=>{if(!root.hidden&&hasUnsaved()){e.preventDefault();e.returnValue=''}});
 window.openChongpanCatalog=async()=>{
  if(!root.hidden){if(hasUnsaved()&&!confirm('มีรายการที่ยังไม่บันทึก ต้องการปิดและทิ้งการแก้ไขหรือไม่?'))return;root.hidden=true;return;}
  root.hidden=false;catalogPage=1;await reload();root.scrollIntoView({behavior:'smooth',block:'start'});
 };
})();
