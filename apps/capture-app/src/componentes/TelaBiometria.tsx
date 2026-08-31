import { useRef, useState } from "react";
import Webcam from "react-webcam";
import { ValidacaoResponseDto } from "@atendvalida/shared-types";
import { api, ErroApi } from "../api";
import { Cartao } from "./Layout";
import { TelaNaoConfigurado } from "./TelaNaoConfigurado";

interface Props {
  validacao: ValidacaoResponseDto;
  aoAtualizar: (v: ValidacaoResponseDto) => void;
}

function TelaConsentimento({ onAceitar }: { onAceitar: () => void }) {
  const [marcado, setMarcado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  return (
    <Cartao titulo="Consentimento para biometria facial" selo="LGPD">
      <div className="termo-consentimento">
        Para confirmar sua presença por reconhecimento facial, precisamos capturar uma foto do seu
        rosto e compará-la com o documento de referência cadastrado pela unidade de saúde. Essa
        imagem é tratada como dado sensível (LGPD, Lei nº 13.709/2018) e usada exclusivamente para
        esta verificação. Você pode recusar e pedir para confirmar por outro método disponível.
      </div>
      <label className="linha-checkbox">
        <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} />
        <span>Li e concordo com a captura e o uso da minha imagem facial para esta confirmação.</span>
      </label>
      <button
        className="botao-primario"
        type="button"
        disabled={!marcado || enviando}
        onClick={async () => {
          setEnviando(true);
          onAceitar();
        }}
      >
        {enviando ? "Registrando..." : "Concordo e continuar"}
      </button>
    </Cartao>
  );
}

export function TelaBiometria({ validacao, aoAtualizar }: Props) {
  const webcamRef = useRef<Webcam>(null);
  const [etapa, setEtapa] = useState<"consentimento" | "captura">("consentimento");
  const [consentimentoId, setConsentimentoId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [naoConfigurado, setNaoConfigurado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function aoAceitarConsentimento() {
    try {
      const resp = await api.registrarConsentimento(validacao.id, "biometria_facial");
      setConsentimentoId(resp.consentimento_id);
      setEtapa("captura");
    } catch {
      setErro("Não foi possível registrar seu consentimento agora. Tente novamente.");
    }
  }

  async function capturarEEnviar() {
    const imagemBase64 = webcamRef.current?.getScreenshot();
    if (!imagemBase64) {
      setErro("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const atualizada = await api.enviarBiometria(validacao.id, imagemBase64, consentimentoId ?? "");
      aoAtualizar(atualizada);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 503) {
        setNaoConfigurado(e.corpo.mensagem);
      } else if (e instanceof ErroApi) {
        setErro(e.corpo.mensagem);
      } else {
        setErro("Não foi possível enviar sua captura agora. Tente novamente.");
      }
    } finally {
      setEnviando(false);
    }
  }

  if (naoConfigurado) {
    return <TelaNaoConfigurado mensagem={naoConfigurado} />;
  }

  if (etapa === "consentimento") {
    return <TelaConsentimento onAceitar={aoAceitarConsentimento} />;
  }

  return (
    <Cartao titulo="Posicione seu rosto" subtitulo="Fique em um local bem iluminado e olhe para a câmera." selo="Biometria facial">
      <div className="webcam-caixa">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          videoConstraints={{ facingMode: "user" }}
          style={{ width: "100%" }}
        />
      </div>
      {erro && <p className="mensagem-erro">{erro}</p>}
      <button className="botao-primario" type="button" onClick={capturarEEnviar} disabled={enviando}>
        {enviando ? "Enviando..." : "Capturar e confirmar"}
      </button>
    </Cartao>
  );
}
