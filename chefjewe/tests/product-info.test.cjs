const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../product-info-server.js'),'utf8');
const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=';
const product={id:'gid://shopify/Product/6761203007683',title:'ชาตรามือ ชาเขียวนม 200 ก.',displayPrice:79,originPrice:80,size:'1 หน่วย',status:'active',totalInventory:1144,isWeightedFresh:false,imageUrls:['https://images.mango-prod.siammakro.cloud/SOURCE/e951f157a9a14fedbdf46308aaa4b662']};
const html=p=>'<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{product:p}}})+'</script>';
function server(fetch=()=>{throw Error('Unexpected fetch')}){const c=vm.createContext({URL,Uint8Array,TextDecoder,Intl,AbortController,Request,Response,setTimeout,clearTimeout,btoa,atob,fetch,json:(data,status=200)=>new Response(JSON.stringify(data),{status})});vm.runInContext(code,c);return c;}
const plain=x=>JSON.parse(JSON.stringify(x));
test('product URLs strip tracking and reject arbitrary hosts, credentials and non-product paths',()=>{
 const c=server();assert.equal(vm.runInContext(`productInfoUrl('https://www.makro.pro/p/155848-6761203007683?utm_source=google#x').href`,c),'https://www.makro.pro/p/155848-6761203007683');
 for(const url of ['http://www.makro.pro/p/155848-6761203007683','https://www.makro.pro.evil.test/p/155848-6761203007683','https://a:b@www.makro.pro/p/155848-6761203007683','https://www.makro.pro:8443/p/155848-6761203007683','https://127.0.0.1/p/155848-6761203007683','https://www.makro.pro/anything'])assert.throws(()=>vm.runInContext('productInfoUrl('+JSON.stringify(url)+')',c));
});
test('Makro uses matching live product data and net weight in title, rather than shipping weight or old structured prices',()=>{
 const c=server();c.fixture=html({...product,measurements:{weight:0.21}})+'<script type="application/ld+json">{"offers":{"price":74}}</script>';
 const result=plain(vm.runInContext(`parseMakroProduct(fixture,new URL('https://www.makro.pro/p/155848-6761203007683'))`,c));assert.equal(result.price,79);assert.equal(result.quantity,200);assert.equal(result.unit,'กรัม');assert.equal(result.supplier,'Makro PRO');
 for(const change of [{id:'gid://shopify/Product/999'},{status:'inactive'},{totalInventory:0},{isWeightedFresh:true},{displayPrice:null}]){c.fixture=html({...product,...change});assert.throws(()=>vm.runInContext(`parseMakroProduct(fixture,new URL('https://www.makro.pro/p/155848-6761203007683'))`,c));}
});
test('pack quantities include explicit multipacks and leave ambiguous sizes unresolved',()=>{
 const c=server();assert.deepEqual(plain(vm.runInContext(`productPackFromTitle('โซดา 325 มล. x 24')`,c)),{quantity:7800,unit:'มล.'});assert.deepEqual(plain(vm.runInContext(`productPackFromTitle('เกลือ 1 กก.')`,c)),{quantity:1,unit:'กิโลกรัม'});
 assert.equal(vm.runInContext(`productPackFromTitle('สินค้า 200 ก. หรือ 400 ก.').quantity`,c),null);assert.equal(vm.runInContext(`productPackFromTitle('ชา 1 หน่วย').quantity`,c),null);
});
test('endpoint returns metadata and a validated image without following upstream redirects',async()=>{
 const calls=[],c=server(async(url,options)=>{calls.push({url,options});return url.includes('makro.pro/p/')?new Response(html(product)):new Response(Buffer.from(image,'base64'),{headers:{'content-type':'image/png'}});});
 const response=await vm.runInContext(`productInfo(new Request('https://chefjewe.pages.dev/api/product-info?url='+encodeURIComponent('https://www.makro.pro/p/155848-6761203007683?tracking=1')))`,c),data=await response.json();assert.equal(response.status,200);assert.equal(data.photo,image);assert.equal(data.price,79);assert.equal(data.quantity,200);assert.equal(calls.length,2);assert.ok(calls.every(x=>x.options.redirect==='manual'));
 const redirect=server(async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/'}}));assert.equal((await vm.runInContext(`productInfo(new Request('https://chefjewe.pages.dev/api/product-info?url='+encodeURIComponent('https://www.makro.pro/p/155848-6761203007683')))`,redirect)).status,502);
});
test('image proxy rejects arbitrary image hosts, executable data and oversized streams',async()=>{
 const c=server();for(const url of ['https://127.0.0.1/image.jpg','https://images.mango-prod.siammakro.cloud.evil.test/SOURCE/a','https://images.mango-prod.siammakro.cloud/SOURCE/a?url=private'])assert.throws(()=>vm.runInContext('productImageUrl('+JSON.stringify(url)+',"Makro PRO")',c));
 const bad=server(async()=>new Response('<svg/>',{headers:{'content-type':'image/png'}}));await assert.rejects(vm.runInContext(`fetchProductPhoto('https://images.mango-prod.siammakro.cloud/SOURCE/a','Makro PRO',new AbortController().signal)`,bad));
 c.response=new Response(new Uint8Array(101));await assert.rejects(vm.runInContext('boundedProductBytes(response,100)',c),/large/);
});
test('unsupported suppliers and unavailable stock return errors instead of invented prices',async()=>{
 const c=server();assert.equal((await vm.runInContext(`productInfo(new Request('https://chefjewe.pages.dev/api/product-info?url=https://example.com/product'))`,c)).status,400);
 const empty=server(async()=>new Response(html({...product,totalInventory:0})));assert.equal((await vm.runInContext(`productInfo(new Request('https://chefjewe.pages.dev/api/product-info?url='+encodeURIComponent('https://www.makro.pro/p/155848-6761203007683')))`,empty)).status,502);
});

test('Makro sugar photo supports product-images CDN path while retaining host and file restrictions',async()=>{
 const photoUrl='https://images.mango-prod.siammakro.cloud/product-images/6761204875459-dc4fa045-b97d-4fc6-9c66-c16a72ee8d9f.jpeg';
 const c=server(async(url)=>url.includes('makro.pro/p/')?new Response(html({...product,imageUrls:[photoUrl]})):new Response(Buffer.from(image,'base64'),{headers:{'content-type':'binary/octet-stream'}}));
 const data=await (await vm.runInContext(`productInfo(new Request('https://chefjewe.pages.dev/api/product-info?url='+encodeURIComponent('https://www.makro.pro/p/155848-6761203007683')))`,c)).json();
 assert.equal(data.photo,image);assert.equal(data.price,79);
 for(const url of [photoUrl+'?url=private',photoUrl.replace('.jpeg','.svg'),photoUrl.replace('siammakro.cloud','siammakro.cloud.evil.test')])assert.throws(()=>vm.runInContext('productImageUrl('+JSON.stringify(url)+',"Makro PRO")',c));
});

const bigcUrl='https://www.bigc.co.th/en/product/dreamy-milky-cream-1000-g.5738495';
const bigc={product_id:5738495,name:'DREAMY Milky Cream 1000 g.',price_sales:148,final_price_incl_tax:148,status:1,not_for_sale:0,stock:'Y',qty:22,sell_in_kg:0,unit:'Bag',image:'https://st.bigc-cs.com/public/media/catalog/product/42/88/milk.jpg'};
const flight=p=>'<script>self.__next_f.push('+JSON.stringify([1,'1:'+JSON.stringify(['$',{product:p,recommended:{...p,product_id:999,price_sales:20}}])+'\n'])+')</script>';
test('Big C matches requested streamed product and rejects unavailable or mismatched data',()=>{
 const c=server();c.fixture=flight(bigc);const result=plain(vm.runInContext(`parseBigCProduct(fixture,new URL('${bigcUrl}'))`,c));assert.equal(result.price,148);assert.equal(result.quantity,1000);assert.equal(result.supplier,'Big C');
 assert.equal(vm.runInContext(`productInfoUrl('${bigcUrl}?tracking=1').href`,c),bigcUrl);
 for(const change of [{product_id:998},{stock:'N'},{not_for_sale:1},{sell_in_kg:1},{price_sales:0,final_price_incl_tax:0}]){c.fixture=flight({...bigc,...change});assert.throws(()=>vm.runInContext(`parseBigCProduct(fixture,new URL('${bigcUrl}'))`,c));}
});
test('Big C endpoint fetches validated product and image and rejects spoofed image hosts',async()=>{
 const c=server(async url=>url.includes('www.bigc.co.th')?new Response(flight(bigc)):new Response(Buffer.from(image,'base64'),{headers:{'content-type':'image/png'}}));
 const data=await(await vm.runInContext(`productInfo(new Request('https://chefjewe.pages.dev/api/product-info?url='+encodeURIComponent('${bigcUrl}')))`,c)).json();assert.equal(data.price,148);assert.equal(data.photo,image);
 assert.throws(()=>vm.runInContext(`productImageUrl('https://st.bigc-cs.com.evil.test/public/media/catalog/product/a.jpg','Big C')`,c));
});

test('Big C photo fetch uses the original catalogue image instead of nested CDN resizing',()=>{
 const c=server();assert.equal(vm.runInContext("productImageUrl('https://st.bigc-cs.com/cdn-cgi/image/format=webp,quality=90/public/media/catalog/product/42/88/milk.jpg','Big C').href",c),'https://st.bigc-cs.com/public/media/catalog/product/42/88/milk.jpg');
});
