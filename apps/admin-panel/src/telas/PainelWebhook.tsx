import { useEffect, useState } from "react";
import { api, ErroApi } from "../api";
import { useAuth } from "../AuthContext";

export function PainelWebhook() {
  const { tenantId } = useAuth();
  const [url, setUrl] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [segredoGerado, setSegredoGerado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    let cancelado = false;
    api
      .obterWebhook(tenantId)
      .then((resp) => {
        if (cancelado || !resp) return;
        setUrl(resp.url ?? "");
        setAtivo(typeof resp.ativo === "boolean" ? resp.ativo : true);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [tenantId]);

  async function salvar() {
    if (!tenantId) return;
    setSalvando(true);
    setErro(null);
    setMensagem(null);
    try {
      const resp = await api.configurarWebhook(tenantId, url, Boolean(ativo));
      if (resp.segredo) setSegredoGerado(resp.segredo);
      setMensagem("Configuração salva com sucesso.");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.corpo.mensagem : "Não foi possível salvar o webhook.");
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    if (!tenantId) return;
    setTestando(true);
    setErro(null);
    setMensagem(null);
    try {
      await api.testarWebhook(tenantId);
      setMensagem("Evento de teste disparado. Verifique o endpoint configurado.");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.corpo.mensagem : "Não foi possível disparar o teste.");
    } finally {
      setTestando(false);
    }
  }

  return (
    <div>
      <h1>Webhook</h1>
      <p style={{ color: "var(--cor-texto-suave)" }}>
        Configure a URL que receberá os eventos <code>validacao.confirmada</code>,{" "}
        <code>validacao.expirada</code> e <code>validacao.rejeitada</code>, assinados via HMAC-SHA256
        no header <code>assinatura_webhook</code>.
      </p>
      <div className="cartao">
        <div className="campo">
          <label>URL do webhook</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://seu-saas.com/webhooks/atendvalida" />
        </div>
        <label className="linha-checkbox" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          <span>Webhook ativo</span>
        </label>

        {segredoGerado && (
          <div className="aviso-caixa">
            Segredo gerado (guarde agora, não será mostrado novamente):
            <div className="chave-exibida" style={{ marginTop: 6 }}>
              {segredoGerado}
            </div>
          </div>
        )}

        {mensagem && <p className="mensagem-sucesso">{mensagem}</p>}
        {erro && <p className="mensagem-erro">{erro}</p>}

        <div style={{ display: "flex", gap: 10 }}>
          <button className="botao-primario" type="button" onClick={salvar} disabled={salvando || !url}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
          <button className="botao-secundario" type="button" onClick={testar} disabled={testando}>
            {testando ? "Enviando..." : "Testar webhook"}
          </button>
        </div>
      </div>
    </div>
  );
}
