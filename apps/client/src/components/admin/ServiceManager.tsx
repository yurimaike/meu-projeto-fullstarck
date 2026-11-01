import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";

type Service = { id:string; name:string; description:string|null; durationMinutes:number; priceCents:number; active:number };
type Payload<T> = { ok:boolean; data?:T; error?:{message?:string} };
const emptyForm = { name:"", description:"", durationMinutes:60, price:"", active:true };

export default function ServiceManager() {
  const [services,setServices] = useState<Service[]>([]);
  const [form,setForm] = useState(emptyForm);
  const [editing,setEditing] = useState<string|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");

  async function load() {
    const response = await apiFetch("/services/admin");
    const payload = await response.json() as Payload<{services:Service[]}>;
    if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Não foi possível carregar os serviços.");
    setServices(payload.data?.services ?? []);
  }
  useEffect(() => { void load().catch(e => setError(e instanceof Error ? e.message : "Erro ao carregar serviços.")); }, []);

  function startEdit(service:Service) {
    setEditing(service.id);
    setForm({name:service.name,description:service.description ?? "",durationMinutes:service.durationMinutes,price:(service.priceCents/100).toFixed(2).replace(".",","),active:service.active === 1});
    setError(""); setNotice("");
  }
  function reset() { setEditing(null); setForm(emptyForm); }

  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = Number(form.price.replace(",","."));
    if (!Number.isFinite(price) || price < 0) { setError("Informe um preço válido."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(editing ? `/services/${editing}` : "/services", {
        method: editing ? "PATCH" : "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({name:form.name,description:form.description,durationMinutes:Number(form.durationMinutes),priceCents:Math.round(price*100),active:form.active})
      });
      const payload = await response.json() as Payload<unknown>;
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Não foi possível salvar o serviço.");
      reset(); await load(); setNotice(editing ? "Serviço atualizado." : "Serviço cadastrado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao salvar serviço."); }
    finally { setBusy(false); }
  }

  async function toggleActive(service:Service) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(`/services/${service.id}`, {
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name:service.name,description:service.description,durationMinutes:service.durationMinutes,priceCents:service.priceCents,active:service.active !== 1})
      });
      const payload = await response.json() as Payload<unknown>;
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Não foi possível alterar o serviço.");
      await load(); setNotice(Boolean(service.active) ? "Serviço desativado. O histórico foi preservado." : "Serviço reativado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao alterar serviço."); }
    finally { setBusy(false); }
  }

  const money = (cents:number) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100);
  return <section className="mb-7 rounded-3xl border border-[#e8d9cb] bg-white p-5 shadow-[0_12px_35px_rgba(92,65,43,0.06)] sm:p-7">
    <div><h2 className="font-serif text-2xl text-[#493629]">Serviços e preços</h2><p className="mt-1 text-sm text-[#8c7767]">Cadastre, edite valores, duração e disponibilidade sem alterar o código do site.</p></div>
    {error && <p role="alert" className="mt-4 rounded-xl border border-[#e7b9ad] bg-[#fff1ed] p-3 text-sm text-[#914b40]">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-[#edf4ed] p-3 text-sm text-[#547357]">{notice}</p>}
    <form onSubmit={save} className="mt-5 grid gap-3 rounded-2xl bg-[#fbf6f0] p-4 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium text-[#705844] sm:col-span-2">Nome do serviço<input required minLength={2} maxLength={120} value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} placeholder="Ex.: Manutenção em gel" className="rounded-xl border border-[#dfcdbd] bg-white px-3 py-2.5"/></label>
      <label className="grid gap-1 text-sm font-medium text-[#705844]">Preço (R$)<input required inputMode="decimal" value={form.price} onChange={e=>setForm(v=>({...v,price:e.target.value}))} placeholder="Ex.: 85,00" className="rounded-xl border border-[#dfcdbd] bg-white px-3 py-2.5"/></label>
      <label className="grid gap-1 text-sm font-medium text-[#705844]">Duração (minutos)<input required type="number" min={5} max={600} step={5} value={form.durationMinutes} onChange={e=>setForm(v=>({...v,durationMinutes:Number(e.target.value)}))} className="rounded-xl border border-[#dfcdbd] bg-white px-3 py-2.5"/></label>
      <label className="grid gap-1 text-sm font-medium text-[#705844] sm:col-span-2">Descrição (opcional)<textarea maxLength={500} value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))} rows={2} className="rounded-xl border border-[#dfcdbd] bg-white px-3 py-2.5"/></label>
      {editing && <label className="flex items-center gap-2 text-sm text-[#705844]"><input type="checkbox" checked={form.active} onChange={e=>setForm(v=>({...v,active:e.target.checked}))}/> Serviço disponível para agendamento</label>}
      <div className="flex flex-wrap gap-2 sm:col-span-2"><button disabled={busy} className="rounded-full bg-[#705844] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar serviço"}</button>{editing && <button type="button" onClick={reset} className="rounded-full border border-[#d9c4b1] bg-white px-5 py-2.5 text-sm font-semibold text-[#705844]">Cancelar edição</button>}</div>
    </form>
    <div className="mt-5 grid gap-3">
      {services.map(service=><article key={service.id} className="flex flex-col gap-3 rounded-2xl border border-[#eaded3] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-[#493629]">{service.name}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${service.active ? "bg-[#edf4ed] text-[#547357]" : "bg-[#f3efeb] text-[#806f62]"}`}>{service.active === 1 ? "Ativo" : "Inativo"}</span></div><p className="mt-1 text-sm text-[#705f51]">{money(service.priceCents)} · {service.durationMinutes} min</p>{service.description && <p className="mt-1 text-xs text-[#8c7767]">{service.description}</p>}</div>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>startEdit(service)} className="rounded-full border border-[#d9c4b1] bg-white px-4 py-2 text-xs font-semibold text-[#705844]">Editar</button><button type="button" disabled={busy} onClick={()=>void toggleActive(service)} className="rounded-full border border-[#d9c4b1] bg-white px-4 py-2 text-xs font-semibold text-[#705844]">{service.active === 1 ? "Desativar" : "Reativar"}</button></div>
      </article>)}
      {services.length===0 && <p className="rounded-xl bg-[#fbf6f0] p-5 text-sm text-[#8c7767]">Nenhum serviço cadastrado ainda.</p>}
    </div>
  </section>;
}
