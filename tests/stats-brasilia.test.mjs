import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{__test} from '../worker.mjs';
import {dashboard} from '../dashboard.mjs';

test('o dia de Brasília não muda às 21h enquanto em UTC já é dia seguinte',()=>{
  assert.equal(__test.brasiliaDay(new Date('2026-11-24T23:59:00Z')),'2026-11-24');
  assert.equal(__test.brasiliaDay(new Date('2026-11-25T00:00:01Z')),'2026-11-24');
  assert.equal(__test.brasiliaDay(new Date('2026-11-25T02:59:59Z')),'2026-11-24');
  assert.equal(__test.brasiliaDay(new Date('2026-11-25T03:00:00Z')),'2026-11-25');
});

test('relatório busca dias completos em Brasília e preserva cliques acumulados',async()=>{
  const today=__test.brasiliaDay();
  const statements=[];
  const env={SESSION_SECRET:'test-secret-used-only-by-node-tests',
    DB:{prepare(sql){return {
      bind:(...params)=>{
        statements.push({sql,params});
        return {
          first:async()=>({total_links:12,total_clicks:161}),
          all:async()=>sql.includes("date(e.clicked_at,'-3 hours')")?{results:[{day:today,clicks:14,visitors:13}]}:{results:[]}
        };
      }
    };}}
  };
  const token=await __test.signSession(env.SESSION_SECRET);
  const req=new Request('https://snt.today/api/stats',{headers:{cookie:'snt_session='+token}});
  const res=await worker.fetch(req,env,{waitUntil(){}});
  assert.equal(res.status,200);
  const data=await res.json();
  assert.equal(data.timezone,'America/Sao_Paulo');
  assert.equal(data.today,today);
  assert.equal(data.totals.today_clicks,14);
  assert.equal(data.totals.total_clicks,161);
  assert.equal(data.days[0].day,today);
  assert.ok(statements.some(x=>x.sql.includes("date(e.clicked_at,'-3 hours')")&&x.sql.includes("datetime(date('now','-3 hours','-6 days'),'+3 hours')")));
  assert.ok(statements.every(x=>x.params[0]==='superadmin'));
});

test('o painel monta os últimos sete dias a partir da data do servidor brasileiro',()=>{
  assert.match(dashboard,/Interações hoje \(Brasília\)/);
  assert.match(dashboard,/Últimos 7 dias • horário de Brasília/);
  assert.match(dashboard,/const brazilToday=/);
  assert.match(dashboard,/setInterval\(refreshStatsIfNeeded,60_000\)/);
  assert.match(dashboard,/visibilitychange/);
});
