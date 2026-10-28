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
 assert.equal(result.recipes.length,1);assert.equal(result.recipes[0].photo,photo);assert.equal(result.ingredients.length,2);assert.equal(result.ingredients.find(i=>i.name==='Unused').photo,photo);
 assert.equal(result.recipes[0].parts.length,1);
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
