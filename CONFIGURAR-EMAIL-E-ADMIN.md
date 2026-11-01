# Configuração do painel e dos e-mails — Letícia

## Painel administrativo

As contas administrativas devem existir primeiro por meio do cadastro normal. Por privacidade, não publique os e-mails reais dos administradores. No banco SQLite/LibSQL de produção, um operador autorizado deve substituir os endereços de exemplo abaixo pelos endereços aprovados, sem guardar os reais neste documento público:

```sql
UPDATE user SET role = 'admin' WHERE lower(email) IN (
  'admin1@example.com',
  'admin2@example.com'
);
```

Confirme que as duas contas foram encontradas:

```sql
SELECT id, name, email, role FROM user
WHERE lower(email) IN ('admin1@example.com', 'admin2@example.com');
```

Se uma conta ainda não existir, ela precisa criar a conta primeiro; depois execute novamente o UPDATE. Não compartilhe senhas no código ou neste arquivo.

## Autorização de cadastro de clientes, funcionários e familiares

No painel administrativo, a secção **E-mails autorizados** permite adicionar ou remover endereços. O administrador deve inserir o endereço original da pessoa antes de ela criar uma conta. O cadastro por e-mail e senha só aceita endereços previamente autorizados; a comparação ignora maiúsculas e minúsculas. O fluxo de criação de conta pelo Google aplica a mesma regra.

Remover uma autorização bloqueia novos cadastros e também impede novos logins por e-mail e senha ou Google. Sessões já abertas deixam de conseguir aceder às rotas protegidas assim que a autorização é removida. A conta já criada não é apagada; fica sem acesso até que o administrador volte a autorizar o endereço. Apenas utilizadores com papel `admin` podem consultar ou alterar a lista.

A migration `apps/server/migrations/002_authorized_emails.sql` cria a lista de autorizações. A primeira conta administrativa continua a ser promovida por um operador autorizado, conforme a secção acima; depois disso, os administradores gerem os e-mails pelo painel.

## E-mails automáticos

O projeto está preparado para enviar e-mails pelo serviço Resend. Configure estas variáveis no ambiente do backend (Render):

- `RESEND_API_KEY`: chave privada criada na conta Resend.
- `EMAIL_FROM`: remetente verificado no Resend, por exemplo `Agenda Letícia <agenda@seudominio.com>`.
- `BOOKING_ADMIN_EMAILS`: e-mails dos destinatários das notificações de reservas, separados por vírgulas; configure apenas no ambiente privado do backend.

Sem as variáveis necessárias configuradas (`RESEND_API_KEY`, `EMAIL_FROM` e `BOOKING_ADMIN_EMAILS`), reservas e decisões continuam a ser gravadas, mas as notificações por e-mail podem não ser enviadas. O backend regista um aviso no log. A chave Resend nunca deve ser colocada no frontend.

Com o provedor configurado:

- Nova solicitação: notifica os dois administradores.
- Aprovação, rejeição ou cancelamento: notifica o cliente e os dois administradores.

## Funcionalidades e limites

- O cliente solicita uma reserva e recebe um código único.
- O horário fica bloqueado enquanto estiver pendente ou aprovado.
- Os administradores aprovam, rejeitam ou cancelam pelo painel `/admin`.
- O painel exige login e papel `admin` no banco.
- A agenda interna usa os dados persistidos no backend.

Antes de produção, faça uma reserva de teste e valide os e-mails. A sincronização com Google Calendar não está activada neste pacote. Nenhum deploy é feito automaticamente por este arquivo.
