import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gift, LockKeyhole, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { authClient } from "@/lib/auth";
import SiteLayout from "@/site/SiteLayout";

type Reward = {
  id: string;
  cycleNumber: number;
  status: "earned" | "redeemed";
  earnedAt: string;
  expiresAt?: string | null;
  redeemedAt?: string | null;
  redeemedService?: string | null;
};
type LoyaltyData = {
  enabled: boolean;
  completedPaid: number;
  progressInCycle: number;
  bookingsUntilReward: number;
  rewards: Reward[];
};
type ApiPayload = { ok?: boolean; data?: LoyaltyData; error?: { message?: string } };

function dateLabel(value?: string | null) {
  if (!value) return "Sem data definida";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(date);
}

export default function MyRewardsPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const verified = Boolean(session?.user?.emailVerified);
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!verified) return;
    let active = true;
    setLoading(true);
    void apiFetch("/loyalty/mine", { silent: true })
      .then(async response => {
        const payload = await response.json() as ApiPayload;
        if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error?.message ?? "Não foi possível consultar seus bônus.");
        if (active) setData(payload.data);
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível consultar seus bônus.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [verified, session?.user?.id]);

  const progress = data?.progressInCycle ?? 0;
  const earned = data?.rewards.filter(reward => reward.status === "earned") ?? [];
  const redeemed = data?.rewards.filter(reward => reward.status === "redeemed") ?? [];

  return (
    <SiteLayout title="Meus bônus | Letícia" description="Acompanhe seu progresso e consulte suas recompensas de fidelidade.">
      <main className="min-h-[60vh] bg-[#fbf5ed]">
        <div className="section-shell mx-auto max-w-3xl px-4 py-14 md:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a77d60]">Área da cliente</p>
          <h1 className="mt-3 font-serif text-4xl text-[#493629] md:text-5xl">Meus Bônus</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#806c5d]">Acompanhe suas reservas pagas e concluídas, suas recompensas disponíveis e o histórico de bônus utilizados.</p>

          {sessionPending && <p className="mt-8 text-sm text-[#806c5d]">Verificando sua conta…</p>}
          {!sessionPending && !verified && (
            <section className="mt-8 rounded-3xl border border-[#e8d9cb] bg-white p-7 shadow-sm">
              <LockKeyhole className="text-[#a77d60]" size={28} />
              <h2 className="mt-4 font-serif text-2xl text-[#493629]">Entre para consultar seus bônus</h2>
              <p className="mt-2 text-sm leading-6 text-[#806c5d]">Por segurança, cada cliente só pode consultar as recompensas vinculadas ao próprio e-mail verificado.</p>
              <Link to="/auth" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#705844] px-6 text-sm font-semibold text-white">Entrar na minha conta</Link>
            </section>
          )}

          {loading && <p className="mt-8 text-sm text-[#806c5d]">Carregando seus bônus…</p>}
          {error && <p role="alert" className="mt-6 rounded-xl border border-[#e7b9ad] bg-[#fff1ed] p-4 text-sm text-[#914b40]">{error}</p>}

          {data && !loading && (
            <>
              <section className="mt-8 rounded-3xl border border-[#e8d9cb] bg-white p-6 shadow-[0_12px_35px_rgba(92,65,43,0.06)] sm:p-8">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-[#f5ece3] p-3"><Sparkles className="text-[#a77d60]" size={23} /></div>
                  <div><h2 className="font-serif text-2xl text-[#493629]">Seu próximo bônus</h2><p className="text-sm text-[#8c7767]">A cada 8 atendimentos pagos e concluídos</p></div>
                </div>
                <div className="mt-7 flex items-end justify-between gap-3">
                  <p className="font-serif text-4xl text-[#493629]">{progress}<span className="text-xl text-[#a1846c]">/8</span></p>
                  <p className="pb-1 text-sm font-medium text-[#705844]">{data.bookingsUntilReward} {data.bookingsUntilReward === 1 ? "atendimento restante" : "atendimentos restantes"}</p>
                </div>
                <div className="mt-3 grid grid-cols-8 gap-2" aria-label={`Progresso: ${progress} de 8 atendimentos`}>
                  {Array.from({ length: 8 }, (_, index) => <div key={index} className={`h-2.5 rounded-full ${index < progress ? "bg-[#6d8267]" : "bg-[#eee5dc]"}`} />)}
                </div>
                <p className="mt-4 text-xs leading-5 text-[#8c7767]">Somente atendimentos marcados pela equipe como pagos e concluídos entram no progresso. Total contabilizado: {data.completedPaid}.</p>
                {!data.enabled && <p className="mt-4 rounded-xl bg-[#fbf6f0] p-3 text-sm text-[#806c5d]">O programa está temporariamente pausado. Seus bônus já conquistados continuam visíveis.</p>}
              </section>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#e8d9cb] bg-white p-5">
                  <p className="text-sm text-[#8c7767]">Bônus disponíveis</p>
                  <p className="mt-2 font-serif text-3xl text-[#547357]">{earned.length}</p>
                </div>
                <div className="rounded-2xl border border-[#e8d9cb] bg-white p-5">
                  <p className="text-sm text-[#8c7767]">Bônus utilizados</p>
                  <p className="mt-2 font-serif text-3xl text-[#493629]">{redeemed.length}</p>
                </div>
              </div>

              <section className="mt-8">
                <h2 className="font-serif text-2xl text-[#493629]">Recompensas conquistadas</h2>
                <div className="mt-4 grid gap-3">
                  {data.rewards.map(reward => {
                    const expired = reward.status === "earned" && Boolean(reward.expiresAt) && new Date(reward.expiresAt as string).getTime() < Date.now();
                    return (
                      <article key={reward.id} className="rounded-2xl border border-[#e8d9cb] bg-white p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3"><div className="rounded-xl bg-[#f5ece3] p-2.5"><Gift className="text-[#a77d60]" size={20} /></div><div><h3 className="font-semibold text-[#493629]">Bônus do ciclo {reward.cycleNumber}</h3><p className="mt-1 text-xs text-[#8c7767]">Conquistado em {dateLabel(reward.earnedAt)}</p></div></div>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${reward.status === "redeemed" ? "bg-[#f0ece8] text-[#806f62]" : expired ? "bg-[#fff1ed] text-[#914b40]" : "bg-[#edf4ed] text-[#547357]"}`}>{reward.status === "redeemed" ? "Utilizado" : expired ? "Expirado" : "Disponível"}</span>
                        </div>
                        <p className="mt-4 text-sm text-[#705f51]">{reward.status === "redeemed" ? `Utilizado em: ${reward.redeemedService ?? "serviço"} · ${dateLabel(reward.redeemedAt)}` : `Validade: ${dateLabel(reward.expiresAt)}`}</p>
                      </article>
                    );
                  })}
                  {data.rewards.length === 0 && <div className="rounded-2xl border border-dashed border-[#dfcdbd] bg-white p-7 text-center"><Gift className="mx-auto text-[#b99c83]" size={28} /><p className="mt-3 font-medium text-[#705844]">Você ainda não tem bônus conquistados.</p><p className="mt-1 text-sm text-[#8c7767]">Continue seus atendimentos para completar o primeiro ciclo de 8.</p></div>}
                </div>
              </section>
            </>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/minhas-reservas" className="inline-flex min-h-11 items-center rounded-full border border-[#d9c4b1] bg-white px-5 text-sm font-semibold text-[#705844]">Ver minhas reservas</Link>
            <Link to="/agenda" className="inline-flex min-h-11 items-center rounded-full bg-[#705844] px-5 text-sm font-semibold text-white">Agendar horário</Link>
          </div>
        </div>
      </main>
    </SiteLayout>
  );
}
