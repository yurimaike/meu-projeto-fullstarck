import { env } from "../_core/env";

const ADMIN_EMAILS = env.BOOKING_ADMIN_EMAILS;
type BookingMail = {
  bookingCode: string; customerName: string; customerEmail: string; customerPhone: string;
  bookingDate: string; bookingTime: string; service: string; status?: string; note?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

async function sendEmail(to: string[], subject: string, html: string) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.warn("[booking-email] E-mail não enviado: configure RESEND_API_KEY e EMAIL_FROM.");
    return false;
  }
  if (to.length === 0) {\n    console.warn("[booking-email] E-mail não enviado: destinatários não configurados.");\n    return false;\n  }\n  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html })
  });
  if (!response.ok) {
    console.error("[booking-email] Falha no provedor de e-mail", response.status, await response.text().catch(() => ""));
    return false;
  }
  return true;
}

function details(b: BookingMail) {
  return `<h2>Reserva ${escapeHtml(b.bookingCode)}</h2><p><b>Cliente:</b> ${escapeHtml(b.customerName)}</p><p><b>E-mail:</b> ${escapeHtml(b.customerEmail)}</p><p><b>WhatsApp:</b> ${escapeHtml(b.customerPhone)}</p><p><b>Serviço:</b> ${escapeHtml(b.service)}</p><p><b>Data:</b> ${escapeHtml(b.bookingDate)} às ${escapeHtml(b.bookingTime)}</p>`;
}

export async function notifyAdminsNewBooking(booking: BookingMail) {
  await sendEmail(ADMIN_EMAILS, `Nova solicitação de reserva — ${booking.bookingCode}`, `<h1>Nova reserva pendente</h1>${details(booking)}<p>Acesse o painel administrativo do site para aprovar ou rejeitar.</p>`);
}

export async function notifyBookingDecision(booking: BookingMail) {
  const status = booking.status === "confirmed" ? "aprovada" : booking.status === "rejected" ? "rejeitada" : "cancelada";
  const customerSubject = `Sua reserva foi ${status} — ${booking.bookingCode}`;
  const customerHtml = `<h1>Sua reserva foi ${status}</h1>${details(booking)}${booking.note ? `<p><b>Observação:</b> ${escapeHtml(booking.note)}</p>` : ""}<p>Em caso de dúvidas, entre em contacto pelo WhatsApp da profissional.</p>`;
  await Promise.all([
    sendEmail([booking.customerEmail], customerSubject, customerHtml),
    sendEmail(ADMIN_EMAILS, `Atualização de reserva ${status} — ${booking.bookingCode}`, `<h1>Reserva ${status}</h1>${details(booking)}${booking.note ? `<p><b>Observação:</b> ${escapeHtml(booking.note)}</p>` : ""}`)
  ]);
}
