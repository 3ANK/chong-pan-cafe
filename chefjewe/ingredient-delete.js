function ingredientDeletionInfo(state,name){
 const costs=state.ingredientCosts||[],source=findIngredientCost(name,costs,state.ingredientAliases||{}),key=normalizeIngredientLabel(source?.name||name),used=[];
 for(const group of state.recipes||[])for(const recipe of group.names||[]){
  if(getDetailRows(group.details?.[recipe]||{}).some(row=>{const cost=findIngredientCost(row.name,costs,state.ingredientAliases||{});return normalizeIngredientLabel(cost?.name||row.name)===key;}))used.push(recipe);
 }
 return {source,key,used};
}
function stateWithoutIngredient(state,name){
 const info=ingredientDeletionInfo(state,name);
 if(!info.source)throw Error('ไม่พบวัตถุดิบในบัญชีราคาซื้อ');
 const matches=row=>{const cost=findIngredientCost(row.name,state.ingredientCosts||[],state.ingredientAliases||{});return normalizeIngredientLabel(cost?.name||row.name)===info.key;};
 const recipes=(state.recipes||[]).map(group=>{let changed=false;const details={...(group.details||{})};
  for(const recipe of group.names||[]){const detail=details[recipe]||{},rows=getDetailRows(detail);if(!rows.some(matches))continue;
   const remaining=rows.filter(row=>!matches(row));details[recipe]={...detail,ingredientRows:remaining,ingredients:remaining.map(formatIngredientRow)};changed=true;
  }
  return changed?{...group,details}:group;
 });
 const aliases={...(state.ingredientAliases||{})};for(const [key,value] of Object.entries(aliases))if(normalizeIngredientLabel(key)===info.key||normalizeIngredientLabel(value)===info.key)delete aliases[key];
 return {...state,recipes,ingredientAliases:aliases,ingredientCosts:(state.ingredientCosts||[]).filter(row=>normalizeIngredientLabel(row.name)!==info.key)};
}
function openIngredientDeleteConfirmation(name,onDeleted){
 if(busy)return;const info=ingredientDeletionInfo(currentState(),name),dialog=document.createElement('dialog');dialog.className='ingredient-transfer-dialog ingredient-delete-confirm';dialog.setAttribute('aria-label','ยืนยันลบวัตถุดิบ');
 const title=document.createElement('h2');title.textContent='ลบวัตถุดิบ · '+name;dialog.append(title);
 const message=document.createElement('p');message.textContent=info.used.length?'วัตถุดิบนี้ยังใช้ใน '+info.used.length+' สูตร หากยืนยัน จะลบวัตถุดิบพร้อมราคาซื้อและรูป และนำรายการนี้ออกจากทุกสูตรด้านล่าง โดยเก็บสูตรเมนูไว้ ต้นทุนจะคำนวณใหม่โดยไม่รวมวัตถุดิบนี้ การลบนี้ไม่มีปุ่มกู้คืน':'ลบวัตถุดิบนี้ พร้อมราคาซื้อและรูป ออกจากรายการใช่ไหม? การลบนี้ไม่มีปุ่มกู้คืน';dialog.append(message);
 if(info.used.length){const list=document.createElement('ul');for(const name of info.used){const li=document.createElement('li');li.textContent=name;list.append(li);}dialog.append(list);}
 const error=document.createElement('p');error.setAttribute('role','alert');dialog.append(error);
 const actions=document.createElement('div');actions.className='category-tools';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='ยกเลิก';actions.append(cancel);
 let saving=false;const close=()=>{if(saving)return;dialog.close();dialog.remove();};cancel.onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
 if(info.source){const remove=document.createElement('button');remove.type='button';remove.className='ingredient-delete-button';remove.textContent=info.used.length?'ยืนยันลบวัตถุดิบและนำออกจากสูตร':'ยืนยันลบวัตถุดิบ';actions.append(remove);
 remove.onclick=async()=>{if(saving||busy)return;saving=true;remove.disabled=true;cancel.disabled=true;error.textContent='';try{const next=stateWithoutIngredient(currentState(),name);if(await persistState(next)){saving=false;close();onDeleted();$('saveStatus').textContent='ลบวัตถุดิบ '+name+' และซิงก์แล้ว';return;}error.textContent=$('saveStatus').textContent||'ลบไม่สำเร็จ กรุณาลองอีกครั้ง';}catch(e){error.textContent=e.message;}finally{saving=false;remove.disabled=false;cancel.disabled=false;}};
 }
 dialog.append(actions);document.body.append(dialog);dialog.showModal();cancel.focus();
}
