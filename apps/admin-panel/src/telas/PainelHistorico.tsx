import { useEffect, useState } from "react";
import { MetodoValidacao, StatusValidacao } from "@atendvalida/shared-types";
import { api, ErroApi, ItemHistorico } from "../api";

async function baixarPdf(comprovanteId: string) {
  const jwt = sessionStorage.getItem("atendvalida_jwt");
  const resposta = await fetch(api.urlPdfComprovante(comprovanteId), {
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
  });
  if (resposta.status === 202) {
    alert("O PDF ainda está sendo gerado. Tente novamente em alguns segundos.");
    return;
  }
  if (!resposta.ok) {
    alert("Não foi possível baixar o comprovante.");
    return;
  }
  const blob = await resposta.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `comprovante-${comprovanteId}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

export function PainelHistorico() {
  const [itens, setItens] = useState<ItemHistorico[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [status, setStatus] = useState("");
  const [metodo, setMetodo] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const resp = await api.listarHistorico({
        status: status || undefined,
        metodo: metodo || undefined,
        data_inicio: dataInicio ? new Date(dataInicio).toISOString() : undefined,
        data_fim: dataFim ? new Date(dataFim + "T23:59:59").toISOString() : undefined,
        pagina,
      });
      setItens(resp.itens);
      setTotal(resp.total);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.corpo.mensagem : "Não foi possível carregar o histórico.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina]);

  const totalPaginas = Math.max(1, Math.ceil(total / 20));

  return (
    <div>
      <h1>Histórico de validações</h1>

      <div className="filtros">
        <div className="campo">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.values(StatusValidacao).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label>Método</label>
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            <option value="">Todos</option>
            {Object.values(MetodoValidacao).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label>De</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </div>
        <div className="campo">
          <label>Até</label>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        </div>
        <div className="campo" style={{ alignSelf: "flex-end" }}>
          <button
            className="botao-primario"
            type="button"
            onClick={() => {
              setPagina(1);
              carregar();
            }}
          >
            Filtrar
          </button>
        </div>
      </div>

      {erro && <p className="mensagem-erro">{erro}</p>}

      <div className="cartao" style={{ overflowX: "auto" }}>
        {carregando ? (
          <p>Carregando...</p>
        ) : itens.length === 0 ? (
          <p>Nenhuma validação encontrada para os filtros selecionados.</p>
        ) : (
          <table className="tabela-historico">
            <thead>
              <tr>
                <th>Atendimento</th>
                <th>Paciente</th>
                <th>Método</th>
                <th>Status</th>
                <th>Criado em</th>
                <th>Comprovante</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id}>
                  <td>{item.atendimento_id}</td>
                  <td>
                    {item.paciente_nome} <br />
                    <span style={{ color: "var(--cor-texto-suave)", fontSize: "0.78rem" }}>
                      {item.paciente_telefone_mascarado}
                    </span>
                  </td>
                  <td>{item.metodo}</td>
                  <td>
                    <span className={`status-pill ${item.status}`}>{item.status}</span>
                  </td>
                  <td>{new Date(item.criado_em).toLocaleString("pt-BR")}</td>
                  <td>
                    {item.comprovante ? (
                      <button className="botao-link" type="button" onClick={() => baixarPdf(item.comprovante!.id)}>
                        Baixar PDF
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="botao-secundario" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
          Anterior
        </button>
        <span style={{ fontSize: "0.85rem" }}>
          Página {pagina} de {totalPaginas}
        </span>
        <button
          className="botao-secundario"
          disabled={pagina >= totalPaginas}
          onClick={() => setPagina((p) => p + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
