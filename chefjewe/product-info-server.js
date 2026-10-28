function productInfoUrl(value){
 const u=new URL(value);if(u.protocol!=='https:'||u.port||u.username||u.password)throw Error('unsupported');
 if(u.hostname==='www.makro.pro'&&/^\/(?:th\/|en\/)?p\/[A-Za-z0-9_-]+-\d+\/?$/.test(u.pathname)){u.search='';u.hash='';return u;}
 if(u.hostname==='www.simummuangonline.com'&&/^\/(?:index\.php\/)?product\/[^/]+\/[A-Za-z0-9]+\/?$/.test(u.pathname)){u.search='';u.hash='';return u;}
 throw Error('unsupported');
}
function productPackFromTitle(name){
 const matches=[...String(name).matchAll(/(\d+(?:[.,]\d+)?)\s*(กิโลกรัม|มิลลิลิตร|กรัม|ลิตร|กก\.?|มล\.?|ก\.|kg\b|ml\b|g\b|l\b)(?:\s*[x×]\s*(\d+))?/gi)];
 if(matches.length!==1)return {quantity:null,unit:''};
 const m=matches[0],quantity=Number(m[1].replace(',','.'))*Number(m[3]||1),raw=m[2].toLowerCase();
 const unit=/^(กิโลกรัม|กก\.?|kg)$/.test(raw)?'กิโลกรัม':/^(มิลลิลิตร|มล\.?|ml)$/.test(raw)?'มล.':/^(ลิตร|l)$/.test(raw)?'ลิตร':'กรัม';
 if(!Number.isFinite(quantity)||quantity<=0||quantity>1000000)return {quantity:null,unit:''};return {quantity,unit};
}
function parseMakroProduct(html,source){
 const match=html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);if(!match)throw Error('unreadable');
 const p=JSON.parse(match[1])?.props?.pageProps?.product,expected=source.pathname.split('/').filter(Boolean).pop().match(/-(\d+)$/)?.[1];
 if(!p||String(p.id)!=='gid://shopify/Product/'+expected||!p.title)throw Error('unreadable');
 if(p.status!=='active'||!(Number(p.totalInventory)>0)||p.unavailableReason)throw Error('unavailable');
 if(p.isWeightedFresh)throw Error('weighted');
 const price=Number(String(p.displayPrice).replace(/,/g,''));if(!Number.isFinite(price)||price<=0)throw Error('unreadable');
 return {name:String(p.title).slice(0,200),price,...productPackFromTitle(p.title),packageName:String(p.size||'').slice(0,100),imageUrl:Array.isArray(p.imageUrls)?p.imageUrls[0]||'':'',supplier:'Makro PRO',sourceUrl:source.href,checkedAt:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),fetchedAt:new Date().toISOString()};
}
function productImageUrl(value,supplier){
 const u=new URL(value);if(u.protocol!=='https:'||u.port||u.username||u.password||u.search||u.hash)throw Error('image');
 if(supplier==='Makro PRO'&&u.hostname==='images.mango-prod.siammakro.cloud'&&/^\/SOURCE\/[A-Za-z0-9_.-]+$/.test(u.pathname))return u;
 if(supplier==='สี่มุมเมืองออนไลน์'&&u.hostname==='www.simummuangonline.com'&&/^\/files\/product\/(?:thumb_405|original)\/[A-Za-z0-9_.-]+$/.test(u.pathname))return u;
 throw Error('image');
}
async function boundedProductBytes(response,limit){
 const reader=response.body?.getReader();if(!reader)throw Error('empty');let length=0;const parts=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit)throw Error('large');parts.push(value);}const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;}
 finally{await reader.cancel().catch(()=>{});}
}
async function fetchProductPhoto(value,supplier,signal){
 const u=productImageUrl(value,supplier),response=await fetch(u.href,{redirect:'manual',signal,headers:{Accept:'image/jpeg,image/png,image/webp'}});
 if(!response.ok){await response.body?.cancel();throw Error('image');}
 if(!/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw Error('image');}
 const bytes=await boundedProductBytes(response,4*1024*1024),head=String.fromCharCode(...bytes.slice(0,12));
 if(!(head.startsWith('\xff\xd8\xff')||head.startsWith('\x89PNG\r\n\x1a\n')||head.startsWith('RIFF')&&head.slice(8,12)==='WEBP'))throw Error('image');
 let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);
}
async function productInfo(request){
 let source;try{source=productInfoUrl(new URL(request.url).searchParams.get('url'));}catch{return json({message:'ขณะนี้รองรับลิงก์หน้าสินค้า Makro PRO และสี่มุมเมืองออนไลน์'},400);}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{
  const response=await fetch(source.href,{redirect:'manual',signal:controller.signal,headers:{Accept:'text/html'},cf:{cacheTtl:0}});
  if(!response.ok){await response.body?.cancel();throw Error('upstream_'+response.status);}
  const html=new TextDecoder().decode(await boundedProductBytes(response,2*1024*1024));let data;
  if(source.hostname==='www.makro.pro')data=parseMakroProduct(html,source);
  else {data={...parseSupplierPrice(html,source),supplier:'สี่มุมเมืองออนไลน์',sourceUrl:source.href};data.imageUrl=html.match(/<img\b[^>]*\bsrc=["'](https:\/\/www\.simummuangonline\.com\/files\/product\/thumb_405\/[^"']+)["']/i)?.[1]||'';}
  data.photo='';if(data.imageUrl){try{data.photo=await fetchProductPhoto(data.imageUrl,data.supplier,controller.signal);}catch{data.photoWarning='ดึงรูปไม่สำเร็จ กรุณาเลือกรูปเอง';}}
  delete data.imageUrl;return json(data);
 }catch(error){const upstream=/^upstream_(\d{3})$/.exec(error.message);return json({code:upstream?'upstream_'+upstream[1]:controller.signal.aborted?'timeout':['large','empty','unavailable','weighted','unreadable'].includes(error.message)?error.message:'network',message:upstream?'หน้าสินค้าตอบกลับ HTTP '+upstream[1]+' กรุณาตรวจลิงก์หรือกรอกข้อมูลเอง':controller.signal.aborted?'หน้าสินค้าตอบกลับช้าเกินไป กรุณาลองใหม่':error.message==='large'?'ข้อมูลหน้าสินค้ามีขนาดเกินที่รองรับ กรุณากรอกเอง':error.message==='unavailable'?'สินค้าไม่พร้อมขาย จึงยังไม่ใช้ราคา':error.message==='weighted'?'สินค้าชั่งน้ำหนัก กรุณาตรวจราคาต่อหน่วยและกรอกเอง':error.message==='unreadable'?'อ่านข้อมูลสินค้าหรือราคาปัจจุบันไม่ชัดเจน กรุณาตรวจลิงก์หรือกรอกเอง':'ติดต่อหน้าสินค้าไม่ได้ กรุณาลองใหม่หรือกรอกข้อมูลเอง'},502);}
 finally{clearTimeout(timer);}
}
