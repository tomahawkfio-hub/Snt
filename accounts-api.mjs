import {validEmail,generatePassword,makePasswordRecord,checkPassword,strongPassword} from './accounts.mjs';
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function nextMonth(){const x=new Date();x.setUTCDate(x.getUTCDate()+30);return x.toISOString().slice(0,10);}
function validDate(s){return typeof s==='string'&&DATE.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));}
function plan(v){return v===990||v===1500;}
function saneName(s){return typeof s==='string'&&s.trim().length>=2&&s.trim().length<=100;}
function cookieClear(response){response.headers.append('set-cookie','snt_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');}
export async function accountEndpoints(req,env,path,actor,{json,error,input}){
  if(path==='/api/account/password'&&req.method==='POST'){
    if(actor.role!=='member')return error('Senha principal deve ser alterada na Cloudflare.',403);
    let data;try{data=await input(req);}catch{return error('Dados inválidos.');}
    if(!strongPassword(data.newPassword))return error('A senha nova precisa de pelo menos 12 caracteres.');
    const record=await env.DB.prepare('SELECT password_salt,password_hash FROM accounts WHERE id=?').bind(actor.id).first();
    if(!await checkPassword(data.currentPassword,record))return error('Senha atual incorreta.',403);
    const fresh=await makePasswordRecord(data.newPassword);
    await env.DB.prepare("UPDATE accounts SET password_salt=?,password_hash=?,session_version=session_version+1,updated_at=datetime('now') WHERE id=?").bind(fresh.salt,fresh.hash,actor.id).run();
    const response=json({ok:true,login_required:true});cookieClear(response);return response;
  }
  if(!path.startsWith('/api/admin/'))return null;
  if(actor.role!=='superadmin')return error('Acesso exclusivo do superadministrador.',403);
  if(path==='/api/admin/accounts'&&req.method==='GET'){
    const r=await env.DB.prepare("SELECT a.id,a.email,a.display_name,a.status,a.plan_cents,a.paid_until,a.created_at,(SELECT COUNT(*) FROM links l WHERE l.owner_id=a.id AND l.disabled=0) AS links,(SELECT COALESCE(SUM(interaction_clicks),0) FROM links l WHERE l.owner_id=a.id AND l.disabled=0) AS clicks FROM accounts a ORDER BY a.created_at DESC LIMIT 200").all();
    return json({accounts:r.results||[],pricing:[990,1500],billing:'manual'});
  }
  if(path==='/api/admin/accounts'&&req.method==='POST'){
    let d;try{d=await input(req);}catch{return error('Dados inválidos.');}
    if(!validEmail(d.email)||!saneName(d.name)||!plan(Number(d.plan_cents)))return error('Informe nome, e-mail e plano válidos.');
    const status=d.status==='active'?'active':'pending';
    const due=status==='active'?(d.paid_until&&validDate(d.paid_until)?d.paid_until:nextMonth()):null;
    if(status==='active'&&due<new Date().toISOString().slice(0,10))return error('A validade não pode estar no passado.');
    const password=generatePassword(),secrets=await makePasswordRecord(password),id=crypto.randomUUID();
    try{
      await env.DB.prepare("INSERT INTO accounts(id,email,display_name,password_salt,password_hash,role,status,plan_cents,paid_until) VALUES(?,?,?,?,?,'member',?,?,?)")
        .bind(id,d.email.trim().toLowerCase(),d.name.trim(),secrets.salt,secrets.hash,status,Number(d.plan_cents),due).run();
    }catch(e){
      if(/UNIQUE|constraint/i.test(String(e)))return error('Este e-mail já está cadastrado.',409);
      throw e;
    }
    return json({account:{id,email:d.email.trim().toLowerCase(),name:d.name.trim(),status,plan_cents:Number(d.plan_cents),paid_until:due},temporary_password:password},201);
  }
  const match=path.match(/^\/api\/admin\/accounts\/([0-9a-f-]{36})(\/reset-password)?$/i);
  if(match&&match[2]&&req.method==='POST'){
    const user=await env.DB.prepare('SELECT id,email FROM accounts WHERE id=?').bind(match[1]).first();
    if(!user)return error('Conta não encontrada.',404);
    const password=generatePassword(),record=await makePasswordRecord(password);
    await env.DB.prepare("UPDATE accounts SET password_salt=?,password_hash=?,session_version=session_version+1,updated_at=datetime('now') WHERE id=?").bind(record.salt,record.hash,user.id).run();
    return json({ok:true,email:user.email,temporary_password:password});
  }
  if(match&&!match[2]&&req.method==='PATCH'){
    const old=await env.DB.prepare('SELECT id,status,plan_cents,paid_until,display_name FROM accounts WHERE id=?').bind(match[1]).first();
    if(!old)return error('Conta não encontrada.',404);
    let d;try{d=await input(req);}catch{return error('Dados inválidos.');}
    const status=d.status===undefined?old.status:d.status;
    const price=d.plan_cents===undefined?old.plan_cents:Number(d.plan_cents);
    const name=d.name===undefined?old.display_name:d.name;
    let due=d.paid_until===undefined?old.paid_until:d.paid_until;
    if(!['pending','active','suspended'].includes(status)||!plan(price)||!saneName(name))return error('Dados inválidos.');
    if(due!==null&&!validDate(due))return error('Data inválida (use AAAA-MM-DD).');
    if(status==='active'&&!due)due=nextMonth();
    const revoke=(status!=='active'&&old.status==='active')?1:0;
    await env.DB.prepare("UPDATE accounts SET status=?,plan_cents=?,paid_until=?,display_name=?,session_version=session_version+?,updated_at=datetime('now') WHERE id=?")
       .bind(status,price,due,name.trim(),revoke,old.id).run();
    return json({ok:true,status,plan_cents:price,paid_until:due});
  }
  return error('Rota administrativa não encontrada.',404);
}
