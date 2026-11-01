import { useEffect, useRef, useState } from "react";
import { Bot, X, Send, Sparkles, LoaderCircle, MessageCircle, ChevronRight } from "lucide-react";
import { streamPlatformAI } from "@/lib/api";
import type { PlatformAIChatMessage } from "@/lib/api";


type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
};

function formatChatTime(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(timestamp);
}

const WELCOME_MESSAGE = `Olá! Sou a Letícia Comercial, assistente do salão Letícia Nail Designer. 💅

Como posso ajudar você hoje? Posso apresentar nossos serviços, tirar dúvidas sobre agendamentos ou ajudar você a escolher o cuidado ideal para suas unhas.`;

export default function CommercialAIChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);
  async function sendMessage(messageText = input) {
    const text = messageText.trim();
    if (!text || loading) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text, timestamp: Date.now() }
    ];

    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    const MAX_MESSAGE_CHARS = 2000;
    if (text.length > MAX_MESSAGE_CHARS) {
      setMessages([
        ...nextMessages,
        { role: "assistant", content: "Sua mensagem está muito longa. Por favor, envie uma mensagem menor.", timestamp: Date.now() }
      ]);
      setLoading(false);
      return;
    }

    const history: PlatformAIChatMessage[] = [
      ...nextMessages.slice(-8).map((message) => ({
        role: message.role,
        content: message.content
      }))
    ];

    try {
      let reply = "";
      try {
        for await (const chunk of streamPlatformAI({
          scene_key: "commercial_chat",
          messages: history
        })) {
          reply += chunk;
          setMessages([...nextMessages, { role: "assistant", content: reply }]);
        }
      } catch (error) {
        throw error instanceof Error ? error : new Error("Não consegui conectar ao assistente. Tente novamente.");
      }

      if (!reply.trim()) {
        setMessages([
          ...nextMessages,
          { role: "assistant", content: "Não recebi uma resposta. Tente novamente.", timestamp: Date.now() }
        ]);
        return;
      }

      setMessages([...nextMessages, { role: "assistant", content: reply, timestamp: Date.now() }]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: detail || "Não consegui conectar ao assistente comercial. Verifique a conexão e tente novamente, ou fale diretamente conosco pelo WhatsApp.",
          timestamp: Date.now()
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  const quickActions = [
    { label: "Serviços e preços", value: "Quais serviços vocês oferecem e os preços?" },
    { label: "Agendar horário", value: "Como faço para agendar um horário?" },
    { label: "Horários disponíveis", value: "Quais horários estão disponíveis?" },
    { label: "Falar no WhatsApp", value: "Quero falar com a Letícia pelo WhatsApp." }
  ];
  return (
    <div className="commercial-ai">
      {open && (
        <section className="commercial-ai-panel" aria-label="Assistente comercial Letícia">
          <header className="commercial-ai-header">
            <div className="commercial-ai-avatar"><Sparkles size={20} /></div>
            <div>
              <strong>Letícia Comercial</strong>
              <span>Atendimento ao cliente</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar chat">
              <X size={20} />
            </button>
          </header>

          <div className="commercial-ai-messages" aria-live="polite">
            {messages.length === 0 && (
              <div className="commercial-ai-welcome">
                <Bot size={30} />
                <strong>Olá! Como posso ajudar?</strong>
                <p>Sou a Letícia Comercial, do salão Letícia Nail Designer.</p>
              </div>
            )}

            {messages.length === 0 && (
              <div className="commercial-ai-quick-actions">
                {quickActions.map((action) => (
                  <button
                    key={action.value}
                    type="button"
                    className="commercial-ai-quick-btn"
                    disabled={loading}
                    onClick={() => {
                      setInput(action.value);
                      void sendMessage(action.value);
                    }}
                  >
                    <MessageCircle size={14} />
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={`commercial-ai-message ${message.role}`}
              >
                {message.role === "assistant" ? <MessageCircle size={14} className="commercial-ai-avatar-icon" /> : null}
                <div className="commercial-ai-message-bubble">
                  {message.content || (loading && message.role === "assistant"
                    ? "Estou preparando a resposta..."
                    : "")}
                  {message.timestamp ? (
                    <time
                      dateTime={new Date(message.timestamp).toISOString()}
                      aria-label={`Enviada às ${formatChatTime(message.timestamp)} no horário de Brasília`}
                      style={{ display: "block", marginTop: 5, fontSize: 11, opacity: 0.7, textAlign: message.role === "user" ? "right" : "left" }}
                    >
                      {formatChatTime(message.timestamp)}
                    </time>
                  ) : null}
                </div>
                {message.role === "user" ? <ChevronRight size={14} className="commercial-ai-user-arrow" /> : null}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form
            className="commercial-ai-form"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Escreva sua mensagem..."
              aria-label="Mensagem para Letícia Comercial"
              disabled={loading}
            />
            <button type="submit" disabled={loading || !input.trim()} aria-label="Enviar mensagem">
              {loading ? <LoaderCircle size={19} className="commercial-ai-spin" /> : <Send size={19} />}
            </button>
          </form>
          <p className="commercial-ai-caption">Letícia Comercial · Atendimento ao cliente</p>
        </section>
      )}

      <button
        type="button"
        className="commercial-ai-launcher"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Fechar Letícia Comercial" : "Abrir Letícia Comercial"}
      >
        {open ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}