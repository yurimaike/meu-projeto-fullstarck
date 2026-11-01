import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authClient, syncAuthTokenFromResult } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AdminLoginModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ProfilePayload = {
  ok?: boolean;
  data?: { profile?: { role?: string } };
};

export default function AdminLoginModal({ open, onOpenChange }: AdminLoginModalProps) {
  const navigate = useNavigate();
  const { refetch } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError("");
      setShowPassword(false);
    }
  }, [open]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError(result.error.status === 429
          ? "Muitas tentativas. Aguarde antes de tentar novamente."
          : "E-mail ou senha inválidos.");
        return;
      }
      syncAuthTokenFromResult(result);

      // The role is read from the authenticated server session. Never trust a
      // role sent by the browser or stored in localStorage.
      const profileResponse = await apiFetch("/me/profile", { silent: true });
      const profile = (await profileResponse.json().catch(() => null)) as ProfilePayload | null;
      if (!profileResponse.ok || !profile?.ok) {
        setError("Não foi possível verificar suas permissões. Tente novamente.");
        return;
      }
      if (profile.data?.profile?.role !== "admin") {
        setError("Esta conta não possui acesso administrativo.");
        return;
      }

      await refetch();
      setPassword("");
      toast.success("Acesso administrativo autorizado.");
      onOpenChange(false);
      navigate("/admin");
    } catch {
      setError("Não foi possível entrar agora. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!submitting) onOpenChange(nextOpen);
    }}>
      <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto border-[#e6d6c7] bg-[#fffaf4] text-[#493629] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-2xl text-[#705844]">
            <LockKeyhole size={20} aria-hidden="true" />
            Acesso administrativo
          </DialogTitle>
          <DialogDescription className="text-[#806c5d]">
            Entre com uma conta autorizada para gerir a agenda e os serviços.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="admin-login-email">E-mail</Label>
            <Input
              id="admin-login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={submitting}
              className="border-[#d8c5b4] bg-white"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="admin-login-password">Senha</Label>
            <div className="relative">
              <Input
                id="admin-login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={submitting}
                className="border-[#d8c5b4] bg-white pr-11"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[#806c5d] hover:text-[#493629]"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-[#d9aaa0] bg-[#fff0ed] px-3 py-2 text-sm text-[#8b3f35]">
              {error}
            </p>
          )}

          <DialogFooter className="mt-1 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Fechar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Entrando..." : "Entrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
