// A native select intentionally shows every ingredient, independent of the current name.
function makeRecipeIngredientPicker(parent,wrap,current){
 const select=document.createElement('select');select.setAttribute('aria-label','ชื่อวัตถุดิบ');
 const names=new Set(collectIngredientNames(currentState()).map(item=>item.name));if(current)names.add(String(current));
 for(const name of [...names].sort((a,b)=>a.localeCompare(b,'th'))){const option=document.createElement('option');option.value=name;option.textContent=name;select.append(option);}
 const custom=document.createElement('option');custom.value='';custom.textContent='＋ พิมพ์ชื่อวัตถุดิบใหม่';select.append(custom);
 const customWrap=document.createElement('label');customWrap.textContent='ชื่อวัตถุดิบใหม่';
 const input=document.createElement('input');input.type='text';input.setAttribute('aria-label','ชื่อวัตถุดิบใหม่');input.placeholder='พิมพ์ชื่อวัตถุดิบ';input.value=current||'';customWrap.append(input);
 select.value=current||'';
 function sync(focus=false){const isCustom=select.value==='';customWrap.hidden=!isCustom;if(isCustom){select.removeAttribute('data-field');input.dataset.field='name';if(focus)input.focus();}else{input.removeAttribute('data-field');select.dataset.field='name';}}
 select.addEventListener('change',()=>sync(true));sync();wrap.append(select);parent.append(wrap,customWrap);return select;
}
