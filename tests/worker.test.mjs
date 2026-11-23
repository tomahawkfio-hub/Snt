import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { __test } from '../worker.mjs';

const { validateDestination, validateCode, createCode, signSession, verifySession, shouldCountClick, classifyRedirect }=__test;
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

test('modo rigoroso exige navegação visível iniciada pelo usuário',()=>{
  const req=(ua,extra={},method='GET')=>new Request('https://snt.today/abc123',{method,headers:{'user-agent':ua,...extra}});
  const human={'Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document','Sec-Fetch-User':'?1'};
  assert.equal(classifyRedirect(req('Mozilla/5.0 (Android) Chrome/120',human)),'interaction');
  assert.equal(classifyRedirect(req('Mozilla/5.0 (Android) Chrome/120')),'no_document_navigation');
  assert.equal(classifyRedirect(req('Mozilla/5.0 (Android) Chrome/120',{'Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'})),'no_user_activation');
  assert.equal(classifyRedirect(req('Mozilla/5.0 (Android) Chrome/120',{'Sec-Fetch-Mode':'no-cors','Sec-Fetch-Dest':'image','Sec-Fetch-User':'?1'})),'no_document_navigation');
  assert.equal(classifyRedirect(req('facebookexternalhit/1.1',human)),'automated_or_prefetch');
  assert.equal(classifyRedirect(req('Mozilla/5.0',human,'HEAD')),'other_method');
});
test('robôs recebem OG sem alterar contadores; verificações humanas sem interação redirecionam',async()=>{
  const link={id:'fcb7bd20-0a84-4d1d-93a9-24d7f3538e28',code:'abc123',
    original_url:'https://example.com/noticia',social_image:'https://example.com/photo.jpg',
    social_title:'Título',social_description:'Descrição',social_fetched_at:'2026-11-22 20:00:00'};
  const statements=[],pending=[];
  const env={SESSION_SECRET:'test-secret-longer-than-thirty-two-bytes',DB:{
    prepare:(sql)=>({bind:(...params)=>{
      statements.push({sql,params});
      return {first:async()=>link,run:async()=>({meta:{changes:1}})};
    }})
  }};
  const ctx={waitUntil(p){pending.push(p);}};
  for(const req of [
    new Request('https://snt.today/abc123',{method:'HEAD',headers:{'user-agent':'Mozilla/5.0'}}),
    new Request('https://snt.today/abc123',{headers:{'user-agent':'Mozilla/5.0 Chrome/120'}})
  ]){
    const res=await worker.fetch(req,env,ctx);
    assert.equal(res.status,302);
  }
  const bot=new Request('https://snt.today/abc123',{headers:{'user-agent':'facebookexternalhit/1.1'}});
  const preview=await worker.fetch(bot,env,ctx);
  assert.equal(preview.status,200);
  assert.match(await preview.text(),/property="og:title"/);
  await Promise.all(pending);
  assert.equal(statements.filter(x=>x.sql.startsWith('INSERT INTO click_events')).length,0);
  assert.equal(statements.filter(x=>x.sql.startsWith('INSERT INTO request_audit_daily')).length,2);
});
test('navegação acionada contabiliza uma vez; repetição não soma',async()=>{
  const row={id:'fcb7bd20-0a84-4d1d-93a9-24d7f3538e28',original_url:'https://example.com/noticia'};
  let insertChanges=1;const statements=[];
  const env={
    SESSION_SECRET:'test-secret-longer-than-thirty-two-bytes',
    DB:{prepare:(sql)=>({bind:(...params)=>{
      statements.push({sql,params});
      return {
        first:async()=>row,
        run:async()=>({meta:{changes:sql.startsWith('INSERT INTO click_events')?insertChanges:1}})
      };
    }})}
  };
  const req=new Request('https://snt.today/abc123',{headers:{
    'user-agent':'Mozilla/5.0 (Linux; Android 15) Chrome/120',
    'Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document','Sec-Fetch-User':'?1'
  }});
  const run=async()=>{
    const pending=[],ctx={waitUntil(p){pending.push(p);}};
    const response=await worker.fetch(req,env,ctx);
    assert.equal(response.status,302);await Promise.all(pending);
  };
  await run();
  assert.equal(statements.filter(x=>x.sql.startsWith('INSERT INTO click_events')).length,1);
  assert.ok(statements.find(x=>x.sql.includes('NOT EXISTS')&&x.sql.includes('qualified=2')));
  assert.ok(statements.find(x=>x.sql.startsWith('INSERT INTO request_audit_daily')&&x.params[2]==='counted'));
  insertChanges=0;await run();
  assert.equal(statements.filter(x=>x.sql.startsWith('INSERT INTO click_events')).length,2);
  assert.ok(statements.find(x=>x.sql.startsWith('INSERT INTO request_audit_daily')&&x.params[2]==='repeat'));
});
