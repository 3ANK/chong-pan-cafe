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
 const {document}=parseHTML(html);const context=vm.createContext({document,window:{addEventListener(){}},navigator:{},crypto:crypto.webcrypto,TextEncoder,TextDecoder,URL,Blob,atob,btoa,console,setTimeout,clearTimeout,setInterval,clearInterval,alert(){},confirm:()=>false,fetch:()=>{throw Error('Unexpected network')}});
 new vm.Script(script).runInContext(context);return {context,document,html};
}
test('compiled web book renders standalone ingredients, photos and transfer buttons',()=>{
 const {context,document}=loadBook();
 vm.runInContext(`ingredientCosts=[{name:'Milk',packageQuantity:2,packageUnit:'L',packagePrice:90,photo:${JSON.stringify(photo)}}];renderCostSection()`,context);
 assert.equal(document.querySelectorAll('.ingredient-table tbody tr').length,1);
 assert.equal(document.querySelector('.ingredient-table img').getAttribute('src'),'data:image/png;base64,'+photo);
 assert.match(document.getElementById('ingredientCostsList').textContent,/รับไฟล์วัตถุดิบพร้อมรูปจากแอป/);
 assert.match(document.getElementById('ingredientCostsList').textContent,/ส่งออกวัตถุดิบพร้อมรูปไปแอป/);
 const result=JSON.parse(vm.runInContext('JSON.stringify(buildIngredientTransfer(currentState()))',context));
 assert.equal(result.recipes.length,0);assert.equal(result.ingredients[0].quantity,2);assert.equal(result.ingredients[0].unit,'L');assert.equal(result.ingredients[0].price,90);assert.equal(result.ingredients[0].photo,photo);
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
