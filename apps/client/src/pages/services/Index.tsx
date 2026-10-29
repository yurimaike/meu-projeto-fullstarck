import { ArrowUpRight, Check, Heart, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import SiteLayout from "../../site/SiteLayout";
import { services } from "../../site/siteData";

export default function ServicesPage() {
  return (
    <SiteLayout
      title="Serviços | Nail Designer Leticia"
      description="Conheça os serviços de manicure, pedicure, esmaltação em gel, banho de gel e manutenção da Leticia."
    >
      <main>
        <section className="page-intro section-shell">
          <p className="eyebrow"><span className="eyebrow-dot" /> Serviços</p>
          <h1>Pequenos detalhes,<br /><em>grande diferença.</em></h1>
          <p>Escolha o cuidado que combina com você. Os valores são informados diretamente no WhatsApp, de acordo com o serviço e a avaliação.</p>
        </section>
        <section className="section-shell service-list">
          {services.map((service, index) => (
            <article className="service-row" key={service.name}>
              <div className="service-row-index">0{index + 1}</div>
              <div className="service-row-mark">{service.mark}</div>
              <div className="service-row-content">
                <h2>{service.name}</h2>
                <p>{service.description}</p>
                <span><Check size={15} /> {service.detail}</span>
              </div>
              <Link className="round-arrow" to="/agenda" aria-label={`Agendar ${service.name}`}><ArrowUpRight size={20} /></Link>
            </article>
          ))}
        </section>
        <section className="section-shell service-note-grid">
          <div className="soft-panel">
            <Sparkles size={21} />
            <h3>Acabamento que respeita seu estilo</h3>
            <p>Do clássico ao mais marcante, a ideia é sair sentindo que o resultado tem a sua cara.</p>
          </div>
          <div className="soft-panel soft-panel-dark">
            <Heart size={21} />
            <h3>Atendimento com calma</h3>
            <p>Um horário reservado para você, com conversa leve e atenção em cada etapa.</p>
          </div>
        </section>
        <section className="section-shell bottom-cta">
          <div><p className="eyebrow">Pronta para escolher?</p><h2>Veja os horários disponíveis.</h2></div>
          <Link className="button button-primary" to="/agenda">Abrir agenda <ArrowUpRight size={17} /></Link>
        </section>
      </main>
    </SiteLayout>
  );
}

