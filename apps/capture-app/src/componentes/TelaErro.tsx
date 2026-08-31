import { Cartao, IconeStatus } from "./Layout";

export function TelaErro({ mensagem }: { mensagem: string }) {
  return (
    <Cartao titulo="Não foi possível continuar">
      <IconeStatus>⚠️</IconeStatus>
      <p className="mensagem-erro">{mensagem}</p>
    </Cartao>
  );
}
