import { useEffect, useState } from "react";
import { MetodoValidacao, TenantMetodoConfigDto } from "@atendvalida/shared-types";
import { api, ErroApi } from "../api";
import { useAuth } from "../AuthContext";

const NOMES_METODO: Record<string, string> = {
  token_whatsapp: "Token via WhatsApp",
  token_sms: "Token via SMS",
  assinatura_tela: "Assinatura em tela",
  biometria_facial: "Biometria facial",
};

interface ParChaveValor {
  chave: string;
  valor: string;
}

function ConfiguracaoMetodo({
  tenantId,
  item,
  aoSalvar,
}: {
  tenantId: string;
  item: TenantMetodoConfigDto;
  aoSalvar: () => void;
}) {
  const [pares, setPares] = useState<ParChaveValor[]>(
    Object.entries(item.configuracao ?? {}).map(([chave, valor]) => ({ chave, valor: String(valor) })),
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function atualizarPar(indice: number, campo: keyof ParChaveValor, valor: string) {
    setPares((atual) => atual.map((p, i) => (i === indice ? { ...p, [campo]: valor } : p)));
  }

  function adicionarPar() {
    setPares((atual) => [...atual, { chave: "", valor: "" }]);
  }

  function removerPar(indice: number) {
    setPares((atual) => atual.filter((_, i) => i !== indice));
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const configuracao = Object.fromEntries(
        pares.filter((p) => p.chave.trim()).map((p) => [p.chave.trim(), p.valor]),
      );
      await api.configurarMetodo(tenantId, item.metodo, { ativo: item.ativo, configuracao });
      aoSalvar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.corpo.mensagem : "Não foi possível salvar a configuração.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ padding: "12px 0 4px" }}>
      {pares.map((par, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            placeholder="chave (ex.: token_api)"
            value={par.chave}
            onChange={(e) => atualizarPar(i, "chave", e.target.value)}
            style={{ flex: 1, padding: 8, borderRadius: 6, border: "1px solid var(--cor-borda)" }}
          />
          <input
            placeholder="valor"
            type="password"
            value={par.valor}
            onChange={(e) => atualizarPar(i, "valor", e.target.value)}
            style={{ flex: 1, padding: 8, borderRadius: 6, border: "1px solid var(--cor-borda)" }}
          />
          <button type="button" className="botao-link" onClick={() => removerPar(i)}>
            remover
          </button>
        </div>
      ))}
      <button type="button" className="botao-secundario" onClick={adicionarPar}>
        + adicionar credencial
      </button>
      {erro && <p className="mensagem-erro">{erro}</p>}
      <div style={{ marginTop: 10 }}>
        <button type="button" className="botao-primario" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar configuração"}
        </button>
      </div>
      <p style={{ fontSize: "0.75rem", color: "var(--cor-texto-suave)", marginTop: 8 }}>
        Valores sensíveis (tokens, chaves) são criptografados no servidor e nunca exibidos novamente
        em texto puro após salvar.
      </p>
    </div>
  );
}

export function PainelMetodos() {
  const { tenantId } = useAuth();
  const [itens, setItens] = useState<TenantMetodoConfigDto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    if (!tenantId) return;
    setCarregando(true);
    try {
      const resp = await api.listarMetodos(tenantId);
      setItens(resp);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.corpo.mensagem : "Não foi possível carregar os métodos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function alternarAtivo(item: TenantMetodoConfigDto) {
    if (!tenantId) return;
    await api.configurarMetodo(tenantId, item.metodo, { ativo: !item.ativo });
    carregar();
  }

  if (carregando) return <p>Carregando métodos...</p>;

  return (
    <div>
      <h1>Métodos de validação</h1>
      <p style={{ color: "var(--cor-texto-suave)" }}>
        Ative os métodos que esta unidade pode usar para confirmar atendimentos. Assinatura em tela e
        biometria facial exigem configuração de provedor antes de ficarem realmente disponíveis para
        os pacientes.
      </p>
      {erro && <p className="mensagem-erro">{erro}</p>}
      <div className="cartao">
        {Object.values(MetodoValidacao).map((metodo) => {
          const item = itens.find((i) => i.metodo === metodo) ?? {
            metodo,
            ativo: false,
            configurado: false,
            configuracao: {},
          };
          return (
            <div key={metodo}>
              <div className="linha-metodo">
                <div>
                  <span className="nome-metodo">{NOMES_METODO[metodo] ?? metodo}</span>
                  <span className={`badge ${item.configurado ? "configurado" : "nao-configurado"}`}>
                    {item.configurado ? "configurado" : "não configurado"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    type="button"
                    className="botao-link"
                    onClick={() => setExpandido(expandido === metodo ? null : metodo)}
                  >
                    {expandido === metodo ? "fechar" : "configurar"}
                  </button>
                  <label className="interruptor">
                    <input type="checkbox" checked={item.ativo} onChange={() => alternarAtivo(item)} />
                    <span className="interruptor-trilho" />
                  </label>
                </div>
              </div>
              {expandido === metodo && tenantId && (
                <ConfiguracaoMetodo tenantId={tenantId} item={item} aoSalvar={carregar} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
