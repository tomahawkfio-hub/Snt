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
test('interface deixa rótulos de simulação visíveis e não troca os reais',()=>{
  assert.match(dashboard,/DADOS FICTÍCIOS/);
  assert.match(dashboard,/Simulação de visualizações/);
  assert.match(dashboard,/FICTÍCIO:/);
  assert.match(dashboard,/interações reais/);
});

test('alternância da visualização fictícia somente no superadmin e com aviso visível',()=>{
  assert.match(dashboard,/id="demoSwitcher"/);
  assert.match(dashboard,/id="demoModeWarning"/);
  assert.match(dashboard,/MODO DEMONSTRAÇÃO — DADOS FICTÍCIOS/);
  assert.match(dashboard,/identity.role!=='superadmin'/);
  assert.match(dashboard,/state.role==='superadmin'&&state.demoMode/);
  assert.match(dashboard,/Voltar aos dados reais/);
  assert.match(dashboard,/Visualizações simuladas/);
  assert.match(dashboard,/renderStats\(state.realStats\)/);
  assert.match(dashboard,/Dados reais dos cliques/);
});
