
(()=>{'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let grant=null;
const storageKey=id=>'counter-pending:'+id;
async function api(path,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{const r=await fetch('/api/admin/member-points'+path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options,signal:controller.signal});const data=await r.json();if(!r.ok)throw Error(data.error||'บันทึกไม่สำเร็จ');return data}finally{clearTimeout(timer)}
}
async function history(id){const el=$('counterHistory');el.textContent='กำลังโหลด…';try{
 const r=await api('?member='+encodeURIComponent(id));if(grant?.member!==id)return;
 el.innerHTML=r.history.length?r.history.map(g=>'<div class="ordercard"><strong>+'+Number(g.delta)+' แต้ม</strong> · ยอดซื้อ '+Number(g.purchase_amount)+' บาท<p class="caption">'+esc(new Date(g.created_at.replace(' ','T')+'Z').toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}))+' · โดย '+esc(g.actor_name)+'</p>'+(g.note?'<p>'+esc(g.note)+'</p>':'')+'</div>').join(''):'ยังไม่มีประวัติเติมแต้มหน้าร้าน';
}catch(e){if(grant?.member===id)el.textContent='โหลดประวัติไม่ได้: '+e.message}}
$('membersContent').addEventListener('click',e=>{
 const b=e.target.closest('[data-counter-member]');if(!b)return;
 const card=b.closest('article'),id=b.dataset.counterMember;
 let pending=null;try{pending=JSON.parse(sessionStorage.getItem(storageKey(id)))}catch{}
 grant={member:id,name:card.querySelector('strong').textContent,payload:pending,busy:false,done:false};
 $('counterName').textContent=grant.name+' · LINE ลงท้าย '+id.slice(-8);
 $('counterAmount').value=pending?.amount||'';$('counterNote').value=pending?.note||'';
 $('counterAmount').disabled=!!pending;$('counterNote').disabled=!!pending;
 $('counterPreview').textContent='ทุก 25 บาท = 1 แต้ม · ปัดเศษทิ้ง';
 $('counterStatus').textContent=pending?'มีรายการรอยืนยันผล กดตรวจผลเพื่อป้องกันการเติมซ้ำ':'';
 $('counterSubmit').textContent=pending?'ตรวจผลรายการเดิม':'ตรวจสอบและเติมแต้ม';$('counterSubmit').disabled=false;$('counterClose').disabled=false;
 $('counterDialog').showModal();history(id);
});
$('counterAmount').addEventListener('input',()=>{const n=Number($('counterAmount').value);$('counterPreview').textContent=Number.isInteger(n)&&n>=25&&n<=100000?'ยอดซื้อ '+n+' บาท → เพิ่ม '+Math.floor(n/25)+' แต้ม':'กรอกยอดซื้อจำนวนเต็ม 25–100,000 บาท'});
$('counterClose').addEventListener('click',()=>{if(!grant?.busy)$('counterDialog').close()});
$('counterDialog').addEventListener('cancel',e=>{if(grant?.busy)e.preventDefault()});
$('counterForm').addEventListener('submit',async e=>{
 e.preventDefault();const g=grant;if(!g||g.busy||g.done)return;
 if(!g.payload){
 const amount=Number($('counterAmount').value),note=$('counterNote').value.trim();
 if(!Number.isInteger(amount)||amount<25||amount>100000){$('counterStatus').textContent='กรอกยอดซื้อจำนวนเต็ม 25–100,000 บาท';return}
 if(!confirm('เติมแต้มให้ '+g.name+' (LINE ลงท้าย '+g.member.slice(-8)+')\nยอดซื้อ '+amount+' บาท · เพิ่ม '+Math.floor(amount/25)+' แต้ม\nยืนยันว่าได้รับเงินจริงและยอดนี้ยังไม่เคยได้รับแต้มแล้ว?'))return;
 g.payload={member:g.member,requestKey:crypto.randomUUID(),amount,note};
 try{sessionStorage.setItem(storageKey(g.member),JSON.stringify(g.payload))}catch{}
 }
 g.busy=true;$('counterSubmit').disabled=true;$('counterClose').disabled=true;$('counterAmount').disabled=true;$('counterNote').disabled=true;$('counterStatus').textContent='กำลังบันทึก…';
 try{
 const r=await api('',{method:'POST',body:JSON.stringify(g.payload)});
 g.done=true;try{sessionStorage.removeItem(storageKey(g.member))}catch{}
 $('counterStatus').textContent='เติม +'+r.added+' แต้มแล้ว · แต้มคงเหลือ '+r.points+' แต้ม';$('counterSubmit').textContent='บันทึกแล้ว ✓';
 history(g.member);document.getElementById('refreshMembers').click();
 }catch(e){$('counterStatus').textContent='ยังยืนยันผลไม่ได้: '+e.message+' · กดลองอีกครั้งจะตรวจรายการเดิมโดยไม่เติมซ้ำ';$('counterSubmit').textContent='ตรวจผล / ลองอีกครั้ง';$('counterSubmit').disabled=false}
 finally{g.busy=false;$('counterClose').disabled=false}
});
})();