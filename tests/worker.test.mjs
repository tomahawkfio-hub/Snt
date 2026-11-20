import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { __test } from '../worker.mjs';

const { validateDestination, validateCode, createCode, signSession, verifySession }=__test;
test('validates destinations',()=>{
  assert.equal(validateDestination('https://example.com/noticia?a=1'),'https://example.com/noticia?a=1');
  for(const u of ['javascript:alert(1)','data:text/html,hi','file:///etc/passwd','https://localhost/foo','http://127.0.0.1','http://10.0.0.8','http://192.168.1.2','http://169.254.169.254','https://username:password@example.com'])
    assert.equal(validateDestination(u),null,u);
});
test('validates codes and restricted endpoints',()=>{
  assert.equal(validateCode('noticia-123'),'noticia-123');
  assert.equal(validateCode('API'),false);
  assert.equal(validateCode('a'),false);
  assert.equal(validateCode('abc de'),false);
  assert.equal(createCode().length,7);
});
test('session HMAC prevents forgery',async()=>{
  const secret='test-secret-longer-than-thirty-two-bytes';
  const value=await signSession(secret);
  const request=new Request('https://snt.today',{headers:{cookie:'snt_session='+value}});
  assert.equal(await verifySession(request,secret),true);
  assert.equal(await verifySession(request,secret+'bad'),false);
  const split=value.split('.');
  split[3]=(split[3][0]==='A'?'B':'A')+split[3].slice(1);
  assert.equal(await verifySession(new Request('https://snt.today',{headers:{cookie:'snt_session='+split.join('.')}}),secret),false);
});
test('health, dashboard, and nonexistent slug',async()=>{
  const ctx={waitUntil(){}};
  const health=await worker.fetch(new Request('https://snt.today/health'),{},ctx);
  assert.equal(health.status,200);
  assert.equal((await health.json()).status,'ok');
  const dashboard=await worker.fetch(new Request('https://snt.today/'),{},ctx);
  assert.equal(dashboard.status,200);
  assert.match(await dashboard.text(),/Seus links, mais inteligentes/);
  const missing=await worker.fetch(new Request('https://snt.today/desconhecido'),{DB:{prepare(){return {bind(){return {first:async()=>null};}};}}},ctx);
  assert.equal(missing.status,404);
});
