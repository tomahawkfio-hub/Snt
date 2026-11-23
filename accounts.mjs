/** SNT Links: contas individuais, sessão HMAC e senha PBKDF2. */
const utf8=new TextEncoder();
const ITERATIONS=165000;
function encode(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function decode(s){const a=s.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(a+'='.repeat((4-a.length%4)%4)),x=>x.charCodeAt(0));}
async function hmac(secret,body){
  const key=await crypto.subtle.importKey('raw',utf8.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',key,utf8.encode(body)));
}
export function validEmail(email){return typeof email==='string'&&email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());}
export function strongPassword(password){return typeof password==='string'&&password.length>=12&&password.length<=128;}
export function generatePassword(){
  return encode(crypto.getRandomValues(new Uint8Array(21)));
}
export async function hashPassword(password,salt){
  if(!strongPassword(password))throw Error('Senha deve ter pelo menos 12 caracteres.');
  const input=await crypto.subtle.importKey('raw',utf8.encode(password),'PBKDF2',false,['deriveBits']);
  const output=await crypto.subtle.deriveBits({name:'PBKDF2',salt:decode(salt),iterations:ITERATIONS,hash:'SHA-256'},input,256);
  return encode(new Uint8Array(output));
}
export async function makePasswordRecord(password){
  const salt=encode(crypto.getRandomValues(new Uint8Array(20)));
  return {salt,hash:await hashPassword(password,salt)};
}
export async function checkPassword(password,user){
  if(!strongPassword(password)||!user?.password_salt||!user?.password_hash)return false;
  const expected=await hashPassword(password,user.password_salt);
  const a=utf8.encode(expected),b=utf8.encode(user.password_hash);
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
export async function signMemberSession(secret,user){
  if(!secret)throw Error('Segredo não definido');
  const body=['v2',user.id,user.session_version,Math.floor(Date.now()/1000)+28800,encode(crypto.getRandomValues(new Uint8Array(15)))].join('.');
  return body+'.'+encode(await hmac(secret,body));
}
export async function verifyMemberSession(req,env){
  if(!env?.SESSION_SECRET||!env?.DB)return null;
  const cookie=(req.headers.get('cookie')||'').split(';').map(c=>c.trim()).find(c=>c.startsWith('snt_session='));
  if(!cookie)return null;
  const parts=cookie.slice('snt_session='.length).split('.');
  if(parts.length!==6||parts[0]!=='v2'||!/^[0-9a-f-]{36}$/i.test(parts[1])||!/^\d{1,10}$/.test(parts[2])||!/^\d{10}$/.test(parts[3]))return null;
  const expires=Number(parts[3]), now=Math.floor(Date.now()/1000);
  if(!Number.isSafeInteger(expires)||expires<=now||expires>now+28860)return null;
  try{
    const expected=encode(await hmac(env.SESSION_SECRET,parts.slice(0,5).join('.')));
    const supplied=parts[5];
    if(expected.length!==supplied.length)return null;
    let mismatch=0;for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^supplied.charCodeAt(i);
    if(mismatch!==0)return null;
    const u=await env.DB.prepare('SELECT id,email,display_name,role,status,plan_cents,paid_until,session_version FROM accounts WHERE id=?').bind(parts[1]).first();
    if(!u||u.role!=='member'||Number(u.session_version)!==Number(parts[2]))return null;
    return {id:u.id,role:'member',name:u.display_name,email:u.email,status:u.status,plan_cents:u.plan_cents,paid_until:u.paid_until,active:u.status==='active'&&!!u.paid_until&&u.paid_until>=new Date().toISOString().slice(0,10)};
  }catch{return null;}
}
export const LOGIN_COOKIE='snt_session';
