const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..'),file=path.join(root,'public/_worker.js'),pattern=/const HTML = ("(?:[^"\\]|\\.)*");/;
let worker=fs.readFileSync(file,'utf8'),html=JSON.parse(worker.match(pattern)[1]);
const client='// PRODUCT_INFO_CLIENT_START\n'+fs.readFileSync(path.join(root,'product-info-client.js'),'utf8')+'// PRODUCT_INFO_CLIENT_END\n';
if(html.includes('// PRODUCT_INFO_CLIENT_START'))html=html.replace(/\/\/ PRODUCT_INFO_CLIENT_START[\s\S]*?\/\/ PRODUCT_INFO_CLIENT_END\n/,client);
else{
 const anchor='function makeCostRow(';if(!html.includes(anchor))throw Error('Missing cost form');html=html.replace(anchor,client+anchor);
 const old="if(isSmmPriceUrl(sourceInput.value)){const pull=document.createElement('button');pull.type='button';pull.textContent='ดึงราคาล่าสุด';pull.addEventListener('click',()=>pullSupplierPrice(line,pull));sourceWrap.append(pull);}";
 if(!html.includes(old))throw Error('Missing supplier button');html=html.replace(old,'appendProductInfoButton(line,sourceWrap,sourceInput);');
 html=html.replace("const value={...source};for(const input of row.querySelectorAll('[data-cost-field]'))", "if(row.dataset.productLoading)return;const value={...source};if(row.dataset.pendingPhoto)value.photo=row.dataset.pendingPhoto;for(const input of row.querySelectorAll('[data-cost-field]'))");
 const ledger="for(const input of line.querySelectorAll('[data-cost-field]'))row[input.dataset.costField]=input.value.trim();return row;";
 if(!html.includes(ledger))throw Error('Missing purchase ledger save');html=html.replaceAll(ledger,"for(const input of line.querySelectorAll('[data-cost-field]'))row[input.dataset.costField]=input.value.trim();if(line.dataset.pendingPhoto)row.photo=line.dataset.pendingPhoto;return row;");
 html=html.replaceAll('if(target.dataset.costSave){',"if(target.dataset.costSave){if(target.closest('.cost-panel').querySelector('[data-product-loading]')){alert('กรุณารอให้ดึงข้อมูลสินค้าเสร็จก่อนบันทึก');return;}");
}
worker=worker.replace(pattern,()=> 'const HTML = '+JSON.stringify(html)+';');
const server='// PRODUCT_INFO_SERVER_START\n'+fs.readFileSync(path.join(root,'product-info-server.js'),'utf8')+'// PRODUCT_INFO_SERVER_END\n';
if(worker.includes('// PRODUCT_INFO_SERVER_START'))worker=worker.replace(/\/\/ PRODUCT_INFO_SERVER_START[\s\S]*?\/\/ PRODUCT_INFO_SERVER_END\n/,server);
else{const anchor='export default {async fetch(request,env){';if(!worker.includes(anchor))throw Error('Missing worker handler');worker=worker.replace(anchor,server+anchor);const route="if(path==='/api/supplier-price'&&request.method==='GET')return await supplierPrice(request);";if(!worker.includes(route))throw Error('Missing authenticated supplier route');worker=worker.replace(route,route+"\n   if(path==='/api/product-info'&&request.method==='GET')return await productInfo(request);");}
fs.writeFileSync(file,worker);console.log('Added authenticated product info fetch with image/price/pack preview');
