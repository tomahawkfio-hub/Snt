import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { __test } from '../worker.mjs';

const { validateDestination, validateCode, createCode, signSession, verifySession, shouldCountClick }=__test;
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

test('robôs e prefetch são excluídos, navegadores comuns continuam elegíveis',()=>{
  const req=(ua,extra={},method='GET')=>new Request('https://snt.today/abc123',{method,headers:{'user-agent':ua,...extra}});
  assert.equal(shouldCountClick(req('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')),true);
  assert.equal(shouldCountClick(req('Mozilla/5.0 [FBAN/FB4A;FBAV/123.0]')),true);
  assert.equal(shouldCountClick(req('facebookexternalhit/1.1')),false);
  assert.equal(shouldCountClick(req('Facebot')),false);
  assert.equal(shouldCountClick(req('Meta-ExternalAgent/1.1')),false);
  assert.equal(shouldCountClick(req('WhatsApp/2.24.2')),false);
  assert.equal(shouldCountClick(req('Googlebot/2.1')),false);
  assert.equal(shouldCountClick(req('curl/8.0')),false);
  assert.equal(shouldCountClick(req('Mozilla/5.0',{'Sec-Purpose':'prefetch'})),false);
  assert.equal(shouldCountClick(req('Mozilla/5.0',{'Purpose':'preview'})),false);
  assert.equal(shouldCountClick(req('Mozilla/5.0',{},'HEAD')),false);
  assert.equal(shouldCountClick(req('',{})),false);
});
test('HEAD e agentes de pré-visualização redirecionam sem contabilizar',async()=>{
  const link={id:'fcb7bd20-0a84-4d1d-93a9-24d7f3538e28',original_url:'https://example.com/noticia'};
  const queries=[];
  const env={
    SESSION_SECRET:'test-secret-longer-than-thirty-two-bytes',
    DB:{
      prepare:(sql)=>{
        queries.push(sql);
        return {bind:()=>({first:async()=>link,run:async()=>({meta:{changes:1}})})};
      }
    }
  };
  const tracked=[],ctx={waitUntil(p){tracked.push(p);}};
  for(const [method,ua] of [['HEAD','Mozilla/5.0'],['GET','facebookexternalhit/1.1']]){
    const req=new Request('https://snt.today/abc123',{method,headers:{'user-agent':ua}});
    const res=await worker.fetch(req,env,ctx);
    assert.equal(res.status,302);
    assert.equal(res.headers.get('location'),'https://example.com/noticia');
  }
  assert.equal(tracked.length,0);
  assert.equal(queries.filter(sql=>sql.startsWith('INSERT')).length,0);
});
test('GET humano cria só registro filtrado, repetição ignora incremento',async()=>{
  const row={id:'fcb7bd20-0a84-4d1d-93a9-24d7f3538e28',original_url:'https://example.com/noticia'};
  let insertChanges=1;const statements=[];
  const env={
    SESSION_SECRET:'test-secret-longer-than-thirty-two-bytes',
    DB:{
      prepare:(sql)=>({
        bind:(...params)=>{
          statements.push({sql,params});
          return {
            first:async()=>row,
            run:async()=>({meta:{changes:sql.startsWith('INSERT INTO click_events')?insertChanges:1}})
          };
        }
      })
    }
  };
  const req=new Request('https://snt.today/abc123',{headers:{'user-agent':'Mozilla/5.0 (Linux; Android 15) Chrome/120'}});
  let pending=[];const ctx={waitUntil(p){pending.push(p);}};
  const response=await worker.fetch(req,env,ctx);
  assert.equal(response.status,302);
  await Promise.all(pending);
  assert.equal(statements.filter(x=>x.sql.includes('UPDATE links SET filtered_clicks')).length,1);
  assert.ok(statements.find(x=>x.sql.includes('NOT EXISTS')));
  insertChanges=0;pending=[];
  await worker.fetch(req,env,ctx);await Promise.all(pending);
  assert.equal(statements.filter(x=>x.sql.includes('UPDATE links SET filtered_clicks')).length,1);
});
