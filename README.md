# SNT Links

Encurtador privado de links e painel de estatísticas para **snt.today**.

Desenvolvido sem consumir créditos da Lovable. Baseado em Cloudflare Workers + D1, com repositório GitHub independente da EcoChurch.

## Estado

Sistema publicado na Cloudflare (Worker + banco D1), com código versionado no GitHub. Domínios: `snt.today` e `www.snt.today`.

## Contagem de cliques (20/11/2026)

O painel apresenta **cliques filtrados desde a ativação desta versão**, e não simplesmente todas as requisições HTTP. Requisições `HEAD`, agentes automáticos conhecidos e pré-buscas declaradas não somam cliques. Repetições do mesmo identificador por link em 60 segundos são desconsideradas. Mesmo assim, nenhuma filtragem pode garantir 100% de visitas humanas.

**Histórico:** contadores antigos permanecem no campo `links.clicks` e eventos anteriores ficam em `click_events` com `qualified=0`. O novo painel utiliza `links.filtered_clicks` e apenas eventos com `qualified=1`. Não houve exclusão dos registros antigos, nem reclassificação retroativa. Para uma instalação existente, executar uma única vez `migrations/20261120_filter_clicks.sql` antes de publicar o código atualizado.


## Instalação

1. Criar banco D1 e executar `schema.sql`.
2. Publicar `worker.mjs` com módulo `dashboard.mjs` e binding `DB` de D1.
3. Definir secrets `ADMIN_PASSWORD` (senha forte e exclusiva) e `SESSION_SECRET` (string aleatória criptograficamente segura com pelo menos 32 bytes de entropia).
4. Testar na URL temporária do Worker.
5. Validar a configuração atual do DNS e só então conectar `snt.today`.

`npm test` executa os testes locais no Node.js 20+.

**Avisos:** O repositório está público; não inclua credenciais ou chaves secretas. URLs HTTP(S) são validadas, mas políticas externas (inclusive Facebook/Meta) podem limitar redirecionamentos. Cloudflare pode cobrar ao exceder quotas gratuitas.