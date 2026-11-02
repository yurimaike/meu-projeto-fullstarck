import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";

type ApiPayload<T> = { ok: boolean; data?: T; error?: { message?: string } };
type Booking = { id: string; customerName: string; customerEmail: string; bookingDate: string; service: string; status: string; paymentStatus?: string };
type Transaction = { id: string; type: "income" | "expense"; amountCents: number; category: string; description: string; transactionDate: string; bookingId?: string | null };
type FinanceData = { incomeCents: number; expenseCents: number; balanceCents: number; transactions: Transaction[] };

const today = () => new Date().toISOString().slice(0, 10);
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const parseAmount = (value: string) => Math.round(Number(value.replace(",", ".")) * 100);

export default function FinancePanel() {
  const [data, setData] = useState<FinanceData>({ incomeCents: 0, expenseCents: 0, balanceCents: 0, transactions: [] });
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [from, setFrom] = useState(() => today().slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Materiais");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(today);
  const [bookingId, setBookingId] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [financeResponse, bookingResponse] = await Promise.all([
      apiFetch(`/finance?from=${from}&to=${to}`),
      apiFetch("/bookings/admin")
    ]);
    const finance = await financeResponse.json() as ApiPayload<FinanceData>;
    const bookingPayload = await bookingResponse.json() as ApiPayload<{ bookings: Booking[] }>;
    if (!financeResponse.ok || !finance.ok || !finance.data) throw new Error(finance.error?.message ?? "Não foi possível carregar o financeiro.");
    if (!bookingResponse.ok || !bookingPayload.ok) throw new Error(bookingPayload.error?.message ?? "Não foi possível carregar as reservas.");
    setData(finance.data);
    setBookings(bookingPayload.data?.bookings ?? []);
  }

  useEffect(() => { void refresh().catch(cause => setError(cause instanceof Error ? cause.message : "Erro ao carregar financeiro.")); }, [from, to]);

  const eligibleBookings = useMemo(() => bookings.filter(booking =>
    booking.status === "confirmed" && booking.paymentStatus === "paid" &&
    !data.transactions.some(transaction => transaction.bookingId === booking.id)
  ), [bookings, data.transactions]);

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const amountCents = parseAmount(amount);
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("Informe um valor válido maior que zero.");
      const response = await apiFetch("/finance/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountCents, category, description, transactionDate: date }) });
      const payload = await response.json() as ApiPayload<unknown>;
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Não foi possível registrar a despesa.");
      setAmount(""); setDescription(""); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao registrar despesa."); }
    finally { setBusy(false); }
  }

  async function submitIncome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const amountCents = parseAmount(incomeAmount);
      if (!bookingId || !Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("Selecione uma reserva e informe o valor realmente recebido.");
      const response = await apiFetch(`/finance/bookings/${bookingId}/income`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountCents, transactionDate: date }) });
      const payload = await response.json() as ApiPayload<unknown>;
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Não foi possível registrar a receita.");
      setBookingId(""); setIncomeAmount(""); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao registrar receita."); }
    finally { setBusy(false); }
  }

  function exportCsv() {
    const rows = [["Data","Tipo","Categoria","Descrição","Valor (R$)"], ...data.transactions.map(item => [item.transactionDate, item.type === "income" ? "Receita" : "Despesa", item.category, item.description, (item.amountCents / 100).toFixed(2).replace(".", ",")])];
    const csv = "\uFEFF" + rows.map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "leticia-salon-financeiro.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return <section className="mb-7 rounded-3xl border border-[#e8d9cb] bg-white p-5 shadow-[0_12px_35px_rgba(92,65,43,0.06)] sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-serif text-2xl text-[#493629]">Financeiro</h2><p className="mt-1 text-sm text-[#8c7767]">Somente valores realmente recebidos e despesas lançadas pela administração.</p></div><button type="button" onClick={exportCsv} className="rounded-full border border-[#d9c4b1] px-4 py-2 text-sm font-semibold text-[#705844]">Exportar CSV / Excel</button></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl bg-[#f3f7f1] p-4"><p className="text-sm text-[#66816a]">Receitas recebidas</p><p className="mt-1 font-serif text-2xl text-[#493629]">{money(data.incomeCents)}</p></div>
      <div className="rounded-2xl bg-[#fff5ee] p-4"><p className="text-sm text-[#9a6a50]">Despesas</p><p className="mt-1 font-serif text-2xl text-[#493629]">{money(data.expenseCents)}</p></div>
      <div className="rounded-2xl bg-[#fbf6f0] p-4"><p className="text-sm text-[#8c7767]">Saldo do período</p><p className="mt-1 font-serif text-2xl text-[#493629]">{money(data.balanceCents)}</p></div>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm text-[#705844]">De <input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 w-full rounded-xl border border-[#dfcdbd] px-3 py-2"/></label><label className="text-sm text-[#705844]">Até <input type="date" value={to} onChange={event => setTo(event.target.value)} className="mt-1 w-full rounded-xl border border-[#dfcdbd] px-3 py-2"/></label></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <form onSubmit={submitIncome} className="space-y-3 rounded-2xl bg-[#fbf6f0] p-4"><h3 className="font-semibold text-[#493629]">Registrar receita de atendimento</h3><p className="text-xs text-[#8c7767]">A reserva precisa estar aprovada e marcada como paga. O valor é informado manualmente.</p><select required value={bookingId} onChange={event => setBookingId(event.target.value)} className="w-full rounded-xl border border-[#dfcdbd] bg-white px-3 py-2 text-sm"><option value="">Selecione atendimento pago ainda não lançado</option>{eligibleBookings.map(booking => <option key={booking.id} value={booking.id}>{booking.bookingDate} · {booking.customerName} · {booking.service}</option>)}</select><input required inputMode="decimal" placeholder="Valor recebido (ex.: 85,00)" value={incomeAmount} onChange={event => setIncomeAmount(event.target.value)} className="w-full rounded-xl border border-[#dfcdbd] bg-white px-3 py-2 text-sm"/><button disabled={busy} className="rounded-full bg-[#6d8267] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Registrar receita</button></form>
      <form onSubmit={submitExpense} className="space-y-3 rounded-2xl bg-[#fbf6f0] p-4"><h3 className="font-semibold text-[#493629]">Registrar despesa</h3><select value={category} onChange={event => setCategory(event.target.value)} className="w-full rounded-xl border border-[#dfcdbd] bg-white px-3 py-2 text-sm"><option>Materiais</option><option>Produtos</option><option>Aluguel</option><option>Contas</option><option>Equipamentos</option><option>Outros</option></select><input required maxLength={240} placeholder="Descrição da despesa" value={description} onChange={event => setDescription(event.target.value)} className="w-full rounded-xl border border-[#dfcdbd] bg-white px-3 py-2 text-sm"/><input required inputMode="decimal" placeholder="Valor (ex.: 120,00)" value={amount} onChange={event => setAmount(event.target.value)} className="w-full rounded-xl border border-[#dfcdbd] bg-white px-3 py-2 text-sm"/><button disabled={busy} className="rounded-full bg-[#705844] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Registrar despesa</button></form>
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl border border-[#e7b9ad] bg-[#fff1ed] px-4 py-3 text-sm text-[#914b40]">{error}</p>}
    <div className="mt-5"><h3 className="mb-3 font-semibold text-[#493629]">Lançamentos recentes</h3><div className="space-y-2">{data.transactions.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eaded3] px-4 py-3"><div><p className="text-sm font-medium text-[#493629]">{item.description}</p><p className="text-xs text-[#8c7767]">{item.transactionDate} · {item.category}</p></div><strong className={item.type === "income" ? "text-[#66816a]" : "text-[#9b594c]"}>{item.type === "income" ? "+" : "−"}{money(item.amountCents)}</strong></div>)}{data.transactions.length === 0 && <p className="rounded-xl bg-[#fbf6f0] px-4 py-5 text-sm text-[#8c7767]">Nenhum lançamento neste período.</p>}</div></div>
  </section>;
}
