import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import { api, ErroApi } from "../api";
import { useAuth } from "../AuthContext";

const esquema = z.object({
  apiKeyId: z.string().min(3, "Informe o Api Key ID."),
  apiSecret: z.string().min(6, "Informe o Api Secret."),
});
type FormLogin = z.infer<typeof esquema>;

export function TelaLogin() {
  const { register, handleSubmit, formState } = useForm<FormLogin>({ resolver: zodResolver(esquema) });
  const [erro, setErro] = useState<string | null>(null);
  const { entrar } = useAuth();
  const navigate = useNavigate();

  async function aoEnviar(dados: FormLogin) {
    setErro(null);
    try {
      const resp = await api.login(dados.apiKeyId, dados.apiSecret);
      const tenantId = api.decodificarTenantId(resp.access_token);
      entrar(resp.access_token, tenantId);
      navigate("/");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.corpo.mensagem : "Não foi possível entrar agora.");
    }
  }

  return (
    <div className="tela-central">
      <div className="cartao-login">
        <h1>AtendValida — Painel do Tenant</h1>
        <form onSubmit={handleSubmit(aoEnviar)}>
          <div className="campo">
            <label>Api Key ID</label>
            <input {...register("apiKeyId")} placeholder="ak_..." autoComplete="username" />
          </div>
          <div className="campo">
            <label>Api Secret</label>
            <input {...register("apiSecret")} type="password" placeholder="as_..." autoComplete="current-password" />
          </div>
          {(formState.errors.apiKeyId || formState.errors.apiSecret) && (
            <p className="mensagem-erro">Preencha as credenciais corretamente.</p>
          )}
          {erro && <p className="mensagem-erro">{erro}</p>}
          <button className="botao-primario largura-total" type="submit" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 16, fontSize: "0.85rem" }}>
          Ainda não tem uma unidade cadastrada?{" "}
          <Link to="/criar-tenant" style={{ color: "var(--cor-primaria)" }}>
            Cadastrar novo tenant
          </Link>
        </p>
      </div>
    </div>
  );
}
