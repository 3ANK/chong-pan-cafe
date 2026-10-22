// Espresso viewer: the canvas owns cup gestures; carousel keeps its own swipe area.
export async function mountEspresso(stage) {
 let yaw=0,pitch=.08,distance=6.6,draw=()=>{},resize=()=>{},mode='';
 const hint=stage.querySelector('.cup-hint');
 try {
 const T=await import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js');
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(35,1,.1,100);
 const renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;stage.prepend(renderer.domElement);
 scene.add(new T.HemisphereLight(0xffffff,0x766545,3));const key=new T.DirectionalLight(0xfff5e4,4);key.position.set(3,5,6);scene.add(key);const rim=new T.DirectionalLight(0xffffff,2);rim.position.set(-4,2,-3);scene.add(rim);
const cup=new T.Group();scene.add(cup);
function mesh(g,m,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);cup.add(o);return o}
const plastic=new T.MeshPhysicalMaterial({color:0xf6f4df,transparent:true,opacity:.17,roughness:.16,metalness:0,side:T.DoubleSide,depthWrite:false});
const coffeeCanvas=document.createElement('canvas');coffeeCanvas.width=32;coffeeCanvas.height=256;let ctx=coffeeCanvas.getContext('2d'),grad=ctx.createLinearGradient(0,0,0,256);grad.addColorStop(0,'#43271b');grad.addColorStop(.4,'#875234');grad.addColorStop(1,'#b48150');ctx.fillStyle=grad;ctx.fillRect(0,0,32,256);const coffeeTex=new T.CanvasTexture(coffeeCanvas);coffeeTex.colorSpace=T.SRGBColorSpace;
mesh(new T.CylinderGeometry(.73,.55,1.85,64),new T.MeshStandardMaterial({map:coffeeTex,roughness:.33}),0,-.09,0);
mesh(new T.CylinderGeometry(.79,.57,2.15,64,1,true),plastic);
function ring(radius,tube,y,material){let r=mesh(new T.TorusGeometry(radius,tube,12,80),material,0,y,0);r.rotation.x=Math.PI/2;return r}
const edge=new T.MeshPhysicalMaterial({color:0xfaf8ef,transparent:true,opacity:.63,roughness:.19});ring(.79,.036,1.08,edge);ring(.57,.025,-1.07,edge);ring(.82,.045,1.12,edge);
mesh(new T.CylinderGeometry(.82,.82,.045,64),new T.MeshPhysicalMaterial({color:0xffffff,transparent:true,opacity:.22,roughness:.12,depthWrite:false}),0,1.12,0);
const iceMat=new T.MeshPhysicalMaterial({color:0xe8ded0,transparent:true,opacity:.72,roughness:.18,metalness:.08});
[[.30,.84,.26],[-.27,.9,.31],[.22,.94,-.3],[-.32,.85,-.24],[0,.96,0]].forEach(([x,y,z],i)=>{let o=mesh(new T.BoxGeometry(.35,.27,.31),iceMat,x,y,z);o.rotation.set(i*.24,.3+i*.7,.12+i*.17)});
const straw=mesh(new T.CylinderGeometry(.045,.045,1.38,20),new T.MeshStandardMaterial({color:0x536d39,roughness:.6}),.38,1.23,-.16);straw.rotation.z=-.13;
const hole=mesh(new T.CircleGeometry(.031,20),new T.MeshBasicMaterial({color:0x263c24}),.47,1.915,-.16);hole.rotation.x=-Math.PI/2;
const label=document.createElement('canvas');label.width=1024;label.height=512;const c=label.getContext('2d');c.fillStyle='#fff9e9';c.beginPath();c.ellipse(512,256,420,224,0,0,Math.PI*2);c.fill();c.fillStyle='#506435';c.textAlign='center';c.textBaseline='middle';c.font='bold 112px Tahoma,sans-serif';c.fillText('ชง&ปั่น',512,225);c.font='32px sans-serif';c.fillText('C H O N G  &  P A N',512,330);const tex=new T.CanvasTexture(label);tex.colorSpace=T.SRGBColorSpace;
mesh(new T.CylinderGeometry(.704,.644,.8,48,1,true,-.92,1.84),new T.MeshStandardMaterial({map:tex,transparent:true,roughness:.8,side:T.DoubleSide}),0,-.12,0);
// Soft contact shadow stays on the table while the cup rotates.
const sc=document.createElement('canvas');sc.width=sc.height=128;const s=sc.getContext('2d'),g=s.createRadialGradient(64,64,4,64,64,64);g.addColorStop(0,'rgba(65,45,20,.24)');g.addColorStop(1,'rgba(65,45,20,0)');s.fillStyle=g;s.fillRect(0,0,128,128);const shadow=new T.Mesh(new T.PlaneGeometry(3.5,3.5),new T.MeshBasicMaterial({map:new T.CanvasTexture(sc),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-1.13;scene.add(shadow);

 draw=()=>{cup.rotation.set(pitch,yaw,0);camera.position.set(0,1.3,distance);camera.lookAt(0,.35,0);renderer.render(scene,camera)};
 resize=()=>{const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();draw()};
 mode='webgl';
 } catch(error) {
 // Geometric CSS fallback for devices without WebGL. All sides rotate together.
 const holder=document.createElement('div');holder.className='css-view';
 const cup=document.createElement('div');cup.className='css-cup';holder.append(cup);stage.prepend(holder);
 for(let i=0;i<48;i++){const f=document.createElement('div');f.className='cup-face';const angle=i*7.5;const light=1+.17*Math.cos(angle*Math.PI/180);f.style.cssText=`transform:rotateY(${angle}deg) translateZ(55px) rotateX(5deg);filter:brightness(${light})`;cup.append(f)}
 const add=(cls,text='')=>{const e=document.createElement('div');e.className=cls;e.textContent=text;cup.append(e);return e};
 add('cup-top');add('cup-bottom');add('cup-straw');add('cup-label','ชง&ปั่น').append(Object.assign(document.createElement('small'),{textContent:'CHONG & PAN'}));
 for(let i=0;i<5;i++){let ice=add('cup-ice');ice.style.transform=`translate3d(${(i%3-1)*26}px,-80px,${(Math.floor(i/3)-.5)*38}px) rotateX(90deg) rotateZ(${i*23}deg)`}
 draw=()=>{cup.style.transform=`rotateX(${pitch*57.3}deg) rotateY(${yaw*57.3}deg) scale(${6.6/distance})`};resize=draw;mode='css';
 }
 const pointers=new Map();let prevPinch=0;
 function zoom(f){distance=Math.max(5.2,Math.min(8.5,distance*f));draw()}
 stage.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.stopPropagation();stage.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});prevPinch=0});
 stage.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;e.stopPropagation();const p=pointers.get(e.pointerId);const dx=e.clientX-p.x,dy=e.clientY-p.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1){yaw+=dx*.012;pitch=Math.max(-.5,Math.min(.65,pitch+dy*.008))}else{const [a,b]=[...pointers.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);if(prevPinch&&d)zoom(prevPinch/d);prevPinch=d}draw()});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,e=>{e.stopPropagation();pointers.delete(e.pointerId);prevPinch=0});
 stage.addEventListener('click',e=>e.stopPropagation());
 stage.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();zoom(Math.exp(e.deltaY*.001))},{passive:false});
 stage.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','Home'].includes(e.key))return;e.preventDefault();e.stopPropagation();if(e.key==='ArrowLeft')yaw-=.15;if(e.key==='ArrowRight')yaw+=.15;if(e.key==='ArrowUp')pitch=Math.max(-.5,pitch-.1);if(e.key==='ArrowDown')pitch=Math.min(.65,pitch+.1);if(e.key==='+'||e.key==='=')zoom(.9);if(e.key==='-')zoom(1.1);if(e.key==='Home'){yaw=0;pitch=.08;distance=6.6}draw()});
 stage.addEventListener('dblclick',()=>{yaw=0;pitch=.08;distance=6.6;draw()});
 new ResizeObserver(resize).observe(stage);resize();stage.dataset.ready=mode;hint.textContent='ลากหมุนแก้ว ↔';stage.dispatchEvent(new Event('cup-ready'));
 return {refresh:resize};
}
