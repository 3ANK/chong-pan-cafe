// Embedded into the existing private recipe book by scripts/build-photo-interop.cjs.
const PHOTO_LIMIT=4*1024*1024, TRANSFER_LIMIT=12*1024*1024;
const photoName=value=>String(value||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
function cleanIngredientPhoto(value){
 if(value==null||value==='')return '';
 if(typeof value!=='string')throw Error('ข้อมูลรูปไม่ถูกต้อง');
 const raw=value.replace(/^data:image\/(?:jpeg|png|webp);base64,/i,'').replace(/\s/g,'');
 if(raw.length>Math.ceil(PHOTO_LIMIT*4/3)||!raw||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)||raw.length%4===1)throw Error('รูปไม่ถูกต้องหรือใหญ่เกิน 4 MB');
 const head=atob(raw.slice(0,Math.min(raw.length,48)));
 if(!(head.startsWith('\xff\xd8\xff')||head.startsWith('\x89PNG\r\n\x1a\n')||head.startsWith('RIFF')&&head.slice(8,12)==='WEBP'))throw Error('รองรับรูป JPEG, PNG หรือ WebP เท่านั้น');
 return raw;
}
function ingredientPhotoDataUrl(value){
 const raw=cleanIngredientPhoto(value);if(!raw)return '';
 const head=atob(raw.slice(0,Math.min(raw.length,48))),type=head.startsWith('\x89PNG')?'png':head.startsWith('RIFF')?'webp':'jpeg';
 return 'data:image/'+type+';base64,'+raw;
}
function productPhotoFor(row){
 if(row?.hideProductPhoto)return null;
 const normalized=photoName(row?.name),source=String(row?.sourceUrl||'').split('?')[0];
 return source?(PRODUCT_PHOTOS.find(item=>item.priceSource===source)||null):(PRODUCT_PHOTOS.find(item=>photoName(item.name)===normalized)||null);
}
function makeIngredientThumbnail(row,name){
 const box=document.createElement('span');box.className='ingredient-photo-box';
 let src='';try{src=ingredientPhotoDataUrl(row?.photo||'')}catch{}
 const product=src?null:productPhotoFor(row);
 if(!src&&product)src=product.asset;
 if(src){const img=document.createElement('img');img.src=src;img.alt='รูป '+name;img.loading='lazy';img.className='ingredient-thumb';img.addEventListener('error',()=>{box.textContent='ยังไม่มีรูป';box.classList.add('photo-empty')});box.append(img);if(product)box.title=(product.illustrative?'รูปประกอบวัตถุดิบ: ':'รูปสินค้า: ')+product.title;}
 else {box.textContent='ยังไม่มีรูป';box.classList.add('photo-empty');}
 return box;
}
async function prepareIngredientPhoto(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('เลือกรูป JPG, PNG หรือ WebP');
 if(file.size>20*1024*1024)throw Error('รูปต้นฉบับใหญ่เกิน 20 MB กรุณาเลือกรูปที่เล็กลง');
 const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('อ่านไฟล์รูปไม่สำเร็จ'));reader.readAsDataURL(file)});
 const image=new Image();image.src=data;
 try{await image.decode();}catch{throw Error('เปิดรูปไม่ได้ กรุณาเลือกไฟล์รูปอื่น');}
 if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>80000000)throw Error('ขนาดรูปไม่รองรับ กรุณาเลือกรูปที่เล็กลง');
 const scale=Math.min(1,1024/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('อุปกรณ์นี้เตรียมรูปไม่สำเร็จ');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
 return cleanIngredientPhoto(canvas.toDataURL('image/jpeg',0.84));
}
function stateWithIngredientPhoto(state,name,photo){
 const result={...state,ingredientCosts:(state.ingredientCosts||[]).map(row=>({...row}))};
 const source=findIngredientCost(name,result.ingredientCosts,state.ingredientAliases||{}),key=photoName(source?.name||name);
 const index=result.ingredientCosts.findIndex(row=>photoName(row.name)===key);
 if(index<0)result.ingredientCosts.push({name,packageQuantity:'',packageUnit:'',packagePrice:'0',photo:cleanIngredientPhoto(photo)});
 else result.ingredientCosts[index]={...result.ingredientCosts[index],photo:cleanIngredientPhoto(photo)};
 return result;
}
function makeIngredientPhotoButton(row,name){
 const button=document.createElement('button');button.type='button';button.className='ingredient-photo-edit';
 const hasPhoto=!!row.photo||!!productPhotoFor(row);button.textContent=hasPhoto?'เปลี่ยนรูป':'เพิ่มรูป';
 button.setAttribute('aria-label',(hasPhoto?'เปลี่ยนรูป ':'เพิ่มรูป ')+name);button.onclick=()=>openIngredientPhotoEditor(name);return button;
}
function openIngredientPhotoEditor(name){
 if(busy||editing)return;if(costsDirty){$('saveStatus').textContent='กรุณาบันทึกราคาที่กำลังแก้ไขก่อนเปลี่ยนรูป';return;}
 const source=findIngredientCost(name)||{name},dialog=document.createElement('dialog');dialog.className='ingredient-transfer-dialog ingredient-photo-dialog';dialog.setAttribute('aria-label','แก้ไขรูปวัตถุดิบ');
 const title=document.createElement('h2');title.textContent='รูปวัตถุดิบ · '+name;dialog.append(title);
 if(source.name!==name){const shared=document.createElement('p');shared.textContent='ใช้รูปเดียวกับ '+source.name+' · บันทึกแล้วมีผลกับวัตถุดิบที่ใช้รายการนี้ร่วมกัน';dialog.append(shared);}
 const preview=document.createElement('div');preview.className='ingredient-photo-preview';preview.append(makeIngredientThumbnail(source,name));dialog.append(preview);
 const help=document.createElement('p');help.textContent='เลือกรูป JPG, PNG หรือ WebP จากมือถือหรือคอม · ระบบย่อรูปให้อัตโนมัติ · รูปจะบันทึกเมื่อกดบันทึกรูป';dialog.append(help);
 const file=document.createElement('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.hidden=true;
 const choose=document.createElement('button');choose.type='button';choose.textContent='เลือกรูปจากเครื่อง';choose.onclick=()=>file.click();dialog.append(choose,file);
 const error=document.createElement('p');error.setAttribute('role','alert');dialog.append(error);
 const status=document.createElement('p');status.setAttribute('role','status');dialog.append(status);
 const actions=document.createElement('div');actions.className='category-tools';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='ยกเลิก';const save=document.createElement('button');save.type='button';save.textContent='บันทึกรูป';save.disabled=true;actions.append(cancel,save);dialog.append(actions);
 let pending='',sequence=0,saving=false;
 const close=()=>{if(saving)return;sequence++;dialog.close();dialog.remove();editing=false;};cancel.onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
 file.onchange=async()=>{const selected=file.files?.[0];if(!selected)return;const ticket=++sequence;pending='';save.disabled=true;error.textContent='';status.textContent='กำลังเตรียมรูป…';try{const photo=await prepareIngredientPhoto(selected);if(ticket!==sequence)return;pending=photo;preview.replaceChildren(makeIngredientThumbnail({name,photo},name));status.textContent='รูปพร้อมบันทึก · '+selected.name;save.disabled=false;}catch(e){if(ticket!==sequence)return;status.textContent='';error.textContent=e.message;}finally{file.value='';}};
 save.onclick=async()=>{if(!pending||saving||busy)return;error.textContent='';saving=true;choose.disabled=true;save.disabled=true;cancel.disabled=true;
 try{const state=stateWithIngredientPhoto(currentState(),name,pending);if(new TextEncoder().encode(JSON.stringify(state)).length>TRANSFER_LIMIT)throw Error('ข้อมูลรวมใหญ่เกิน 12 MB กรุณาเลือกรูปที่เล็กลง');
 if(await persistState(state)){saving=false;close();$('saveStatus').textContent='บันทึกรูป '+name+' และซิงก์แล้ว';return;}error.textContent=$('saveStatus').textContent||'บันทึกรูปไม่สำเร็จ กรุณาลองอีกครั้ง';
 }catch(e){error.textContent=e.message;}finally{saving=false;choose.disabled=false;save.disabled=!pending;cancel.disabled=false;}};
 document.body.append(dialog);editing=true;dialog.showModal();choose.focus();
}
function ingredientRowsFromTransfer(data){
 if(!data||Number(data.version)!==1||!['chef-jewe','chefjewe-category'].includes(data.format))throw Error('ไม่ใช่ไฟล์วัตถุดิบ ChefJewe รุ่นที่รองรับ');
 const rows=new Map();
 function add(value,native=false){
  if(!value||typeof value.name!=='string'||!value.name.trim())throw Error('ไฟล์มีวัตถุดิบที่ไม่มีชื่อ');
  const quantity=native?value.quantity:value.packageQuantity,unit=native?value.unit:value.packageUnit,price=native?value.price:value.packagePrice;
  if(native&&(!(Number(quantity)>0)||!Number.isFinite(Number(quantity))||!Number.isFinite(Number(price))||Number(price)<0||!String(unit||'').trim()))throw Error('ปริมาณ หน่วย หรือราคาวัตถุดิบไม่ถูกต้อง: '+value.name);
  const key=photoName(value.name),previous=rows.get(key),photo=cleanIngredientPhoto(value.photo||'');
  const row={name:value.name.trim(),packageQuantity:String(quantity??''),packageUnit:String(unit||''),packagePrice:String(price??'0'),photo,unitWeights:{},note:String(value.note||''),sourceUrl:String(value.sourceUrl||''),checkedAt:String(value.checkedAt||''),costRecord:value.costRecord||'',groups:String(value.groups||''),appId:String(native?value.id||'':value.appId||'')};
  if(!Number.isFinite(Number(row.packagePrice))||Number(row.packagePrice)<0)throw Error('ราคาวัตถุดิบไม่ถูกต้อง: '+row.name);
  for(const [u,n] of Object.entries(value.unitWeights||{})){if(!Number.isFinite(Number(n))||Number(n)<=0)throw Error('น้ำหนักต่อหน่วยไม่ถูกต้อง: '+row.name);row.unitWeights[u]=Number(n);}
  if(previous){row.photo=photo||previous.photo;if(Number(row.packagePrice)<=0&&Number(previous.packagePrice)>0){row.packagePrice=previous.packagePrice;row.packageQuantity=previous.packageQuantity;row.packageUnit=previous.packageUnit;}row.groups=row.groups||previous.groups;row.appId=row.appId||previous.appId;row.unitWeights={...previous.unitWeights,...row.unitWeights};}
  rows.set(key,row);
 }
 for(const row of data.ingredientCosts||[])add(row);
 for(const item of data.ingredients||[]){if(data.format==='chef-jewe')add(item,true);else if(item.packageQuantity!==undefined)add(item);}
 if(!rows.size)throw Error('ไม่พบวัตถุดิบในไฟล์');
 return [...rows.values()];
}
function mergeIngredientPhotoRows(existing,incoming,options={}){
 const rows=existing.map(row=>({...row})),indices=new Map(rows.map((row,i)=>[photoName(row.name),i]));let added=0,photos=0,prices=0;
 for(const fresh of incoming){
  const i=indices.get(photoName(fresh.name));
  if(i===undefined){indices.set(photoName(fresh.name),rows.length);rows.push({...fresh});added++;if(fresh.photo)photos++;continue;}
  const old=rows[i];let next={...old};
  if(options.updatePrices&&Number(fresh.packagePrice)>0&&Number(fresh.packageQuantity)>0&&String(fresh.packageUnit||'').trim()){next={...old,...fresh,photo:old.photo||'',groups:old.groups||fresh.groups};prices++;}
  if(fresh.photo&&(!old.photo||options.replacePhotos)){next.photo=fresh.photo;photos++;}
  rows[i]=next;
 }
 return {rows,added,photos,prices};
}
async function validateIngredientPhotos(rows){
 for(const row of rows){if(!row.photo)continue;const image=new Image();image.src=ingredientPhotoDataUrl(row.photo);try{await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw Error();}catch{throw Error('อ่านรูปไม่ได้: '+row.name);}}
}
async function showIngredientImport(data){
 const incoming=ingredientRowsFromTransfer(data);await validateIngredientPhotos(incoming);
 if(costsDirty||busy)throw Error('กรุณาบันทึกงานที่กำลังแก้ไขก่อน');
 const dialog=document.createElement('dialog');dialog.className='ingredient-transfer-dialog';dialog.setAttribute('aria-label','ตรวจวัตถุดิบและรูปก่อนนำเข้า');
 const title=document.createElement('h2');title.textContent='ตรวจวัตถุดิบและรูปก่อนนำเข้า';
 const intro=document.createElement('p');intro.textContent='พบ '+incoming.length+' วัตถุดิบ · มีรูป '+incoming.filter(row=>row.photo).length+' รายการ · เพิ่มข้อมูลโดยเก็บสูตรเดิมไว้';
 const list=document.createElement('div');list.className='ingredient-import-list';
 const selected=new Set(incoming.map((_,i)=>i));
 incoming.forEach((row,i)=>{const label=document.createElement('label');label.className='ingredient-import-item';const check=document.createElement('input');check.type='checkbox';check.checked=true;check.setAttribute('aria-label','เลือก '+row.name);check.onchange=()=>{check.checked?selected.add(i):selected.delete(i);update()};const text=document.createElement('span');text.textContent=row.name+' · '+row.packageQuantity+' '+row.packageUnit+' / '+row.packagePrice+' บาท';label.append(check,makeIngredientThumbnail({...row,hideProductPhoto:true},row.name),text);list.append(label)});
 function option(text){const label=document.createElement('label');label.className='transfer-option';const input=document.createElement('input');input.type='checkbox';label.append(input,document.createTextNode(text));return {label,input};}
 const price=option('อัปเดตราคาซื้อและหน่วยซื้อของรายการชื่อซ้ำ'),photo=option('แทนที่รูปเดิมด้วยรูปจากไฟล์');
 const note=document.createElement('p');note.className='tag';note.textContent='ค่าเริ่มต้นเก็บราคาและรูปเดิม · เติมรูปให้รายการที่ยังไม่มีรูป · ราคา 0 และรูปว่างไม่ล้างข้อมูลเดิม';
 const status=document.createElement('p');status.setAttribute('role','status');
 const buttons=document.createElement('div');buttons.className='category-tools';const save=document.createElement('button');save.textContent='ยืนยันนำเข้าวัตถุดิบพร้อมรูป';const cancel=document.createElement('button');cancel.textContent='ยกเลิก';buttons.append(save,cancel);
 const close=()=>{if(busy)return;dialog.close();dialog.remove();editing=false;};cancel.onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
 function update(){const result=mergeIngredientPhotoRows(ingredientCosts,incoming.filter((_,i)=>selected.has(i)),{updatePrices:price.input.checked,replacePhotos:photo.input.checked});status.textContent='เลือก '+selected.size+' · เพิ่ม '+result.added+' · รับรูป '+result.photos+' · อัปเดตราคา '+result.prices;save.disabled=!selected.size;}
 price.input.onchange=update;photo.input.onchange=update;
 save.onclick=async()=>{if(!selected.size||busy)return;const state=JSON.parse(JSON.stringify(currentState())),result=mergeIngredientPhotoRows(state.ingredientCosts,incoming.filter((_,i)=>selected.has(i)),{updatePrices:price.input.checked,replacePhotos:photo.input.checked});state.ingredientCosts=result.rows;if(new TextEncoder().encode(JSON.stringify(state)).length>TRANSFER_LIMIT){status.textContent='ข้อมูลรวมใหญ่เกิน 12 MB กรุณาลดจำนวนรูปก่อนนำเข้า';return;}save.disabled=true;cancel.disabled=true;try{downloadJson('ChefJewe-web-before-ingredient-import-'+Date.now()+'.json',{format:'chefjewe-native',version:1,state:currentState()});if(await persistState(state)){close();$('saveStatus').textContent='นำเข้าแล้ว เพิ่ม '+result.added+' วัตถุดิบ · รับรูป '+result.photos+' รายการ';}else status.textContent='บันทึกไม่สำเร็จ ข้อมูลเดิมยังอยู่';}finally{save.disabled=false;cancel.disabled=false;}};
 dialog.append(title,intro,price.label,photo.label,note,list,status,buttons);document.body.append(dialog);editing=true;update();dialog.showModal();
}
function buildIngredientTransfer(state){
 const usedIds=new Set(),ingredients=collectIngredientNames(state).map(item=>{
  const row=findIngredientCost(item.name,state.ingredientCosts||[],state.ingredientAliases||{})||{name:item.name},name=item.name;let id=String(row.appId||'')||chefJeweId();if(usedIds.has(id))id=chefJeweId();usedIds.add(id);
  return {id,name,quantity:Number(row.packageQuantity)>0?Number(row.packageQuantity):1,unit:String(row.packageUnit||[...item.units].find(Boolean)||'รายการ'),price:Number(row.packagePrice)>0?Number(row.packagePrice):0,photo:cleanIngredientPhoto(row.photo||''),unitWeights:{...(row.unitWeights||{})},note:String(row.note||''),sourceUrl:String(row.sourceUrl||''),checkedAt:String(row.checkedAt||''),costRecord:row.costRecord||'',groups:String(row.groups||'')};
 });
 return {format:'chef-jewe',version:1,exportScope:'ingredient-category',categories:[],ingredients,recipes:[],ingredientCosts:ingredients.map(i=>({name:i.name,packageQuantity:i.quantity,packageUnit:i.unit,packagePrice:i.price,unitWeights:i.unitWeights,note:i.note,sourceUrl:i.sourceUrl,checkedAt:i.checkedAt,costRecord:i.costRecord,groups:i.groups,photo:i.photo}))};
}
async function embedProductPhotos(data){
 const cache=new Map();let missing=0;
 const records=data.ingredients||[];
 for(const item of records){if(item.photo)continue;const row={...item,...(findIngredientCost(item.name)||{}),name:item.name};const product=productPhotoFor(row);if(!product)continue;
  try{if(!cache.has(product.asset)){const response=await fetch(product.asset);if(!response.ok)throw Error('image');const blob=await response.blob();const raw=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob)});cache.set(product.asset,cleanIngredientPhoto(raw));}item.photo=cache.get(product.asset);item.photoSource=product.source;}
  catch{missing++;}
 }
 for(const row of data.ingredientCosts||[]){const item=records.find(i=>photoName(i.name)===photoName(row.name));if(!row.photo&&item?.photo)row.photo=item.photo;}
 if(missing)throw Error('แนบรูปสินค้าไม่สำเร็จ '+missing+' รายการ กรุณาลองส่งออกใหม่');
 if(new TextEncoder().encode(JSON.stringify(data)).length>TRANSFER_LIMIT)throw Error('ไฟล์รวมใหญ่เกิน 12 MB กรุณาส่งออกแยกหมวด');
 return data;
}
if(typeof module!=='undefined'&&module.exports)module.exports={cleanIngredientPhoto,ingredientPhotoDataUrl,ingredientRowsFromTransfer,mergeIngredientPhotoRows};
