import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CommercialAIChat from "./CommercialAIChat";

const mocks = vi.hoisted(() => ({ streamPlatformAI: vi.fn() }));
vi.mock("@/lib/api", () => ({ streamPlatformAI: mocks.streamPlatformAI }));

async function* streamText(value: string) {
  yield value;
}

afterEach(cleanup);

describe("CommercialAIChat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renderiza o botão launcher e o painel ao abrir", () => {
    render(<CommercialAIChat />);
    fireEvent.click(screen.getByLabelText("Abrir Letícia Comercial"));
    expect(screen.getByLabelText("Assistente comercial Letícia")).not.toBeNull();
    expect(screen.getByText(/Como posso ajudar você hoje/)).not.toBeNull();
  });

  it("envia mensagem e recebe resposta pelo streaming atual", async () => {
    mocks.streamPlatformAI.mockReturnValue(streamText("Olá! Como posso ajudar?"));
    render(<CommercialAIChat />);
    fireEvent.click(screen.getByLabelText("Abrir Letícia Comercial"));
    fireEvent.change(screen.getByPlaceholderText("Escreva sua mensagem..."), { target: { value: "Olá" } });
    fireEvent.submit(screen.getByRole("button", { name: "Enviar mensagem" }).closest("form")!);
    expect(await screen.findByText("Olá! Como posso ajudar?")).not.toBeNull();
    expect(mocks.streamPlatformAI).toHaveBeenCalledWith(expect.objectContaining({
      scene_key: "commercial_chat",
      messages: expect.arrayContaining([expect.objectContaining({ role: "user", content: "Olá" })])
    }));
  });

  it("bloqueia mensagem vazia", () => {
    render(<CommercialAIChat />);
    fireEvent.click(screen.getByLabelText("Abrir Letícia Comercial"));
    fireEvent.submit(screen.getByRole("button", { name: "Enviar mensagem" }).closest("form")!);
    expect(mocks.streamPlatformAI).not.toHaveBeenCalled();
  });

  it("bloqueia mensagem acima de 2000 caracteres", () => {
    render(<CommercialAIChat />);
    fireEvent.click(screen.getByLabelText("Abrir Letícia Comercial"));
    fireEvent.change(screen.getByPlaceholderText("Escreva sua mensagem..."), { target: { value: "a".repeat(2001) } });
    fireEvent.submit(screen.getByRole("button", { name: "Enviar mensagem" }).closest("form")!);
    expect(mocks.streamPlatformAI).not.toHaveBeenCalled();
    expect(screen.getByText(/Sua mensagem está muito longa/)).not.toBeNull();
  });

  it("desabilita input enquanto carrega", () => {
    mocks.streamPlatformAI.mockReturnValue(new Promise(() => {}));
    render(<CommercialAIChat />);
    fireEvent.click(screen.getByLabelText("Abrir Letícia Comercial"));
    const input = screen.getByPlaceholderText("Escreva sua mensagem...");
    fireEvent.change(input, { target: { value: "Teste" } });
    fireEvent.submit(screen.getByRole("button", { name: "Enviar mensagem" }).closest("form")!);
    expect(input.hasAttribute("disabled")).toBe(true);
  });

  it("trata erro da IA com mensagem amigável", async () => {
    mocks.streamPlatformAI.mockImplementation(async function* () {
      throw new Error("Falha na conexão");
    });
    render(<CommercialAIChat />);
    fireEvent.click(screen.getByLabelText("Abrir Letícia Comercial"));
    fireEvent.change(screen.getByPlaceholderText("Escreva sua mensagem..."), { target: { value: "Olá" } });
    fireEvent.submit(screen.getByRole("button", { name: "Enviar mensagem" }).closest("form")!);
    expect(await screen.findByText("Falha na conexão")).not.toBeNull();
  });

  it("não expõe scene_key no DOM", () => {
    render(<CommercialAIChat />);
    expect(screen.queryByText("commercial_chat")).toBeNull();
  });
});
