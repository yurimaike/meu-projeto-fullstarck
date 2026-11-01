import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Clock3, Mail, Phone, RefreshCw, ShieldCheck, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { AdminGuard } from "@/components/auth/AdminGuard";
import SiteLayout from "../../site/SiteLayout";
import LeticiaAIChat from "@/components/admin/LeticiaAIChat";

type Booking = {
  id: string;
  bookingCode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  bookingDate: string;
  bookingTime: string;
  service: string;
  status: string;
  paymentStatus?: "paid" | "unpaid";
  completedAt?: string | null;
};
type LoyaltyReward = { id: string; customerEmail: string; customerName: string; cycleNumber: number; status: "earned" | "redeemed"; earnedAt: string; redeemedAt?: string | null; redeemedService?: string | null };
type LoyaltyData = { enabled: boolean; rewards: LoyaltyReward[]; customers: Array<{ customerEmail: string; customerName: string; completedPaid: number }> };
type Payload<T> = { ok: boolean; data?: T; error?: { message?: string } };

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Aprovada",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
};

function AdminContent() {
  const [items, setItems] = useState<Booking[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [loyalty, setLoyalty] = useState<LoyaltyData>({ enabled: false, rewards: [], customers: [] });
  const [serviceChoices] = useState(["Manicure e pedicure", "Esmaltação em gel", "Banho de gel", "Manutenção"]);
  const [redeemChoices, setRedeemChoices] = useState<Record<string, string>>({});
  const [redeemBookingChoices, setRedeemBookingChoices] = useState<Record<string, string>>({});

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const response = await apiFetch("/bookings/admin");
      const payload = await response.json() as Payload<{ bookings: Booking[] }>;
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Não foi possível carregar as reservas.");
      setItems(payload.data?.bookings ?? []);
      await refreshLoyalty();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao carregar reservas.");
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshLoyalty() {
    try {
      const response = await apiFetch("/loyalty/admin");
      const payload = await response.json() as Payload<LoyaltyData>;
      if (response.ok && payload.ok && payload.data) setLoyalty(payload.data);
    } catch { /* agenda continua disponível mesmo se o painel de fidelidade falhar */ }
  }

  useEffect(() => { void refresh(); }, []);

  async function decide(booking: Booking, action: "confirmed" | "rejected" | "cancelled") {
    setBusy(booking.id);
    setError("");
    try {
      const response = await apiFetch(`/bookings/${booking.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json() as Payload<unknown>;
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Não foi possível atualizar a reserva.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao atualizar reserva.");
    } finally {
      setBusy("");
    }
  }

  async function updateBookingFlag(booking: Booking, endpoint: "payment" | "completion", value: boolean) {
    setBusy(booking.id); setError("");
    try {
      const response = await apiFetch(`/loyalty/bookings/${booking.id}/${endpoint}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(endpoint === "payment" ? { paid: value } : { completed: value }) });
      const payload = await response.json() as Payload<unknown>;
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Não foi possível atualizar.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao atualizar."); }
    finally { setBusy(""); }
  }

  async function toggleLoyalty() {
    try {
      const response = await apiFetch("/loyalty/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !loyalty.enabled }) });
      const payload = await response.json() as Payload<{ enabled: boolean }>;
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Não foi possível alterar.");
      await refreshLoyalty();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao alterar fidelidade."); }
  }

  async function redeemReward(reward: LoyaltyReward) {
    const booking = items.find(item => item.id === redeemBookingChoices[reward.id] && item.customerEmail.toLowerCase() === reward.customerEmail.toLowerCase() && item.status === "confirmed");
    const service = redeemChoices[reward.id] || serviceChoices[0];
    if (!booking) { setError("Selecione uma reserva aprovada da mesma cliente para registrar o resgate."); return; }
    if (!window.confirm(`Confirmar resgate do bônus de ${reward.customerName} para o serviço ${service}?`)) return;
    try {
      const response = await apiFetch(`/loyalty/rewards/${reward.id}/redeem`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: booking.id, service }) });
      const payload = await response.json() as Payload<unknown>;
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Não foi possível resgatar.");
      await refreshLoyalty();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao resgatar bônus."); }
  }

  const visibleItems = useMemo(
    () => items.filter((booking) =>
      (!dateFilter || booking.bookingDate === dateFilter) &&
      (statusFilter === "all" || booking.status === statusFilter)
    ),
    [items, dateFilter, statusFilter],
  );
  const pendingCount = items.filter((booking) => booking.status === "pending").length;
  const confirmedCount = items.filter((booking) => booking.status === "confirmed").length;

  return (
    <SiteLayout title="Painel administrativo | Leticia" description="Gestão de reservas do estúdio Leticia Nail Designer">
      <main className="min-h-[70vh] bg-[#fbf5ed]">
        <div className="section-shell mx-auto max-w-6xl px-4 py-10 sm:py-14">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#e6d6c7] bg-white/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a765b]">
                <ShieldCheck size={14} /> Área protegida
              </div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-[#b17f65]">Painel administrativo</p>
              <h1 className="font-serif text-3xl text-[#493629] sm:text-4xl">Olá, equipe <em className="text-[#a77d60]">Leticia</em></h1>
              <p className="mt-2 max-w-xl text-sm text-[#806c5d]">Gerencie os pedidos de agendamento e acompanhe a agenda do estúdio.</p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d9c4b1] bg-white px-5 py-3 text-sm font-semibold text-[#705844] shadow-sm transition hover:bg-[#f5e9dd] disabled:opacity-60"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Atualizando..." : "Atualizar agenda"}
            </button>
          </div>

          <div className="mb-7 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#eadbce] bg-white p-5 shadow-[0_8px_24px_rgba(92,65,43,0.05)]">
              <p className="text-sm text-[#8c7767]">Total de reservas</p>
              <p className="mt-2 font-serif text-3xl text-[#493629]">{items.length}</p>
            </div>
            <div className="rounded-2xl border border-[#eadbce] bg-white p-5 shadow-[0_8px_24px_rgba(92,65,43,0.05)]">
              <p className="text-sm text-[#8c7767]">Aguardando aprovação</p>
              <p className="mt-2 font-serif text-3xl text-[#a66e45]">{pendingCount}</p>
            </div>
            <div className="rounded-2xl border border-[#eadbce] bg-white p-5 shadow-[0_8px_24px_rgba(92,65,43,0.05)]">
              <p className="text-sm text-[#8c7767]">Confirmadas</p>
              <p className="mt-2 font-serif text-3xl text-[#66816a]">{confirmedCount}</p>
            </div>
          </div>

          <section className="mb-7 rounded-3xl border border-[#e8d9cb] bg-white p-5 shadow-[0_12px_35px_rgba(92,65,43,0.06)] sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="font-serif text-2xl text-[#493629]">Fidelidade: a cada 8 atendimentos</h2><p className="mt-1 text-sm text-[#8c7767]">Somente atendimentos pagos e concluídos contam. O bônus dá direito a um serviço cadastrado.</p></div>
              <button type="button" onClick={() => void toggleLoyalty()} className={`rounded-full px-5 py-2.5 text-sm font-semibold ${loyalty.enabled ? "bg-[#6d8267] text-white" : "border border-[#d9c4b1] bg-white text-[#705844]"}`}>{loyalty.enabled ? "Programa ativado · Desativar" : "Programa desativado · Ativar"}</button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#fbf6f0] p-4"><p className="text-sm text-[#8c7767]">Bônus disponíveis</p><p className="mt-1 font-serif text-3xl text-[#493629]">{loyalty.rewards.filter(r => r.status === "earned").length}</p></div><div className="rounded-2xl bg-[#fbf6f0] p-4"><p className="text-sm text-[#8c7767]">Bônus já utilizados</p><p className="mt-1 font-serif text-3xl text-[#493629]">{loyalty.rewards.filter(r => r.status === "redeemed").length}</p></div></div>
            <div className="mt-5 space-y-3">{loyalty.rewards.map(reward => <div key={reward.id} className="flex flex-col gap-3 rounded-xl border border-[#eaded3] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-[#493629]">{reward.customerName}</p><p className="text-xs text-[#8c7767]">{reward.customerEmail} · Ciclo {reward.cycleNumber} · {reward.status === "earned" ? "Bônus disponível" : `Utilizado: ${reward.redeemedService ?? "serviço"}`}</p></div>{reward.status === "earned" && <div className="flex flex-wrap gap-2"><select aria-label={`Reserva para resgate de ${reward.customerName}`} value={redeemBookingChoices[reward.id] || ""} onChange={event => setRedeemBookingChoices(old => ({ ...old, [reward.id]: event.target.value }))} className="rounded-xl border border-[#dfcdbd] bg-white px-3 py-2 text-sm text-[#493629]"><option value="">Escolher reserva aprovada</option>{items.filter(item => item.customerEmail.toLowerCase() === reward.customerEmail.toLowerCase() && item.status === "confirmed").map(item => <option key={item.id} value={item.id}>{item.bookingDate} · {item.bookingTime} · {item.service}</option>)}</select><select aria-label={`Serviço gratuito de ${reward.customerName}`} value={redeemChoices[reward.id] || serviceChoices[0]} onChange={event => setRedeemChoices(old => ({ ...old, [reward.id]: event.target.value }))} className="rounded-xl border border-[#dfcdbd] bg-white px-3 py-2 text-sm text-[#493629]">{serviceChoices.map(service => <option key={service}>{service}</option>)}</select><button type="button" onClick={() => void redeemReward(reward)} className="rounded-full bg-[#6d8267] px-4 py-2 text-sm font-semibold text-white">Confirmar resgate</button></div>}</div>)}</div>
          </section>

          <section className="rounded-3xl border border-[#e8d9cb] bg-white p-5 shadow-[0_12px_35px_rgba(92,65,43,0.06)] sm:p-7">
            <div className="mb-6 flex flex-col gap-1">
              <h2 className="font-serif text-2xl text-[#493629]">Reservas recebidas</h2>
              <p className="text-sm text-[#8c7767]">Yuri e Letícia têm acesso administrativo com as mesmas permissões.</p>
            </div>

            <div className="mb-6 grid gap-3 rounded-2xl bg-[#fbf6f0] p-4 sm:grid-cols-[1fr_1fr]">
              <label className="grid gap-2 text-sm font-medium text-[#705844]">
                Filtrar por data
                <span className="relative">
                  <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a1846c]" />
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(event) => setDateFilter(event.target.value)}
                    className="w-full rounded-xl border border-[#dfcdbd] bg-white py-2.5 pl-10 pr-3 text-sm text-[#493629] outline-none focus:border-[#a77d60] focus:ring-2 focus:ring-[#a77d60]/15"
                  />
                </span>
              </label>
              <label className="grid gap-2 text-sm font-medium text-[#705844]">
                Estado da reserva
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="w-full rounded-xl border border-[#dfcdbd] bg-white px-3 py-2.5 text-sm text-[#493629] outline-none focus:border-[#a77d60] focus:ring-2 focus:ring-[#a77d60]/15"
                >
                  <option value="all">Todos os estados</option>
                  <option value="pending">Pendentes</option>
                  <option value="confirmed">Aprovadas</option>
                  <option value="rejected">Rejeitadas</option>
                  <option value="cancelled">Canceladas</option>
                </select>
              </label>
            </div>

            {error && <p role="alert" className="mb-5 rounded-xl border border-[#e7b9ad] bg-[#fff1ed] px-4 py-3 text-sm text-[#914b40]">{error}</p>}

            <div className="grid gap-4">
              {visibleItems.map((booking) => {
                const status = booking.status;
                const statusStyle = status === "confirmed"
                  ? "bg-[#edf4ed] text-[#547357] border-[#d8e6d8]"
                  : status === "pending"
                    ? "bg-[#fff5e8] text-[#9a6a35] border-[#f0dfc5]"
                    : "bg-[#f3efeb] text-[#806f62] border-[#e6ddd5]";
                return (
                  <article key={booking.id} className="rounded-2xl border border-[#eaded3] bg-white p-5 transition hover:border-[#d8c2ae] hover:shadow-[0_8px_24px_rgba(92,65,43,0.06)] sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-[#493629]">{booking.customerName}</h3>
                        <p className="mt-1 text-xs text-[#9a8574]">Código: {booking.bookingCode}</p>
                      </div>
                      <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle}`}>
                        {statusLabels[status] ?? status}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-3 text-sm text-[#705f51] sm:grid-cols-2">
                      <div className="flex items-center gap-2"><CalendarDays size={16} className="shrink-0 text-[#a1846c]" /> {booking.bookingDate}</div>
                      <div className="flex items-center gap-2"><Clock3 size={16} className="shrink-0 text-[#a1846c]" /> {booking.bookingTime}</div>
                      <div className="sm:col-span-2"><span className="font-semibold text-[#493629]">Serviço:</span> {booking.service}</div>
                      <div className="flex min-w-0 items-center gap-2"><Mail size={16} className="shrink-0 text-[#a1846c]" /><span className="truncate">{booking.customerEmail}</span></div>
                      <div className="flex items-center gap-2"><Phone size={16} className="shrink-0 text-[#a1846c]" /> {booking.customerPhone}</div>
                    </div>

                    <div className="mt-4 rounded-xl bg-[#fbf6f0] p-4 text-sm text-[#705f51]">
                      <p>Pagamento: <strong>{booking.paymentStatus === "paid" ? "Recebido" : "Não recebido"}</strong></p>
                      <p className="mt-1">Atendimento: <strong>{booking.completedAt ? "Concluído" : "Não concluído"}</strong></p>
                      {status !== "rejected" && status !== "cancelled" && <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!!busy} onClick={() => void updateBookingFlag(booking, "payment", booking.paymentStatus !== "paid")} className="rounded-full border border-[#d9c4b1] bg-white px-4 py-2 text-xs font-semibold text-[#705844] disabled:opacity-50">{booking.paymentStatus === "paid" ? "Marcar não recebido" : "Confirmar pagamento"}</button><button type="button" disabled={!!busy || (booking.paymentStatus !== "paid" && !booking.completedAt)} onClick={() => void updateBookingFlag(booking, "completion", !booking.completedAt)} className="rounded-full border border-[#d9c4b1] bg-white px-4 py-2 text-xs font-semibold text-[#705844] disabled:opacity-50">{booking.completedAt ? "Reabrir atendimento" : "Marcar concluído"}</button></div>}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2 border-t border-[#f0e7df] pt-4">
                      {status === "pending" && <>
                        <button type="button" disabled={!!busy} onClick={() => void decide(booking, "confirmed")} className="inline-flex items-center gap-2 rounded-full bg-[#6d8267] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#586e53] disabled:opacity-50">
                          <Check size={16} /> {busy === booking.id ? "Salvando..." : "Aprovar reserva"}
                        </button>
                        <button type="button" disabled={!!busy} onClick={() => void decide(booking, "rejected")} className="inline-flex items-center gap-2 rounded-full border border-[#e3c8c0] bg-white px-4 py-2.5 text-sm font-semibold text-[#9b594c] transition hover:bg-[#fff3f0] disabled:opacity-50">
                          <X size={16} /> Rejeitar
                        </button>
                      </>}
                      {status === "confirmed" && (
                        <button type="button" disabled={!!busy} onClick={() => void decide(booking, "cancelled")} className="rounded-full border border-[#e3c8c0] bg-white px-4 py-2.5 text-sm font-semibold text-[#9b594c] hover:bg-[#fff3f0] disabled:opacity-50">
                          Cancelar reserva
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
              {visibleItems.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[#dfcdbd] bg-[#fdfaf7] px-5 py-12 text-center">
                  <CalendarDays size={28} className="mx-auto mb-3 text-[#b99c83]" />
                  <p className="font-medium text-[#705844]">Nenhuma reserva encontrada</p>
                  <p className="mt-1 text-sm text-[#9a8574]">Altere os filtros ou atualize a agenda.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
      <LeticiaAIChat />
    </SiteLayout>
  );
}

export default function AdminPage() {
  return <AdminGuard><AdminContent /></AdminGuard>;
}
