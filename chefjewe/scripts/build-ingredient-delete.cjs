const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..'),file=path.join(root,'public/_worker.js'),pattern=/const HTML = ("(?:[^"\\]|\\.)*");/;
let worker=fs.readFileSync(file,'utf8'),html=JSON.parse(worker.match(pattern)[1]);
const helper='// INGREDIENT_DELETE_START\n'+fs.readFileSync(path.join(root,'ingredient-delete.js'),'utf8')+'// INGREDIENT_DELETE_END\n';
if(html.includes('// INGREDIENT_DELETE_START'))html=html.replace(/\/\/ INGREDIENT_DELETE_START[\s\S]*?\/\/ INGREDIENT_DELETE_END\n/,helper);
else{
 const anchor='function openIngredientPriceEditor(item){';if(!html.includes(anchor))throw Error('Missing price editor');html=html.replace(anchor,helper+anchor);
 const start=html.indexOf(anchor),end=html.indexOf('function isSmmPriceUrl',start);let editor=html.slice(start,end);
 const old="save.textContent='บันทึกราคา';actions.append(cancel,save);";if(!editor.includes(old))throw Error('Missing price actions');
 editor=editor.replace(old,"save.textContent='บันทึกราคา';save.className='ingredient-price-save';const remove=document.createElement('button');remove.type='button';remove.className='ingredient-delete-button';remove.textContent='ลบวัตถุดิบ';remove.onclick=()=>openIngredientDeleteConfirmation(source.name,close);actions.append(cancel,remove,save);");
 html=html.slice(0,start)+editor+html.slice(end);
}
const css=`<style id="ingredient-delete-styles">dialog.ingredient-price-dialog .ingredient-delete-button,dialog.ingredient-delete-confirm .ingredient-delete-button{background:#b42332;color:#fff;border:1px solid #981b29;box-shadow:none}dialog.ingredient-price-dialog .ingredient-delete-button:hover,dialog.ingredient-delete-confirm .ingredient-delete-button:hover{background:#921c29;color:#fff}dialog.ingredient-price-dialog .ingredient-price-save{background:#5b45b5;color:#fff;border:1px solid #493397;box-shadow:none}dialog.ingredient-price-dialog .ingredient-price-save:hover{background:#493397;color:#fff}.ingredient-price-dialog .category-tools,.ingredient-delete-confirm .category-tools{display:flex;flex-wrap:wrap;gap:10px}.ingredient-price-dialog .category-tools button,.ingredient-delete-confirm .category-tools button{min-height:44px}.ingredient-delete-confirm [role="alert"]{color:#a52f2f}</style>`;
html=html.replace(/<style id="ingredient-delete-styles">[\s\S]*?<\/style>/,'').replace('</head>',css+'</head>');worker=worker.replace(pattern,()=> 'const HTML = '+JSON.stringify(html)+';');fs.writeFileSync(file,worker);console.log('Added ingredient delete action and distinct save/delete colors');
