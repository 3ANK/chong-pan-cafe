const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),file=path.join(root,'public/_worker.js');let worker=fs.readFileSync(file,'utf8');
const pattern=/const HTML = ("(?:[^"\\]|\\.)*");/;
let html=JSON.parse(worker.match(pattern)[1]),script=html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
const catalogue=JSON.parse(fs.readFileSync(path.join(root,'photo-catalogue.json'))).filter(row=>row.asset).map(({name,priceSource,source,title,asset,illustrative})=>({name,priceSource,source,title,asset,illustrative}));
const helper='// PHOTO_INTEROP_START\nconst PRODUCT_PHOTOS='+JSON.stringify(catalogue)+';\n'+fs.readFileSync(path.join(root,'photo-interop.js'),'utf8')+'\n// PHOTO_INTEROP_END\n';
function replace(a,b){if(!script.includes(a))throw Error('Missing script anchor '+a.slice(0,100));script=script.replace(a,b);}
if(!script.includes('// PHOTO_INTEROP_START')){
 replace('function renderCostSection(){',helper+'\nfunction renderCostSection(){');
 replace('const all=collectIngredientNames(currentState()),costMap=', 'const all=collectIngredientNames(currentState()),costMap=');
 replace("title.textContent='รายการวัตถุดิบจากสูตร'","title.textContent='วัตถุดิบและรูปภาพ'");
 replace("help.textContent='แต่ละชื่อแสดงเป็นรายการเดียว ใช้ดูว่าปรากฏในกี่สูตรและผูกข้อมูลราคาซื้อแล้วหรือยัง'","help.textContent='รวมวัตถุดิบจากสูตรและรายการที่นำเข้า · รูปจากแอปแสดงก่อนรูปประกอบสินค้า · ราคาซื้อเดิมยังอยู่'");
 replace('name.append(editPrice);','name.className="ingredient-name-cell";const product=findIngredientCost(item.name)||{name:item.name};name.append(makeIngredientThumbnail(product,item.name),editPrice);');
 replace("if(!all.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent='เพิ่มสูตรที่มีวัตถุดิบก่อน แล้วรายการวัตถุดิบจะแสดงที่นี่'","if(!all.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent='นำเข้าไฟล์วัตถุดิบพร้อมรูปจากแอป หรือเพิ่มวัตถุดิบเพื่อเริ่มใช้งาน'");
 replace("['json','ส่งออกวัตถุดิบ JSON']","['json','ส่งออกวัตถุดิบพร้อมรูปไปแอป']");
 replace("const exportHelp=document.createElement('p');",`const importButton=document.createElement('button');importButton.type='button';importButton.textContent='รับไฟล์วัตถุดิบพร้อมรูปจากแอป';const ingredientFile=document.createElement('input');ingredientFile.type='file';ingredientFile.accept='.json,.chefjewe,application/json,application/vnd.chefjewe.recipe';ingredientFile.hidden=true;importButton.onclick=()=>{if(!busy)ingredientFile.click()};ingredientFile.onchange=async()=>{const file=ingredientFile.files?.[0];if(!file)return;try{if(file.size>20*1024*1024)throw Error('ไฟล์ใหญ่เกิน 20 MB');await showIngredientImport(JSON.parse((await file.text()).replace(/^\\uFEFF/,'')))}catch(error){$('saveStatus').textContent='นำเข้าไม่สำเร็จ: '+error.message;alert('นำเข้าไม่สำเร็จ: '+error.message)}finally{ingredientFile.value=''}};exportTools.prepend(importButton,ingredientFile);const exportHelp=document.createElement('p');`);
 replace("exportHelp.textContent='ส่งออกทุกรายการพร้อมสถานะราคาและลิงก์แหล่งซื้อ · CSV เปิดใน Excel ได้ · JSON เก็บข้อมูลราคาสำหรับนำเข้า'","exportHelp.textContent='ไฟล์ JSON รวมรูป ราคาซื้อ หน่วยซื้อ และหมายเหตุ ใช้รับ–ส่งกับ ChefJewe 1.13 · ตรวจรายการก่อนนำเข้า · CSV สำหรับ Excel ไม่มีรูป'");
 replace('function exportIngredients(format){','async function exportIngredients(format){');
 const old="if(format==='json')downloadJson('ChefJewe-ingredients-'+date+'.json',{format:'chefjewe-category',version:1,category:'ต้นทุน',exportedAt:new Date().toISOString(),ingredientCosts:currentState().ingredientCosts,ingredientAliases:currentState().ingredientAliases,ingredients:rows});";
 replace(old,"if(format==='json'){try{downloadJson('ChefJewe-ingredients-photos-'+date+'.json',await embedProductPhotos(buildIngredientTransfer(currentState())))}catch(error){$('saveStatus').textContent=error.message;alert(error.message);return;}}");
 const tail=' return [...items.values()].sort((a,b)=>a.name.localeCompare(b.name,"th"));';
 replace(tail,` for(const row of state.ingredientCosts||[]){const key=normalizeIngredientLabel(row.name);if(key&&!items.has(key))items.set(key,{key,name:String(row.name).trim(),count:0,units:new Set(row.packageUnit?[row.packageUnit]:[]),recipes:new Set(),rows:[]});}\n`+tail);
 const pictureStart="const picture=String(row.photo||'');if(/^(?:data:image\\/(?:png|jpeg|webp);base64,)?[A-Za-z0-9+/=\\s]+$/.test(picture)&&picture.length>40){";
 const start=script.indexOf(pictureStart,script.indexOf('function makeCostRow('));
 const end=script.indexOf('for(const [field,label,placeholder,type]',start);
 if(start<0||end<0)throw Error('photo cost row anchor');
 script=script.slice(0,start)+'line.append(makeIngredientThumbnail(row,row.name));'+script.slice(end);
 replace(' const data=JSON.parse((await file.text()).replace(/^\\uFEFF/,""));',' const data=JSON.parse((await file.text()).replace(/^\\uFEFF/,""));\n if(data?.format===\'chef-jewe\'&&Number(data.version)===1&&Array.isArray(data.recipes)&&!data.recipes.length){replaceChefJeweImport=false;return showIngredientImport(data);}');
 const costStart=script.indexOf(' const incomingCosts=[...');const costEnd=script.indexOf(' const updateExisting=',costStart);
 if(costStart<0||costEnd<0)throw Error('cost merge anchor');
 script=script.slice(0,costStart)+` const incomingCostRows=ingredientRowsFromTransfer(data);await validateIngredientPhotos(incomingCostRows);
 const duplicateRows=incomingCostRows.filter(row=>state.ingredientCosts.some(old=>photoName(old.name)===photoName(row.name)));
 const updatePrices=duplicateRows.some(row=>Number(row.packagePrice)>0)&&confirm('อัปเดตราคาซื้อของวัตถุดิบชื่อซ้ำหรือไม่? กด ยกเลิก เพื่อเก็บราคาเดิม');
 const replacePhotos=duplicateRows.some(row=>row.photo)&&confirm('แทนที่รูปวัตถุดิบเดิมด้วยรูปจากไฟล์หรือไม่? กด ยกเลิก เพื่อเติมรูปเฉพาะรายการที่ยังไม่มีรูป');
 const ingredientMerge=mergeIngredientPhotoRows(state.ingredientCosts,incomingCostRows,{updatePrices,replacePhotos});state.ingredientCosts=ingredientMerge.rows;
 const costsAdded=ingredientMerge.added,costsUpdated=ingredientMerge.prices+ingredientMerge.photos;
`+script.slice(costEnd);
 // Keep compatibility with recipe-only files that contain no ingredient list.
 replace('const incomingCostRows=ingredientRowsFromTransfer(data);','const incomingCostRows=(data.ingredients?.length||data.ingredientCosts?.length)?ingredientRowsFromTransfer(data):[];');
 replace("if(category==='ต้นทุน'){if(!Array.isArray(data.ingredientCosts))", "if(category==='ต้นทุน')return showIngredientImport(data);if(category==='ต้นทุน'){if(!Array.isArray(data.ingredientCosts))");
 replace('$("exportChefJeweButton").addEventListener("click",()=>{\n const data=buildChefJeweBackup(currentState());','$("exportChefJeweButton").addEventListener("click",async()=>{\n let data;try{data=await embedProductPhotos(buildChefJeweBackup(currentState()));}catch(error){alert(error.message);return;}');
 replace(' return {format:\'chef-jewe\',version:1,ingredientCosts:JSON.parse(JSON.stringify(state.ingredientCosts||[]))',` const standalone=buildIngredientTransfer(state);for(const item of standalone.ingredients)if(!ingredients.some(old=>photoName(old.name)===photoName(item.name)))ingredients.push(item);
 return {format:'chef-jewe',version:1,ingredientCosts:JSON.parse(JSON.stringify(state.ingredientCosts||[]))`);
}else{
 script=script.replace(/\/\/ PHOTO_INTEROP_START[\s\S]*?\/\/ PHOTO_INTEROP_END\n/,helper);
}
// Keep this hook idempotent when rebuilding an already upgraded book.
script=script.replace('name.append(makeIngredientThumbnail(product,item.name),editPrice);','name.append(makeIngredientThumbnail(product,item.name),editPrice,makeIngredientPhotoButton(product,item.name));');
script=script.replace(/^\s*(?:async )?function exportCategory\(category\)\{[^\n]+\}/m,`async function exportCategory(category){try{const state=currentState(),media=await embedProductPhotos(buildIngredientTransfer(state)),groups=state.recipes.filter(group=>group.category===category),keys=new Set(groups.flatMap(group=>(group.names||[]).map(name=>recipeKey(category,name))));const costs=state.ingredientCosts.map(row=>({...row,photo:row.photo||media.ingredients.find(item=>photoName(item.name)===photoName(row.name))?.photo||''}));downloadJson('chefjewe-'+category.replace(/[^\\p{L}\\p{M}\\p{N}-]+/gu,'-')+'.json',{format:'chefjewe-category',version:1,category,recipes:groups,recipeOrder:state.recipeOrder.filter(key=>keys.has(key)),favoriteRecipes:state.favoriteRecipes.filter(key=>keys.has(key)),ingredientAliases:state.ingredientAliases,ingredientCosts:costs});}catch(error){alert(error.message)}}`);
script=script.replaceAll("downloadJson('chefjewe-costs.json',{format:'chefjewe-category',version:1,category,ingredientCosts:currentState().ingredientCosts})","exportIngredients('json')");
script=script.replaceAll("downloadJson('chefjewe-costs.json',{format:'chefjewe-category',version:1,category:'ต้นทุน',ingredientCosts:currentState().ingredientCosts})","exportIngredients('json')");
html=html.replace(/(<script[^>]*>)[\s\S]*?(<\/script>)/,(_,open,close)=>open+script+close);
const css=`\n/* Ingredient photos and app transfer */
.ingredient-name-cell{display:flex;align-items:center;gap:14px;min-height:100px}.ingredient-photo-box{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:76px;height:76px;border-radius:16px;background:#fff;overflow:hidden;border:1px solid #e5e2f2}.ingredient-thumb{width:100%;height:100%;object-fit:contain}.photo-empty{font-size:11px;color:#8a829e;text-align:center;background:#eeedf6}.ingredient-transfer-dialog{width:min(720px,94vw);max-height:90vh;overflow:auto;padding:24px;border:1px solid #ded8ee;border-radius:24px;background:#f7f9ff;color:#3d405e}.ingredient-import-list{max-height:42vh;overflow:auto;border-block:1px solid #e2deed;margin:16px 0}.ingredient-import-item{display:flex;align-items:center;gap:12px;padding:10px 4px;border-bottom:1px solid #e2deed}.ingredient-import-item input,.transfer-option input{width:20px;height:20px;min-height:20px;flex-shrink:0}.transfer-option{display:flex;align-items:center;gap:10px;margin:12px 0}.ingredient-import-item .ingredient-photo-box{width:58px;height:58px}.ingredient-transfer-dialog .category-tools{position:sticky;bottom:0;background:#f7f9ff;padding-top:12px}.ingredient-table .ingredient-price-link{white-space:normal;text-align:left}@media(max-width:650px){.ingredient-photo-box{width:58px;height:58px}.ingredient-name-cell{gap:8px}.ingredient-transfer-dialog{padding:16px}.ingredient-name-cell .ingredient-price-link{max-width:170px}}
`;
const photoEditorCss='.ingredient-photo-edit{font-size:12px;padding:8px 12px;min-height:38px;flex-shrink:0}.ingredient-photo-dialog{width:min(540px,94vw)}.ingredient-photo-preview{display:flex;justify-content:center;margin:20px 0}.ingredient-photo-preview .ingredient-photo-box{width:220px;height:220px}.ingredient-photo-dialog [role="alert"]{color:#a52f2f}.ingredient-photo-dialog>button{width:100%}.ingredient-photo-dialog [role="status"]{overflow-wrap:anywhere}@media(max-width:650px){.ingredient-name-cell{flex-wrap:wrap}.ingredient-photo-edit{margin-left:auto}.ingredient-photo-preview .ingredient-photo-box{width:180px;height:180px}}';
html=html.replace(/<style id="ingredient-photo-styles">[\s\S]*?<\/style>/,'');html=html.replace('</head>','<style id="ingredient-photo-styles">'+css+photoEditorCss+'</style></head>');
worker=worker.replace(pattern,()=> 'const HTML = '+JSON.stringify(html)+';');
worker=worker.replace("if(path==='/logo.webp'||path==='/pastel.css')", "if(path==='/logo.webp'||path==='/pastel.css'||path.startsWith('/ingredient-images/'))");
fs.writeFileSync(file,worker);console.log('Updated worker: '+catalogue.length+' verified product photos');
