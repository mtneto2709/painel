import { createContext, PropsWithChildren, useContext, useState } from "react";
import { definirSessao, obterTenantId, sessaoAtiva } from "./api";

interface AuthContextValue {
  autenticado: boolean;
  tenantId: string | null;
  entrar: (jwt: string, tenantId: string) => void;
  sair: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [autenticado, setAutenticado] = useState(sessaoAtiva());
  const [tenantId, setTenantId] = useState<string | null>(obterTenantId());

  function entrar(jwt: string, novoTenantId: string) {
    definirSessao(jwt, novoTenantId);
    setAutenticado(true);
    setTenantId(novoTenantId);
  }

  function sair() {
    definirSessao(null, null);
    setAutenticado(false);
    setTenantId(null);
  }

  return (
    <AuthContext.Provider value={{ autenticado, tenantId, entrar, sair }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
