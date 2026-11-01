import { Link } from "react-router-dom";
import SiteLayout from "../../site/SiteLayout";
import { whatsappLink } from "../../site/siteData";

export default function AboutPage() {
  return (
    <SiteLayout title="Sobre | Nail Designer Letícia" description="Conheça o atendimento da Nail Designer Letícia em Nova Tramandaí.">
      <main className="section-shell section-block">
        <p className="eyebrow">Nail Designer Letícia</p>
        <h1>Cuidado em cada <em>detalhe.</em></h1>
        <p className="hero-lede">
          Manicure, pedicure, esmaltação em gel, banho de gel e manutenção
          em Nova Tramandaí, com acabamento delicado e atendimento próximo.
        </p>
        <p className="hero-lede">
          Consulte os serviços e a disponibilidade na agenda.
          Para orientações e confirmação do atendimento, converse diretamente com a Letícia.
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" to="/agenda">Consultar agenda</Link>
          <a className="button button-quiet" href={whatsappLink("Olá, Letícia! Gostaria de saber mais sobre o atendimento.")} target="_blank" rel="noreferrer">Falar no WhatsApp</a>
        </div>
      </main>
    </SiteLayout>
  );
}
