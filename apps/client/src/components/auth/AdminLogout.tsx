import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authClient, clearAuthToken } from "@/lib/auth";

export default function AdminLogout() {
  const navigate = useNavigate();
  const { refetch } = authClient.useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("SIGN_OUT_FAILED");
      clearAuthToken();
      await refetch();
      navigate("/", { replace: true });
    } catch {
      setError("Não foi possível encerrar a sessão. Tente sair novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="header-admin-trigger" type="button" disabled={busy} onClick={() => void signOut()}>
        {busy ? "Saindo..." : "Sair da administração"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
