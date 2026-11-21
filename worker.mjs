/** SNT Links — Cloudflare Workers / D1. No Lovable API or credentials. */
import { dashboard } from './dashboard.mjs';
import { fetchSocialMetadata, isSocialCrawler, renderSocialPreview } from './preview.mjs';

const COOKIE='snt_session';
const ALPHABET='23456789abcdefghjkmnpqrstuvwxyz';
const RESERVED=new Set(['api','admin','login','logout','health','assets','robots.txt','favicon.ico','sitemap.xml']);
const encoder=new TextEncoder();
const security={
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};

function json(data,status=200) {
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
function error(message,status=400){return json({error:message},status);}
function b64(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function unb64(value){const s=value.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));}
async function key(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function mac(secret,text){return new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(text)));}
async function signSession(secret) {
  const expiry=Math.floor(Date.now()/1000)+28800;
  const nonce=b64(crypto.getRandomValues(new Uint8Array(16)));
  const payload=['v1',expiry,nonce].join('.');
  return payload+'.'+b64(await mac(secret,payload));
}
async function verifySession(req,secret){
  if(!secret)return false;
  const cookie=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));
  if(!cookie)return false;
  const token=cookie.slice(COOKIE.length+1);
  const parts=token.split('.');
  if(parts.length!==4||parts[0]!=='v1'||!/^\d{10}$/.test(parts[1]))return false;
  const expiry=Number(parts[1]),now=Date.now()/1000;
  if(!Number.isSafeInteger(expiry)||expiry<=now||expiry>now+28860)return false;
  try{
    const signature=unb64(parts[3]);
    if(signature.length!==32||b64(signature)!==parts[3])return false;
    return crypto.subtle.verify('HMAC',await key(secret),signature,encoder.encode(parts.slice(0,3).join('.')));
  }catch{return false;}
}
async function passwordMatches(provided,expected){
  if(!expected||typeof provided!=='string'||provided.length>1024)return false;
  const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(provided)),crypto.subtle.digest('SHA-256',encoder.encode(expected))]);
  const x=new Uint8Array(a),y=new Uint8Array(b);
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
  return diff===0;
}
function sameOrigin(req){
  const origin=req.headers.get('origin'),site=req.headers.get('sec-fetch-site');
  return origin===new URL(req.url).origin&&(!site||site==='same-origin');
}
async function input(req){
  if(!(req.headers.get('content-type')||'').startsWith('application/json'))throw Error('JSON necessário');
  if(Number(req.headers.get('content-length')||0)>8192)throw Error('Dados muito grandes');
  const body=await req.text();
  if(body.length>8192)throw Error('Dados muito grandes');
  const parsed=JSON.parse(body);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('JSON inválido');
  return parsed;
}
function validateDestination(value){
  if(typeof value!=='string'||value.length>2048)return null;
  try{
    const url=new URL(value.trim()),host=url.hostname.toLowerCase();
    if(!['http:','https:'].includes(url.protocol)||!host||url.username||url.password)return null;
    if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal'))return null;
    if(/^\d+\.\d+\.\d+\.\d+$/.test(host)){
      const parts=host.split('.').map(Number);
      if(parts.some(n=>n<0||n>255)||parts[0]===0||parts[0]===10||parts[0]===127||parts[0]>=224||
      (parts[0]===169&&parts[1]===254)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||
      (parts[0]===192&&parts[1]===168)||(parts[0]===100&&parts[1]>=64&&parts[1]<=127))return null;
    }
    if(host==='[::1]'||host.startsWith('[fc')||host.startsWith('[fd')||host.startsWith('[fe80'))return null;
    return url.toString();
  }catch{return null;}
}
function validateCode(code){
  if(code===null||code===undefined||code==='')return null;
  if(typeof code!=='string')return false;
  const value=code.trim().toLowerCase();
  return /^[a-z0-9_-]{3,24}$/.test(value)&&!RESERVED.has(value)?value:false;
}
function createCode(size=7){
  const bytes=crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes,n=>ALPHABET[n%ALPHABET.length]).join('');
}
function referrer(req){try{return new URL(req.headers.get('referer')).hostname.slice(0,100);}catch{return 'direto';}}
function device(req){return /mobile|android|iphone|ipad/i.test(req.headers.get('user-agent')||'')?'mobile':'desktop';}
// Um acesso automático não deve aumentar a contagem, mas continua recebendo o redirecionamento.
function shouldCountClick(req){
  if(req.method!=='GET')return false; // HEAD verifica URL, não é clique.
  const ua=(req.headers.get('user-agent')||'').trim();
  if(!ua)return false;
  // Robôs de prévia de redes sociais, indexadores e clientes automáticos conhecidos.
  // Evitar bloquear navegadores reais do Facebook (FBAN/FBAV) e do WhatsApp.
  const botUA=/(?:facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher|twitterbot|telegrambot|discordbot|slackbot|linkedinbot|pinterestbot|googlebot|bingbot|yandexbot|baiduspider|duckduckbot|applebot|crawler|spider|bot\b|headlesschrome|lighthouse|curl\/|wget\/|python-requests|python-urllib|go-http-client|node-fetch|axios\/|postmanruntime|uptimerobot|httpclient)/i;
  if(botUA.test(ua)||ua.toLowerCase().startsWith('whatsapp/'))return false;
  const purpose=['purpose','sec-purpose','x-purpose','x-moz'].map(h=>req.headers.get(h)||'').join(' ');
  if(/\b(prefetch|prerender|preview)\b/i.test(purpose))return false;
  if(req.cf?.botManagement?.verifiedBot===true)return false;
  const botScore=req.cf?.botManagement?.score;
  if(Number.isFinite(botScore)&&botScore<30)return false; // disponível apenas em planos compatíveis
  return true;
}
function classifyRedirect(req){
  if(req.method!=='GET')return 'other_method';
  if(!shouldCountClick(req))return 'automated_or_prefetch';
  // Sec-Fetch-User: ?1 indica acionamento de navegação pelo usuário.
  // No modo estrito, requisições sem esse sinal não somam cliques.
  const mode=(req.headers.get('sec-fetch-mode')||'').toLowerCase();
  const dest=(req.headers.get('sec-fetch-dest')||'').toLowerCase();
  if(mode!=='navigate'||dest!=='document')return 'no_document_navigation';
  if(req.headers.get('sec-fetch-user')!=='?1')return 'no_user_activation';
  return 'interaction';
}
async function bucket(req,secret){
  return b64(await mac(secret,'login:'+Math.floor(Date.now()/600000)+':'+(req.headers.get('cf-connecting-ip')||'unknown'))).slice(0,32);
}
async function visitorHash(req,secret){
  return b64(await mac(secret,new Date().toISOString().slice(0,10)+'|'+(req.headers.get('cf-connecting-ip')||'')+'|'+(req.headers.get('user-agent')||'').slice(0,200))).slice(0,32);
}
async function saveSocialMetadata(db,id,destination){
  // Usamos apenas o título, a imagem e a descrição existentes na notícia original.
  const meta=await fetchSocialMetadata(destination);
  await db.prepare(
    "UPDATE links SET social_title=?,social_description=?,social_image=?,social_fetched_at=datetime('now') WHERE id=? AND original_url=?"
  ).bind(meta.title,meta.description,meta.image,id,destination).run();
  return meta;
}
async function api(req,env,path,ctx){
  if(path==='/api/session'&&req.method==='GET')return json({authenticated:await verifySession(req,env.SESSION_SECRET)});
  if(path==='/api/login'&&req.method==='POST'){
    if(!sameOrigin(req))return error('Origem não autorizada.',403);
    if(!env.DB||!env.ADMIN_PASSWORD||!env.SESSION_SECRET)return error('Acesso administrativo ainda não configurado.',503);
    const id=await bucket(req,env.SESSION_SECRET);
    const attempts=await env.DB.prepare('SELECT failures FROM login_attempts WHERE bucket=?').bind(id).first();
    if((attempts?.failures||0)>=8)return error('Muitas tentativas. Tente novamente em até 10 minutos.',429);
    let body;try{body=await input(req);}catch{return error('Dados inválidos.');}
    if(!await passwordMatches(body.password,env.ADMIN_PASSWORD)){
      await env.DB.prepare('INSERT INTO login_attempts(bucket,failures) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET failures=failures+1').bind(id).run();
      return error('Senha incorreta.',401);
    }
    await env.DB.prepare('DELETE FROM login_attempts WHERE bucket=?').bind(id).run();
    const response=json({ok:true});
    response.headers.append('set-cookie',COOKIE+'='+await signSession(env.SESSION_SECRET)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800');
    return response;
  }
  if(!await verifySession(req,env.SESSION_SECRET))return error('Faça login para continuar.',401);
  if(req.method!=='GET'&&!sameOrigin(req))return error('Origem não autorizada.',403);
  if(path==='/api/logout'&&req.method==='POST'){
    const response=json({ok:true});
    response.headers.append('set-cookie',COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    return response;
  }
  if(!env.DB)return error('Banco de dados não configurado.',503);
  if(path==='/api/links'&&req.method==='GET'){
    const r=await env.DB.prepare("SELECT id,code,original_url,COALESCE(NULLIF(title,''),social_title) AS title,social_image,interaction_clicks AS clicks,created_at FROM links WHERE disabled=0 ORDER BY created_at DESC LIMIT 150").all();
    return json({links:r.results||[]});
  }
  if(path==='/api/links'&&req.method==='POST'){
    let body;try{body=await input(req);}catch{return error('Dados inválidos.');}
    const dest=validateDestination(body.url),custom=validateCode(body.customCode);
    if(!dest)return error('Informe um endereço HTTP ou HTTPS válido.');
    if(custom===false)return error('Use de 3 a 24 letras, números, hífen ou sublinhado.');
    const title=typeof body.title==='string'?body.title.trim().slice(0,120):'';
    const id=crypto.randomUUID();
    for(let i=0;i<(custom?1:8);i++){
      const code=custom||createCode();
      const r=await env.DB.prepare('INSERT OR IGNORE INTO links(id,code,original_url,title) VALUES(?,?,?,?)').bind(id,code,dest,title).run();
      if(r.meta?.changes===1){
        // A criação não depende do tempo de resposta do site original.
        ctx.waitUntil(saveSocialMetadata(env.DB,id,dest).catch(e=>console.error(JSON.stringify({event:'social_metadata_error',error:String(e)}))));
        return json({link:{id,code,url:dest,title,shortUrl:new URL(req.url).origin+'/'+code}},201);
      }
    }
    return error(custom?'Esse endereço personalizado já está em uso.':'Não foi possível gerar código único.',409);
  }
  const refresh=path.match(/^\/api\/links\/([0-9a-f-]{36})\/refresh-preview$/i);
  if(refresh&&req.method==='POST'){
    const row=await env.DB.prepare('SELECT id,original_url,code FROM links WHERE id=? AND disabled=0').bind(refresh[1]).first();
    if(!row)return error('Link não encontrado.',404);
    const meta=await saveSocialMetadata(env.DB,row.id,row.original_url);
    return json({preview:meta,shortUrl:new URL(req.url).origin+'/'+row.code,hasImage:!!meta.image});
  }
  const id=path.match(/^\/api\/links\/([0-9a-f-]{36})$/i);
  if(id&&req.method==='DELETE'){
    const r=await env.DB.prepare('DELETE FROM links WHERE id=?').bind(id[1]).run();
    return r.meta?.changes?json({ok:true}):error('Link não encontrado.',404);
  }
  if(path==='/api/stats'&&req.method==='GET'){
    const [total,seven,countries,audit]=await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS total_links, COALESCE(SUM(interaction_clicks),0) AS total_clicks FROM links WHERE disabled=0').first(),
      env.DB.prepare("SELECT substr(clicked_at,1,10) AS day, COUNT(*) AS clicks, COUNT(DISTINCT visitor_hash) AS visitors FROM click_events WHERE qualified=2 AND clicked_at >= datetime('now','-6 days') GROUP BY substr(clicked_at,1,10) ORDER BY day ASC").all(),
      env.DB.prepare('SELECT country,COUNT(*) AS clicks FROM click_events WHERE qualified=2 GROUP BY country ORDER BY clicks DESC LIMIT 5').all(),
      env.DB.prepare("SELECT classification,SUM(attempts) AS attempts FROM request_audit_daily WHERE day >= date('now','-6 days') GROUP BY classification").all()
    ]);
    const today=new Date().toISOString().slice(0,10);
    const todayClicks=(seven.results||[]).find(x=>x.day===today)?.clicks||0;
    return json({totals:{...total,today_clicks:todayClicks},days:seven.results||[],countries:countries.results||[],audit:audit.results||[]});
  }
  return error('Rota não encontrada.',404);
}
async function redirect(req,env,ctx,slug){
  if(!env.DB)return new Response('Serviço indisponível.',{status:503});
  const row=await env.DB.prepare('SELECT id,code,title,original_url,social_title,social_description,social_image,social_fetched_at FROM links WHERE code=? AND disabled=0').bind(slug.toLowerCase()).first();
  if(!row)return new Response('Link não encontrado.',{status:404});
  const target=validateDestination(row.original_url);
  if(!target)return new Response('Destino inválido.',{status:410});
  if(isSocialCrawler(req)){
    // Social crawlers see real metadata for the SAME article a human is sent to.
    // Their requests do not enter the click counter or the request audit.
    let meta={title:row.social_title||row.title||'',description:row.social_description||'',image:row.social_image||''};
    const stale=!row.social_fetched_at||(!meta.image&&(Date.now()-Date.parse(row.social_fetched_at.replace(' ','T')+'Z')>900000));
    if(stale){
      try{meta=await saveSocialMetadata(env.DB,row.id,target);}catch(e){
        console.error(JSON.stringify({event:'preview_fetch_failed',error:String(e)}));
      }
    }
    const shortUrl=new URL(req.url).origin+'/'+row.code;
    const html=renderSocialPreview({title:meta.title||row.title||'',description:meta.description||'',image:meta.image||''},shortUrl,target);
    return new Response(req.method==='HEAD'?null:html,{status:200,headers:{
      'content-type':'text/html; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
      'vary':'User-Agent'
    }});
  }
  const classification=classifyRedirect(req);
  ctx.waitUntil((async()=>{
    try{
      let resultType=classification;
      if(classification==='interaction'&&env.SESSION_SECRET){
        const hash=await visitorHash(req,env.SESSION_SECRET);
        // Bloqueio atômico de requisições repetidas no período de 60 segundos.
        // O trigger do banco atualiza interaction_clicks somente após inserir o evento.
        const result=await env.DB.prepare(
          "INSERT INTO click_events(link_id,country,referrer_domain,device,visitor_hash,qualified) "+
          "SELECT ?,?,?,?,?,2 WHERE NOT EXISTS ("+
          "SELECT 1 FROM click_events WHERE link_id=? AND visitor_hash=? AND qualified=2 "+
          "AND clicked_at>=datetime('now','-60 seconds'))"
        ).bind(row.id,req.cf?.country||'XX',referrer(req),device(req),hash,row.id,hash).run();
        resultType=result.meta?.changes===1?'counted':'repeat';
      }else if(classification==='interaction'){
        resultType='tracking_unavailable';
      }
      // Auditoria agrupada, sem armazenar IP ou User-Agent brutos.
      await env.DB.prepare(
        'INSERT INTO request_audit_daily(link_id,day,classification,attempts) VALUES(?,?,?,1) '+
        'ON CONFLICT(link_id,day,classification) DO UPDATE SET attempts=attempts+1'
      ).bind(row.id,new Date().toISOString().slice(0,10),resultType).run();
    }catch(e){console.error(JSON.stringify({event:'click_tracking_error',error:String(e)}));}
  })());
  return new Response(null,{status:302,headers:{location:target,'cache-control':'no-store','x-robots-tag':'noindex, nofollow','referrer-policy':'no-referrer'}});
}
export default {
  async fetch(req,env,ctx){
    try{
      const url=new URL(req.url),path=url.pathname;
      if(path==='/health')return json({status:'ok',db:!!env.DB});
      if(path==='/robots.txt')return new Response('User-agent: *\nDisallow: /admin\nDisallow: /api/\n',{headers:{'content-type':'text/plain; charset=utf-8'}});
      if(path==='/favicon.ico')return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#2563eb"/><path d="M22 22l-7 7a9 9 0 0 0 13 13l7-7m-6-6 7-7a9 9 0 0 1 13 13l-7 7" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>',{headers:{'content-type':'image/svg+xml'}});
      if(path.startsWith('/api/'))return api(req,env,path,ctx);
      if(path==='/'||path==='/admin'){
        if(req.method!=='GET')return error('Método não permitido.',405);
        return new Response(dashboard,{headers:{'content-type':'text/html; charset=utf-8',...security}});
      }
      const slug=path.match(/^\/([a-zA-Z0-9_-]{3,24})\/?$/);
      if(slug&&(req.method==='GET'||req.method==='HEAD'))return redirect(req,env,ctx,slug[1]);
      return new Response('Página não encontrada.',{status:404});
    }catch(e){console.error(JSON.stringify({event:'request_error',error:String(e)}));return error('Ocorreu um erro interno.',500);}
  }
};
export const __test={validateDestination,validateCode,createCode,signSession,verifySession,shouldCountClick,classifyRedirect};
