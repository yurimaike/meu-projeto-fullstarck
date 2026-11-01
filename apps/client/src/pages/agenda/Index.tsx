import { ArrowUpRight, CalendarDays, Check, Clock3, MessageCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import SiteLayout from "../../site/SiteLayout";
import { services, whatsappLink } from "../../site/siteData";
import { apiFetch } from "@/lib/api";

type ApiPayload<T> = { ok: boolean; data?: T; error?: { message?: string } };
const times = ["08:00", "09:30", "11:00", "13:00", "14:30", "16:00", "17:30", "19:00"];
function isoDate(offset:number) { const d=new Date(); d.setDate(d.getDate()+offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function displayDate(value:string) { return new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"long"}).format(new Date(`${value}T12:00:00`)); }
export default function AgendaPage() {
  const [selectedDate,setSelectedDate]=useState(isoDate(1)); const [selectedService,setSelectedService]=useState(services[0].name); const [selectedTime,setSelectedTime]=useState<string|null>(null);
  const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [phone,setPhone]=useState(""); const [busy,setBusy]=useState<string[]>([]); const [loading,setLoading]=useState(false); const [sending,setSending]=useState(false); const [notice,setNotice]=useState(""); const [bookingCode,setBookingCode]=useState(""); const [connectionUncertain,setConnectionUncertain]=useState(false); const [refreshing,setRefreshing]=useState(false);
  const refreshAvailability = useCallback(async (date:string, quiet=false) => {
    if (!quiet) setRefreshing(true);
    try {
      const response = await apiFetch(`/bookings?date=${encodeURIComponent(date)}`, { auth:false, silent:true });
      const payload = await response.json() as ApiPayload<{busyTimes:string[]}>;
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Não foi possível consultar os horários.");
      setBusy(payload.data?.busyTimes ?? []);
      if (!quiet) setNotice("Disponibilidade actualizada.");
      return true;
    } catch (error) {
      if (!quiet) setNotice(error instanceof Error ? error.message : "Sem conexão. Seus dados continuam preenchidos.");
      return false;
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSelectedTime(null);
    void refreshAvailability(selectedDate, true).then(ok => {
      if (active && !ok) setBusy(times);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedDate, refreshAvailability]);

  // Keep the in-progress form in this tab so a refresh or brief connection loss
  // does not erase the customer's selections or contact details.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("leticia:booking-draft");
      if (!raw) return;
      const draft = JSON.parse(raw) as { name?:string; email?:string; phone?:string; date?:string; service?:string; time?:string|null };
      if (typeof draft.name === "string") setName(draft.name);
      if (typeof draft.email === "string") setEmail(draft.email);
      if (typeof draft.phone === "string") setPhone(draft.phone);
      if (typeof draft.date === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(draft.date)) setSelectedDate(draft.date);
      if (typeof draft.service === "string" && services.some(item => item.name === draft.service)) setSelectedService(draft.service);
      if (typeof draft.time === "string" && times.includes(draft.time)) setSelectedTime(draft.time);
    } catch {
      sessionStorage.removeItem("leticia:booking-draft");
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem("leticia:booking-draft", JSON.stringify({ name, email, phone, date:selectedDate, service:selectedService, time:selectedTime }));
    } catch { /* Storage may be unavailable; the live form remains usable. */ }
  }, [name,email,phone,selectedDate,selectedService,selectedTime]);

  useEffect(() => {
    const onOnline = () => { setNotice("Conexão restabelecida. Actualizando os horários…"); void refreshAvailability(selectedDate, true); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [selectedDate, refreshAvailability]);
  async function submit() { if(!selectedTime)return;setSending(true);setNotice("");setConnectionUncertain(false);try{const response=await apiFetch("/bookings",{method:"POST",auth:false,headers:{"Content-Type":"application/json"},body:JSON.stringify({customerName:name,customerEmail:email,customerPhone:phone,bookingDate:selectedDate,bookingTime:selectedTime,service:selectedService})});const payload=await response.json() as ApiPayload<{bookingCode:string}>;if(!response.ok||!payload.ok)throw new Error(payload.error?.message??"Não foi possível solicitar a reserva.");const code=payload.data?.bookingCode??"";setBookingCode(code);setNotice(`Solicitação enviada! Seu código é ${code}. Aguarde a confirmação.`);setBusy(v=>[...v,selectedTime!]);const msg=`Olá! Solicitei um horário pelo site.\nNome: ${name}\nE-mail: ${email}\nWhatsApp: ${phone}\nCódigo: ${code}\nServiço: ${selectedService}\nData: ${selectedDate}\nHorário: ${selectedTime}`;window.open(whatsappLink(msg),"_blank","noopener,noreferrer");setSelectedTime(null);setConnectionUncertain(false);sessionStorage.removeItem("leticia:booking-draft");}catch(e){const networkFailure=e instanceof TypeError || !navigator.onLine;setConnectionUncertain(networkFailure);setNotice(networkFailure?"A conexão caiu durante o envio. Não envie novamente ainda: a solicitação pode ter sido recebida. Confira primeiro ‘Minhas reservas’ pelo e-mail usado ou actualize a disponibilidade. Seus dados foram mantidos neste separador.":e instanceof Error?e.message:"Erro ao enviar. Seus dados foram mantidos.");}finally{setSending(false);}}
  const dateChoices=Array.from({length:7},(_,i)=>({value:isoDate(i+1),label:i===0?"Amanhã":displayDate(isoDate(i+1)).split(",")[0].slice(0,3)+" "+isoDate(i+1).slice(8)+"/"+isoDate(i+1).slice(5,7)}));
  return <SiteLayout title="Agenda | Nail Designer Leticia" description="Solicite seu horário online."><main>
    <section className="page-intro page-intro-compact section-shell"><p className="eyebrow"><span className="eyebrow-dot"/> Agenda aberta</p><h1>Reserve um momento<br/><em>para você.</em></h1><p>Escolha o serviço, a data e o horário. Sua solicitação será confirmada pela equipe.</p></section>
    <section className="section-shell agenda-layout"><div className="agenda-main">
      <div className="agenda-step"><div className="step-heading"><span>01</span><div><p className="eyebrow">Seus dados</p><h2>Quem está agendando?</h2></div></div><div className="booking-fields"><label>Nome completo<input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required placeholder="Seu nome"/></label><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required placeholder="voce@email.com"/></label><label>WhatsApp com DDD<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel" required placeholder="(00) 00000-0000"/></label></div></div>
      <div className="agenda-step"><div className="step-heading"><span>02</span><div><p className="eyebrow">Quando</p><h2>Escolha o melhor dia</h2></div></div><div className="date-picker" role="group" aria-label="Escolha a data">{dateChoices.map(d=><button key={d.value} className={selectedDate===d.value?"date-option is-selected":"date-option"} onClick={()=>setSelectedDate(d.value)}><CalendarDays size={16}/><span>{d.label}</span></button>)}</div></div>
      <div className="agenda-step"><div className="step-heading"><span>03</span><div><p className="eyebrow">O que você deseja?</p><h2>Escolha o serviço</h2></div></div><div className="service-choice-grid">{services.map(s=><button key={s.name} className={selectedService===s.name?"service-choice is-selected":"service-choice"} onClick={()=>setSelectedService(s.name)}><span className="choice-mark">{s.mark}</span><span>{s.name}</span>{selectedService===s.name&&<Check size={16}/>}</button>)}</div></div>
      <div className="agenda-step"><div className="step-heading"><span>04</span><div><p className="eyebrow">Horários</p><h2>Escolha um horário livre</h2></div></div><div className="time-legend"><span><i className="legend-dot legend-free"/> Livre</span><span><i className="legend-dot legend-busy"/> Ocupado</span></div><div className="time-grid" role="group" aria-label="Horários disponíveis">{times.map(t=>{const isBusy=busy.includes(t);return <button key={t} className={`time-option ${isBusy?"is-busy":""} ${selectedTime===t?"is-selected":""}`} disabled={isBusy||loading} onClick={()=>setSelectedTime(t)} aria-label={`${t}, ${isBusy?"ocupado":"livre"}`}><Clock3 size={15}/>{t}{isBusy&&<span>lotado</span>}</button>;})}</div>{loading&&<p className="summary-hint">Consultando disponibilidade…</p>}<button type="button" className="summary-hint underline" disabled={refreshing||loading} onClick={()=>void refreshAvailability(selectedDate)}>{refreshing?"Actualizando…":"Actualizar horários"}</button></div>
    </div><aside className="agenda-summary"><div className="summary-top"><span className="summary-label">Seu pedido</span><span className="summary-status"><i/> online</span></div><h2>{selectedService}</h2><dl><div><dt>Data</dt><dd>{displayDate(selectedDate)}</dd></div><div><dt>Horário</dt><dd>{selectedTime??"Selecione abaixo"}</dd></div><div><dt>Local</dt><dd>Nova Tramandaí</dd></div></dl><div className="summary-divider"/><p className="summary-note"><MessageCircle size={16}/> Sua reserva ficará pendente até a aprovação.</p><button className="button button-primary summary-button" disabled={!selectedTime||!name.trim()||!email.trim()||!phone.trim()||sending||loading} onClick={()=>void submit()}>{sending?"Enviando…":"Solicitar reserva"} <ArrowUpRight size={16}/></button>{!selectedTime&&<p className="summary-hint">Escolha um horário livre para continuar.</p>}{notice&&<p role={connectionUncertain?"alert":"status"} className="summary-hint">{notice}</p>}{connectionUncertain&&<a className="summary-hint underline" href="/minhas-reservas">Consultar Minhas reservas antes de tentar novamente</a>}{bookingCode&&<p className="summary-hint">Guarde seu código: <strong>{bookingCode}</strong></p>}</aside></section>
  </main></SiteLayout>;
}
