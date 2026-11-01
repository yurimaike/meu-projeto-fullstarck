import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SiteLayout from "@/site/SiteLayout";
import AdminLogout from "./AdminLogout";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  apiFetch: vi.fn(),
  refetch: vi.fn(),
  clearAuthToken: vi.fn(),
  syncAuthTokenFromResult: vi.fn(),
  success: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  authClient: {
    signIn: { email: mocks.signIn },
    signOut: mocks.signOut,
    useSession: () => ({ refetch: mocks.refetch })
  },
  clearAuthToken: mocks.clearAuthToken,
  syncAuthTokenFromResult: mocks.syncAuthTokenFromResult
}));
vi.mock("@/lib/api", () => ({ apiFetch: mocks.apiFetch }));
vi.mock("sonner", () => ({ toast: { success: mocks.success } }));
vi.mock("@/components/commercial/CommercialAIChat", () => ({ default: () => null }));

function renderSite() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<SiteLayout title="Letícia" description="Teste"><h1>Site público</h1></SiteLayout>} />
        <Route path="/admin" element={<h1>Painel autorizado</h1>} />
      </Routes>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("button", { name: "Área administrativa" }));
}

function submitLogin() {
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "fixture@example.com" } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "fixture-password-32!" } });
  fireEvent.submit(screen.getByRole("button", { name: "Entrar" }).closest("form")!);
}

function profile(role: string, status = 200) {
  return new Response(JSON.stringify({ ok: true, data: { profile: { role } } }), {
    status, headers: { "Content-Type": "application/json" }
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.refetch.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("acesso administrativo pelo menu", () => {
  it("abre sobre a página pública, permite mostrar senha e fechar sem navegar", () => {
    renderSite();
    expect(screen.getByRole("dialog", { name: "Acesso administrativo" })).not.toBeNull();
    const input = screen.getByLabelText("Senha") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.change(input, { target: { value: "temporary" } });
    fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(input.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(input.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Site público")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Área administrativa" }));
    expect((screen.getByLabelText("Senha") as HTMLInputElement).value).toBe("");
  });

  it("senha incorreta não solicita acesso ao painel", async () => {
    mocks.signIn.mockResolvedValue({ error: { status: 401 } });
    renderSite();
    submitLogin();
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "E-mail ou senha inválidos.");
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(screen.queryByText("Painel autorizado")).toBeNull();
  });

  it("conta comum autenticada é recusada pelo perfil retornado pelo servidor", async () => {
    mocks.signIn.mockResolvedValue({ data: { token: "fixture-token" } });
    mocks.apiFetch.mockResolvedValue(profile("user"));
    renderSite();
    submitLogin();
    expect(await screen.findByText("Esta conta não possui acesso administrativo.")).not.toBeNull();
    expect(mocks.apiFetch).toHaveBeenCalledWith("/me/profile", { silent: true });
    expect(screen.queryByText("Painel autorizado")).toBeNull();
  });

  it("atualiza sessão e abre /admin somente após o servidor confirmar admin", async () => {
    let finishRefresh: () => void = () => undefined;
    mocks.refetch.mockImplementation(() => new Promise<void>((resolve) => { finishRefresh = resolve; }));
    mocks.signIn.mockResolvedValue({ data: { token: "fixture-token" } });
    mocks.apiFetch.mockResolvedValue(profile("admin"));
    renderSite();
    submitLogin();
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalled());
    expect(screen.queryByText("Painel autorizado")).toBeNull();
    finishRefresh();
    expect(await screen.findByText("Painel autorizado")).not.toBeNull();
    expect(mocks.success).toHaveBeenCalledWith("Acesso administrativo autorizado.");
  });

  it("falha de rede ou perfil inválido nunca libera o painel", async () => {
    mocks.signIn.mockResolvedValue({ data: { token: "fixture-token" } });
    mocks.apiFetch.mockRejectedValue(new Error("offline"));
    renderSite();
    submitLogin();
    expect(await screen.findByText("Não foi possível entrar agora. Tente novamente.")).not.toBeNull();
    expect(screen.queryByText("Painel autorizado")).toBeNull();
  });

  it("mostra erro claro ao receber limite de tentativas do servidor", async () => {
    mocks.signIn.mockResolvedValue({ error: { status: 429 } });
    renderSite();
    submitLogin();
    expect(await screen.findByText("Muitas tentativas. Aguarde antes de tentar novamente.")).not.toBeNull();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });
});

describe("saída administrativa", () => {
  function renderLogout() {
    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin" element={<AdminLogout />} />
          <Route path="/" element={<h1>Voltou ao site público</h1>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it("encerra no servidor, limpa o token, atualiza a sessão e sai do painel", async () => {
    mocks.signOut.mockResolvedValue({ data: { success: true } });
    renderLogout();
    fireEvent.click(screen.getByRole("button", { name: "Sair da administração" }));
    expect(await screen.findByText("Voltou ao site público")).not.toBeNull();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.clearAuthToken).toHaveBeenCalledOnce();
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it("não declara logout concluído se o servidor recusar", async () => {
    mocks.signOut.mockResolvedValue({ error: { message: "offline" } });
    renderLogout();
    fireEvent.click(screen.getByRole("button", { name: "Sair da administração" }));
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(mocks.clearAuthToken).not.toHaveBeenCalled();
    expect(screen.queryByText("Voltou ao site público")).toBeNull();
  });
});
