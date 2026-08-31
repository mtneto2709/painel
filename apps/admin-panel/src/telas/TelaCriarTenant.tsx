import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { api, ErroApi } from "../api";
import { CriarTenantResponseDto } from "@atendvalida/shared-types";

const esquema = z.object({
  operatorToken: z.string().min(3, "Informe o token de operador."),
  nome: z.string().min(2, "Informe o nome da unidade/clínica."),
  emailContato: z.string().email("E-mail inválido.").optional().or(z.literal("")),
});
type FormCriarTenant = z.infer<typeof esquema>;

/**
 * Cadastro de um novo tenant (unidade de saúde). Requer o token de operador
 * do AtendValida — este passo é de uso interno/onboarding, não self-service
 * público, conforme o contrato `POST /v1/tenants`.
 */
export function TelaCriarTenant() {
  const { register, handleSubmit, formState } = useForm<FormCriarTenant>({ resolver: zodResolver(esquema) });
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CriarTenantResponseDto | null>(null);

  async function aoEnviar(dados: FormCriarTenant) {
    setErro(null);
    try {
      const resp = await api.criarTenant(dados.operatorToken, dados.nome, dados.emailContato || undefined);
      setResultado(resp);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.corpo.mensagem : "Não foi possível criar o tenant agora.");
    }
  }

  if (resultado) {
    return (
      <div className="tela-central">
        <div className="cartao-login">
          <h1>Tenant criado com sucesso</h1>
          <div className="aviso-caixa">
            Guarde estas credenciais agora — o Api Secret não será mostrado novamente.
          </div>
          <div className="campo">
            <label>Api Key ID</label>
            <div className="chave-exibida">{resultado.api_key_id}</div>
          </div>
          <div className="campo">
            <label>Api Secret</label>
            <div className="chave-exibida">{resultado.api_secret}</div>
          </div>
          <Link to="/login">
            <button className="botao-primario largura-total" type="button" style={{ marginTop: 8 }}>
              Ir para o login
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tela-central">
      <div className="cartao-login">
        <h1>Cadastrar novo tenant</h1>
        <form onSubmit={handleSubmit(aoEnviar)}>
          <div className="campo">
            <label>Token de operador</label>
            <input {...register("operatorToken")} type="password" placeholder="Fornecido pela equipe AtendValida" />
          </div>
          <div className="campo">
            <label>Nome da unidade/clínica</label>
            <input {...register("nome")} placeholder="Clínica ABC" />
          </div>
          <div className="campo">
            <label>E-mail de contato (opcional)</label>
            <input {...register("emailContato")} placeholder="contato@clinica.com.br" />
          </div>
          {Object.keys(formState.errors).length > 0 && (
            <p className="mensagem-erro">Verifique os campos preenchidos.</p>
          )}
          {erro && <p className="mensagem-erro">{erro}</p>}
          <button className="botao-primario largura-total" type="submit" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Criando..." : "Criar tenant"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 16, fontSize: "0.85rem" }}>
          Já tem credenciais? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
