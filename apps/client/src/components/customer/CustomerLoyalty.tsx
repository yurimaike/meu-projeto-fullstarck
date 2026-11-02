import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Reward = {
  id: string;
  status: "earned" | "redeemed";
  earnedAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  redeemedService: string | null;
};

type Payload = {
  ok?: boolean;
  data?: {
    enabled: boolean;
    completedPaid: number;
    bookingsUntilReward: number | null;
    rewards: Reward[];
  };
  error?: { message?: string };
};

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(date);
}

export default function CustomerLoyalty() {
  const [data, setData] = useState<Payload["data"]>();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void apiFetch("/customer-loyalty/mine", { silent: true })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as Payload | null;
        if (!response.ok || !payload?.ok || !payload.data) {
          throw new Error(payload?.error?.message ?? "Não foi possível consultar seus bônus.");
        }
        if (active) setData(payload.data);
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : "Não foi possível consultar seus bônus.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading) return <p className="mt-8 text-sm text-muted-foreground" role="status">Carregando seus bônus…</p>;
  if (message) return <p className="mt-8 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{message}</p>;
  if (!data?.enabled) return null;

  return (
    <section className="mt-10 rounded-2xl border border-border bg-card p-6 md:p-8" aria-labelledby="customer-loyalty-title">
      <p className="eyebrow">Fidelidade</p>
      <h2 id="customer-loyalty-title" className="mt-2 font-display text-2xl">Meus bônus</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Você tem {data.completedPaid} atendimento(s) pago(s) e concluído(s).
        {data.bookingsUntilReward === 0
          ? " Seu próximo bônus já foi contabilizado; confira a lista abaixo."
          : ` Faltam ${data.bookingsUntilReward} atendimento(s) pago(s) e concluído(s) para completar o próximo ciclo.`}
      </p>
      {data.rewards.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">Ainda não há bônus disponíveis.</p>
      ) : (
        <div className="mt-5 grid gap-3">
          {data.rewards.map((reward) => (
            <article key={reward.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{reward.status === "earned" ? "Bônus conquistado" : "Bônus utilizado"}</strong>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
                  {reward.status === "earned" ? "Disponível" : "Resgatado"}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Conquistado em: {dateLabel(reward.earnedAt)}</p>
              {reward.status === "earned" && <p className="mt-1 text-sm text-muted-foreground">Válido até: {dateLabel(reward.expiresAt)}</p>}
              {reward.status === "redeemed" && <p className="mt-1 text-sm text-muted-foreground">Serviço utilizado: {reward.redeemedService ?? "—"}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
