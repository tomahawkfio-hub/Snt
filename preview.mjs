/** SNT Links: metadata extracted from the linked article, never generated from guesses. */
const MAX_HTML_BYTES=256000;
export const SOCIAL_CRAWLER=/(?:facebookexternalhit|facebot|meta-external(?:agent|fetcher)|whatsapp\/|twitterbot|telegrambot|linkedinbot|pinterestbot|slackbot|discordbot|skypeuripreview)/i;
export function isSocialCrawler(request){
  return SOCIAL_CRAWLER.test(request.headers.get('user-agent')||'');
}
export function escapeHtml(value=''){
  return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function decodeEntities(s=''){
  return String(s).replace(/&(#(?:x[0-9a-f]+|[0-9]+)|amp|quot|apos|lt|gt|nbsp|hellip|ndash|mdash);/gi,(_,entity)=>{
    const x=entity.toLowerCase();
    if(x[0]==='#'){const n=x[1]==='x'?parseInt(x.slice(2),16):parseInt(x.slice(1),10);return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';}
    return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',hellip:'…',ndash:'–',mdash:'—'}[x]||'';
  });
}
function attrs(tag){
  const fields={};
  const pattern=/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while((match=pattern.exec(tag))!==null)fields[match[1].toLowerCase()]=decodeEntities(match[2]??match[3]??match[4]);
  return fields;
}
function safeMediaUrl(url,base){
  if(typeof url!=='string'||!url.trim())return '';
  try{const u=new URL(url.trim(),base);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!u.hostname)return '';return u.href.slice(0,2048);}catch{return '';}
}
export function extractSocialMetadata(html,base){
  const head=html.split(/<\/head\s*>/i)[0].slice(0,MAX_HTML_BYTES);
  const meta={};
  for(const tag of head.match(/<meta\b[^>]*>/gi)||[]){
    const a=attrs(tag),name=(a.property||a.name||'').toLowerCase();
    if(name&&a.content&&!meta[name])meta[name]=a.content.trim();
  }
  const titleMatch=head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title=decodeEntities((meta['og:title']||meta['twitter:title']||(titleMatch?.[1]||'').replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim()).slice(0,240);
  const description=decodeEntities(meta['og:description']||meta['twitter:description']||meta.description||'').replace(/\s+/g,' ').trim().slice(0,500);
  const image=safeMediaUrl(meta['og:image:secure_url']||meta['og:image']||meta['twitter:image']||meta['twitter:image:src']||'',base);
  return {title,description,image};
}
export async function fetchSocialMetadata(destination,fetcher=fetch){
  const timeout=AbortSignal.timeout(5500);
  let url=destination;
  for(let n=0;n<3;n++){
    // Validate each destination, including redirect targets, before fetching.
    if(!/^https?:\/\//i.test(url))return {title:'',description:'',image:''};
    const parsed=new URL(url);
    if(parsed.username||parsed.password||parsed.hostname==='localhost'||parsed.hostname.endsWith('.local')||parsed.hostname.endsWith('.internal')||/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)||parsed.hostname.startsWith('['))return {title:'',description:'',image:''};
    let res;
    try{
      res=await fetcher(url,{method:'GET',redirect:'manual',signal:timeout,headers:{'user-agent':'SNTLinksPreview/1.0 (social metadata; no user click)','accept':'text/html,application/xhtml+xml;q=0.9','purpose':'prefetch'}});
    }catch{return {title:'',description:'',image:''};}
    if([301,302,303,307,308].includes(res.status)){
      const location=res.headers.get('location');
      if(!location)return {title:'',description:'',image:''};
      url=new URL(location,url).href;
      continue;
    }
    if(!res.ok||!/(?:text\/html|application\/xhtml\+xml)/i.test(res.headers.get('content-type')||''))return {title:'',description:'',image:''};
    const reader=res.body?.getReader();
    if(!reader)return {title:'',description:'',image:''};
    const decoder=new TextDecoder();
    let html='',bytes=0;
    try{
      while(bytes<MAX_HTML_BYTES){
        const {done,value}=await reader.read();
        if(done)break;
        bytes+=value.byteLength;
        html+=decoder.decode(value,{stream:true});
        if(/<\/head\s*>/i.test(html))break;
      }
    }finally{await reader.cancel().catch(()=>{});}
    return extractSocialMetadata(html,url);
  }
  return {title:'',description:'',image:''};
}
export function renderSocialPreview(metadata,shortUrl,target){
  const title=metadata.title||new URL(target).hostname;
  const description=metadata.description||'Leia a matéria completa no site original.';
  const image=metadata.image||'';
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+escapeHtml(title)+'</title>'+
    '<meta property="og:type" content="article">'+
    '<meta property="og:url" content="'+escapeHtml(shortUrl)+'">'+
    '<meta property="og:title" content="'+escapeHtml(title)+'">'+
    '<meta property="og:description" content="'+escapeHtml(description)+'">'+
    (image?'<meta property="og:image" content="'+escapeHtml(image)+'"><meta name="twitter:image" content="'+escapeHtml(image)+'">':'')+
    '<meta name="twitter:card" content="summary_large_image">'+
    '<meta name="twitter:title" content="'+escapeHtml(title)+'">'+
    '<meta name="twitter:description" content="'+escapeHtml(description)+'">'+
    '</head><body><p><a href="'+escapeHtml(target)+'">Leia a matéria completa</a></p></body></html>';
}
