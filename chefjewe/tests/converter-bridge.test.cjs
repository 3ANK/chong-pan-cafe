const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/../cost-audit-client.js','utf8');
function setup(){const messages=[],child={postMessage:x=>messages.push(x)},listeners={},state={ingredientCosts:[{name:'Milk',packageQuantity:1000,packageUnit:'กรัม',packagePrice:122,photo:'preserve'}]};let saved=null;
 const window={location:{origin:'https://chefjewe.pages.dev'},open:()=>child,addEventListener:(name,fn)=>listeners[name]=fn};const c=vm.createContext({window,document:{querySelector:()=>null},currentPassphrase:'test-only',lastUpdatedAt:'r1',ingredientCosts:state.ingredientCosts,busy:false,editing:false,costsDirty:false,currentState:()=>state,normalizeUnit:u=>u,convertRecipeQuantity:q=>q,persistState:async x=>{saved=x;return true},$:()=>({})});vm.runInContext(source,c);vm.runInContext('costConverterWindow=window.open()',c);return {c,child,listeners,messages,saved:()=>saved};}
test('converter changes accept only the current same-origin child and revision',async()=>{
 const s=setup(),data={type:'chefjewe-converter-save',revision:'r1',name:'Milk',density:1.5,equivalents:{}};
 await s.listeners.message({origin:'https://evil.test',source:s.child,data});assert.equal(s.saved(),null);
 await s.listeners.message({origin:'https://chefjewe.pages.dev',source:{},data});assert.equal(s.saved(),null);
 await s.listeners.message({origin:'https://chefjewe.pages.dev',source:s.child,data:{...data,revision:'old'}});assert.equal(s.saved(),null);assert.equal(s.messages.at(-1).ok,false);
 await s.listeners.message({origin:'https://chefjewe.pages.dev',source:s.child,data});const row=s.saved().ingredientCosts[0];assert.equal(row.unitWeights.ช้อนชา,7.5);assert.equal(row.packagePrice,122);assert.equal(row.photo,'preserve');assert.ok(Math.abs(row.usableQuantity-1000/1.5)<0.000001);assert.equal(s.messages.at(-2).ok,true);
});
test('invalid or busy converter updates never persist',async()=>{
 const s=setup(),event={origin:'https://chefjewe.pages.dev',source:s.child,data:{type:'chefjewe-converter-save',revision:'r1',name:'Milk',density:-2}};await s.listeners.message(event);assert.equal(s.saved(),null);vm.runInContext('busy=true',s.c);event.data.density=1.5;await s.listeners.message(event);assert.equal(s.saved(),null);
});
