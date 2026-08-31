import { Cartao } from "./Layout";

export function TelaCarregando() {
  return (
    <Cartao titulo="Carregando..." subtitulo="Só um instante, estamos preparando sua confirmação.">
      <div style={{ textAlign: "center", padding: "12px 0" }}>⏳</div>
    </Cartao>
  );
}
