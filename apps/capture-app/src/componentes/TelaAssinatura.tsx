import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { ValidacaoResponseDto } from "@atendvalida/shared-types";
import { api, ErroApi } from "../api";
import { Cartao } from "./Layout";
import { TelaNaoConfigurado } from "./TelaNaoConfigurado";

interface Props {
  validacao: ValidacaoResponseDto;
  aoAtualizar: (v: ValidacaoResponseDto) => void;
}

export function TelaAssinatura({ validacao, aoAtualizar }: Props) {
  const padRef = useRef<SignatureCanvas>(null);
  const [enviando, setEnviando] = useState(false);
  const [naoConfigurado, setNaoConfigurado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function limpar() {
    padRef.current?.clear();
    setErro(null);
  }

  async function confirmar() {
    if (!padRef.current || padRef.current.isEmpty()) {
      setErro("Por favor, assine no campo indicado antes de confirmar.");
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const imagemBase64 = padRef.current.getTrimmedCanvas().toDataURL("image/png");
      const atualizada = await api.enviarAssinatura(validacao.id, imagemBase64);
      aoAtualizar(atualizada);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 503) {
        setNaoConfigurado(e.corpo.mensagem);
      } else if (e instanceof ErroApi) {
        setErro(e.corpo.mensagem);
      } else {
        setErro("Não foi possível enviar sua assinatura agora. Tente novamente.");
      }
    } finally {
      setEnviando(false);
    }
  }

  if (naoConfigurado) {
    return <TelaNaoConfigurado mensagem={naoConfigurado} />;
  }

  return (
    <Cartao titulo="Assine para confirmar" subtitulo="Use o dedo ou a caneta digital para assinar abaixo." selo="Assinatura em tela">
      <div className="assinatura-caixa">
        <SignatureCanvas
          ref={padRef}
          penColor="#0f172a"
          canvasProps={{ width: 340, height: 180, style: { width: "100%", height: "180px" } }}
        />
      </div>
      {erro && <p className="mensagem-erro">{erro}</p>}

      <button className="botao-primario" type="button" onClick={confirmar} disabled={enviando}>
        {enviando ? "Enviando..." : "Confirmar assinatura"}
      </button>
      <button className="botao-secundario" type="button" onClick={limpar} disabled={enviando}>
        Limpar e assinar novamente
      </button>
    </Cartao>
  );
}
