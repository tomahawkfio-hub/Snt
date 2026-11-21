# SNT Links

Encurtador privado de links e painel de estatísticas para **snt.today**.

Desenvolvido sem consumir créditos da Lovable. Baseado em Cloudflare Workers + D1, com repositório GitHub independente da EcoChurch.

## Estado

Sistema publicado na Cloudflare (Worker + banco D1), com código versionado no GitHub. Domínios: `snt.today` e `www.snt.today`.

## Contagem de cliques (20/11/2026)

O painel apresenta **cliques filtrados desde a ativação desta versão**, e não simplesmente todas as requisições HTTP. Requisições `HEAD`, agentes automáticos conhecidos e pré-buscas declaradas não somam cliques. Repetições do mesmo identificador por link em 60 segundos são desconsideradas. Mesmo assim, nenhuma filtragem pode garantir 100% de visitas humanas.

**Histórico:** contadores antigos permanecem no campo `links.clicks` e eventos anteriores ficam em `click_events` com `qualified=0`. O novo painel utiliza `links.filtered_clicks` e apenas eventos com `qualified=1`. Não houve exclusão dos registros antigos, nem reclassificação retroativa. Para uma instalação existente, executar uma única vez `migrations/20261120_filter_clicks.sql` antes de publicar o código atualizado.


## Validação rigorosa contra cliques suspeitos (21/11/2026)

O painel agora contabiliza **cliques com sinal de interação** (`interaction_clicks`). Uma navegação só entra nessa métrica se:

- A solicitação for `GET`, não for identificada como pré-visualização/robô e não declarar prefetch.
- O navegador enviar `Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document` e `Sec-Fetch-User: ?1`.
- O mesmo visitante (hash anônimo diário de IP + User-Agent) não tiver sido contado no mesmo link nos últimos 60 segundos.

Outras solicitações continuam recebendo o redirecionamento normal, mas não aumentam os números. A tabela `request_audit_daily` agrega por link/data/classificação as requisições contadas, repetidas ou sem prova de interação. O painel exibe um total de solicitações descartadas dos últimos sete dias.

**Importante:** `Sec-Fetch-User` é um sinal do navegador, não prova criptográfica de pessoa real. Robôs podem falsificar cabeçalhos, e navegadores antigos ou WebViews podem omitir esses sinais, gerando subcontagem. O sistema **não confirma o carregamento no site de destino**. Para medir visitantes que efetivamente chegaram ao artigo, é necessário instrumentar os sites de notícias.

**Histórico preservado:** `links.clicks` é a métrica original, `links.filtered_clicks` é a primeira tentativa de filtragem, `links.interaction_clicks` é a métrica rigorosa iniciada em 21/11/2026. O campo `click_events.qualified` contém 0, 1 ou 2, respectivamente. Não reclassificamos dados antigos porque não foram guardados todos os cabeçalhos necessários para validá-los. A migração `migrations/20261121_interaction_clicks.sql` deve ser executada uma vez antes de publicar a versão rigorosa.

## Prévia social: título e foto ao compartilhar

- A criação de um link inicia uma leitura dos metadados do artigo de destino (Open Graph, Twitter e título HTML) e os salva no D1, sem atrasar o redirecionamento.
- Robôs de prévia identificados do Facebook/WhatsApp/X/Telegram recebem HTML com `og:title`, `og:description`, `og:image`, `og:url` e `twitter:card`. Os leitores continuam sendo redirecionados com status HTTP 302 diretamente ao artigo original.
- Links antigos também recebem metadados quando solicitados pela primeira vez por um robô de prévia. No painel, o botão de atualizar prévia faz uma nova busca, exibe título e miniatura quando disponíveis e informa se a imagem não foi encontrada.
- `robots.txt` permite o rastreamento dos links curtos, mas restringe as URLs administrativas.
- **Limitações:** o site de destino precisa publicar a imagem e permitir a leitura de HTML pelo Worker. Se o Facebook já armazenou uma prévia antiga, é necessário abrir o [Depurador de Compartilhamento da Meta](https://developers.facebook.com/tools/debug/) e usar *Scrape Again* no URL curto. O Facebook controla a forma como o cartão final aparece; não há garantia de exibição.
- Robôs de pré-visualização **não entram na contagem de cliques com interação**.

## Instalação

1. Criar banco D1 e executar `schema.sql`.
2. Publicar `worker.mjs` com módulo `dashboard.mjs` e binding `DB` de D1.
3. Definir secrets `ADMIN_PASSWORD` (senha forte e exclusiva) e `SESSION_SECRET` (string aleatória criptograficamente segura com pelo menos 32 bytes de entropia).
4. Testar na URL temporária do Worker.
5. Validar a configuração atual do DNS e só então conectar `snt.today`.

`npm test` executa os testes locais no Node.js 20+.

**Avisos:** O repositório está público; não inclua credenciais ou chaves secretas. URLs HTTP(S) são validadas, mas políticas externas (inclusive Facebook/Meta) podem limitar redirecionamentos. Cloudflare pode cobrar ao exceder quotas gratuitas.