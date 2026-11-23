import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePassword,makePasswordRecord,checkPassword,signMemberSession,verifyMemberSession,validEmail} from '../accounts.mjs';
import {accountEndpoints} from '../accounts-api.mjs';
import worker,{__test} from '../worker.mjs';

const userId='1627c75d-18b7-4960-a247-ece7d1c40042';
const otherId='190e6fc7-625e-4df3-91d8-83f5d1c105c1';
const secret='test-session-signature-secret-long-enough-1234';
function account(status='active'){
  return {id:userId,email:'assinante@example.com',display_name:'Cliente teste',role:'member',
    status,plan_cents:990,paid_until:'2099-01-01',session_version:1};
}
async function memberEnv(status='active'){
  const user=account(status);
  return {user,SESSION_SECRET:secret,DB:{prepare(sql){
    if(sql.includes('FROM accounts WHERE id=?'))return {bind:(id)=>({first:async()=>id===userId?user:null})};
    throw Error('Unmocked query '+sql);
  }}};
}
function memberReq(path,token,opts={}){return new Request('https://snt.today'+path,{...opts,headers:{cookie:'snt_session='+token,...opts.headers}});}
test('senhas geradas não são compartilhadas nem guardadas em texto puro',async()=>{
  const pwd=generatePassword();
  assert.ok(pwd.length>=20);
  const record=await makePasswordRecord(pwd);
  assert.ok(record.salt&&record.hash&&record.hash!==pwd);
  assert.equal(await checkPassword(pwd,record),true);
  assert.equal(await checkPassword('senha-incorreta-123456',record),false);
  assert.equal(validEmail('cliente@example.com'),true);
  assert.equal(validEmail('invalido'),false);
});
test('sessões HMAC de cada membro verificam identidade e impedem falsificação',async()=>{
  const env=await memberEnv(),token=await signMemberSession(secret,env.user);
  assert.equal((await verifyMemberSession(memberReq('/api/session',token),env)).id,userId);
  const tampered=token.slice(0,-1)+(token.endsWith('a')?'b':'a');
  assert.equal(await verifyMemberSession(memberReq('/api/session',tampered),env),null);
  const suspended=await memberEnv('suspended');
  assert.equal((await verifyMemberSession(memberReq('/api/session',token),suspended)).active,false);
});
test('API de gestão somente para superadmin',async()=>{
  const req=new Request('https://snt.today/api/admin/accounts');
  const out=await accountEndpoints(req,{},'/api/admin/accounts',{role:'member',id:userId},{
    json:(x,status=200)=>Response.json(x,{status}),
    error:(m,status=400)=>Response.json({error:m},{status}),
    input:async()=>({})
  });
  assert.equal(out.status,403);
});
test('assinante não pode acessar links, exclusão ou estatísticas de outro usuário',async()=>{
  const user=account();const token=await signMemberSession(secret,user),queries=[];
  const env={SESSION_SECRET:secret,DB:{prepare(sql){
    return {bind:(...params)=>{
      queries.push({sql,params});
      if(sql.includes('FROM accounts WHERE id=?'))return {first:async()=>user};
      if(sql.startsWith('DELETE FROM links'))return {run:async()=>({meta:{changes:0}})};
      if(sql.includes('social_fetched_at='))return {all:async()=>({results:[]})};
      if(sql.startsWith('SELECT id,code'))return {all:async()=>({results:[]})};
      if(sql.startsWith('SELECT COUNT(*)'))return {first:async()=>({total_links:0,total_clicks:0})};
      return {all:async()=>({results:[]}),first:async()=>null};
    }};
  }}};
  const wait=[];const ctx={waitUntil(p){wait.push(p);}};
  const get=await worker.fetch(memberReq('/api/links',token),env,ctx);
  assert.equal(get.status,200);assert.deepEqual((await get.json()).links,[]);
  await Promise.all(wait);
  assert.ok(queries.some(x=>x.sql.includes('FROM links WHERE owner_id=?')&&x.params[0]===userId));
  const statistics=await worker.fetch(memberReq('/api/stats',token),env,ctx);
  assert.equal(statistics.status,200);
  assert.ok(queries.filter(x=>x.sql.includes('JOIN links l ON')&&x.sql.includes('owner_id=?')).length>=2);
  const deletion=await worker.fetch(memberReq('/api/links/'+otherId,token,{
    method:'DELETE',headers:{origin:'https://snt.today','content-type':'application/json'}
  }),env,ctx);
  assert.equal(deletion.status,404);
  assert.ok(queries.some(x=>x.sql.startsWith('DELETE FROM links WHERE id=? AND owner_id=?')&&x.params[0]===otherId&&x.params[1]===userId));
});
test('root continua usando cookie antigo e recebe papel de superadmin',async()=>{
  const token=await __test.signSession(secret);
  const env={SESSION_SECRET:secret,DB:{prepare(){throw Error('Root não precisa consultar banco para sessão.')}}};
  const res=await worker.fetch(memberReq('/api/session',token),env,{waitUntil(){}});
  assert.equal(res.status,200);
  const data=await res.json();assert.equal(data.role,'superadmin');assert.equal(data.authenticated,true);
});
