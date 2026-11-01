# Configuração do sistema de reservas

## Administradores

O cadastro em `/auth` exige que o e-mail já esteja na lista `authorized_emails`. Por isso, a configuração inicial de cada administrador deve ser feita por um operador com acesso seguro ao banco, antes de a pessoa criar a conta:

1. Aplique as migrations do servidor, incluindo `002_authorized_emails.sql`.
2. Insira os e-mails administrativos aprovados na lista de autorização. Substitua os exemplos abaixo por endereços reais, fora do repositório público:
   ```sql
   INSERT INTO authorized_emails (email, createdBy, createdAt)
   VALUES
     ('admin1@example.com', 'bootstrap', unixepoch()),
     ('admin2@example.com', 'bootstrap', unixepoch())
   ON CONFLICT(email) DO NOTHING;
   ```
3. Cada administrador cria a própria conta pela página `/auth`, usando exatamente o e-mail autorizado.
4. Depois de confirmar que as contas existem, o operador promove-as para administradoras:
   ```sql
   UPDATE user SET role = 'admin'
   WHERE lower(email) IN ('admin1@example.com', 'admin2@example.com');
   ```
5. Confirme que os administradores conseguem entrar em `/admin`.

Apenas contas autorizadas podem criar conta e iniciar sessão. Apenas utilizadores com papel `admin` podem gerir a lista de e-mails autorizados. Guarde os endereços administrativos e o acesso ao banco em local privado; não publique credenciais nem compartilhe senhas.

## Reservas

A migration `apps/server/migrations/004_bookings.sql` cria a tabela de reservas. O formulário coleta nome, e-mail e WhatsApp, além do serviço/data/horário. Cada pedido recebe código de referência e inicia como `pending`. O horário fica indisponível enquanto estiver pendente ou aprovado. O painel administrativo permite aprovar, rejeitar e cancelar.

## Notificações por e-mail

O código-base deste projeto só oferece envio de e-mail transacional por templates predefinidos do gateway da plataforma (ver `apps/server/services/message.ts`). Não há no ZIP um template documentado para notificação de reserva, nem credenciais/configuração que permitam garantir entrega. Portanto, este pacote ainda não envia e-mails automáticos. Antes de ativar essa função, configure um provedor/template transacional aprovado e teste a entrega para os dois administradores e para o cliente. Não coloque chaves em arquivos versionados.

## Calendário

A lista administrativa mostra todas as reservas e seus estados. A sincronização externa com Google Calendar não está configurada neste pacote; requer credenciais OAuth e autorização da conta de calendário.
