import { ArrowUpRight, CalendarDays, Camera, Check, Clock3, Heart, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import SiteLayout from "../../site/SiteLayout";
import { salonContact, services, whatsappLink } from "../../site/siteData";

const Index = () => {
  return (
    <SiteLayout
      title="Nail Designer Leticia | Manicure e pedicure em Nova Tramandaí"
      description="Manicure, pedicure, esmaltação em gel, banho de gel e manutenção com Leticia Borges em Nova Tramandaí."
    >
      <main>
        <section className="hero-section section-shell">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-dot" /> Nail designer em Nova Tramandaí</p>
            <h1>Unhas cuidadas, presença marcante.</h1>
            <p className="hero-lede">
              Um momento só seu para sair com mãos e pés impecáveis. Atendimento próximo,
              acabamento delicado e horários combinados diretamente com a Leticia.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" to="/agenda">
                <CalendarDays size={18} />
                Ver agenda
                <ArrowUpRight size={17} />
              </Link>
              <a className="button button-quiet" href={whatsappLink("Olá, Leticia! Gostaria de saber mais sobre seus atendimentos.")} target="_blank" rel="noreferrer">
                <MessageCircle size={18} />
                Falar no WhatsApp
              </a>
            </div>
            <div className="hero-notes">
              <span><Check size={15} /> Horários de 08h às 19h</span>
              <span><Check size={15} /> Valores sob consulta</span>
            </div>
          </div>

          <div className="hero-visual-wrap">
            <div className="hero-glow" />
            <div className="hero-image-card">
              <img
                data-image-slot="home.hero"
                src="https://drive.google.com/uc?export=download&id=1FKATsShnBYRPIlt2v-pq9B9GOhNSzQbs"
                alt="Perfil da Nail Designer Leticia com exemplos de manicure e pedicure"
                width="620"
                height="720"
              />
              <div className="hero-image-caption">
                <div>
                  <span className="caption-kicker">Agenda aberta</span>
                  <strong>Reserve seu horário</strong>
                </div>
                <Link to="/agenda" aria-label="Abrir agenda">
                  <ArrowUpRight size={18} />
                </Link>
              </div>
            </div>
            <div className="floating-stamp">
              <Heart size={16} fill="currentColor" />
              <span>feito com cuidado</span>
            </div>
          </div>
        </section>

        <section className="trust-strip">
          <div className="section-shell trust-grid">
            <div className="trust-item"><span className="trust-icon"><Clock3 size={18} /></span><div><strong>08h — 19h</strong><span>janela de atendimento</span></div></div>
            <div className="trust-item"><span className="trust-icon"><Heart size={18} /></span><div><strong>Acabamento delicado</strong><span>cuidado em cada detalhe</span></div></div>
            <a className="trust-item" href={salonContact.instagram} target="_blank" rel="noreferrer"><span className="trust-icon"><Camera size={18} /></span><div><strong>{salonContact.instagramHandle}</strong><span>veja mais inspirações</span></div></a>
          </div>
        </section>

        <section className="section-shell section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Serviços essenciais</p>
              <h2>Seu ritual de beleza, do seu jeito.</h2>
            </div>
            <Link className="text-link" to="/servicos">Ver todos os serviços <ArrowUpRight size={16} /></Link>
          </div>
          <div className="service-grid">
            {services.slice(0, 3).map((service, index) => (
              <article className={`service-card service-card-${index + 1}`} key={service.name}>
                <div className="service-number">0{index + 1}</div>
                <div className="service-mark">{service.mark}</div>
                <h3>{service.name}</h3>
                <p>{service.description}</p>
                <Link to="/agenda" className="card-link">Escolher horário <ArrowUpRight size={16} /></Link>
              </article>
            ))}
          </div>
        </section>

        <section className="section-shell invite-section">
          <div className="invite-card">
            <div>
              <p className="eyebrow">Vamos combinar?</p>
              <h2>O próximo horário bonito pode ser o seu.</h2>
              <p>Escolha um serviço e um horário livre. A confirmação final acontece no WhatsApp, de forma simples e pessoal.</p>
            </div>
            <Link className="button button-light" to="/agenda">Abrir agenda <ArrowUpRight size={17} /></Link>
          </div>
        </section>
      </main>
    </SiteLayout>
  );
};

export default Index;
