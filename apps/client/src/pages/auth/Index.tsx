import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authClient } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { readResponseBody, normalizeApiError } from "@/lib/api-error";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Reference auth page — wired to the rules in AGENTS.md (### Auth). This is an
 * EXAMPLE to copy/adapt for your product; keep the navigation pattern intact.
 *
 * It demonstrates the four things generated login pages usually get wrong:
 *   1. Tri-state session gating — wait for the session check (loading) before
 *      deciding. Never treat "loading" as "guest", or the first paint after
 *      login bounces the authenticated user straight back here.
 *   2. Reverse guard — an already-authenticated user is redirected away from
 *      /auth instead of being shown the login form again.
 *   3. On success, navigate with the router. NEVER call
 *      window.location.reload(): this is a client-side-routed SPA, so a reload
 *      just re-renders THIS login route and strands the user ("logs in but
 *      bounces back to login"). The Bearer token is already persisted by
 *      lib/auth.ts.
 *   4. Session refresh after out-of-band verification — the verify-code
 *      endpoint is a product API route, not a Better Auth endpoint, so the
 *      client session atom does NOT update on its own. Await a session
 *      refetch before navigating away, or every auth guard keeps reading the
 *      pre-verification session (emailVerified: false) and the app looks
 *      logged out right after a successful verification.
 *
 * Protecting other routes is the mirror image: gate them on the same
 * loading / authed / guest tri-state and redirect guests to "/auth".
 */
const AuthPage = () => {
  const navigate = useNavigate();
  const { data: session, isPending, refetch: refetchSession } = authClient.useSession();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setSenha] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);

  const verificationEmail =
    pendingVerificationEmail || (!session?.user?.emailVerified ? session?.user?.email ?? "" : "");
  const resendWaitSeconds = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));

  useEffect(() => {
    if (resendAvailableAt <= now) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [now, resendAvailableAt]);

  // (1) Loading: the token-based session check has not resolved yet.
  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // (2) Reverse guard: verified users leave the login route. Keep signed-in
  // but unverified users here so the verification-code form cannot be skipped
  // by a fast session refresh after sign-up.
  if (session?.user?.emailVerified && !verificationEmail) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({ name, email, password })
          : await authClient.signIn.email({ email, password });

      if (result.error) {
        throw new Error(result.error.message ?? "Authentication failed");
      }

      if (mode === "signup") {
        await sendVerificationCode();
        setPendingVerificationEmail(email);
        toast.success("Verification code sent");
        return;
      }

      toast.success("Signed in");
      // (3) Navigate via the router. Do NOT window.location.reload().
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onForgotPassword = async () => {
    if (!email.trim()) {
      toast.error("Digite seu e-mail primeiro.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiFetch("/auth/request-password-reset", {
        method: "POST",
        auth: false,
        silent: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          redirectTo: `${window.location.origin}/reset-password`
        })
      });

      if (!response.ok) {
        throw new Error("Não foi possível solicitar a recuperação. Tente novamente.");
      }

      toast.success("Se o e-mail estiver cadastrado, você receberá um link de recuperação.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao solicitar recuperação.");
    } finally {
      setSubmitting(false);
    }
  };
  const sendVerificationCode = async () => {
    const response = await apiFetch("/api/email-verification/send-code", {
      method: "POST",
      auth: true
    });
    if (!response.ok) {
      const body = await readResponseBody(response);
      const retryAfterSeconds =
        body && typeof body === "object" && "data" in body
          ? Number((body.data as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds ?? 0)
          : 0;
      if (retryAfterSeconds > 0) {
        setNow(Date.now());
        setResendAvailableAt(Date.now() + retryAfterSeconds * 1000);
      }
      throw new Error(normalizeApiError(body).message);
    }
    setNow(Date.now());
    setResendAvailableAt(Date.now() + 60 * 1000);
  };

  const onVerifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await apiFetch("/api/email-verification/verify-code", {
        method: "POST",
        auth: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verificationCode })
      });
      if (!response.ok) {
        throw new Error(normalizeApiError(await readResponseBody(response)).message);
      }

      // (4) Refresh the Better Auth session BEFORE leaving this screen; the
      // verify-code route updated the database out of band, so the client
      // session atom still says emailVerified: false until this refetch.
      await refetchSession();

      toast.success("E-mail verificado");
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onResendCode = async () => {
    setSubmitting(true);
    try {
      await sendVerificationCode();
      toast.success("Verification code resent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao reenviar o código");
    } finally {
      setSubmitting(false);
    }
  };

  if (verificationEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3eee7] p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Verifique seu e-mail</CardTitle>
            <CardDescription>Digite o código de 6 dígitos enviado para {verificationEmail}.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onVerifyCode} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="verification-code">Verification code</Label>
                <Input
                  id="verification-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting || verificationCode.length !== 6}>
                {submitting ? "Aguarde..." : "Verificar e-mail"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={submitting || resendWaitSeconds > 0}
                onClick={onResendCode}
              >
                {resendWaitSeconds > 0 ? `Reenviar em ${resendWaitSeconds}s` : "Reenviar código"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#f4e8dc] via-[#fffaf4] to-[#ead8c5] p-4 sm:p-8"
      style={{ backgroundImage: "linear-gradient(135deg, rgba(248,239,228,0.78), rgba(255,250,244,0.70)), url('/images/fundo-leticia.png')", backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#f8eee3]/35 via-[#fffaf4]/45 to-[#ead8c5]/65" />
      <Card className="relative z-10 my-4 w-full max-w-md overflow-hidden rounded-[2rem] border border-white/80 bg-[#fffdfa] shadow-[0_20px_60px_rgba(92,65,43,0.16)]">
        <div className="bg-gradient-to-b from-[#f4e8dc] to-[#fffdfa] px-4 py-7 text-center">
          <div className="mb-2 text-3xl text-[#947B65]">✿</div>
          <div className="font-serif text-3xl font-medium tracking-[0.25em] text-[#705844]">LETÍCIA</div>
          <div className="mt-2 text-xs tracking-[0.3em] text-[#947B65]">NAIL DESIGNER</div>
          <div className="mt-3 text-[10px] font-medium tracking-[0.18em] text-[#A88A70]">BEAUTY STUDIO • ÁREA ADMINISTRATIVA</div>
        </div>
        <CardHeader className="pt-6 text-center">
          <CardTitle>{mode === "signup" ? "Criar sua conta" : "Bem-vinda!"}</CardTitle>
          <CardDescription>
            {mode === "signup" ? "Use o e-mail autorizado pela equipe para criar sua conta." : "Entre na sua conta."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as "signin" | "signup")}
            className="mb-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>
          </Tabs>
          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setSenha(event.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Aguarde…" : mode === "signup" ? "Cadastrar" : "Entrar"}
            </Button>
          </form>
          {mode === "signin" && (
            <div className="mt-3 text-center">
              <Button type="button" variant="link" className="text-[#705844]" disabled={submitting} onClick={onForgotPassword}>
                Esqueci minha senha
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthPage;

