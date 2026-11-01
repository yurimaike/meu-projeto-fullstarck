import { Camera, LockKeyhole, Menu, MessageCircle, Sparkles, X } from "lucide-react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { salonContact, whatsappLink } from "./siteData";
import CommercialAIChat from "@/components/commercial/CommercialAIChat";
import AdminLoginModal from "@/components/auth/AdminLoginModal";

type SiteLayoutProps = {
  children: ReactNode;
  title: string;
  description: string;
};

const navItems = [
  { to: "/", label: "Início" },
  { to: "/servicos", label: "Serviços" },
  { to: "/agenda", label: "Agenda" },
  { to: "/minhas-reservas", label: "Minhas reservas" },
  { to: "/contato", label: "Contato" },
];

function usePageMeta(title: string, description: string) {
  const location = useLocation();

  useEffect(() => {
    document.title = title;
    const descriptionTag = document.querySelector('meta[name="description"]');
    if (descriptionTag) descriptionTag.setAttribute("content", description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", title);
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) ogDescription.setAttribute("content", description);
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.setAttribute("content", title);
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    if (twitterDescription) twitterDescription.setAttribute("content", description);
  }, [description, location.pathname, title]);
}

export default function SiteLayout({ children, title, description }: SiteLayoutProps) {
  usePageMeta(title, description);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="section-shell header-inner relative flex-wrap">
          <Link className="brand-lockup" to="/" aria-label="Nail Designer Leticia, início">
            <span className="brand-mark"><Sparkles size={15} /></span>
            <span><strong>Leticia</strong><em>nail designer</em></span>
          </Link>
          <button type="button" className="ml-auto grid h-11 w-11 place-items-center rounded-full border border-[#d9c4b1] text-[#705844] md:hidden" onClick={() => setMobileMenuOpen((open) => !open)} aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={mobileMenuOpen} aria-controls="mobile-site-navigation">
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <nav className="desktop-nav" aria-label="Navegação principal">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }: { isActive: boolean }) => isActive ? "nav-link is-active" : "nav-link"}
              >
                {item.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => setAdminLoginOpen(true)}
              className="nav-link inline-flex items-center gap-2 border-0 bg-transparent"
              aria-haspopup="dialog"
            >
              <LockKeyhole size={14} />
              Admin
            </button>
          </nav>
          <div id="mobile-site-navigation" className={mobileMenuOpen ? "order-last flex w-full flex-col gap-1 rounded-2xl border border-[#e8d9cb] bg-[#fffaf4] p-3 shadow-lg md:hidden" : "hidden"}>
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/"} onClick={() => setMobileMenuOpen(false)} className={({ isActive }: { isActive: boolean }) => isActive ? "rounded-xl bg-[#f0e3d7] px-4 py-3 text-sm font-semibold text-[#493629]" : "rounded-xl px-4 py-3 text-sm text-[#705844] hover:bg-[#f7eee6]"}>
                {item.label}
              </NavLink>
            ))}
            <button type="button" onClick={() => { setMobileMenuOpen(false); setAdminLoginOpen(true); }} className="flex items-center gap-2 rounded-xl px-4 py-3 text-left text-sm font-semibold text-[#705844] hover:bg-[#f7eee6]">
              <LockKeyhole size={16} /> Administração
            </button>
          </div>
          <a className="header-cta" href={whatsappLink("Olá, Leticia! Gostaria de agendar um horário.")} target="_blank" rel="noreferrer">
            <MessageCircle size={16} />
            WhatsApp
          </a>
        </div>
      </header>

      {children}

      <footer className="site-footer">
        <div className="section-shell footer-grid">
          <div>
            <Link className="brand-lockup footer-brand" to="/">
              <span className="brand-mark"><Sparkles size={15} /></span>
              <span><strong>Leticia</strong><em>nail designer</em></span>
            </Link>
            <p className="footer-note">Manicure, pedicure e gel com cuidado em Nova Tramandaí.</p>
          </div>
          <div className="footer-links">
            <Link to="/servicos">Serviços</Link>
            <Link to="/agenda">Agenda</Link>
            <Link to="/contato">Contato</Link>
            <a href={salonContact.instagram} target="_blank" rel="noreferrer"><Camera size={15} /> Instagram</a>
          </div>
          <div className="footer-contact">
            <span>Agendamentos</span>
            <a href={whatsappLink("Olá, Leticia! Gostaria de agendar um horário.")} target="_blank" rel="noreferrer">(51) 99890-1388</a>
            <a href={`mailto:${salonContact.email}`}>{salonContact.email}</a>
          </div>
        </div>
        <div className="section-shell footer-bottom"><span>© 2026 Leticia Borges</span><span>Nova Tramandaí · RS</span></div>
      </footer>
      <CommercialAIChat />
      <AdminLoginModal open={adminLoginOpen} onOpenChange={setAdminLoginOpen} />
    </div>
  );
}
