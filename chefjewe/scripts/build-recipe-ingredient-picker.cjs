const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),file=path.join(root,'public/_worker.js'),pattern=/const HTML = ("(?:[^"\\]|\\.)*");/;
let worker=fs.readFileSync(file,'utf8'),html=JSON.parse(worker.match(pattern)[1]);
const helper='// RECIPE_INGREDIENT_PICKER_START\n'+fs.readFileSync(path.join(root,'recipe-ingredient-picker.js'),'utf8')+'// RECIPE_INGREDIENT_PICKER_END\n';
if(html.includes('// RECIPE_INGREDIENT_PICKER_START'))html=html.replace(/\/\/ RECIPE_INGREDIENT_PICKER_START[\s\S]*?\/\/ RECIPE_INGREDIENT_PICKER_END\n/,helper);
else{
 const anchor='function renderStructuredIngredients(rows){';if(!html.includes(anchor))throw Error('Missing recipe editor');html=html.replace(anchor,helper+anchor);
 const old="if(key==='name')input.setAttribute('list','ingredientNames');wrap.append(input);";
 if(!html.includes(old))throw Error('Missing ingredient name field');
 html=html.replace(old,"if(key==='name')return makeRecipeIngredientPicker(parent,wrap,row[key]??'');wrap.append(input);");
}
worker=worker.replace(pattern,()=> 'const HTML = '+JSON.stringify(html)+';');fs.writeFileSync(file,worker);
console.log('Updated recipe ingredient name picker');
