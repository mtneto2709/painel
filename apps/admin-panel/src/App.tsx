import { Navigate, Route, HashRouter, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { TelaLogin } from "./telas/TelaLogin";
import { TelaCriarTenant } from "./telas/TelaCriarTenant";
import { Layout } from "./telas/Layout";
import { PainelMetodos } from "./telas/PainelMetodos";
import { PainelWebhook } from "./telas/PainelWebhook";
import { PainelHistorico } from "./telas/PainelHistorico";

function RotaProtegida({ children }: { children: JSX.Element }) {
  const { autenticado } = useAuth();
  if (!autenticado) return <Navigate to="/login" replace />;
  return children;
}

function Rotas() {
  return (
    <Routes>
      <Route path="/login" element={<TelaLogin />} />
      <Route path="/criar-tenant" element={<TelaCriarTenant />} />
      <Route
        path="/"
        element={
          <RotaProtegida>
            <Layout />
          </RotaProtegida>
        }
      >
        <Route index element={<PainelMetodos />} />
        <Route path="webhook" element={<PainelWebhook />} />
        <Route path="historico" element={<PainelHistorico />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Rotas />
      </AuthProvider>
    </HashRouter>
  );
}
