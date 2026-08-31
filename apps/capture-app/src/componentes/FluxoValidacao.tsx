import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ValidacaoResponseDto } from "@atendvalida/shared-types";
import { api, ErroApi } from "../api";
import { TelaCarregando } from "./TelaCarregando";
import { TelaErro } from "./TelaErro";
import { TelaToken } from "./TelaToken";
import { TelaAssinatura } from "./TelaAssinatura";
import { TelaBiometria } from "./TelaBiometria";
import { TelaConcluida } from "./TelaConcluida";
import { TelaNaoConfigurado } from "./TelaNaoConfigurado";

export function FluxoValidacao() {
  const { id: idDaRota } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const id = idDaRota ?? searchParams.get("validacao_id") ?? searchParams.get("id");

  const [validacao, setValidacao] = useState<ValidacaoResponseDto | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setErro("Nenhuma validação foi informada. Verifique o link recebido.");
      return;
    }
    api
      .obterValidacao(id)
      .then(setValidacao)
      .catch((e) =>
        setErro(e instanceof ErroApi ? e.corpo.mensagem : "Não foi possível carregar sua confirmação."),
      );
  }, [id]);

  if (erro) return <TelaErro mensagem={erro} />;
  if (!validacao) return <TelaCarregando />;

  if (validacao.status === "metodo_nao_configurado") {
    return <TelaNaoConfigurado mensagem={validacao.mensagem} />;
  }

  if (["confirmado", "expirado", "rejeitado", "codigo_invalido", "erro"].includes(validacao.status)) {
    return <TelaConcluida status={validacao.status} />;
  }

  switch (validacao.metodo) {
    case "token_whatsapp":
    case "token_sms":
      return <TelaToken validacao={validacao} aoAtualizar={setValidacao} />;
    case "assinatura_tela":
      return <TelaAssinatura validacao={validacao} aoAtualizar={setValidacao} />;
    case "biometria_facial":
      return <TelaBiometria validacao={validacao} aoAtualizar={setValidacao} />;
    default:
      return <TelaErro mensagem="Método de validação desconhecido." />;
  }
}
