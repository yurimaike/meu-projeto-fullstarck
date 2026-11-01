import { ArrowUpRight, Camera, MapPin, MessageCircle, Phone } from "lucide-react";
import SiteLayout from "../../site/SiteLayout";
import { salonContact, whatsappLink } from "../../site/siteData";

export default function ContactPage() {
  return (
    <SiteLayout
      title="Contato | Nail Designer Leticia"
      description="Entre em contato com Leticia Borges para consultar valores e confirmar seu horário em Nova Tramandaí."
    >
      <main>
        <section className="page-intro section-shell contact-intro">
          <p className="eyebrow"><span className="eyebrow-dot" /> Fale com a Leticia</p>
          <h1>Vamos deixar seu<br /><em>próximo horário marcado?</em></h1>
          <p>Para consultar valores, tirar dúvidas ou confirmar a disponibilidade, mande uma mensagem. O atendimento é feito de forma pessoal pelo WhatsApp.</p>
        </section>
        <section className="section-shell contact-grid">
          <a className="contact-card contact-card-main" href={whatsappLink("Olá, Leticia! Vim pelo site e gostaria de consultar um horário.")} target="_blank" rel="noreferrer">
            <span className="contact-card-icon"><MessageCircle size={22} /></span>
            <span className="contact-card-kicker">Agendamentos</span>
            <h2>WhatsApp</h2>
            <p>(51) 99890-1388</p>
            <span className="contact-card-action">Enviar mensagem <ArrowUpRight size={17} /></span>
          </a>
          <a className="contact-card" href={salonContact.instagram} target="_blank" rel="noreferrer">
            <span className="contact-card-icon"><Camera size={22} /></span>
            <span className="contact-card-kicker">Portfólio e novidades</span>
            <h2>Instagram</h2>
            <p>{salonContact.instagramHandle}</p>
            <span className="contact-card-action">Ver perfil <ArrowUpRight size={17} /></span>
          </a>
          <a className="contact-card" href={`mailto:${salonContact.email}`}>
            <span className="contact-card-icon"><Phone size={22} /></span>
            <span className="contact-card-kicker">Contato por e-mail</span>
            <h2>E-mail</h2>
            <p>{salonContact.email}</p>
            <span className="contact-card-action">Enviar e-mail <ArrowUpRight size={17} /></span>
          </a>
        </section>
        <section className="section-shell contact-details">
          <div className="contact-detail"><MapPin size={20} /><div><span>Atendimento</span><strong>Nova Tramandaí · RS</strong></div></div>
          <div className="contact-detail"><Phone size={20} /><div><span>Horários</span><strong>De 08h às 19h</strong></div></div>
        </section>
        <section className="section-shell bottom-cta">
          <div><p className="eyebrow">Já sabe o que quer?</p><h2>Confira os horários livres.</h2></div>
          <a className="button button-primary" href="/agenda">Abrir agenda <ArrowUpRight size={17} /></a>
        </section>
      </main>
    </SiteLayout>
  );
}
