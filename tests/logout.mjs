import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/[[path]].js';
const invoke=origin=>onRequest({request:new Request('https://shop.test/api/auth/logout',{method:'POST',headers:{Origin:origin}}),env:{DB:{}}});
const out=await invoke('https://shop.test');assert.equal(out.status,200);const cookie=out.headers.get('Set-Cookie');assert.match(cookie,/^chongpan_sid=;/);assert.match(cookie,/Max-Age=0/);assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);
assert.equal((await invoke('https://other.test')).status,403);
console.log('LOGOUT PASS: clears current browser session cookie, rejects cross-origin logout');
