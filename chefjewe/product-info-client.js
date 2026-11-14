function appendProductInfoButton(line,host,sourceInput){
 const button=document.createElement('button');button.type='button';button.dataset.productFetch='true';button.textContent='ดึงข้อมูลจากลิงก์';button.disabled=!sourceInput.value.trim()||!!line.dataset.productLoading;button.onclick=()=>pullProductInfo(line,button);host.append(button);
 const hint=document.createElement('small');hint.textContent='รองรับ Makro PRO, Big C, Lotus’s และสี่มุมเมือง · ดึงมาให้ตรวจก่อนบันทึก';host.append(hint);
}
async function pullProductInfo(line,button){
 if(busy||line.dataset.productLoading)return;
 const read=field=>line.querySelector('[data-cost-field="'+field+'"]'),source=read('sourceUrl').value.trim();
 let status=line.querySelector('[data-product-status]');if(!status){status=document.createElement('p');status.dataset.productStatus='true';status.setAttribute('role','status');status.style.cssText='grid-column:1/-1;white-space:normal';line.append(status);}
 const editor=line.closest('dialog'),save=editor?.querySelector('.ingredient-price-save'),previousSaveDisabled=save?.disabled;
 button.disabled=true;line.dataset.productLoading='true';if(save)save.disabled=true;status.textContent='กำลังดึงรูป ราคา และปริมาณ…';
 try{
  const response=await fetch('/api/product-info?url='+encodeURIComponent(source),{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.message||'ดึงข้อมูลไม่สำเร็จ');
  let photo='';if(data.photo){const raw=cleanIngredientPhoto(data.photo),head=atob(raw.slice(0,48)),type=head.startsWith('\x89PNG')?'image/png':head.startsWith('RIFF')?'image/webp':'image/jpeg';const bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));photo=await prepareIngredientPhoto(new File([bytes],'product-photo',{type}));}
  if(!line.isConnected||source!==read('sourceUrl').value.trim())throw Error('ลิงก์ถูกเปลี่ยน กรุณากดดึงข้อมูลอีกครั้ง');
  if(!Number.isFinite(Number(data.price))||Number(data.price)<=0)throw Error('อ่านราคาสินค้าไม่ได้');
  if(!editor)costsDirty=true;
  read('packagePrice').value=String(data.price);read('checkedAt').value=data.checkedAt||'';
  if(Number(data.quantity)>0&&data.unit){read('packageQuantity').value=String(data.quantity);read('packageUnit').value=data.unit;}
  if(!read('name').value.trim())read('name').value=data.name;
  const oldNote=read('note').value,autoNote=data.supplier+' · '+data.name+' · ราคาอ้างอิงจากหน้าสินค้า อาจต่างตามสาขาหรือโปรโมชั่น';
  read('note').value=(!oldNote||oldNote==='รอใส่ราคาซื้อ · ยังไม่นับรวมในต้นทุน')?autoNote:oldNote.includes(autoNote)?oldNote:oldNote+' · '+autoNote;
  if(photo){line.dataset.pendingPhoto=photo;line.querySelector('.ingredient-photo-box')?.replaceWith(makeIngredientThumbnail({name:read('name').value,photo},read('name').value));}
  read('packagePrice').dispatchEvent(new Event('input',{bubbles:true}));
  status.textContent='ดึงได้: '+data.name+' · '+(data.quantity?data.quantity+' '+data.unit:'ปริมาณยังอ่านไม่ชัด กรุณากรอกเอง')+' / '+data.price+' บาท'+(photo?' · มีรูปตัวอย่าง':' · '+(data.photoWarning||'ไม่มีรูปสินค้า'))+' · ตรวจสินค้าให้ตรงรุ่น แล้วกด “'+(editor?'บันทึกราคา':'บันทึกต้นทุน')+'”';
 }catch(error){status.textContent=error.message+' · ยังไม่ได้บันทึกข้อมูลทับ';}
 finally{delete line.dataset.productLoading;if(line.isConnected){for(const current of line.querySelectorAll('[data-product-fetch]'))current.disabled=!read('sourceUrl').value.trim();if(save)save.disabled=previousSaveDisabled;}}
}

function bulkPricePatch(row,data){
 if(!Number.isFinite(Number(data.price))||Number(data.price)<=0)throw Error('อ่านราคาไม่ได้');
 if(!(Number(data.quantity)>0)||!data.unit)throw Error('อ่านขนาดบรรจุไม่ได้');
 const quantity=convertRecipeQuantity(Number(data.quantity),data.unit,row.packageUnit);
 if(quantity===null||Math.abs(quantity-Number(row.packageQuantity))>Math.max(0.0001,Number(row.packageQuantity)*0.000001))throw Error('ขนาดหรือหน่วยซื้อไม่ตรง กรุณาตรวจรายการนี้เอง');
 return {...row,packagePrice:String(data.price),checkedAt:data.checkedAt||row.checkedAt,priceProductName:data.name,priceSupplier:data.supplier};
}
function appendBulkPriceButton(host){
 const button=document.createElement('button');button.type='button';button.textContent='อัปเดตราคาทุกรายการ';button.dataset.bulkPriceUpdate='true';button.onclick=()=>updateAllIngredientPrices(button);host.append(button);
}
async function updateAllIngredientPrices(button){
 if(busy||document.querySelector('[data-bulk-price-running]'))return;
 if(costsDirty||document.querySelector('dialog[open]')){$('saveStatus').textContent='กรุณาบันทึกหรือปิดหน้าต่างแก้ไขก่อนอัปเดตราคารวม';return;}
 const state=JSON.parse(JSON.stringify(currentState())),dialog=document.createElement('dialog');dialog.dataset.bulkPriceRunning='true';dialog.className='ingredient-transfer-dialog';dialog.setAttribute('aria-label','อัปเดตราคาทุกรายการ');
 const title=document.createElement('h2');title.textContent='อัปเดตราคาทุกรายการ';const progress=document.createElement('p');progress.setAttribute('role','status');const list=document.createElement('ul');list.style.cssText='max-height:45vh;overflow:auto;line-height:1.8';const close=document.createElement('button');close.type='button';close.textContent='หยุดหลังรายการนี้';let stopped=false,running=true;close.onclick=()=>{if(running){stopped=true;close.disabled=true;close.textContent='กำลังหยุด…';}else{dialog.close();dialog.remove();}};dialog.addEventListener('cancel',event=>{event.preventDefault();if(running){stopped=true;}else{dialog.close();dialog.remove();}});
 dialog.append(title,progress,list,close);document.body.append(dialog);dialog.showModal();button.disabled=true;
 const oldEditing=editing;editing=true;let updated=0,failed=0,skipped=0,done=0;
 const cache=new Map();
 try{
  for(let i=0;i<(state.ingredientCosts||[]).length;i++){
   if(stopped)break;
   const row=state.ingredientCosts[i];done++;progress.textContent='กำลังตรวจ '+done+' / '+state.ingredientCosts.length+' · '+row.name;
   const item=document.createElement('li');list.append(item);
   if(noCostPrice(row)||freeIngredient(row.name)||!row.sourceUrl){skipped++;item.textContent=row.name+' · ข้าม: ไม่มีลิงก์หรือกำหนดว่าไม่มีต้นทุน';continue;}
   try{
    const source=new URL(row.sourceUrl);source.search='';source.hash='';
    let data=cache.get(source.href);
    if(!data){const response=await fetch('/api/product-info?priceOnly=1&url='+encodeURIComponent(source.href),{cache:'no-store'});data=await response.json();if(!response.ok)throw Error(data.message||'ดึงข้อมูลไม่สำเร็จ');cache.set(source.href,data);}
    state.ingredientCosts[i]=bulkPricePatch(row,data);updated++;item.textContent=row.name+' · '+row.packagePrice+' → '+data.price+' บาท';
   }catch(error){failed++;item.textContent=row.name+' · คงราคาเดิม: '+error.message;}
  }
  if(updated){progress.textContent='กำลังบันทึกราคาที่อัปเดตได้…';if(!await persistState(state))throw Error($('saveStatus').textContent||'บันทึกไม่สำเร็จ');}
  progress.textContent=(stopped?'หยุดแล้ว · ':'')+'บันทึกแล้ว '+updated+' รายการ · ดึงไม่ได้ '+failed+' · ข้าม '+skipped+(stopped?' · ยังไม่ตรวจ '+(state.ingredientCosts.length-done):'');
 }catch(error){progress.textContent='ยังไม่ได้บันทึกราคา: '+error.message;}
 finally{running=false;editing=oldEditing;delete dialog.dataset.bulkPriceRunning;close.disabled=false;close.textContent='ปิด';if(button.isConnected)button.disabled=false;}
}
