# Assistente administrativo com edição do site via GitHub

## Objectivo

Evoluir o chat privado Letícia AI para que a administradora possa pedir alterações ao site em linguagem natural. Clientes nunca devem ver nem aceder a esta ferramenta.

## Fluxo obrigatório

1. A administradora conversa normalmente com a IA.
2. A IA faz perguntas apenas quando faltar informação e não altera ficheiros nesta fase.
3. Quando o pedido estiver claro, a IA apresenta um plano com resumo, ficheiros a criar/alterar/remover, descrição de cada alteração, riscos e verificações previstas.
4. A interface pede autorização explícita: “Posso fazer estas alterações e salvar no GitHub?”
5. Só uma confirmação afirmativa explícita, associada ao plano apresentado, autoriza a execução. Uma alteração posterior ao plano invalida a autorização anterior.
6. Sem confirmação, nenhuma escrita é realizada.
7. Depois da autorização, o servidor cria uma branch própria, aplica apenas os ficheiros aprovados e abre um Pull Request para revisão.
8. O site não é publicado automaticamente. A publicação depende da revisão e integração do Pull Request.

## Separação entre assistente administrativo e atendimento ao cliente

- O componente Letícia AI deve permanecer montado exclusivamente dentro da página administrativa protegida por `AdminGuard`.
- Até a implementação e validação do fluxo de aprovação/execução, a interface deve identificar claramente o modo como consulta/planeamento e não deve pedir confirmação de execução que ainda não consegue realizar.
- Não importar nem renderizar Letícia AI em layouts, páginas ou componentes públicos/da área da cliente.
- Todas as rotas do assistente administrativo devem aplicar `adminRoute` no servidor, inclusive chat, planeamento, aprovação, execução e geração de imagens.
- O assistente comercial público é um produto separado: não pode receber ferramentas de edição, acesso ao GitHub, contexto administrativo, dados privados ou permissões de escrita.
- A proteção visual do frontend é apenas uma camada de interface; a autorização decisiva é sempre a verificação de papel administrativo no backend.
- Testes automatizados devem confirmar que utilizadores anónimos recebem 401 e clientes autenticados recebem 403, inclusive nas rotas de chat e imagens.

## Segurança obrigatória

- A autorização tem de ser validada no servidor; esconder o chat no frontend não é controlo de acesso suficiente.
- Todas as rotas de planeamento e execução devem usar autenticação e autorização administrativa através de adminRoute.
- O token GitHub deve existir apenas como variável secreta no servidor (GITHUB_TOKEN); nunca pode ser enviado ao browser, incluído em respostas ou registado em logs.
- O servidor deve validar novamente o utilizador administrador e a autorização imediatamente antes de cada escrita.
- A autorização deve estar vinculada a um identificador/hash do plano e expirar; não aceitar um simples campo confirmed=true sem correspondência com o plano.
- Aplicar allowlist de caminhos e bloquear ficheiros de autenticação, segredos, configuração de deploy, workflows e migrações, salvo revisão técnica explícita.
- Limitar número/tamanho de ficheiros, validar caminhos contra traversal, rejeitar conteúdo binário e impedir alterações fora do repositório configurado.
- Nunca executar comandos arbitrários, scripts fornecidos pelo modelo, deploy, merge ou publicação.
- Registar auditoria: administrador, pedido, plano aprovado, ficheiros, branch, commit, PR, data e resultado. Não guardar tokens nem conversas completas sem política de retenção.
- Em erro parcial, parar, informar exactamente o que foi escrito e não afirmar que o PR foi criado.

## Configuração externa necessária

Antes de activar escritas reais, configurar no ambiente privado do backend:
- Credencial GitHub do backend (preferencialmente GitHub App com instalação limitada a este repositório e permissões de Contents: read/write e Pull requests: read/write; alternativamente um token fine-grained com escopo apenas neste repositório e permissões mínimas).
- GITHUB_REPOSITORY=yurimaike/meu-projeto-fullstarck.
- GITHUB_BASE_BRANCH: branch de referência aprovada para o trabalho do assistente.

O token não deve ser colocado em ficheiros .env versionados, código frontend ou mensagens do chat. Preferir GitHub App com permissões de conteúdo e Pull Requests limitadas ao repositório, quando disponível.

## Critérios de aceitação

- Um cliente autenticado como utilizador comum recebe 403 em todas as rotas do editor.
- Uma administradora pode conversar e refinar o pedido sem qualquer escrita no GitHub.
- O plano mostra caminhos e operações exactos.
- “Não” não cria branch, commit ou PR.
- “Sim” só executa o plano cujo hash foi apresentado e confirmado.
- O PR é criado numa branch separada e nunca é integrado automaticamente.
- A interface mostra links e estado reais devolvidos pelo GitHub; erros são apresentados sem alegar sucesso.
- Testes cobrem autorização, confirmação ausente/expirada/alterada, caminhos proibidos, falhas parciais e criação de PR.

## Ambientes de publicação do projecto

A arquitectura de publicação identificada para este projecto é:
- Cloudflare Pages: frontend público (`https://meu-projeto-fullstarck.pages.dev`) e previews de Pull Requests, se a integração GitHub estiver activa.
- Render: serviço backend/API. A configuração real do serviço e os seus domínios devem ser confirmados no painel Render antes de qualquer alteração.
- Turso: banco de dados SQLite/libSQL. Nunca executar migrações ou alterar dados de produção como parte de uma edição de conteúdo do site sem plano e aprovação próprios.
- GitHub: repositório, branches, commits e Pull Requests.

A publicação deve seguir esta ordem: branch -> Pull Request -> verificações automatizadas -> preview Cloudflare -> revisão humana -> merge autorizado -> deploy. Alterações que exigem backend ou schema também precisam de deploy coordenado no Render; migrações Turso exigem procedimento separado, backup e aprovação explícita. Não assumir que a integração Cloudflare/Render está configurada apenas porque o site público responde.

## Estado

Este documento define o contrato de produto e segurança. O chat administrativo usa a rota `/api/ai` protegida por `adminRoute`, mas a interface permanece explicitamente em modo consulta/planeamento. As rotas funcionais de planeamento/aprovação/execução e a interface de aprovação ainda não foram implementadas. O editor não está activo. A execução real ainda depende da implementação, de testes executados com sucesso, da configuração de credenciais GitHub no ambiente privado do backend e da confirmação da integração Cloudflare Pages/Render. Não considerar o editor activo nem publicar até todos os critérios de aceitação passarem.
