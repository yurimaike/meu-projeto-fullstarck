# Configuração do painel e dos e-mails — Letícia

## Painel administrativo

As contas administrativas devem existir primeiro por meio do cadastro normal. Por privacidade, não publique os e-mails reais dos administradores. No banco SQLite/LibSQL de produção, um operador autorizado deve substituir os endereços de exemplo abaixo pelos endereços aprovados, sem guardar os reais neste documento público:

```sql
UPDATE user SET role = 'admin' WHERE lower(email) IN (
  'yurimaike123@gmail.com',
  'leticia.silvalb.11296@gmail.com'
);
```

Confirme que as duas contas foram encontradas:

```sql
SELECT id, name, email, role FROM user
WHERE lower(email) IN ('admin1@example.com', 'admin2@example.com');
```

Se uma conta ainda não existir, ela precisa criar a conta primeiro; depois execute novamente o UPDATE. Não compartilhe senhas no código ou neste arquivo.

## E-mails automáticos

O projeto está preparado para enviar e-mails pelo serviço Resend. Configure estas variáveis no ambiente do backend (Render):

- `RESEND_API_KEY`: chave privada criada na conta Resend.
- `EMAIL_FROM`: remetente verificado no Resend, por exemplo `Agenda Letícia <agenda@seudominio.com>`.\n- `BOOKING_ADMIN_EMAILS`: e-mails dos destinatários das notificações de reservas, separados por vírgulas; configure apenas no ambiente privado do backend.

Sem essas duas variáveis, reservas e decisões continuam a ser gravadas, mas os e-mails não são enviados. O backend regista um aviso no log. A chave Resend nunca deve ser colocada no frontend.

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
