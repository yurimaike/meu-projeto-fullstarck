import { env } from "../_core/env";

export type SendEmailInput = {
  email: string;
  code: string;
  expiresInMinutes: number;
  siteName?: string;
  locale?: string;
};

export class MessageServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number
  ) {
    super(message);
    this.name = "MessageServiceError";
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char] ?? char;
  });
}

export async function sendEmailVerificationCode(input: SendEmailInput) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new MessageServiceError(
      "RESEND_API_KEY and EMAIL_FROM must be configured",
      500
    );
  }

  const siteName = input.siteName ?? "Letícia Nail Designer";
  const safeSiteName = escapeHtml(siteName);
  const safeCode = escapeHtml(input.code);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.email],
      subject: `Seu código de verificação - ${siteName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#705844">
          <h2>${safeSiteName}</h2>
          <p>Seu código de verificação é:</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:20px;background:#f4e8dc;text-align:center;border-radius:12px">
            ${safeCode}
          </div>
          <p>Este código expira em ${input.expiresInMinutes} minutos.</p>
          <p>Se você não solicitou este código, ignore esta mensagem.</p>
        </div>
      `
    })
  });

  let responseBody: { id?: string; message?: string } | null = null;

  try {
    responseBody = await response.json() as {
      id?: string;
      message?: string;
    };
  } catch {
    // Resposta sem JSON.
  }

  if (!response.ok) {
    throw new MessageServiceError(
      responseBody?.message || "Resend failed to send email",
      response.status
    );
  }

  return responseBody;
}

export async function sendGuestBookingAccessCode(email: string, code: string) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new MessageServiceError("Email delivery is not configured", 503);
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email],
      subject: "Código para consultar suas reservas — Letícia Nail Designer",
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#705844"><h2>Letícia Nail Designer</h2><p>Seu código para consultar reservas é:</p><div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:20px;background:#f4e8dc;text-align:center;border-radius:12px">${escapeHtml(code)}</div><p>O código expira em 10 minutos e pode ser usado uma única vez.</p><p>Se você não pediu esse código, ignore esta mensagem.</p></div>`
    }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new MessageServiceError("Email delivery failed", 502);
}

export type SendPasswordResetEmailInput = {
  email: string;
  url: string;
  siteName?: string;
};

export async function sendPasswordResetEmail(input: SendPasswordResetEmailInput) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new MessageServiceError(
      "RESEND_API_KEY and EMAIL_FROM must be configured",
      500
    );
  }

  const siteName = input.siteName ?? "Letícia Nail Designer";
  const safeSiteName = escapeHtml(siteName);
  const safeUrl = escapeHtml(input.url);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.email],
      subject: `Recuperação de senha - ${siteName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#705844">
          <h2>${safeSiteName}</h2>
          <p>Recebemos uma solicitação para redefinir sua senha.</p>
          <p><a href="${safeUrl}" style="display:inline-block;padding:14px 24px;background:#705844;color:white;text-decoration:none;border-radius:8px">Criar nova senha</a></p>
          <p>Este link expira em 1 hora.</p>
          <p>Se você não solicitou a recuperação, ignore este e-mail.</p>
        </div>
      `
    })
  });

  let responseBody: { id?: string; message?: string } | null = null;

  try {
    responseBody = await response.json() as {
      id?: string;
      message?: string;
    };
  } catch {
    // Resposta sem JSON.
  }

  if (!response.ok) {
    throw new MessageServiceError(
      responseBody?.message || "Resend failed to send password reset email",
      response.status
    );
  }

  return responseBody;
}
