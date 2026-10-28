const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const worker=fs.readFileSync(__dirname+'/../public/_worker.js','utf8');const html=JSON.parse(worker.match(/const HTML = ("(?:[^"\\]|\\.)*");/)[1]);

test('remove Carnation / fresh milk duplicate and move its recipe use to canonical cost without changing quantities',()=>{
 const c=vm.createContext({getDetailRows:d=>d.ingredientRows.map(r=>({...r})),formatIngredientRow:r=>[r.name,r.min,r.unit].join(' ')});
 vm.runInContext(html.slice(html.indexOf('function mergeCarnationAlternative('),html.indexOf('function standardizeDrinkMilk(')),c);
 c.state={ingredientCosts:[{name:'นมข้นจืดตราคาเนชั่น',packagePrice:66,usableQuantity:770},{name:'นมข้นจืดตราคาเนชั่น / นมสด',packagePrice:0}],ingredientAliases:{'นมทางเลือก':'นมข้นจืดตราคาเนชั่น / นมสด'},recipes:[{names:['เมนู'],details:{'เมนู':{ingredientRows:[{name:'นมข้นจืดตราคาเนชั่น / นมสด',min:'30',unit:'มล.'}]}}}]};
 assert.equal(vm.runInContext('mergeCarnationAlternative(state).changed',c),true);assert.equal(c.state.ingredientCosts.length,1);assert.equal(c.state.ingredientCosts[0].usableQuantity,770);const row=c.state.recipes[0].details['เมนู'].ingredientRows[0];assert.equal(row.name,'นมข้นจืดตราคาเนชั่น');assert.equal(row.min,'30');assert.equal(row.unit,'มล.');assert.equal(c.state.ingredientAliases['นมทางเลือก'],'นมข้นจืดตราคาเนชั่น');assert.equal(vm.runInContext('mergeCarnationAlternative(state).changed',c),false);
});
