/* Owner settings. Access tokens are submitted only to the authenticated same-origin server. */
(()=>{
 const esc=s=>escapeText(s),el=document.getElementById('loyverseSettings');let settings;
 const names={synced:'บันทึกเข้า Loyverse แล้ว',blocked:'รอเชื่อมต่อ / ตรวจคู่เมนู',pending:'รอส่งเข้า Loyverse',preparing:'กำลังเตรียมยอดขาย',sending:'กำลังส่งยอดขาย',unknown:'รอตรวจผลใน Loyverse',error:'ส่งไม่สำเร็จ',review:'ต้องตรวจใบเสร็จใน Loyverse'};
 window.renderLoyverseStatus=o=>{
  if(o.status!=='completed'||o.payment_status!=='verified'||Number(o.total)<=0||Number(o.points_used)>0)return '';
  const s=o.loyverse||{status:'pending'};
  return '<div class="loyalty-points"><strong>Loyverse: '+esc(names[s.status]||'รอตรวจสอบ')+'</strong>'+(s.receipt_number?'<p>ใบเสร็จ '+esc(s.receipt_number)+'</p>':'')+(s.message?'<p>'+esc(s.message)+'</p>':'')+(!['synced','review'].includes(s.status)?'<button type="button" class="secondary" data-sync-loyverse="'+esc(o.id)+'">'+(['sending','preparing','unknown'].includes(s.status)?'ตรวจผลการส่ง Loyverse':'ส่งเข้า Loyverse')+'</button>':'')+'</div>';
 };
 function select(id,label,rows,value){return '<label>'+esc(label)+'<select id="'+id+'"><option value="">เลือก…</option>'+rows.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===value?'selected':'')+'>'+esc(x.name+(x.options?' · '+x.options:''))+'</option>').join('')+'</select></label>'}
 function paint(){
  const c=settings.config||{},o=settings.options;
  el.innerHTML='<p class="caption">เชื่อมยอดขายหลังส่งมอบและรับเงินแล้ว ออเดอร์แลกแต้มยังไม่ส่งเข้า Loyverse</p><form id="loyverseConnect"><label>Access Token จาก Loyverse<input id="loyverseToken" type="password" autocomplete="off" required placeholder="วาง Token ที่นี่ ไม่ต้องส่งในแชต"></label><button class="secondary" type="submit">'+(settings.connected?'เปลี่ยนบัญชีเชื่อมต่อ':'เชื่อมต่อและตรวจสิทธิ์')+'</button></form>';
  if(!o)return;
  el.insertAdjacentHTML('beforeend','<p>เชื่อมต่อ API ได้แล้ว กรุณาเลือกร้านและจับคู่เมนูก่อนเปิดส่งอัตโนมัติ</p><form id="loyverseConfig">'+select('lvStore','ร้าน Loyverse',o.stores,c.storeId)+select('lvCash','เงินสด',o.payments.filter(x=>x.type==='CASH'),c.cashId)+select('lvQr','วิธีรับเงินสำหรับ QR ร้าน',o.payments,c.qrId)+select('lvDiscount','ส่วนลดจำนวนเงิน สำหรับโปรโมชัน',o.discounts,c.discountId)+'<p class="caption">เมนูที่ชื่อตรงกันจะแนะนำให้ ตรวจทุกรายการก่อนบันทึก เลือกไม่จับคู่ได้แต่ระบบจะหยุดออเดอร์ที่มีเมนูนั้น</p><div id="lvMappings" style="max-height:360px;overflow:auto"></div><label><input id="lvEnabled" type="checkbox" '+(c.enabled?'checked':'')+'> เปิดส่งอัตโนมัติหลังส่งมอบและรับเงิน</label><button class="primary" type="submit">บันทึกการจับคู่และการส่งยอดขาย</button></form>');
  document.getElementById('lvMappings').innerHTML=(settings.products||[]).map((p,n)=>'<div data-product="'+esc(p.id)+'">'+select('lvMap'+n,p.name,o.variants,c.mappings?.[p.id]||settings.suggestions?.[p.id])+'</div>').join('');
 }
 async function load(){el.textContent='กำลังตรวจการเชื่อมต่อ…';try{settings=await request('admin/loyverse');paint()}catch(e){el.textContent=e.message}}
 document.getElementById('manageLoyverse').addEventListener('click',async()=>{const panel=document.getElementById('loyversePanel');panel.hidden=!panel.hidden;if(!panel.hidden){panel.scrollIntoView({behavior:'smooth'});await load()}});
 el.addEventListener('submit',async e=>{
  e.preventDefault();const button=e.target.querySelector('button[type="submit"]');button.disabled=true;
  try{
   if(e.target.id==='loyverseConnect'){
    const input=document.getElementById('loyverseToken'),token=input.value.trim();input.value='';
    await request('admin/loyverse',{method:'POST',body:JSON.stringify({action:'connect',token})});await load();alert('เชื่อมต่อแล้ว ตรวจคู่เมนูและเปิดการส่งอัตโนมัติต่อได้');
   }else{
    const mappings={};document.querySelectorAll('#lvMappings [data-product]').forEach(row=>{const value=row.querySelector('select').value;if(value)mappings[row.dataset.product]=value});
    const v=id=>document.getElementById(id).value;
    await request('admin/loyverse',{method:'POST',body:JSON.stringify({action:'save',storeId:v('lvStore'),cashId:v('lvCash'),qrId:v('lvQr'),discountId:v('lvDiscount'),mappings,enabled:document.getElementById('lvEnabled').checked})});await load();alert('บันทึกแล้ว ออเดอร์เก่ากดส่งเข้า Loyverse ได้จากรายการออเดอร์');
   }
  }catch(err){alert(err.message)}finally{button.disabled=false}
 });
 document.getElementById('adminContent').addEventListener('click',async e=>{const b=e.target.closest('[data-sync-loyverse]');if(!b)return;if(!confirm('ตรวจและส่งยอดขายออเดอร์นี้เข้า Loyverse? หากเคยคีย์ยอดนี้ใน POS เองแล้ว อย่าส่งซ้ำ'))return;b.disabled=true;try{const r=await request('admin/loyverse/sync',{method:'POST',body:JSON.stringify({id:b.dataset.syncLoyverse})});alert(r.status==='synced'?'บันทึกแล้ว ใบเสร็จ '+r.receipt_number:(r.message||names[r.status]||'ยังไม่พร้อมส่ง'));await loadOrders()}catch(err){alert(err.message)}finally{b.disabled=false}});
})();
