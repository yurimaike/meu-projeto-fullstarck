import { ArrowUpRight, CalendarDays, Check, Clock3, MessageCircle } from "lucide-react";
import { useState } from "react";
import SiteLayout from "../../site/SiteLayout";
import { availableTimes, dateOptions, services, whatsappLink } from "../../site/siteData";

export default function AgendaPage() {
  const [selectedDate, setSelectedDate] = useState(dateOptions[0].value);
  const [selectedService, setSelectedService] = useState(services[0].name);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const message = `Olá, Leticia! Gostaria de solicitar um horário.%0A%0A serviço: ${selectedService}%0A data: ${selectedDate}%0A horário: ${selectedTime ?? "a combinar"}`;

  return (
    <SiteLayout
      title="Agenda | Nail Designer Leticia"
      description="Escolha um serviço e um horário entre 08h e 19h. A confirmação do atendimento é feita pelo WhatsApp."
    >
      <main>
        <section className="page-intro page-intro-compact section-shell">
          <p className="eyebrow"><span className="eyebrow-dot" /> Agenda aberta</p>
          <h1>Reserve um momento<br /><em>para você.</em></h1>
          <p>Selecione uma data, escolha o serviço e toque em um horário livre. A Leticia confirma tudo pelo WhatsApp.</p>
        </section>

        <section className="section-shell agenda-layout">
          <div className="agenda-main">
            <div className="agenda-step">
              <div className="step-heading"><span>01</span><div><p className="eyebrow">Quando</p><h2>Escolha o melhor dia</h2></div></div>
              <div className="date-picker" role="group" aria-label="Escolha a data">
                {dateOptions.map((date) => (
                  <button key={date.value} className={selectedDate === date.value ? "date-option is-selected" : "date-option"} onClick={() => setSelectedDate(date.value)}>
                    <CalendarDays size={16} /><span>{date.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="agenda-step">
              <div className="step-heading"><span>02</span><div><p className="eyebrow">O que você deseja?</p><h2>Escolha o serviço</h2></div></div>
              <div className="service-choice-grid">
                {services.map((service) => (
                  <button key={service.name} className={selectedService === service.name ? "service-choice is-selected" : "service-choice"} onClick={() => setSelectedService(service.name)}>
                    <span className="choice-mark">{service.mark}</span><span>{service.name}</span>{selectedService === service.name && <Check size={16} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="agenda-step">
              <div className="step-heading"><span>03</span><div><p className="eyebrow">Horários</p><h2>Escolha um horário livre</h2></div></div>
              <div className="time-legend"><span><i className="legend-dot legend-free" /> Livre</span><span><i className="legend-dot legend-busy" /> Ocupado</span></div>
              <div className="time-grid" role="group" aria-label="Horários disponíveis">
                {availableTimes.map((slot) => {
                  const isBusy = slot.status === "busy";
                  const isSelected = selectedTime === slot.time;
                  return (
                    <button
                      key={slot.time}
                      className={`time-option ${isBusy ? "is-busy" : ""} ${isSelected ? "is-selected" : ""}`}
                      disabled={isBusy}
                      onClick={() => setSelectedTime(slot.time)}
                      aria-label={`${slot.time}, ${isBusy ? "ocupado" : "livre"}`}
                    >
                      <Clock3 size={15} /> {slot.time}
                      {isBusy && <span>lotado</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="agenda-summary">
            <div className="summary-top"><span className="summary-label">Seu pedido</span><span className="summary-status"><i /> online</span></div>
            <h2>{selectedService}</h2>
            <dl>
              <div><dt>Data</dt><dd>{selectedDate}</dd></div>
              <div><dt>Horário</dt><dd>{selectedTime ?? "Selecione abaixo"}</dd></div>
              <div><dt>Local</dt><dd>Nova Tramandaí</dd></div>
            </dl>
            <div className="summary-divider" />
            <p className="summary-note"><MessageCircle size={16} /> A confirmação e os valores são combinados diretamente com a Leticia.</p>
            <button
              className="button button-primary summary-button"
              disabled={!selectedTime}
              onClick={() => {
                if (selectedTime) window.open(whatsappLink(message.replace(/%0A/g, "\n")), "_blank", "noopener,noreferrer");
              }}
            >
              <MessageCircle size={17} /> Solicitar pelo WhatsApp <ArrowUpRight size={16} />
            </button>
            {!selectedTime && <p className="summary-hint">Escolha um horário livre para continuar.</p>}
          </aside>
        </section>
      </main>
    </SiteLayout>
  );
}

