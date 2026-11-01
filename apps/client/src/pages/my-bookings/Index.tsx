import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { authClient } from "@/lib/auth";
import SiteLayout from "@/site/SiteLayout";
import { whatsappLink } from "@/site/siteData";

type CustomerBooking = {
  id: string;
  bookingDate: string;
  bookingTime: string;
  service: string;
  status: "pending" | "confirmed" | "rejected" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

type ApiPayload = {
  ok?: boolean;
  data?: { bookings?: CustomerBooking[]; message?: string };
  error?: { message?: string };
};

const statusLabel: Record<CustomerBooking["status"], string> = {
  pending: "Aguardando confirmação",
  confirmed: "Confirmada",
  rejected: "Não confirmada",
  cancelled: "Cancelada"
};

function dateLabel(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(parsed);
}

export default function MyBookingsPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isVerifiedAccount = Boolean(session?.user?.emailVerified);
  const [accountBookings, setAccountBookings] = useState<CustomerBooking[]>([]);
  const [guestBookings, setGuestBookings] = useState<CustomerBooking[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!isVerifiedAccount) return;
    let active = true;
    setLoading(true);
    void apiFetch("/bookings/mine", { silent: true })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as ApiPayload | null;
        if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message ?? "Não foi possível carregar suas reservas.");
        if (active) setAccountBookings(payload.data?.bookings ?? []);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar suas reservas.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isVerifiedAccount, session?.user?.id]);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/bookings/guest-access/request-code", {
        method: "POST", auth: false, silent: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const payload = (await response.json().catch(() => null)) as ApiPayload | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message ?? "Não foi possível enviar o código.");
      setCodeSent(true);
      setNotice("Se houver reservas para esse endereço, enviaremos um código. Confira sua caixa de entrada e o spam.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar o código.");
    } finally {
      setSending(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const response = await apiFetch("/bookings/guest-access/verify-code", {
        method: "POST", auth: false, silent: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code })
      });
      const payload = (await response.json().catch(() => null)) as ApiPayload | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message ?? "O código não é válido.");
      setGuestBookings(payload.data?.bookings ?? []);
      setCode("");
      setNotice("Acesso confirmado. Esta consulta fica nesta página até você sair ou atualizá-la.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "O código não é válido.");
    } finally {
      setSending(false);
    }
  }

  const bookings = isVerifiedAccount ? accountBookings : guestBookings;
  const shouldLoad = sessionPending || (isVerifiedAccount && loading);

  return (
    <SiteLayout title="Minhas reservas | Letícia" description="Consulte suas reservas de atendimento.">
      <main className="section-shell min-h-[60vh] py-16 md:py-24">
        <div className="mx-auto max-w-3xl">
          <p className="eyebrow">Área da cliente</p>
          <h1 className="mt-3 font-display text-4xl text-foreground md:text-5xl">Minhas reservas</h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Entre com uma conta cujo e-mail foi verificado ou confirme por código o endereço usado no agendamento.
          </p>

          {!sessionPending && !isVerifiedAccount && guestBookings === null && (
            <section className="mt-8 rounded-2xl border border-border bg-card p-6 md:p-8">
              <h2 className="font-display text-2xl">Consultar como visitante</h2>
              <p className="mt-2 text-sm text-muted-foreground">Enviaremos um código de uso único ao e-mail informado. O código expira em 10 minutos.</p>
              <form className="mt-6 grid gap-4" onSubmit={codeSent ? verifyCode : requestCode}>
                <label className="grid gap-2 text-sm font-medium" htmlFor="booking-history-email">
                  E-mail usado no agendamento
                  <input id="booking-history-email" className="min-h-12 rounded-xl border border-input bg-background px-4" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
                </label>
                {codeSent && (
                  <label className="grid gap-2 text-sm font-medium" htmlFor="booking-history-code">
                    Código de seis dígitos
                    <input id="booking-history-code" className="min-h-12 rounded-xl border border-input bg-background px-4 tracking-[0.4em]" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
                  </label>
                )}
                <div className="flex flex-wrap gap-3">
                  <button className="min-h-12 rounded-full bg-primary px-6 text-primary-foreground disabled:opacity-60" type="submit" disabled={sending}>
                    {sending ? "Aguarde…" : codeSent ? "Confirmar código" : "Enviar código"}
                  </button>
                  {codeSent && <button className="min-h-12 rounded-full border border-border px-5" type="button" disabled={sending} onClick={() => { setCodeSent(false); setCode(""); setNotice(""); }}>Usar outro e-mail</button>}
                </div>
              </form>
              {!session?.user && <p className="mt-5 text-sm text-muted-foreground">Também pode <Link className="text-primary underline" to="/auth">entrar ou criar uma conta</Link> e verificar seu e-mail.</p>}
            </section>
          )}

          {notice && <p className="mt-6 rounded-xl bg-secondary p-4 text-sm text-secondary-foreground" role="status">{notice}</p>}
          {error && <p className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive" role="alert">{error}</p>}
          {shouldLoad && <p className="mt-10" role="status">Carregando suas reservas…</p>}
          {!shouldLoad && bookings !== null && bookings.length === 0 && (
            <section className="mt-8 rounded-2xl border border-border bg-card p-7 md:p-9">
              <h2 className="font-display text-2xl">Nenhuma reserva encontrada</h2>
              <p className="mt-2 text-muted-foreground">Confira o endereço usado ao agendar ou faça uma nova reserva.</p>
              <Link className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 text-primary-foreground" to="/agenda">Agendar horário</Link>
            </section>
          )}

          {!shouldLoad && bookings && bookings.length > 0 && (
            <div className="mt-8 grid gap-4">
              {bookings.map((booking) => (
                <article key={booking.id} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-xl">{booking.service}</h2>
                      <p className="mt-2 text-muted-foreground">{dateLabel(booking.bookingDate)} · {booking.bookingTime}</p>
                    </div>
                    <span className="rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground">{statusLabel[booking.status]}</span>
                  </div>
                  {booking.status === "pending" || booking.status === "confirmed" ? (
                    <a className="mt-5 inline-flex min-h-11 items-center rounded-full border border-primary/30 px-5 text-sm text-primary hover:bg-primary/5" href={whatsappLink(`Olá, gostaria de solicitar o cancelamento do meu horário de ${booking.service}, em ${dateLabel(booking.bookingDate)} às ${booking.bookingTime}.`)} target="_blank" rel="noreferrer">
                      Solicitar cancelamento pelo WhatsApp
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </SiteLayout>
  );
}
