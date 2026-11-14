const bookUnitMap={'กรัม':'g','กิโลกรัม':'kg','มล.':'ml','ml':'ml','ลิตร':'l','ลูก':'fruit','ขวด':'bottle','ชิ้น':'piece','กระป๋อง':'can'};
const bookCustomMap={spoon:'ช้อน',soupSpoon:'ช้อนแกง',coffeeSpoon:'ช้อนกาแฟ',bottle:'ขวด',can:'กระป๋อง',piece:'ชิ้น',fruit:'ลูก',slice:'แว่น',seed:'เม็ด'};
let bookRevision=null;
const bookStatus=document.createElement('p');bookStatus.className='notice';bookStatus.setAttribute('role','status');bookStatus.textContent=window.opener?'กำลังเชื่อมข้อมูลจากสมุดสูตร…':'เปิดหน้าแปลงหน่วยจากสมุดสูตรที่ปลดล็อกแล้ว เพื่อใช้ข้อมูลชุดเดียวกัน';
const bookSave=document.createElement('button');bookSave.type='button';bookSave.textContent='บันทึกค่าที่ชั่งจริงกลับสมุดสูตร';bookSave.disabled=true;
const bookHint=document.createElement('p');bookHint.className='notice';bookHint.textContent='ใช้วัตถุดิบที่มีคำว่า (สมุดสูตร) · ส่งเฉพาะค่าหน่วยที่ชั่งจริงกลับสูตร ราคาซื้อยังใช้ค่าที่บันทึกในสมุดสูตร';
document.querySelector('main').prepend(bookStatus,bookSave,bookHint);
function bookDensity(row){
 const unit=bookUnitMap[row.packageUnit],mass=Number(row.packageQuantity)*(unit==='kg'?1000:1);
 if((unit==='g'||unit==='kg')&&['ml','มล.'].includes(row.usableUnit)&&Number(row.usableQuantity)>0)return mass/Number(row.usableQuantity);
 if(Number(row.unitWeights?.['ช้อนชา'])>0)return Number(row.unitWeights['ช้อนชา'])/5;
 return null;
}
window.addEventListener('message',event=>{
 if(!window.opener||event.source!==window.opener||event.origin!==window.location.origin)return;
 const data=event.data;if(!data||typeof data!=='object')return;
 if(data.type==='chefjewe-converter-result'){bookStatus.textContent=data.message;bookSave.disabled=false;return;}
 if(data.type!=='chefjewe-book-snapshot'||!Array.isArray(data.rows))return;
 bookRevision=data.revision;const selected=item()?.linkedName;
 items=items.filter(i=>!i.linkedName);for(const key of Object.keys(prices))if(key.startsWith('book-'))delete prices[key];
 data.rows.forEach((row,index)=>{
  const id='book-'+index,density=bookDensity(row),equivalents={};
  for(const [key,unit] of Object.entries(bookCustomMap)){const grams=Number(row.unitWeights?.[unit]);if(grams>0)equivalents[key]={unit:'g',value:grams};
   else if(row.usableUnit===unit&&Number(row.usableQuantity)>0){const factor=row.packageUnit==='ลิตร'?1000:1;if(['ml','มล.','ลิตร'].includes(row.packageUnit))equivalents[key]={unit:'ml',value:Number(row.packageQuantity)*factor/Number(row.usableQuantity)};}}
  items.push({id,name:row.name+' (สมุดสูตร)',linkedName:row.name,density,equivalents,source:'ค่าที่ร้านบันทึกในสมุดสูตร',note:row.note||'',measured:false});
  const packUnit=bookUnitMap[row.packageUnit];if(packUnit&&Number(row.packagePrice)>=0&&Number(row.packageQuantity)>0)prices[id]={price:Number(row.packagePrice),pack:Number(row.packageQuantity),unit:packUnit};
 });
 const target=items.find(x=>x.linkedName===selected)||items.find(x=>x.linkedName);fillItems(target?.id||item()?.id);loadPrice();refreshCustom();bookSave.disabled=false;bookStatus.textContent='เชื่อมสมุดสูตรแล้ว · '+data.rows.length+' รายการ · ค่าที่ชั่งใหม่ส่งกลับไปใช้คำนวณสูตรได้';
});
bookSave.onclick=()=>{
 const selected=item();if(!window.opener||!selected?.linkedName){bookStatus.textContent='เลือกวัตถุดิบ (สมุดสูตร) ก่อน';return;}
 if(!selected.measured&&!Object.keys(selected.equivalents||{}).length){bookStatus.textContent='กรอกผลชั่งหรือหน่วยเฉพาะของร้านก่อนส่งกลับ';return;}
 const equivalents={};for(const [key,eq] of Object.entries(selected.equivalents||{}))if(bookCustomMap[key])equivalents[bookCustomMap[key]]=eq;
 bookSave.disabled=true;bookStatus.textContent='กำลังบันทึกกลับสมุดสูตร…';window.opener.postMessage({type:'chefjewe-converter-save',name:selected.linkedName,revision:bookRevision,density:selected.measured?selected.density:null,equivalents},window.location.origin);
};
if(window.opener)window.opener.postMessage({type:'chefjewe-converter-ready'},window.location.origin);
