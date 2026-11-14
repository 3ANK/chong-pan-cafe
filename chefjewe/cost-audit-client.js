const COST_AUDIT_VERSION='cost-audit-20261114-v1';
function repairCostAuditState(state){
 const migrations=state.recipeMigrations||(state.recipeMigrations=[]);if(migrations.includes(COST_AUDIT_VERSION))return false;
 const costs=state.ingredientCosts||(state.ingredientCosts=[]);
 const backup=row=>{if(!row.costAuditOriginal){const {photo,costAuditOriginal,...original}=row;row.costAuditOriginal=JSON.parse(JSON.stringify(original));}};
 for(const row of costs){
  if(/เจ้าของร้านยืนยัน|ราคาซื้อจริง|คงราคาซื้อจริง/.test(row.note||''))row.priceMode='actual';
  if(row.name==='โซดา'&&Number(row.packagePrice)===190&&Number(row.packageQuantity)===325&&normalizeUnit(row.packageUnit)==='มล.'&&/150038748|18139/.test(row.sourceUrl||'')){
   backup(row);Object.assign(row,{packageQuantity:'7800',packageUnit:'มล.',usableQuantity:24,usableUnit:'ขวด',usablePackQuantity:7800,usablePackUnit:'มล.'});
  }
  if(row.name==='นมผง'){
   backup(row);Object.assign(row,{packageQuantity:'1000',packageUnit:'กรัม',packagePrice:'122',priceMode:'actual',checkedAt:'2026-11-14',sourceUrl:'https://dreamyshoponline.com/product/dreamy-milky-cream-หัวนมผงเข้มข้น/',note:'Dreamy Milky Cream ดรีมมี่ มิลค์กี้ ครีม · เจ้าของร้านยืนยัน 1,000 กรัม 122 บาท · 2 ช้อนชา = 15 กรัม · ยืนยัน 14/11/2026',unitWeights:{...(row.unitWeights||{}),'ช้อนชา':7.5}});
   for(const k of ['usableQuantity','usableUnit','usablePackQuantity','usablePackUnit'])delete row[k];
  }
  if(row.name==='ผงโกโก้'&&/500g/.test(row.sourceUrl||'')&&Number(row.packageQuantity)===450){backup(row);row.costReviewRequired='ขนาดที่บันทึก 450 กรัมไม่ตรงข้อความ 500 กรัมในลิงก์เดิม กรุณาตรวจฉลากถุงที่ร้านใช้';}
  if(row.name==='แอปเปิ้ล'&&/กาล่า/.test(row.note||'')){backup(row);row.costReviewRequired='สูตรแอปเปิ้ลเขียวใช้ราคาแอปเปิ้ลกาล่า กรุณายืนยันพันธุ์และราคาซื้อจริง';}
  if(row.name==='น้ำบ๊วย'){
   backup(row);row.costReviewRequired='ยืนยันว่าใช้น้ำจากบ๊วยดองหรือน้ำบ๊วยเข้มข้น และตวงปริมาณใช้ได้จริง ห้ามใช้จำนวนลูกแทนปริมาตรน้ำ';
  }
 }
 const additions=[[/^น้ำส้มปั่น\s*\[จิว\]$/u,'ส้มสด','3','4','ลูก'],[/^มัทฉะโกโก้/u,'ผงโกโก้','20','30','กรัม'],[/^มัทฉะโตนด/u,'ผงมัทฉะ','2.5','','ช้อนชา'],[/^ชามะนาว/u,'น้ำเชื่อม','30','60','มล.'],[/^น้ำแดงโซดามะนาว/u,'น้ำแดง','40','45','มล.']];
 for(const group of state.recipes||[])for(const name of group.names||[]){
  const d=group.details?.[name];if(!d)continue;let rows=getDetailRows(d).map(r=>({...r})),changed=false;
  const remember=()=>{if(!d.costAuditOriginal)d.costAuditOriginal={ingredients:d.ingredients,ingredientRows:d.ingredientRows,steps:d.steps};};
  for(const [pattern,ingredient,min,max,unit] of additions)if(pattern.test(name)&&!rows.some(r=>r.name===ingredient)){
   remember();rows.push({name:ingredient,min,max,actual:'',unit,note:'รอยืนยันปริมาณจริงของร้าน · กู้รายการจากชื่อเมนู/ข้อความสูตรเดิม',original:''});changed=true;
  }
  if(/ไข่มุก/.test(name)&&!rows.some(r=>/ไข่มุก/.test(r.name))){remember();rows.push({name:'ไข่มุก',min:'',max:'',actual:'',unit:'กรัม',note:'รอยืนยันว่ารวมไข่มุกหรือขายแยก และปริมาณไข่มุกสุกต่อแก้ว',original:''});changed=true;}
  if(/บ๊วย/.test(name))for(const r of rows)if(r.name==='น้ำบ๊วย'&&normalizeUnit(r.unit)==='ลูก'){
   remember();r.min='';r.max='';r.actual='';r.unit='มล.';r.note='รอยืนยันปริมาตรน้ำบ๊วยจริง · เดิมตั้งเป็นลูก';changed=true;
  }
  if(changed){d.ingredientRows=rows;d.ingredients=rows.map(formatIngredientRow);}
 }
 migrations.push(COST_AUDIT_VERSION);return true;
}
function recipeAuditWarnings(detail){
 const rows=getDetailRows(detail),warnings=[],seen=new Set();
 for(const r of rows){const key=JSON.stringify([normalizeIngredientLabel(r.name),r.min,r.max,r.actual,normalizeUnit(r.unit)]);if(seen.has(key)&&r.name)warnings.push('พบวัตถุดิบและปริมาณซ้ำ: '+r.name+' · ตรวจว่าใช้ซ้ำจริงหรือไม่');seen.add(key);}
 const text=Array.isArray(detail.steps)?detail.steps.join('\n'):String(detail.steps||''),marker='ยังไม่รวมในรายการคำนวณ — ต้องตรวจปริมาณ:';
 const index=text.indexOf(marker);
 if(index>=0){for(const line of text.slice(index+marker.length).split('\n').map(x=>x.trim()).filter(Boolean)){
  const target=line.replace(/^[-•]\s*/,'').split(/[\d\s]/u)[0];
  if(target&&!/^(หมายเหตุ|ขนาดแก้ว|วิธีทำ)/.test(target)&&!rows.some(r=>target.startsWith(r.name)||r.name.startsWith(target)))warnings.push('ข้อความสูตรยังมีรายการที่ไม่ได้ลงตาราง: '+line);
 }}
 return [...new Set(warnings)];
}
function appendCostPriceMode(line,row){
 const label=document.createElement('label');label.textContent='แหล่งราคาที่ใช้คำนวณ';const select=document.createElement('select');select.dataset.costField='priceMode';select.setAttribute('aria-label','แหล่งราคาที่ใช้คำนวณ');
 for(const [value,text] of [['reference','ราคาอ้างอิง · อัปเดตจากลิงก์ได้'],['actual','ราคาซื้อจริง · ไม่ให้ปุ่มอัปเดตรวมทับ']]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}select.value=row.priceMode||'reference';label.append(select);line.append(label);
 if(row.costReviewRequired){const review=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.dataset.costReviewConfirmed='true';review.append(check,document.createTextNode('ตรวจและแก้ข้อมูลแล้ว: '+row.costReviewRequired));line.append(review);}
}
function drinkPackagingPrice(){
 const row=findIngredientCost('ชุดบรรจุภัณฑ์ทุกขนาด');if(!row)return DRINK_PACKAGING_COST;
 if(noCostPrice(row))return 0;
 if(!validCost(row)||zeroCost(row)||normalizeUnit(row.packageUnit)!=='ชุด')return null;
 return Number(row.packagePrice)/Number(row.packageQuantity);
}
// The converter talks only to its same-origin recipe-book window. Prices stay in the encrypted book.
let costConverterWindow=null;
const converterLink=document.querySelector('a[href="/unit-cost"]');if(converterLink)converterLink.addEventListener('click',event=>{event.preventDefault();costConverterWindow=window.open('/unit-cost','chefjewe-cost-converter');if(!costConverterWindow)$('saveStatus').textContent='กรุณาอนุญาตหน้าต่างแปลงหน่วยสำหรับเว็บนี้';});
function converterBookSnapshot(){return {type:'chefjewe-book-snapshot',revision:lastUpdatedAt,rows:ingredientCosts.map(({photo,costAuditOriginal,...row})=>row)};}
window.addEventListener('message',async event=>{
 if(!costConverterWindow||event.source!==costConverterWindow||event.origin!==window.location.origin||!currentPassphrase)return;
 const data=event.data;if(!data||typeof data!=='object')return;
 if(data.type==='chefjewe-converter-ready'){event.source.postMessage(converterBookSnapshot(),window.location.origin);return;}
 if(data.type!=='chefjewe-converter-save')return;
 const reply=(ok,message)=>event.source.postMessage({type:'chefjewe-converter-result',ok,message},window.location.origin);
 if(busy||editing||costsDirty){reply(false,'กรุณาบันทึกหรือปิดหน้าต่างแก้ไขในสมุดสูตรก่อน');return;}
 if(data.revision!==lastUpdatedAt){reply(false,'ข้อมูลสมุดสูตรเปลี่ยนแล้ว กรุณาปิดและเปิดหน้าแปลงหน่วยใหม่');return;}
 try{
  const state=JSON.parse(JSON.stringify(currentState())),row=state.ingredientCosts.find(r=>r.name===data.name);if(!row)throw Error('ไม่พบวัตถุดิบในสมุดสูตร');
  if(data.density!==null&&data.density!==undefined){const density=Number(data.density);if(!Number.isFinite(density)||density<=0||density>100)throw Error('ค่าความหนาแน่นไม่ถูกต้อง');
   const unit=normalizeUnit(row.packageUnit),q=Number(row.packageQuantity);if(!(q>0))throw Error('ระบุขนาดบรรจุในสมุดสูตรก่อน');
   if(unit==='กรัม'||unit==='กิโลกรัม'){row.usableQuantity=q*(unit==='กิโลกรัม'?1000:1)/density;row.usableUnit='มล.';}
   else if(unit==='มล.'||unit==='ลิตร'){row.usableQuantity=q*(unit==='ลิตร'?1000:1)*density;row.usableUnit='กรัม';}
   else throw Error('ปริมาณชั่งจริงนี้ต้องใช้กับหน่วยซื้อกรัม กิโลกรัม มล. หรือลิตร');
   row.usablePackQuantity=q;row.usablePackUnit=unit;row.unitWeights={...(row.unitWeights||{}),'ช้อนชา':density*5,'ช้อนโต๊ะ':density*15};
  }
  if(data.equivalents){for(const [unit,eq] of Object.entries(data.equivalents)){if(!['ช้อน','ช้อนแกง','ช้อนกาแฟ','ขวด','กระป๋อง','ชิ้น','ลูก','แว่น','เม็ด'].includes(unit)||!eq||!['g','ml'].includes(eq.unit)||!Number.isFinite(eq.value)||eq.value<=0||eq.value>1000000)throw Error('หน่วยเฉพาะไม่ถูกต้อง');
   if(eq.unit==='g'){row.unitWeights={...(row.unitWeights||{}),[unit]:eq.value};}
   else{const pack=convertRecipeQuantity(Number(row.packageQuantity),row.packageUnit,'มล.');if(pack===null)throw Error('หน่วยซื้อไม่ตรงกับหน่วยปริมาตร กรุณาตั้งค่าในสมุดสูตร');row.usableQuantity=pack/eq.value;row.usableUnit=unit;row.usablePackQuantity=Number(row.packageQuantity);row.usablePackUnit=normalizeUnit(row.packageUnit);}
  }}
  if(!await persistState(state))throw Error($('saveStatus').textContent);reply(true,'บันทึกค่าที่ชั่งจริงกลับสมุดสูตรและซิงก์แล้ว');event.source.postMessage(converterBookSnapshot(),window.location.origin);
 }catch(error){reply(false,error.message);}
});
