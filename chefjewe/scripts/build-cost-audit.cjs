const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..'),file=path.join(root,'public/_worker.js');let worker=fs.readFileSync(file,'utf8');
const pattern=/const HTML = ("(?:[^"\\]|\\.)*");/,unitPattern=/const UNIT_COST_HTML = ("(?:[^"\\]|\\.)*");/;let html=JSON.parse(worker.match(pattern)[1]),unit=JSON.parse(worker.match(unitPattern)[1]);
const client='// COST_AUDIT_CLIENT_START\n'+fs.readFileSync(path.join(root,'cost-audit-client.js'),'utf8')+'// COST_AUDIT_CLIENT_END\n';
if(html.includes('// COST_AUDIT_CLIENT_START'))html=html.replace(/\/\/ COST_AUDIT_CLIENT_START[\s\S]*?\/\/ COST_AUDIT_CLIENT_END\n/,client);else html=html.replace('function makeCostRow(',client+'function makeCostRow(');
if(!html.includes('COST_AUDIT_PATCHED')){
 html=html.replace('function validCost(row){','function validCost(row){if(row?.costReviewRequired)return false;');
 html=html.replace("line.className='cost-row';line.append", "line.className='cost-row';appendCostPriceMode(line,row);line.append");
 html=html.replace('Object.assign(value,normalizeCostPrice(value));value.unitWeights=',"if(row.querySelector('[data-cost-review-confirmed]')?.checked)delete value.costReviewRequired;Object.assign(value,normalizeCostPrice(value));value.unitWeights=");
 html=html.replace('const rows=recipeCostRows(detail,domain);let total=0',"const rows=recipeCostRows(detail,domain);let total=0");
 html=html.replace('const converted=convertRecipeQuantity(amount,unit,cost.packageUnit,cost);',"if(cost.costReviewRequired){missing++;pending.push({name,reason:cost.costReviewRequired});breakdown.push({name,amount,unit,cost:null,reason:cost.costReviewRequired});continue;}const converted=convertRecipeQuantity(amount,unit,cost.packageUnit,cost);");
 const old="}const ingredientTotal=total,packagingCost=domain==='drinks'?DRINK_PACKAGING_COST:0;if(packagingCost)";
 const replacement="}for(const reason of recipeAuditWarnings(detail)){missing++;pending.push({name:'ตรวจสูตร',reason});}const ingredientTotal=total,packagingCost=domain==='drinks'?drinkPackagingPrice():0;if(packagingCost===null){missing++;pending.push({name:'ชุดบรรจุภัณฑ์ทุกขนาด',reason:'ตรวจราคาซื้อและหน่วยชุดบรรจุภัณฑ์'});}if(packagingCost)";
 if(!html.includes(old))throw Error('Missing packaging calculation anchor');html=html.replace(old,replacement);
 html=html.replace("purchase:'เหมาจ่าย 5 บาทต่อแก้ว · ทุกขนาด · รวมบรรจุภัณฑ์ในสูตรแล้ว'","purchase:'บัญชีบรรจุภัณฑ์ '+packagingCost+' บาทต่อแก้ว · นับครั้งเดียว'");
 html=html.replace("'วัตถุดิบ + ชุดบรรจุภัณฑ์ 5 บาททุกขนาด'","'วัตถุดิบ + บรรจุภัณฑ์ '+costInfo.packagingCost+' บาท'");
 html=html.replace('เครื่องดื่มทุกขนาดรวมชุดแก้ว ฝา หลอด ถุงหิ้ว 5 บาทต่อแก้วอัตโนมัติ','เครื่องดื่มรวมบรรจุภัณฑ์หนึ่งชุดต่อแก้ว ตามราคาในบัญชีวัตถุดิบ');
 html=html.replace("price:DRINK_PACKAGING_COST,costStatus:'priced'","price:drinkPackagingPrice()??0,costStatus:drinkPackagingPrice()===null?'unresolved':'priced'");

 html=html.replace("const milk=mergeCarnationAlternative(cleaned.state);return {state:milk.state,changed:names.changed||organized.changed||cleaned.changed||milk.changed}","const milk=mergeCarnationAlternative(cleaned.state);const audited=repairCostAuditState(milk.state);return {state:milk.state,changed:names.changed||organized.changed||cleaned.changed||milk.changed||audited}");
 html=html.replace("if(costsDirty||document.querySelector('dialog[open]'))", "if(costsDirty||document.querySelector('dialog[open]'))");
 html+='\n<!-- COST_AUDIT_PATCHED -->';
}
 html=html.replace("if(noCostPrice(row)||freeIngredient(row.name)||!row.sourceUrl)","if(row.priceMode==='actual'||row.costReviewRequired||noCostPrice(row)||freeIngredient(row.name)||!row.sourceUrl)");
 html=html.replace("ข้าม: ไม่มีลิงก์หรือกำหนดว่าไม่มีต้นทุน","ข้าม: ราคาซื้อจริง / รอตรวจข้อมูล / ไม่มีลิงก์ / ไม่มีต้นทุน");
 html=html.replace("if(busy||line.dataset.productLoading)return;","if(busy||line.dataset.productLoading)return;if(line.querySelector('[data-cost-field=\"priceMode\"]')?.value==='actual'){alert('รายการนี้ใช้ราคาซื้อจริง หากต้องการใช้ราคาเว็บ ให้เปลี่ยนแหล่งราคาเป็นราคาอ้างอิงก่อน');return;}");

html=html.replace('unresolved.push(...recipeAuditWarnings(detail));const meta=detail.chefJewe||{};', 'const meta=detail.chefJewe||{};');
if(!html.includes('unresolved.push(...recipeAuditWarnings(detail));const fullSteps='))html=html.replace('const fullSteps=', 'unresolved.push(...recipeAuditWarnings(detail));const fullSteps=');
html=html.replace("reasons.push('ข้อมูลราคาซื้อหรือขนาดบรรจุไม่ครบ')","reasons.push(cost?.costReviewRequired||'ข้อมูลราคาซื้อหรือขนาดบรรจุไม่ครบ')");
const bridge='// CONVERTER_BOOK_BRIDGE_START\n'+fs.readFileSync(path.join(root,'converter-book-bridge.js'),'utf8')+'// CONVERTER_BOOK_BRIDGE_END\n';
if(unit.includes('// CONVERTER_BOOK_BRIDGE_START'))unit=unit.replace(/\/\/ CONVERTER_BOOK_BRIDGE_START[\s\S]*?\/\/ CONVERTER_BOOK_BRIDGE_END\n/,bridge);else unit=unit.replace('</body>','<script>'+bridge+'</script></body>');
unit=unit.replace("label:'ออนซ์ของเหลว (ประมาณ 30 ml)',ml:30","label:'ออนซ์ของเหลว (29.57353 ml)',ml:29.57353");
worker=worker.replace(pattern,()=> 'const HTML = '+JSON.stringify(html)+';').replace(unitPattern,()=> 'const UNIT_COST_HTML = '+JSON.stringify(unit)+';');fs.writeFileSync(file,worker);console.log('Built cost audit, configurable packaging and converter bridge');
