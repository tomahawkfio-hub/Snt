# SNT Links

Encurtador privado de links e painel de estatísticas para **snt.today**.

Desenvolvido sem consumir créditos da Lovable. Baseado em Cloudflare Workers + D1, com repositório GitHub independente da EcoChurch.

## Estado

Código-fonte versionado no GitHub; publicar em produção requer configurar banco D1, segredos administrativos e confirmar DNS/serviços existentes em `snt.today` antes de apontar o domínio.

## Instalação

1. Criar banco D1 e executar `schema.sql`.
2. Publicar `worker.mjs` com módulo `dashboard.mjs` e binding `DB` de D1.
3. Definir secrets `ADMIN_PASSWORD` (senha forte e exclusiva) e `SESSION_SECRET` (string aleatória criptograficamente segura com pelo menos 32 bytes de entropia).
4. Testar na URL temporária do Worker.
5. Validar a configuração atual do DNS e só então conectar `snt.today`.

`npm test` executa os testes locais no Node.js 20+.

**Avisos:** O repositório está público; não inclua credenciais ou chaves secretas. URLs HTTP(S) são validadas, mas políticas externas (inclusive Facebook/Meta) podem limitar redirecionamentos. Cloudflare pode cobrar ao exceder quotas gratuitas.