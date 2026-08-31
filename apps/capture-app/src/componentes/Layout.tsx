import { PropsWithChildren, ReactNode } from "react";

interface LayoutProps {
  titulo: string;
  subtitulo?: string;
  selo?: string;
}

export function Cartao({ titulo, subtitulo, selo, children }: PropsWithChildren<LayoutProps>) {
  return (
    <div className="tela">
      <div className="cartao">
        <div className="cabecalho">
          {selo && <span className="selo">{selo}</span>}
          <h1>{titulo}</h1>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        {children}
        <div className="rodape-app">Processo seguro fornecido por AtendValida</div>
      </div>
    </div>
  );
}

export function IconeStatus({ children }: { children: ReactNode }) {
  return <div className="icone-status">{children}</div>;
}
