/* Loyalty card; never retrieves another member's identity or points. */
'use strict';
const byId=id=>document.getElementById(id);
const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let liffId='',signedIn=false;
const LIFF_REDIRECT_URI='https://chongpan-ordering-v2.pages.dev/member/';
async function getJson(path,opts={}){
 const r=await fetch('/api/'+path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...opts});
 let data;try{data=await r.json()}catch{throw Error('เชื่อมต่อระบบสมาชิกไม่สำเร็จ')}
 if(!r.ok){const e=new Error(data.error||'ระบบสมาชิกขัดข้อง');e.status=r.status;throw e}
 return data;
}
function showStatus(text,variant=''){
 const el=byId('memberStatus');el.textContent=text;el.className='member-status '+variant;
}
function shortDate(value){
 if(!value)return '';
 const d=new Date(String(value).includes('T')?value:value.replace(' ','T')+'Z');
 return Number.isFinite(d.getTime())?d.toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}):'';
}
function activityRow(item){
 const plus=Number(item.delta)>=0;
 const label=item.kind==='order'?'แต้มจากออเดอร์ที่ส่งมอบแล้ว':item.kind==='legacy'?'โอนแต้มสมาชิกเก่าที่ตรวจสอบแล้ว':item.kind==='redemption'?'ใช้แต้มซื้อเมนู':item.kind==='refund'?'คืนแต้มจากออเดอร์ที่ยกเลิก':'ปรับปรุงยอดแต้มโดยร้าน';
 const ref=item.orderId?' · ออเดอร์ '+String(item.orderId).slice(0,8).toUpperCase():'';
 return '<div class="member-entry"><div><strong>'+escapeHtml(label)+'</strong><p>'+escapeHtml(shortDate(item.createdAt)+ref)+'</p></div><span class="member-delta '+(plus?'':'negative')+'">'+(plus?'+':'')+Number(item.delta).toLocaleString('th-TH')+' แต้ม</span></div>';
}
async function readPoints(){
 try{
  const data=await getJson('points');
  signedIn=true;
  byId('loginArea').hidden=true;
  byId('memberContents').hidden=false;
  byId('loyaltyName').textContent=data.member.name||'สมาชิกชง&ปั่น';
  byId('loyaltyPoints').textContent=Number(data.member.points).toLocaleString('th-TH');
  byId('pointsHistory').innerHTML=data.history.length?data.history.map(activityRow).join(''):'<div class="member-empty">ยังไม่มีประวัติได้รับแต้มจากระบบใหม่</div>';
  showStatus('เข้าสู่ระบบ LINE แล้ว · แสดงยอดแต้มเฉพาะบัญชีของคุณ','ok');
 }catch(e){
  signedIn=false;byId('memberContents').hidden=true;byId('loginArea').hidden=false;
  showStatus(e.status===401?'กรุณาเข้าสู่บัญชี LINE เพื่อดูแต้มสมาชิก':e.message,'warning');
 }
}
async function signIn(){
 if(!liffId){showStatus('ยังไม่ได้ตั้งค่า LINE LIFF สำหรับหน้าเว็บใหม่','warning');return}
 if(!window.liff){showStatus('ไม่สามารถโหลด LINE Login ได้ กรุณาลองใหม่','warning');return}
 const button=byId('memberLogin');button.disabled=true;
 try{
  await liff.init({liffId});
  if(!liff.isLoggedIn()){liff.login({redirectUri:LIFF_REDIRECT_URI});return}
  const idToken=liff.getIDToken();if(!idToken)throw Error('ไม่พบ LINE ID Token กรุณาเข้าสู่ระบบ LINE อีกครั้ง');
  await getJson('auth/line',{method:'POST',body:JSON.stringify({idToken})});
  await readPoints();
 }catch(e){showStatus(e.message,'warning')}finally{button.disabled=false}
}
byId('memberLogin').addEventListener('click',signIn);
byId('refreshPoints').addEventListener('click',readPoints);
(async()=>{
 try{
  const config=await getJson('loyalty/info');
  liffId=config.liffId||'';
  await readPoints();
  // LINE callback can navigate here without the previously stored session.
  if(!signedIn&&new URL(location.href).searchParams.has('liff.state')&&liffId)await signIn();
 }catch(e){showStatus(e.message,'warning');byId('loginArea').hidden=false}
})();
