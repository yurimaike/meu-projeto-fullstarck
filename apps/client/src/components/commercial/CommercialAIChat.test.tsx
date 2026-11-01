import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import CommercialAIChat from "./CommercialAIChat";

import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

vi.mock("@/lib/api", () => ({
  callPlatformAI: vi.fn()
}));

import { callPlatformAI } from "@/lib/api";

const mockedCallPlatformAI = callPlatformAI as ReturnType<typeof vi.fn>;

describe("CommercialAIChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza o botão launcher e o painel ao abrir", () => {
    render(<CommercialAIChat />);
    expect(screen.getByLabelText("Abrir Letícia Comercial")).not.toBeNull();
    fireEvent.click(screen.getByLabelText("Abrir Letícia Comercial"));
    expect(screen.getByLabelText("Assistente comercial Letícia")).not.toBeNull();
  });

  it("envia mensagem e recebe resposta", async () => {
    mockedCallPlatformAI.mockResolvedValue("Olá! Como posso ajudar?");
    render(<CommercialAIChat />);
    fireEvent.click(screen.getByLabelText("Abrir Letícia Comercial"));
    const input = screen.getByPlaceholderText("Escreva sua mensagem...");
    fireEvent.change(input, { target: { value: "Olá" } });
    fireEvent.submit(screen.getByRole("button", { name: "Enviar mensagem" }).closest("form")!);
    expect(await screen.findByText("Olá! Como posso ajudar?")).not.toBeNull();
  });

  it("bloqueia mensagem vazia", async () => {
    render(<CommercialAIChat />);
    fireEvent.click(screen.getByLabelText("Abrir Letícia Comercial"));
    const input = screen.getByPlaceholderText("Escreva sua mensagem...");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.submit(screen.getByRole("button", { name: "Enviar mensagem" }).closest("form")!);
    expect(mockedCallPlatformAI).not.toHaveBeenCalled();
  });

  it("bloqueia mensagem acima de 2000 caracteres", async () => {
    render(<CommercialAIChat />);
    fireEvent.click(screen.getByLabelText("Abrir Letícia Comercial"));
    const input = screen.getByPlaceholderText("Escreva sua mensagem...");
    const longMessage = "a".repeat(2001);
    fireEvent.change(input, { target: { value: longMessage } });
    fireEvent.submit(screen.getByRole("button", { name: "Enviar mensagem" }).closest("form")!);
    expect(mockedCallPlatformAI).not.toHaveBeenCalled();
    expect(screen.getByText(/Sua mensagem está muito longa/)).not.toBeNull();
  });

  it("desabilita input enquanto carrega", async () => {
    mockedCallPlatformAI.mockReturnValue(new Promise(() => {}));
    render(<CommercialAIChat />);
    fireEvent.click(screen.getByLabelText("Abrir Letícia Comercial"));
    const input = screen.getByPlaceholderText("Escreva sua mensagem...");
    fireEvent.change(input, { target: { value: "Teste" } });
    fireEvent.submit(screen.getByRole("button", { name: "Enviar mensagem" }).closest("form")!);
    expect(input.hasAttribute("disabled")).toBe(true);
  });

  it("trata erro da IA com mensagem amigável", async () => {
    mockedCallPlatformAI.mockRejectedValue(new Error("Falha na conexão"));
    render(<CommercialAIChat />);
    fireEvent.click(screen.getByLabelText("Abrir Letícia Comercial"));
    const input = screen.getByPlaceholderText("Escreva sua mensagem...");
    fireEvent.change(input, { target: { value: "Olá" } });
    fireEvent.submit(screen.getByRole("button", { name: "Enviar mensagem" }).closest("form")!);
    expect(await screen.findByText(/Não consegui conectar/)).not.toBeNull();
  });

  it("não expõe scene_key no DOM", () => {
    render(<CommercialAIChat />);
    expect(screen.queryByText("commercial_chat")).toBeNull();
  });
});