import test from 'node:test';
import assert from 'node:assert/strict';
import {extractSocialMetadata,renderSocialPreview,fetchSocialMetadata,isSocialCrawler} from '../preview.mjs';

const original='https://news.example.com/noticia/123';
test('extrai titulo, descricao e foto Open Graph com URL relativa',()=>{
  const html='<html><head><meta content="Matéria &amp; apuração" property="og:title">'+
    '<meta property="og:description" content="Resumo da notícia">'+
    '<meta property="og:image" content="/wp-content/uploads/2026/11/foto.jpg"></head></html>';
  assert.deepEqual(extractSocialMetadata(html,original),{
    title:'Matéria & apuração',description:'Resumo da notícia',
    image:'https://news.example.com/wp-content/uploads/2026/11/foto.jpg'
  });
});
test('usa metadados do Twitter ou titulo HTML se OG indisponivel',()=>{
  const meta=extractSocialMetadata('<head><title>Título original</title><meta name="twitter:image" content="https://img.example.com/cover.png"></head>',original);
  assert.equal(meta.title,'Título original');
  assert.equal(meta.image,'https://img.example.com/cover.png');
});
test('renderiza OG e protege HTML de injeção',()=>{
  const html=renderSocialPreview({title:'<script>alert(1)</script>',description:'Texto & notícia',image:'https://img.example.com/image.jpg'},'https://snt.today/abc123',original);
  assert.match(html,/property="og:title"/);
  assert.match(html,/content="&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
  assert.match(html,/property="og:image" content="https:\/\/img.example.com\/image.jpg"/);
  assert.match(html,/content="https:\/\/snt.today\/abc123"/);
  assert.doesNotMatch(html,/<script>alert/);
});
test('distingue robô de preview social e navegador normal',()=>{
  const req=(ua)=>new Request('https://snt.today/abc123',{headers:{'User-Agent':ua}});
  assert.equal(isSocialCrawler(req('facebookexternalhit/1.1')),true);
  assert.equal(isSocialCrawler(req('WhatsApp/2.0')),true);
  assert.equal(isSocialCrawler(req('Twitterbot/1.0')),true);
  assert.equal(isSocialCrawler(req('Mozilla/5.0 Chrome/120')),false);
});
test('baixar HTML limitado e extrair campos do destino',async()=>{
  const html='<html><head><meta property="og:title" content="Notícia teste"><meta property="og:image" content="https://news.example.com/image.jpg"></head><body>conteúdo</body></html>';
  const seen=[];
  const meta=await fetchSocialMetadata(original,async(url,opts)=>{
    seen.push({url,redirect:opts.redirect});
    return new Response(html,{status:200,headers:{'content-type':'text/html; charset=UTF-8'}});
  });
  assert.equal(seen.length,1);
  assert.equal(seen[0].redirect,'manual');
  assert.equal(meta.title,'Notícia teste');
  assert.equal(meta.image,'https://news.example.com/image.jpg');
});
test('rejeita redirecionamento para IP direto interno',async()=>{
  const meta=await fetchSocialMetadata(original,async()=>new Response('',{status:302,headers:{location:'http://127.0.0.1/admin'}}));
  assert.deepEqual(meta,{title:'',description:'',image:''});
});
