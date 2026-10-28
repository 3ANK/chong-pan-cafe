const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const worker=fs.readFileSync(__dirname+'/../public/_worker.js','utf8');const html=JSON.parse(worker.match(/const HTML = ("(?:[^"\\]|\\.)*");/)[1]);
test('remove legacy spoon quantities from drinks without converting, retaining backup and other units',()=>{
 const c=vm.createContext({getDetailRows:d=>d.ingredientRows.map(r=>({...r})),groupDomain:g=>g.domain==='food'?'food':'drinks',formatIngredientRow:r=>[r.name,r.min,r.unit].filter(Boolean).join(' ')});
 const start=html.indexOf('function removeLegacySpoonQuantities('),end=html.indexOf('function standardizeDrinkSpoons(',start);vm.runInContext(html.slice(start,end),c);
 c.state={recipes:[{names:['Drink'],details:{Drink:{ingredientRows:[{name:'กาแฟ',min:'1',max:'2',actual:'1.5',unit:'10g(1ช้อน)'},{name:'นม',min:'30',unit:'มล.'},{name:'ผง',min:'10',unit:'กรัม'}]}}},{domain:'food',names:['Food'],details:{Food:{ingredientRows:[{name:'น้ำตาล',min:'1',unit:'ช้อนโต๊ะ (10g)'}]}}}]};
 assert.equal(vm.runInContext('removeLegacySpoonQuantities(state).changed',c),true);
 const rows=c.state.recipes[0].details.Drink.ingredientRows;for(const key of ['min','max','actual','unit'])assert.equal(rows[0][key],'');assert.equal(rows[0].quantityBeforeRemovingLegacySpoon.actual,'1.5');assert.equal(rows[1].min,'30');assert.equal(rows[2].min,'10');assert.equal(c.state.recipes[1].details.Food.ingredientRows[0].unit,'ช้อนโต๊ะ (10g)');
 assert.equal(vm.runInContext('removeLegacySpoonQuantities(state).changed',c),false);rows[0].min='10';rows[0].unit='กรัม';vm.runInContext('removeLegacySpoonQuantities(state)',c);assert.equal(rows[0].min,'10');
});
