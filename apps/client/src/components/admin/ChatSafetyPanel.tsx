import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck, Unlock } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Incident = { id: string; visitorId: string; severity: "high" | "critical"; reason: string; messageExcerpt: string; createdAt: string; status: string };
type Block = { visitorId: string; blockedAt: string; reason: string };
type Payload<T> = { ok: boolean; data?: T; error?: { message?: string } };

export default function ChatSafetyPanel() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true); setError("");
    try {
      const response = await apiFetch("/chat-safety/admin");
      const payload = await response.json() as Payload<{ incidents: Incident[]; blocks: Block[] }>;
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Não foi possível carregar as ocorrências.");
      setIncidents(payload.data?.incidents ?? []);
      setBlocks(payload.data?.blocks ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao carregar ocorrências."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  async function unblock(visitorId: string) {
    const reason = window.prompt("Motivo do desbloqueio (obrigatório):");
    if (!reason?.trim()) return;
    try {
      const response = await apiFetch(`/chat-safety/${encodeURIComponent(visitorId)}/unblock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
      const payload = await response.json() as Payload<unknown>;
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Não foi possível desbloquear.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao desbloquear."); }
  }

  async function review(id: string, status: "reviewed" | "dismissed") {
    try {
      const response = await apiFetch(`/chat-safety/incidents/${id}/review`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const payload = await response.json() as Payload<unknown>;
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Não foi possível atualizar a ocorrência.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao atualizar ocorrência."); }
  }

  return <section className="mb-7 rounded-3xl border border-[#e5c5bc] bg-white p-5 shadow-[0_12px_35px_rgba(92,65,43,0.06)] sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="flex items-center gap-2 text-[#9b594c]"><AlertTriangle size={19} /><h2 className="font-serif text-2xl text-[#493629]">Segurança do atendimento</h2></div><p className="mt-1 text-sm text-[#8c7767]">Ocorrências graves, bloqueios ativos e decisões administrativas.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-full border border-[#d9c4b1] px-4 py-2 text-sm font-semibold text-[#705844] disabled:opacity-50"><RefreshCw size={15} /> Atualizar</button>
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-[#fff0ed] p-3 text-sm text-[#914b40]">{error}</p>}
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#fff5f1] p-4"><p className="text-sm text-[#8c7767]">Bloqueios ativos</p><p className="mt-1 font-serif text-3xl text-[#9b594c]">{blocks.length}</p></div><div className="rounded-2xl bg-[#fbf6f0] p-4"><p className="text-sm text-[#8c7767]">Ocorrências registradas</p><p className="mt-1 font-serif text-3xl text-[#493629]">{incidents.length}</p></div></div>
    <h3 className="mt-6 font-semibold text-[#493629]">Bloqueios ativos</h3>
    <div className="mt-3 space-y-3">{blocks.map(block => <article key={block.visitorId} className="rounded-xl border border-[#eaded3] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-[#493629]">Visitante bloqueado</p><p className="break-all text-xs text-[#8c7767]">ID: {block.visitorId}</p><p className="mt-1 text-sm text-[#705f51]">{block.reason}</p><p className="text-xs text-[#9a8574]">{new Date(block.blockedAt).toLocaleString("pt-BR")}</p></div><button type="button" onClick={() => void unblock(block.visitorId)} className="inline-flex items-center gap-2 rounded-full bg-[#6d8267] px-4 py-2 text-sm font-semibold text-white"><Unlock size={15} /> Desbloquear</button></div></article>)}{blocks.length===0 && <p className="rounded-xl bg-[#fbf6f0] p-4 text-sm text-[#8c7767]">Nenhum bloqueio ativo.</p>}</div>
    <h3 className="mt-6 font-semibold text-[#493629]">Histórico de ocorrências</h3>
    <div className="mt-3 space-y-3">{incidents.map(item => <article key={item.id} className="rounded-xl border border-[#eaded3] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-[#9b594c]">{item.severity === "critical" ? "Gravidade crítica" : "Gravidade alta"} · {item.status === "open" ? "Pendente" : item.status === "reviewed" ? "Revisada" : "Descartada"}</span><time className="text-xs text-[#9a8574]">{new Date(item.createdAt).toLocaleString("pt-BR")}</time></div><p className="mt-2 text-sm font-semibold text-[#493629]">{item.reason}</p><p className="mt-2 whitespace-pre-wrap rounded-lg bg-[#fbf6f0] p-3 text-sm text-[#705f51]">{item.messageExcerpt}</p><p className="mt-2 break-all text-xs text-[#9a8574]">Visitante: {item.visitorId}</p>{item.status==="open" && <div className="mt-3 flex gap-2"><button type="button" onClick={() => void review(item.id,"reviewed")} className="rounded-full border border-[#d9c4b1] px-3 py-2 text-xs font-semibold text-[#705844]">Marcar revisada</button><button type="button" onClick={() => void review(item.id,"dismissed")} className="rounded-full border border-[#e3c8c0] px-3 py-2 text-xs font-semibold text-[#9b594c]">Descartar ocorrência</button></div>}</article>)}{incidents.length===0 && <p className="rounded-xl bg-[#fbf6f0] p-4 text-sm text-[#8c7767]">Nenhuma ocorrência registrada.</p>}</div>
    <p className="mt-4 flex items-center gap-2 text-xs text-[#8c7767]"><ShieldCheck size={14} /> Somente administradores autenticados podem rever ocorrências e desbloquear visitantes.</p>
  </section>;
}
