# Configuração do sistema de reservas

## Administradores

Os administradores devem criar as suas contas pela página `/auth`. Para proteger a privacidade, os e-mails administrativos não são publicados neste documento. Um operador autorizado deve executar o SQL de promoção usando os endereços aprovados, guardados fora do repositório público:

```sql
-- Substitua pelos e-mails administrativos autorizados, fora do repositório público.\nUPDATE user SET role = 'admin' WHERE lower(email) IN ('admin1@example.com', 'admin2@example.com');
```

Os dois endereços recebem permissões equivalentes no painel `/admin`. Não existe cadastro público de administradores e não se deve compartilhar senhas.

## Reservas

A migration `apps/server/migrations/004_bookings.sql` cria a tabela de reservas. O formulário coleta nome, e-mail e WhatsApp, além do serviço/data/horário. Cada pedido recebe código de referência e inicia como `pending`. O horário fica indisponível enquanto estiver pendente ou aprovado. O painel administrativo permite aprovar, rejeitar e cancelar.

## Notificações por e-mail

O código-base deste projeto só oferece envio de e-mail transacional por templates predefinidos do gateway da plataforma (ver `apps/server/services/message.ts`). Não há no ZIP um template documentado para notificação de reserva, nem credenciais/configuração que permitam garantir entrega. Portanto, este pacote ainda não envia e-mails automáticos. Antes de ativar essa função, configure um provedor/template transacional aprovado e teste a entrega para os dois administradores e para o cliente. Não coloque chaves em arquivos versionados.

## Calendário

A lista administrativa mostra todas as reservas e seus estados. A sincronização externa com Google Calendar não está configurada neste pacote; requer credenciais OAuth e autorização da conta de calendário.
