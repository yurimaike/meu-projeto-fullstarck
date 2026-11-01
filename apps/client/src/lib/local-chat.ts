const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

export function localCustomerReply(message: string) {
  const text = normalized(message);

  if (text.includes("whatsapp") || text.includes("contato") || text.includes("contacto")) {
    return "Você pode falar diretamente pelo WhatsApp no número (51) 99890-1388. O botão WhatsApp do site abre a conversa com uma mensagem pronta.";
  }
  if (text.includes("horario") || text.includes("agenda") || text.includes("agendar")) {
    return "Para agendar, abra a página Agenda, escolha o serviço, a data e um horário disponível. A confirmação é mostrada ao final e você pode acompanhar a reserva em Minhas reservas.";
  }
  if (text.includes("preco") || text.includes("servico") || text.includes("valor")) {
    return "A página Serviços apresenta os procedimentos. Os valores estão sob consulta: confirme com a Letícia pelo WhatsApp antes de agendar.";
  }
  if (text.includes("cancel")) {
    return "As regras de cancelamento aparecem na sua reserva. Se precisar de ajuda com uma situação específica, informe o código da reserva pelo WhatsApp.";
  }
  return "Posso ajudar com serviços, horários, agendamento, cancelamento e contato. Escolha uma das opções rápidas ou fale conosco pelo WhatsApp.";
}

export function localAdminReply(message: string) {
  const text = normalized(message);

  if (text.includes("reserva") || text.includes("agenda")) {
    return "Use Agendamentos para filtrar por data e estado. As ações de aprovar, rejeitar e cancelar são protegidas pelo servidor e só aparecem para administradores.";
  }
  if (text.includes("servico") || text.includes("preco")) {
    return "Os serviços e preços devem ser geridos no painel quando essa seção estiver habilitada. Não altere valores pelo navegador ou por APIs sem autorização.";
  }
  if (text.includes("senha") || text.includes("segur")) {
    return "Nunca compartilhe senhas ou tokens. Saia do painel ao terminar e peça ao proprietário para criar ou revogar acessos administrativos.";
  }
  if (text.includes("backup") || text.includes("banco")) {
    return "Faça um backup verificável antes de qualquer migração. Migrações de produção exigem identificação do banco, cópia recuperável e autorização específica.";
  }
  return "Posso orientar sobre agenda, reservas, serviços, segurança e backups. As alterações reais continuam dependendo das permissões do painel e de confirmação do proprietário.";
}
