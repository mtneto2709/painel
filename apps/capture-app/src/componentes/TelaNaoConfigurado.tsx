import { Cartao, IconeStatus } from "./Layout";

interface Props {
  mensagem?: string;
}

/**
 * Estado gracioso para métodos ainda stubados (assinatura em tela e
 * biometria facial): a tela nunca "quebra", apenas informa que o método
 * não está disponível para esta unidade de saúde.
 */
export function TelaNaoConfigurado({ mensagem }: Props) {
  return (
    <Cartao titulo="Método indisponível no momento">
      <IconeStatus>🛠️</IconeStatus>
      <p style={{ textAlign: "center" }}>
        {mensagem ?? "Este método de validação ainda não está disponível para esta unidade de saúde."}
      </p>
      <p style={{ textAlign: "center", color: "var(--cor-texto-suave)", fontSize: "0.85rem" }}>
        Por favor, entre em contato com a recepção para concluir sua confirmação por outro método.
      </p>
    </Cartao>
  );
}
