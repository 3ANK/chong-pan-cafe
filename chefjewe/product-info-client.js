function appendProductInfoButton(line,host,sourceInput){
 const button=document.createElement('button');button.type='button';button.dataset.productFetch='true';button.textContent='ดึงข้อมูลจากลิงก์';button.disabled=!sourceInput.value.trim()||!!line.dataset.productLoading;button.onclick=()=>pullProductInfo(line,button);host.append(button);
 const hint=document.createElement('small');hint.textContent='รองรับ Makro PRO และสี่มุมเมือง · ดึงมาให้ตรวจก่อนบันทึก';host.append(hint);
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
