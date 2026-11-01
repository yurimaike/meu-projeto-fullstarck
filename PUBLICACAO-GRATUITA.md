# Plano de publicação gratuita — Nail Designer Letícia

## Estado

O projeto foi validado localmente como `fullStack`, mas ainda não foi publicado
fora da infraestrutura Skywork. Não há credenciais de provedor externo, conta
do proprietário ou banco de produção configurados nesta cópia.

## Rota candidata

Cloudflare Pages para os arquivos estáticos, Cloudflare Workers para a API Hono
adaptada ao runtime de Workers e Cloudflare D1 para SQLite. O plano gratuito
oficial informa 100.000 requisições de Worker por dia, 5 milhões de linhas lidas
por dia, 100.000 linhas escritas por dia, 5 GB de D1 e até 10 bancos D1. Os
limites são limites de inclusão: quando excedidos, as operações gratuitas
falham; não devem ser tratados como cobrança automática.

Fontes oficiais consultadas em 31/10/2026:

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages

## Adaptações ainda necessárias

- Substituir o adaptador Node por uma entrada Hono para Workers.
- Substituir a camada libSQL/Turso por D1 ou manter um provedor externo somente
  após verificar que é gratuito e não exige cobrança futura.
- Remover o gateway Skywork, o storage Skywork e o fluxo Google dependente dele.
- Manter o chat administrativo em FAQ local até existir uma IA local realmente
  disponível no ambiente de execução.
- Definir uma solução de e-mail sem cobrança para verificação e recuperação de
  senha, ou marcar esses fluxos como pendentes.
- Adaptar uploads para uma solução gratuita verificada e aplicar limites.
- Criar backup exportável do D1 e testar restauração antes de qualquer dado real.

## Bloqueio de publicação

O cadastro do provedor precisa ser feito pelo proprietário, com sua própria
conta e sua própria verificação. Não solicitar senhas, tokens ou cartão pelo
chat. Não foi possível confirmar nesta auditoria se a conta escolhida exigirá
cartão ou verificação adicional; se exigir pagamento, assinatura ou cobrança,
o provedor deverá ser abandonado.

Até que o proprietário crie e confirme a conta gratuita sem cobrança, o site
permanece apenas local/preparado. Nenhum endereço público é declarado.
