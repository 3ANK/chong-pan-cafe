const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),crypto=require('crypto');
const {cleanIngredientPhoto,ingredientRowsFromTransfer,mergeIngredientPhotoRows}=require('../photo-interop.js');
const photo='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=';
const item={id:'milk',name:'Milk',quantity:1000,unit:'ml',price:0,photo,groups:'Drinks',unitWeights:{ml:1.03}};
test('unpriced native ingredients retain photos, groups, weights and identity',()=>{
 const rows=ingredientRowsFromTransfer({format:'chef-jewe',version:1,ingredients:[item],recipes:[]});
 assert.equal(rows[0].photo,photo);assert.equal(rows[0].packagePrice,'0');assert.equal(rows[0].appId,'milk');assert.equal(rows[0].unitWeights.ml,1.03);assert.equal(rows[0].groups,'Drinks');
});
test('ledger and ingredient photos combine without losing positive purchase costs',()=>{
 const rows=ingredientRowsFromTransfer({format:'chef-jewe',version:1,ingredientCosts:[{name:'Milk',packageQuantity:2,packageUnit:'L',packagePrice:90}],ingredients:[item]});
 assert.equal(rows.length,1);assert.equal(rows[0].photo,photo);assert.equal(rows[0].packagePrice,'90');assert.equal(rows[0].packageQuantity,'2');
});
test('duplicate import fills missing photos independently from prices',()=>{
 const old={name:'Milk',packageQuantity:2,packageUnit:'L',packagePrice:90,photo:''},fresh={...old,packagePrice:100,photo};
 let result=mergeIngredientPhotoRows([old],[fresh]);assert.equal(result.rows[0].packagePrice,90);assert.equal(result.rows[0].photo,photo);assert.equal(result.added,0);
 result=mergeIngredientPhotoRows(result.rows,[{...fresh,photo:'new'}]);assert.equal(result.rows[0].photo,photo);
 result=mergeIngredientPhotoRows(result.rows,[{...fresh,photo:'new'}],{replacePhotos:true});assert.equal(result.rows[0].photo,'new');assert.equal(result.rows[0].packagePrice,90);
 result=mergeIngredientPhotoRows([old],[{...fresh,packagePrice:0}],{updatePrices:true});assert.equal(result.rows[0].packagePrice,90);
 result=mergeIngredientPhotoRows([{...old,photo}],[{...fresh,photo:''}],{replacePhotos:true,updatePrices:true});assert.equal(result.rows[0].photo,photo);assert.equal(result.rows[0].packagePrice,100);
 assert.equal(old.photo,'');
});
test('unsupported versions, executable images and invalid purchase amounts are rejected',()=>{
 assert.throws(()=>ingredientRowsFromTransfer({format:'chef-jewe',version:2,ingredients:[item]}));
 assert.throws(()=>ingredientRowsFromTransfer({format:'chef-jewe',version:1,ingredients:[{...item,quantity:-1}]}));
 assert.throws(()=>cleanIngredientPhoto('data:image/svg+xml;base64,PHN2Zy8+'));
 assert.throws(()=>cleanIngredientPhoto('javascript:alert(1)'));
 assert.throws(()=>cleanIngredientPhoto('bad'));
 assert.equal(cleanIngredientPhoto('data:image/png;base64,'+photo),photo);
});
test('legacy website ingredient JSON remains accepted',()=>{
 const data={format:'chefjewe-category',version:1,category:'ต้นทุน',ingredientCosts:[{name:'Salt',packageQuantity:'1000',packageUnit:'g',packagePrice:'18',photo}]};
 assert.equal(ingredientRowsFromTransfer(data)[0].photo,photo);
});
function loadBook(){
 const {parseHTML}=require('linkedom');const raw=fs.readFileSync(path.join(__dirname,'../public/_worker.js'),'utf8');
 const html=JSON.parse(raw.match(/const HTML = ("(?:[^"\\]|\\.)*");/)[1]);const script=html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
 const {document,HTMLSelectElement}=parseHTML(html);
 // Linkedom omits the browser's select.value setter.
 const descriptor=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
 if(!descriptor.set)Object.defineProperty(HTMLSelectElement.prototype,'value',{...descriptor,set(value){const options=[...this.querySelectorAll('option')];for(const option of options)option.removeAttribute('selected');options.find(option=>option.value===String(value))?.setAttribute('selected','');}});
 const context=vm.createContext({document,window:{addEventListener(){}},navigator:{},crypto:crypto.webcrypto,TextEncoder,TextDecoder,URL,Blob,atob,btoa,console,setTimeout,clearTimeout,setInterval,clearInterval,alert(){},confirm:()=>false,fetch:()=>{throw Error('Unexpected network')}});
 new vm.Script(script).runInContext(context);return {context,document,html};
}
test('compiled web book renders standalone ingredients, photos and transfer buttons',()=>{
 const {context,document}=loadBook();
 vm.runInContext(`ingredientCosts=[{name:'Milk',packageQuantity:2,packageUnit:'L',packagePrice:90,photo:${JSON.stringify(photo)}}];renderCostSection()`,context);
 assert.equal(document.querySelectorAll('.ingredient-table tbody tr').length,1);
 assert.equal(document.querySelector('.ingredient-table img').getAttribute('src'),'data:image/png;base64,'+photo);
 assert.match(document.getElementById('ingredientCostsList').textContent,/รับไฟล์วัตถุดิบพร้อมรูปจากแอป/);
 assert.match(document.getElementById('ingredientCostsList').textContent,/ส่งออกวัตถุดิบพร้อมรูปไปแอป/);
 assert.equal(document.querySelector('.ingredient-photo-edit').getAttribute('aria-label'),'เปลี่ยนรูป Milk');
 const result=JSON.parse(vm.runInContext('JSON.stringify(buildIngredientTransfer(currentState()))',context));
 assert.equal(result.recipes.length,0);assert.equal(result.ingredients[0].quantity,2);assert.equal(result.ingredients[0].unit,'L');assert.equal(result.ingredients[0].price,90);assert.equal(result.ingredients[0].photo,photo);
});
test('editing one photo preserves purchase costs, metadata and recipes, and exports the selected photo',()=>{
 const {context}=loadBook();const state={version:1,recipes:[{category:'Drinks',names:['Coffee']}],ingredientCosts:[{name:'Milk',packageQuantity:'2',packageUnit:'L',packagePrice:'90',note:'Original seller',sourceUrl:'https://example.com/milk',checkedAt:'2026-10-28',unitWeights:{ml:1.03},photo:''},{name:'Sugar',packagePrice:'20',photo}],ingredientAliases:{},recipeOrder:[],categoryOrder:[],favoriteRecipes:[],recipeMigrations:[]};
 const next=JSON.parse(vm.runInContext('JSON.stringify(stateWithIngredientPhoto('+JSON.stringify(state)+',"Milk",'+JSON.stringify(photo)+'))',context));
 assert.deepEqual(next,{...state,ingredientCosts:[{...state.ingredientCosts[0],photo},state.ingredientCosts[1]]});assert.equal(state.ingredientCosts[0].photo,'');
 const result=JSON.parse(vm.runInContext('JSON.stringify(buildIngredientTransfer('+JSON.stringify(next)+'))',context));assert.equal(result.ingredients.find(i=>i.name==='Milk').photo,photo);assert.equal(result.ingredients.find(i=>i.name==='Milk').price,90);
});
test('photo edits follow shared ingredient aliases without creating duplicate purchase rows',()=>{
 const {context}=loadBook();const state={recipes:[],ingredientCosts:[{name:'Milk',packagePrice:'90',unitWeights:{ml:1.03}}],ingredientAliases:{'milk alias':'Milk'}};
 const result=JSON.parse(vm.runInContext('JSON.stringify(stateWithIngredientPhoto('+JSON.stringify(state)+',"Milk alias",'+JSON.stringify(photo)+'))',context));
 assert.equal(result.ingredientCosts.length,1);assert.equal(result.ingredientCosts[0].name,'Milk');assert.equal(result.ingredientCosts[0].photo,photo);assert.equal(result.ingredientCosts[0].packagePrice,'90');
 const fresh=JSON.parse(vm.runInContext('JSON.stringify(stateWithIngredientPhoto('+JSON.stringify(state)+',"Unused",'+JSON.stringify(photo)+'))',context));assert.equal(fresh.ingredientCosts[1].packagePrice,'0');assert.equal(fresh.ingredientCosts[1].packageQuantity,'');
});
test('photo picker rejects unsupported or oversized input before decoding',async()=>{
 const {context}=loadBook();await assert.rejects(vm.runInContext('prepareIngredientPhoto({type:"image/svg+xml",size:20})',context),/JPG/);
 await assert.rejects(vm.runInContext('prepareIngredientPhoto({type:"image/jpeg",size:21*1024*1024})',context),/20 MB/);
});
test('recipe ingredient picker exposes all ingredients even with an existing name and preserves row quantities',()=>{
 const {context,document}=loadBook();
 vm.runInContext(`ingredientCosts=[{name:'น้ำกาแฟสกัด'},{name:'กาแฟโบราณ งูเห่า'},{name:'น้ำตาล'}];renderStructuredIngredients([{name:'น้ำกาแฟสกัด',min:'150',max:'',actual:'',unit:'มล.',note:'Keep note',original:'น้ำกาแฟสกัด 150 มล.'}])`,context);
 const select=document.querySelector('#ingredientRows select[aria-label="ชื่อวัตถุดิบ"]');assert.equal(select.value,'น้ำกาแฟสกัด');
 assert.ok([...select.querySelectorAll('option')].some(o=>o.value==='กาแฟโบราณ งูเห่า'));
 select.value='กาแฟโบราณ งูเห่า';select.dispatchEvent(new document.defaultView.Event('change'));
 const rows=JSON.parse(vm.runInContext('JSON.stringify(readStructuredIngredients())',context));assert.equal(rows[0].name,'กาแฟโบราณ งูเห่า');assert.equal(rows[0].min,'150');assert.equal(rows[0].unit,'มล.');assert.equal(rows[0].note,'Keep note');
 assert.equal(document.querySelectorAll('#ingredientRows [data-field="name"]').length,1);
});
test('recipe picker accepts a new name and can return to an existing ingredient',()=>{
 const {context,document}=loadBook();vm.runInContext(`ingredientCosts=[{name:'น้ำตาล'}];renderStructuredIngredients([{name:'ชื่อเดิมนอกบัญชี',min:'2',unit:'กรัม'}])`,context);
 const select=document.querySelector('#ingredientRows select[aria-label="ชื่อวัตถุดิบ"]');assert.equal(select.value,'ชื่อเดิมนอกบัญชี');
 select.value='';select.dispatchEvent(new document.defaultView.Event('change'));const input=document.querySelector('#ingredientRows input[aria-label="ชื่อวัตถุดิบใหม่"]');input.value='ชื่อใหม่';
 assert.equal(JSON.parse(vm.runInContext('JSON.stringify(readStructuredIngredients())',context))[0].name,'ชื่อใหม่');
 select.value='น้ำตาล';select.dispatchEvent(new document.defaultView.Event('change'));assert.equal(JSON.parse(vm.runInContext('JSON.stringify(readStructuredIngredients())',context))[0].name,'น้ำตาล');assert.equal(document.querySelectorAll('#ingredientRows [data-field="name"]').length,1);
});
test('deleting an unused ingredient removes only its purchase row and obsolete aliases',()=>{
 const {context}=loadBook();const state={recipes:[],ingredientCosts:[{name:'Unused',packagePrice:'95',photo},{name:'Keep',packagePrice:'20',note:'Preserve'}],ingredientAliases:{unused:'Unused','unused alias':'Unused',keep:'Keep'},favoriteRecipes:['Keep recipe']};
 const result=JSON.parse(vm.runInContext('JSON.stringify(stateWithoutIngredient('+JSON.stringify(state)+',"Unused"))',context));
 assert.deepEqual(result,{...state,ingredientCosts:[state.ingredientCosts[1]],ingredientAliases:{keep:'Keep'}});assert.equal(state.ingredientCosts.length,2);
});
test('deleting ingredients used directly or through a shared alias is blocked',()=>{
 const {context}=loadBook();const state={recipes:[{category:'Drinks',names:['Tea drink','Alias drink'],details:{'Tea drink':{ingredientRows:[{name:'Tea',min:'10',unit:'g'}]},'Alias drink':{ingredientRows:[{name:'Tea alias',min:'20',unit:'g'}]}}}],ingredientCosts:[{name:'Tea',packagePrice:'95'}],ingredientAliases:{'tea alias':'Tea'}};
 const info=JSON.parse(vm.runInContext('JSON.stringify(ingredientDeletionInfo('+JSON.stringify(state)+',"Tea"))',context));assert.deepEqual(info.used,['Tea drink','Alias drink']);assert.throws(()=>vm.runInContext('stateWithoutIngredient('+JSON.stringify(state)+',"Tea")',context),/2 สูตร/);
});
test('link fetch stages price, net quantity and photo in the form without persisting the original ingredient',async()=>{
 const {context,document}=loadBook();context.File=File;context.Event=document.defaultView.Event;context.Uint8Array=Uint8Array;context.fetch=async()=>({ok:true,json:async()=>({supplier:'Makro PRO',name:'ชาเขียวนม 200 ก.',price:79,quantity:200,unit:'กรัม',photo,checkedAt:'2026-10-28'})});
 vm.runInContext(`ingredientCosts=[{name:'Tea',packageQuantity:'1',packageUnit:'kg',packagePrice:'95',note:'Original'}];prepareIngredientPhoto=async()=>${JSON.stringify(photo)};var testLine=makeCostRow({...ingredientCosts[0],sourceUrl:'https://www.makro.pro/p/155848-6761203007683'});document.body.append(testLine);var testButton=testLine.querySelector('[data-product-fetch]');`,context);
 await vm.runInContext('pullProductInfo(testLine,testButton)',context);const line=context.testLine;
 assert.equal(line.querySelector('[data-cost-field="packagePrice"]').value,'79');assert.equal(line.querySelector('[data-cost-field="packageQuantity"]').value,'200');assert.equal(line.querySelector('[data-cost-field="packageUnit"]').value,'กรัม');assert.equal(line.dataset.pendingPhoto,photo);assert.match(line.querySelector('[data-cost-field="note"]').value,/Original/);
 assert.equal(vm.runInContext('ingredientCosts[0].packagePrice',context),'95');assert.equal(vm.runInContext('ingredientCosts[0].photo',context),undefined);
});
test('a failed fetch leaves existing draft purchase fields and photo untouched',async()=>{
 const {context,document}=loadBook();context.fetch=async()=>({ok:false,json:async()=>({message:'ไม่รองรับลิงก์'})});vm.runInContext(`var testLine=makeCostRow({name:'Tea',packageQuantity:'200',packageUnit:'กรัม',packagePrice:'95',sourceUrl:'https://example.com/product'});document.body.append(testLine);testLine.dataset.pendingPhoto=${JSON.stringify(photo)};var testButton=testLine.querySelector('[data-product-fetch]');`,context);
 await vm.runInContext('pullProductInfo(testLine,testButton)',context);assert.equal(context.testLine.querySelector('[data-cost-field="packagePrice"]').value,'95');assert.equal(context.testLine.dataset.pendingPhoto,photo);assert.equal(context.testLine.dataset.productLoading,undefined);assert.equal(context.testButton.disabled,false);
});
test('full web export includes unused ingredient photos and leaves recipe data intact',()=>{
 const {context}=loadBook();
 const source={version:1,recipes:[{category:'Drinks',names:['Coffee'],details:{Coffee:{ingredientRows:[{name:'Milk',min:'100',unit:'ml'}],steps:['Mix'],chefJewe:{photo}}}}],ingredientCosts:[{name:'Milk',packageQuantity:1000,packageUnit:'ml',packagePrice:50,photo},{name:'Unused',packageQuantity:2,packageUnit:'kg',packagePrice:80,photo}],ingredientAliases:{},favoriteRecipes:[],recipeOrder:[],categoryOrder:[],recipeMigrations:[]};
 const result=JSON.parse(vm.runInContext('JSON.stringify(buildChefJeweBackup('+JSON.stringify(source)+'))',context));
 assert.equal(result.recipes.length,1);assert.equal(result.recipes[0].photo,photo);assert.equal(result.ingredients.length,3);assert.equal(result.ingredients.find(i=>i.name==='Unused').photo,photo);
 assert.equal(result.recipes[0].parts.length,2);
});
test('product photos are served by assets without touching authentication or state storage',()=>{
 const raw=fs.readFileSync(path.join(__dirname,'../public/_worker.js'),'utf8');assert.match(raw,/path\.startsWith\('\/ingredient-images\/'\)/);
 assert.match(raw,/if\(!await signedIn\(request,env\)\)/);assert.match(raw,/revision = revision \+ 1/);
 for(const row of JSON.parse(fs.readFileSync(path.join(__dirname,'../photo-catalogue.json'))))if(row.asset){assert.ok(fs.statSync(path.join(__dirname,'../public',row.asset)).size>0);}
});
test('the complete Cloudflare worker remains valid JavaScript',()=>{
 const {spawnSync}=require('child_process');const raw=fs.readFileSync(path.join(__dirname,'../public/_worker.js'),'utf8');
 const checked=spawnSync(process.execPath,['--input-type=module','--check'],{input:raw,encoding:'utf8'});assert.equal(checked.status,0,checked.stderr.slice(-500));
});
test('web transfer fixture includes real product images with priced and unpriced records',()=>{
 const {context}=loadBook();const catalogue=JSON.parse(fs.readFileSync(path.join(__dirname,'../photo-catalogue.json')));const image=fs.readFileSync(path.join(__dirname,'../public',catalogue[0].asset)).toString('base64');
 const state={recipes:[],ingredientCosts:[{name:'Web photo priced',packageQuantity:2,packageUnit:'L',packagePrice:79,photo:image,unitWeights:{ml:1.03},groups:'Drinks'},{name:'Web photo unpriced',packageQuantity:1,packageUnit:'kg',packagePrice:0,photo:image,groups:'Food'}],ingredientAliases:{}};
 const result=JSON.parse(vm.runInContext('JSON.stringify(buildIngredientTransfer('+JSON.stringify(state)+'))',context));
 assert.equal(result.ingredients.length,2);assert.equal(result.ingredients.find(i=>i.name==='Web photo unpriced').price,0);assert.ok(result.ingredients.every(i=>i.photo===image));
 if(process.env.CHEFJEWE_FIXTURE)fs.writeFileSync(process.env.CHEFJEWE_FIXTURE,JSON.stringify(result));
});

test('recipe search ignores stale import strings and hidden purchase metadata after an ingredient is renamed',()=>{
 const {context}=loadBook();
 vm.runInContext(`ingredientCosts=[{name:'กาแฟโบราณ งูเห่า',packageQuantity:350,packageUnit:'กรัม',packagePrice:45,note:'น้ำกาแฟ ราคาเดิม',brand:'น้ำกาแฟ',grade:'น้ำกาแฟ'}];ingredientAliases={'น้ำกาแฟ':'กาแฟโบราณ งูเห่า'};`,context);
 context.fixture={category:'กาแฟ',names:['โอเลี้ยง'],details:{'โอเลี้ยง':{title:'โอเลี้ยง',ingredients:['น้ำกาแฟ 150 มล.'],ingredientRows:[{name:'กาแฟโบราณ งูเห่า',original:'น้ำกาแฟ 150 มล.',actual:'15',unit:'กรัม'}],notes:['น้ำกาแฟ ข้อมูลเก่า'],steps:['ชงแล้วเติมน้ำแข็ง']}}};
 assert.equal(vm.runInContext("recipeMatchesSearch(fixture,'โอเลี้ยง','น้ำกาแฟ')",context),false);
 for(const query of ['โอเลี้ยง','กาแฟโบราณ','น้ำแข็ง']){context.query=query;assert.equal(vm.runInContext("recipeMatchesSearch(fixture,'โอเลี้ยง',query)",context),true);}
 context.fixture.details['โอเลี้ยง'].ingredientRows[0].name='น้ำกาแฟ';
 assert.equal(vm.runInContext("recipeMatchesSearch(fixture,'โอเลี้ยง','น้ำกาแฟ')",context),true);
 context.fixture.details['โอเลี้ยง'].ingredientRows=[];
 assert.equal(vm.runInContext("recipeMatchesSearch(fixture,'โอเลี้ยง','น้ำกาแฟ')",context),false);
 delete context.fixture.details['โอเลี้ยง'].ingredientRows;
 assert.equal(vm.runInContext("recipeMatchesSearch(fixture,'โอเลี้ยง','น้ำกาแฟ')",context),true);
});

test('ingredient usage links list current exact ingredient references and open the chosen recipe',()=>{
 const {context,document}=loadBook();
 vm.runInContext(`recipes=[{category:'กาแฟ',names:['โอเลี้ยง','เลิกใช้แล้ว'],details:{'โอเลี้ยง':{ingredientRows:[{name:'น้ำกาแฟ',actual:150,unit:'มล.'},{name:'น้ำกาแฟ',actual:5,unit:'มล.'}]},'เลิกใช้แล้ว':{ingredients:['น้ำกาแฟ 150 มล.'],ingredientRows:[{name:'กาแฟโบราณ',actual:15,unit:'กรัม'}]}}},{category:'หมวดอื่น',names:['โอเลี้ยง'],details:{'โอเลี้ยง':{ingredientRows:[{name:'น้ำกาแฟ',actual:100,unit:'มล.'}]}}}];ingredientCosts=[{name:'ไม่มีคนใช้'}];document.querySelector('#category').innerHTML='<option value=""></option><option value="กาแฟ">กาแฟ</option><option value="หมวดอื่น">หมวดอื่น</option>';`,context);
 assert.equal(vm.runInContext("ingredientRecipeUses(currentState(),'น้ำกาแฟ').length",context),2);
 assert.equal(vm.runInContext("ingredientRecipeUses(currentState(),'ไม่มีคนใช้').length",context),0);
 document.defaultView.HTMLElement.prototype.showModal=function(){this.setAttribute('open','')};document.defaultView.HTMLElement.prototype.close=function(){this.removeAttribute('open')};
 vm.runInContext("showIngredientRecipes('น้ำกาแฟ')",context);
 const buttons=document.querySelectorAll('.ingredient-usage-list button');assert.equal(buttons.length,2);assert.match(buttons[1].textContent,/หมวดอื่น/);
 buttons[1].onclick();assert.equal(document.querySelector('.ingredient-usage-dialog'),null);assert.equal(vm.runInContext('activeView',context),'recipes');assert.equal(document.querySelectorAll('#cards .recipe-card').length,1);assert.equal(document.querySelector('#cards .recipe-card').dataset.recipeName,'โอเลี้ยง');
 vm.runInContext("showIngredientRecipes('ไม่มีคนใช้')",context);assert.match(document.querySelector('.ingredient-usage-dialog').textContent,/ยังไม่มีเมนู/);
});

test('ingredient usage count includes shared-cost aliases and agrees with deletion protection',()=>{
 const {context}=loadBook();
 vm.runInContext(`recipes=[{category:'กาแฟ',names:['โอเลี้ยง'],details:{'โอเลี้ยง':{ingredientRows:[{name:'น้ำกาแฟ',actual:150,unit:'มล.'}]}}}];ingredientCosts=[{name:'น้ำกาแฟสกัด',packagePrice:20,packageQuantity:1000,packageUnit:'มล.'}];ingredientAliases={[normalizeIngredientLabel('น้ำกาแฟ')]:'น้ำกาแฟสกัด'};`,context);
 for(const name of ['น้ำกาแฟสกัด','น้ำกาแฟ']){context.ingredientName=name;assert.equal(vm.runInContext('ingredientRecipeUses(currentState(),ingredientName).length',context),1);assert.equal(vm.runInContext('ingredientDeletionInfo(currentState(),ingredientName).used.length',context),1);}
 assert.throws(()=>vm.runInContext("stateWithoutIngredient(currentState(),'น้ำกาแฟสกัด')",context),/ยังใช้ใน 1 สูตร/);
});

test('plain water has a dash price and no missing cost or unit conversion warnings',()=>{
 const {context,document}=loadBook();
 vm.runInContext(`ingredientCosts=[{name:'น้ำ',packagePrice:'1',packageQuantity:'1',packageUnit:'1'}];`,context);
 for(const name of ['น้ำ','น้ำเปล่า','น้ำร้อน','น้ำอุ่น']){context.waterName=name;
 const result=vm.runInContext("calculateRecipeCost({ingredientRows:[{name:waterName,actual:150,unit:'มล.'}]})",context);assert.equal(result.total,0);assert.equal(result.missing,0);assert.equal(result.zeroPriced,0);assert.equal(result.breakdown[0].noCost,true);
 const row=vm.runInContext("makeCostRow({name:waterName,packagePrice:'0'})",context);assert.equal(row.querySelector('[data-cost-field=packagePrice]').value,'–');assert.notEqual(row.querySelector('[data-cost-field=packagePrice]').readOnly,true);
 assert.match(vm.runInContext("ingredientCostStatus({name:waterName}).detail",context),/ไม่มีต้นทุน/);
 }
 assert.equal(vm.runInContext("freeIngredient('น้ำกาแฟ')",context),false);assert.equal(vm.runInContext("freeIngredient('น้ำมะพร้าว')",context),false);
 vm.runInContext("recipes=[{category:'กาแฟ',names:['ทดสอบ'],details:{'ทดสอบ':{ingredientRows:[{name:'น้ำ',actual:150,unit:'มล.'}]}}}];renderCostSection();",context);
 assert.doesNotMatch(document.querySelector('.ingredient-table').textContent,/1 1 \/ 1 บาท/);assert.match(document.querySelector('.ingredient-table').textContent,/–/);
});

test('a dash marks any ingredient as no cost while zero and blank remain pending',()=>{
 const {context}=loadBook();
 for(const dash of ['-','–','—']){context.dash=dash;const row=vm.runInContext("normalizeCostPrice({name:'ของแถม',packagePrice:dash})",context);assert.equal(row.noCost,true);assert.equal(row.packagePrice,'0');context.fixture=row;
 const result=vm.runInContext("ingredientCosts=[fixture];calculateRecipeCost({ingredientRows:[{name:'ของแถม',actual:1,unit:'ชิ้น'}]})",context);assert.equal(result.missing,0);assert.equal(result.zeroPriced,0);assert.equal(result.total,0);
 assert.equal(vm.runInContext("ingredientCostStatus({name:'ของแถม'}).kind",context),'free');
 }
 for(const price of ['0','','50']){context.price=price;assert.equal(vm.runInContext("normalizeCostPrice({name:'ของแถม',noCost:true,packagePrice:price}).noCost",context),false);}
 vm.runInContext("ingredientCosts=[{name:'ของแถม',packagePrice:'0',noCost:false}]",context);assert.equal(vm.runInContext("ingredientCostStatus({name:'ของแถม'}).kind",context),'price');
});

test('recipe ingredient edit opens the currently selected ingredient and preserves the unsaved recipe on cancel and save',async()=>{
 const {context,document}=loadBook();document.defaultView.HTMLElement.prototype.showModal=function(){this.setAttribute('open','')};document.defaultView.HTMLElement.prototype.close=function(){this.removeAttribute('open')};
 vm.runInContext(`editing=true;ingredientCosts=[{name:'ชาเขียว ตรามือ',packagePrice:'79',packageQuantity:'200',packageUnit:'กรัม'}];document.querySelector('#newRecipeName').value='สูตรที่ยังไม่บันทึก';document.querySelector('#recipeDialog').setAttribute('open','');addStructuredIngredient({name:'ชา',min:'1',max:'',actual:'',unit:'10g(1ช้อน)',note:'หมายเหตุที่ยังไม่บันทึก',original:'ชา 1 ช้อน'});`,context);
 const box=document.querySelector('#ingredientRows').lastElementChild,select=box.querySelector('[aria-label="ชื่อวัตถุดิบ"]');select.value='ชาเขียว ตรามือ';select.dispatchEvent(new document.defaultView.Event('change'));
 box.querySelector('.recipe-ingredient-edit').onclick();let dialog=document.querySelector('.ingredient-price-dialog');assert.match(dialog.querySelector('h2').textContent,/ชาเขียว ตรามือ/);assert.equal(dialog.querySelector('[data-cost-field=packagePrice]').value,'79');
 [...dialog.querySelectorAll('button')].find(b=>b.textContent==='ยกเลิก').click();assert.equal(document.querySelector('.ingredient-price-dialog'),null);assert.equal(vm.runInContext('editing',context),true);assert.equal(box.querySelector('[data-field=min]').value,'1');assert.equal(box.querySelector('[data-field=note]').value,'หมายเหตุที่ยังไม่บันทึก');
 box.querySelector('.recipe-ingredient-edit').onclick();dialog=document.querySelector('.ingredient-price-dialog');dialog.querySelector('[data-cost-field=packagePrice]').value='80';
 context.Option=function(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option;};vm.runInContext('persistState=async state=>{globalThis.savedState=state;applyRecipeState(state);return true;}',context);
 dialog.querySelector('.ingredient-price-save').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(vm.runInContext("savedState.ingredientCosts.find(row=>row.name===\"ชาเขียว ตรามือ\").packagePrice",context),'80');assert.equal(document.querySelector('#newRecipeName').value,'สูตรที่ยังไม่บันทึก');assert.equal(select.value,'ชาเขียว ตรามือ');assert.equal(box.querySelector('[data-field=unit]').value,'');assert.equal(box.querySelector('[data-field=min]').value,'1');assert.ok(![...box.querySelectorAll('[data-field=unit] option')].some(option=>option.value==='10g(1ช้อน)'));assert.equal(vm.runInContext('editing',context),true);
});

test('a measured pack yield calculates kg purchases used in ml without assuming density',()=>{
 const {context}=loadBook();
 vm.runInContext(`ingredientCosts=[{name:'นม',packageQuantity:'1',packageUnit:'กิโลกรัม',packagePrice:'66',usableQuantity:900,usableUnit:'มล.',usablePackQuantity:1,usablePackUnit:'กิโลกรัม'}];`,context);
 assert.equal(vm.runInContext("convertRecipeQuantity(30,'มล.','กิโลกรัม',null)",context),null);
 const result=vm.runInContext("calculateRecipeCost({ingredientRows:[{name:'นม',min:'30',unit:'มล.'}]})",context);assert.ok(Math.abs(result.total-2.2)<1e-10,JSON.stringify(result));assert.equal(result.missing,0);
 assert.ok(Math.abs(vm.runInContext("convertRecipeQuantity(0.03,'ลิตร','กิโลกรัม',ingredientCosts[0])",context)-1/30)<1e-10);
 vm.runInContext("ingredientCosts[0].usableQuantity=770",context);assert.ok(Math.abs(vm.runInContext("calculateRecipeCost({ingredientRows:[{name:'นม',min:'30',unit:'มล.'}]}).total",context)-66*30/770)<1e-10);
 vm.runInContext("ingredientCosts[0].packageQuantity='2'",context);assert.equal(vm.runInContext("convertRecipeQuantity(30,'มล.','กิโลกรัม',ingredientCosts[0])",context),null);
});
test('pack editor automatically converts compatible units and clears measurements when fetched pack size changes',()=>{
 const {context,document}=loadBook();
 vm.runInContext(`sourceFixture={name:'นม',packageQuantity:'1',packageUnit:'กิโลกรัม',packagePrice:'66',unitWeights:{ลูก:120}};rowFixture=makeCostRow(sourceFixture);editorFixture=makeUsablePackEditor(rowFixture,sourceFixture,{name:'นม',units:new Set(['มล.'])});`,context);
 const editor=vm.runInContext('editorFixture',context),row=vm.runInContext('rowFixture',context),unit=editor.box.querySelector('[data-usable-unit]'),qty=editor.box.querySelector('[data-usable-quantity]');
 assert.equal(unit.value,'มล.');assert.equal(qty.disabled,false);qty.value='900';qty.dispatchEvent(new document.defaultView.Event('input'));assert.match(editor.box.textContent,/0.0733/);
 const saved=editor.read({packageQuantity:'1',packageUnit:'กิโลกรัม'});assert.equal(saved.usableQuantity,900);assert.equal(saved.usableUnit,'มล.');
 row.querySelector('[data-cost-field=packageQuantity]').value='2';row.querySelector('[data-cost-field=packageQuantity]').dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));assert.equal(qty.value,'');
 unit.value='กรัม';unit.dispatchEvent(new document.defaultView.Event('change'));assert.equal(qty.disabled,true);assert.match(editor.box.textContent,/2,000/);assert.equal(editor.read({...saved}).usableQuantity,undefined);
 // Existing per-unit weights remain on the purchase row; only relevant units are shown in the advanced form.
 assert.equal(vm.runInContext('sourceFixture.unitWeights.ลูก',context),120);
});

test('missing ingredient status identifies exact recipes and distinguishes missing quantities from conversion',()=>{
 const {context,document}=loadBook();
 vm.runInContext(`recipes=[{category:'ชา',domain:'drinks',names:['ชาเย็น','ชาปั่น','ชาครบ'],details:{'ชาเย็น':{ingredientRows:[{name:'ชา',min:'',unit:''}]},'ชาปั่น':{ingredientRows:[{name:'ชา',min:'1',unit:'ช้อน'}]},'ชาครบ':{ingredientRows:[{name:'ชา',min:'10',unit:'กรัม'}]}}}];ingredientCosts=[{name:'ชา',packageQuantity:'200',packageUnit:'กรัม',packagePrice:'95'}];ingredientAliases={};`,context);
 const issues=JSON.parse(vm.runInContext("JSON.stringify(ingredientRecipeIssues('ชา'))",context));assert.equal(issues.length,2);assert.equal(issues[0].name,'ชาเย็น');assert.match(issues[0].reason,/ปริมาณ/);assert.equal(issues[1].conversion,true);assert.match(issues[1].reason,/ช้อน เป็น กรัม/);
 vm.runInContext("renderCostSection()",context);const status=[...document.querySelectorAll('.status-pill')].find(el=>el.getAttribute('aria-label')==='ดูจุดที่ต้องแก้ ชา');assert.ok(status);status.click();const dialog=document.querySelector('.ingredient-usage-dialog');assert.ok(dialog.textContent.includes('ชาเย็น'));assert.ok(dialog.textContent.includes('ชาปั่น'));assert.ok(!dialog.textContent.includes('ชาครบ'));assert.ok(dialog.textContent.includes('แก้การแปลงหน่วยวัตถุดิบ'));vm.runInContext('openRecipeForm=key=>{globalThis.openedIssueKey=key;}',context);dialog.querySelector('button').click();assert.equal(vm.runInContext('openedIssueKey',context),JSON.stringify(['ชา','ชาเย็น']));
});
