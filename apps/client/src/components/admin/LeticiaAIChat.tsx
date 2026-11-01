import { useEffect, useRef, useState } from "react";
import { Bot, X, Send, Sparkles, LoaderCircle } from "lucide-react";
import { streamPlatformAI } from "@/lib/api";
import type { PlatformAIChatMessage } from "@/lib/api";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const SYSTEM_PROMPT = `
Você é Letícia AI, assistente EXCLUSIVAMENTE administrativa do salão Letícia Nail Designer.
Responda em português do Brasil, com postura profissional, clara, organizada e objetiva.
Seu foco é ajudar a administradora a compreender e organizar a gestão do salão e do site.
Atenda solicitações administrativas sobre:
- consulta e organização dos serviços cadastrados;
- conferência de preços e informações dos serviços;
- consulta e organização de horários e agenda;
- análise de agendamentos e dúvidas sobre reservas;
- revisão de informações do site e sugestões de melhoria.
Não aja como atendente de clientes, não simule conversas de clientes e não faça testes de mensagens consecutivas ou de velocidade.
Não invente dados, preços, disponibilidade, reservas ou relatórios. Se não tiver acesso a um dado real, explique essa limitação e indique onde ele precisa ser consultado.
Você pode orientar e preparar alterações, mas não afirme que salvou ou modificou dados, arquivos, preços, reservas ou configurações sem uma ferramenta real que confirme a operação.
Antes de uma alteração importante, explique o que será alterado e peça confirmação.
Nunca solicite senhas, tokens ou chaves secretas.
`;

export default function LeticiaAIChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text }
    ];

    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    const history: PlatformAIChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...nextMessages.slice(-16).map((message) => ({
        role: message.role,
        content: message.content
      }))
    ];

    try {
      let reply = "";
      for await (const chunk of streamPlatformAI({
        scene_key: "chat",
        messages: history
      })) {
        reply += chunk;
        setMessages([
          ...nextMessages,
          { role: "assistant", content: reply }
        ]);
      }

      if (!reply.trim()) {
        setMessages([
          ...nextMessages,
          { role: "assistant", content: "Não recebi uma resposta. Tente novamente." }
        ]);
      }
    } catch {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: "Não consegui conectar à IA. Verifique a conexão e tente novamente."
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="leticia-ai">
      {open && (
        <section className="leticia-ai-panel" aria-label="Assistente Letícia AI">
          <header className="leticia-ai-header">
            <div className="leticia-ai-avatar"><Sparkles size={20} /></div>
            <div>
              <strong>Letícia AI</strong>
              <span>Assistente administrativa</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar chat">
              <X size={20} />
            </button>
          </header>

          <div className="leticia-ai-messages" aria-live="polite">
            {messages.length === 0 && (
              <div className="leticia-ai-welcome">
                <Bot size={30} />
                <strong>Olá! Como posso ajudar?</strong>
                <p>Converse comigo sobre o site e a administração do salão.</p>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={`leticia-ai-message ${message.role}`}
              >
                {message.content || (loading && message.role === "assistant"
                  ? "Estou preparando a resposta..."
                  : "")}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form
            className="leticia-ai-form"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Escreva sua mensagem..."
              aria-label="Mensagem para Letícia AI"
              disabled={loading}
            />
            <button type="submit" disabled={loading || !input.trim()} aria-label="Enviar mensagem">
              {loading ? <LoaderCircle size={19} className="leticia-ai-spin" /> : <Send size={19} />}
            </button>
          </form>
          <p className="leticia-ai-caption">Letícia AI · Assistente do salão</p>
        </section>
      )}

      <button
        type="button"
        className="leticia-ai-launcher"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Fechar Letícia AI" : "Abrir Letícia AI"}
      >
        {open ? <X size={24} /> : <Sparkles size={24} />}
      </button>
    </div>
  );
}
