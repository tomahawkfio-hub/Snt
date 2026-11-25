import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{__test} from '../worker.mjs';
import {signMemberSession} from '../accounts.mjs';
import {dashboard} from '../dashboard.mjs';

const secret='test-only-secret-for-session-signature-xyz';
const demoLinks=[{code:'aaa1111',views:20000},{code:'bbb2222',views:17598}];

test('somente superadmin vê dados fictícios separados do painel real',async()=>{
  const session=await __test.signSession(secret);
  const queries=[];
  const DB={prepare(sql){
    return {bind:(...params)=>{
      queries.push({sql,params});
      return {all:async()=>({results:sql.includes('demo_daily_views')?demoLinks:[]}),first:async()=>sql.includes('MAX(day)')?{day:'2026-11-24'}:{total_links:12,total_clicks:168}};
    }};
  }};
  const get=path=>worker.fetch(new Request('https://snt.today'+path,{headers:{cookie:'snt_session='+session}}),{SESSION_SECRET:secret,DB},{waitUntil(){}});
  const response=await get('/api/demo');
  assert.equal(response.status,200);
  const demo=await response.json();
  assert.equal(demo.type,'simulation');
  assert.match(demo.label,/FICTÍCIOS/);
  assert.equal(demo.total,37598);
  assert.equal(demo.links.length,2);
  assert.equal(demo.day,'2026-11-24');
  assert.ok(queries.some(x=>x.sql.includes('MAX(day)')&&x.params[0]==='superadmin'));
  assert.ok(queries.some(x=>x.sql.includes('demo_daily_views')&&x.sql.includes('l.owner_id=?')&&x.params[0]==='superadmin'&&x.params[1]==='superadmin'));
  const real=await get('/api/stats');
  assert.equal(real.status,200);
  const actual=await real.json();
  assert.equal(actual.totals.total_clicks,168);
  assert.equal(Object.hasOwn(actual.totals,'demo_views'),false);
});
test('conta comum não consulta demonstração de superadmin',async()=>{
  const member={id:'c43b5a61-d170-4d16-83dc-1e2fb669ff04',role:'member',status:'active',
    paid_until:'2099-01-01',session_version:1,email:'cliente@example.com',display_name:'Assinante',
    plan_cents:990,must_change_password:0};
  const token=await signMemberSession(secret,member);
  let attemptedDemoQuery=false;
  const db={prepare(sql){
    if(sql.includes('demo_daily_views'))attemptedDemoQuery=true;
    return {bind:()=>({first:async()=>member,all:async()=>({results:[]})})};
  }};
  const response=await worker.fetch(new Request('https://snt.today/api/demo',{headers:{cookie:'snt_session='+token}}),{SESSION_SECRET:secret,DB:db},{waitUntil(){}});
  assert.equal(response.status,403);
  assert.equal(attemptedDemoQuery,false);
});
test('dashboard principal usa somente valores reais, independentemente da conta',()=>{
  assert.match(dashboard,/\$\('totalClicks'\)\.textContent=number\(a\.total_clicks\)/);
  assert.match(dashboard,/\$\('todayClicks'\)\.textContent=number\(a\.today_clicks\)/);
  assert.match(dashboard,/const data=days\.map\(day=>Number\(\(stats\.days\|\|\[\]\)\.find/);
  assert.match(dashboard,/number\(x\.clicks\)\+' cliques qualificados'/);
  assert.doesNotMatch(dashboard,/demoByCode/);
  assert.doesNotMatch(dashboard,/state\.demoMode/);
  assert.doesNotMatch(dashboard,/id="demoModeButton"/);
  assert.doesNotMatch(dashboard,/id="demoArea"/);
});
test('37.598 fictícios ficam preservados só como arquivo do superadmin',()=>{
  assert.match(dashboard,/id="demoArchiveNotice"/);
  assert.match(dashboard,/Cenário de demonstração arquivado:/);
  assert.match(dashboard,/não entram nos contadores reais/);
  assert.match(dashboard,/if\(state\.role!=='superadmin'/);
  assert.match(dashboard,/state\.role==='superadmin'\?api\('\/api\/demo'\)/);
});

test('histórico ilustrativo mostra hoje e ontem em Brasília apenas ao superadmin',async()=>{
  const today=__test.brasiliaDay();
  const previous=new Date(today+'T12:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);
  const yesterday=previous.toISOString().slice(0,10);
  const queries=[];
  const env={SESSION_SECRET:secret,DB:{prepare(sql){
    return {bind:(...params)=>{queries.push({sql,params});
      return {all:async()=>({results:[{day:today,views:87},{day:yesterday,views:37598}]})};
    }};
  }}};
  const session=await __test.signSession(secret);
  const response=await worker.fetch(new Request('https://snt.today/api/demo/days',{
    headers:{cookie:'snt_session='+session}
  }),env,{waitUntil(){}});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.type,'simulation');
  assert.match(result.label,/FICTÍCIOS/);
  assert.deepEqual(result.days,[
    {day:today,period:'hoje',views:87},
    {day:yesterday,period:'ontem',views:37598}
  ]);
  assert.ok(queries.some(x=>x.sql.includes('demo_daily_views')&&x.sql.includes('l.owner_id=?')&&x.params[0]==='superadmin'&&x.params[1]==='superadmin'&&x.params[2]===today&&x.params[3]===yesterday));
});
test('assinante não consulta histórico fictício do superadmin',async()=>{
  const member={id:'c43b5a61-d170-4d16-83dc-1e2fb669ff04',role:'member',status:'active',
    paid_until:'2099-01-01',session_version:1,email:'cliente@example.com',display_name:'Assinante',
    plan_cents:990,must_change_password:0};
  const token=await signMemberSession(secret,member);
  let touchedDemo=false;
  const db={prepare(sql){if(sql.includes('demo_daily_views'))touchedDemo=true;
    return {bind:()=>({first:async()=>member,all:async()=>({results:[]})})};
  }};
  const response=await worker.fetch(new Request('https://snt.today/api/demo/days',{headers:{cookie:'snt_session='+token}}),{SESSION_SECRET:secret,DB:db},{waitUntil(){}});
  assert.equal(response.status,403);
  assert.equal(touchedDemo,false);
});
test('dashboard preserva estatísticas reais e mostra datas fictícias separadas',()=>{
  assert.match(dashboard,/id="demoDailyHistory"/);
  assert.match(dashboard,/Exemplo de histórico de visualizações/);
  assert.match(dashboard,/DADOS FICTÍCIOS/);
  assert.match(dashboard,/id="demoTodayViews"/);
  assert.match(dashboard,/id="demoYesterdayViews"/);
  assert.match(dashboard,/state\.role==='superadmin'\?api\('\/api\/demo\/days'\)/);
  assert.match(dashboard,/\$\('totalClicks'\)\.textContent=number\(a\.total_clicks\)/);
  assert.match(dashboard,/\$\('todayClicks'\)\.textContent=number\(a\.today_clicks\)/);
});
