import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export function Layout() {
  const { sair } = useAuth();
  const navigate = useNavigate();

  function aoSair() {
    sair();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <aside className="barra-lateral">
        <h2>AtendValida</h2>
        <nav>
          <NavLink to="/" end className={({ isActive }) => (isActive ? "ativo" : "")}>
            Métodos de validação
          </NavLink>
          <NavLink to="/webhook" className={({ isActive }) => (isActive ? "ativo" : "")}>
            Webhook
          </NavLink>
          <NavLink to="/historico" className={({ isActive }) => (isActive ? "ativo" : "")}>
            Histórico
          </NavLink>
          <button type="button" onClick={aoSair} style={{ marginTop: 24 }}>
            Sair
          </button>
        </nav>
      </aside>
      <main className="conteudo">
        <Outlet />
      </main>
    </div>
  );
}
