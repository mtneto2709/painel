import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ValidacaoResponseDto } from "@atendvalida/shared-types";
import { api, ErroApi } from "../api";
import { Cartao } from "./Layout";

const esquemaCodigo = z.object({
  codigo: z
    .string()
    .min(4, "Informe o código recebido.")
    .max(8, "Código inválido.")
    .regex(/^\d+$/, "O código deve conter apenas números."),
});
type FormCodigo = z.infer<typeof esquemaCodigo>;

interface Props {
  validacao: ValidacaoResponseDto;
  aoAtualizar: (v: ValidacaoResponseDto) => void;
}

function segundosRestantes(expiraEm: string | null): number {
  if (!expiraEm) return 0;
  return Math.max(0, Math.floor((new Date(expiraEm).getTime() - Date.now()) / 1000));
}

export function TelaToken({ validacao, aoAtualizar }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    reset,
  } = useForm<FormCodigo>({ resolver: zodResolver(esquemaCodigo) });

  const [restante, setRestante] = useState(() => segundosRestantes(validacao.expira_em));
  const [reenviando, setReenviando] = useState(false);
  const [avisoReenvio, setAvisoReenvio] = useState<string | null>(null);

  useEffect(() => {
    setRestante(segundosRestantes(validacao.expira_em));
    const intervalo = setInterval(() => setRestante(segundosRestantes(validacao.expira_em)), 1000);
    return () => clearInterval(intervalo);
  }, [validacao.expira_em]);

  const canalDescricao = useMemo(
    () => (validacao.metodo === "token_sms" ? "SMS" : "WhatsApp"),
    [validacao.metodo],
  );

  async function aoEnviar(dados: FormCodigo) {
    try {
      const atualizada = await api.confirmarToken(validacao.id, dados.codigo);
      aoAtualizar(atualizada);
      reset();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        setError("codigo", { message: erro.corpo.mensagem });
      } else {
        setError("codigo", { message: "Não foi possível confirmar agora. Tente novamente." });
      }
    }
  }

  async function aoReenviar() {
    setReenviando(true);
    setAvisoReenvio(null);
    try {
      const atualizada = await api.reenviarToken(validacao.id);
      aoAtualizar(atualizada);
      setAvisoReenvio(`Um novo código foi enviado por ${canalDescricao}.`);
    } catch (erro) {
      setAvisoReenvio(erro instanceof ErroApi ? erro.corpo.mensagem : "Não foi possível reenviar agora.");
    } finally {
      setReenviando(false);
    }
  }

  const expirado = restante <= 0;

  return (
    <Cartao
      titulo="Confirme seu atendimento"
      subtitulo={`Enviamos um código de confirmação por ${canalDescricao}.`}
      selo={canalDescricao}
    >
      <form onSubmit={handleSubmit(aoEnviar)}>
        <div className="campo-codigo" style={{ display: "block" }}>
          <input
            {...register("codigo")}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={8}
            style={{ width: "100%", letterSpacing: "0.5em", fontSize: "1.6rem", textAlign: "center" }}
            aria-label="Código de confirmação"
          />
        </div>
        {errors.codigo && <p className="mensagem-erro">{errors.codigo.message}</p>}
        {validacao.tentativas > 0 && !errors.codigo && (
          <p className="contador">Tentativa(s) realizadas: {validacao.tentativas}</p>
        )}

        <button className="botao-primario" type="submit" disabled={isSubmitting || expirado}>
          {isSubmitting ? "Confirmando..." : "Confirmar código"}
        </button>

        <p className="contador">
          {expirado ? "O código expirou." : `Expira em ${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, "0")}`}
        </p>

        <button
          className="botao-secundario"
          type="button"
          onClick={aoReenviar}
          disabled={reenviando || (!expirado && restante > 240)}
        >
          {reenviando ? "Reenviando..." : "Reenviar código"}
        </button>
        {avisoReenvio && <p className="mensagem-sucesso">{avisoReenvio}</p>}
      </form>
    </Cartao>
  );
}
