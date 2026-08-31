import { Cartao, IconeStatus } from "./Layout";

const MENSAGENS: Record<string, { icone: string; titulo: string; texto: string }> = {
  confirmado: {
    icone: "✅",
    titulo: "Atendimento confirmado!",
    texto: "Sua confirmação foi registrada com sucesso. Você já pode fechar esta janela.",
  },
  expirado: {
    icone: "⏰",
    titulo: "Código expirado",
    texto: "O tempo para confirmação acabou. Peça à recepção para reenviar um novo código.",
  },
  rejeitado: {
    icone: "❌",
    titulo: "Confirmação não realizada",
    texto: "Não foi possível concluir a confirmação. Fale com a recepção.",
  },
  codigo_invalido: {
    icone: "🔒",
    titulo: "Muitas tentativas incorretas",
    texto: "O código foi bloqueado por segurança. Peça um novo reenvio para tentar novamente.",
  },
  erro: {
    icone: "⚠️",
    titulo: "Ocorreu um erro",
    texto: "Não foi possível concluir sua confirmação agora. Tente novamente em instantes.",
  },
};

export function TelaConcluida({ status }: { status: string }) {
  const info = MENSAGENS[status] ?? MENSAGENS.erro;
  return (
    <Cartao titulo={info.titulo}>
      <IconeStatus>{info.icone}</IconeStatus>
      <p style={{ textAlign: "center" }}>{info.texto}</p>
    </Cartao>
  );
}
