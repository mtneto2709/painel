import { BrowserRouter, Route, Routes } from "react-router-dom";
import { FluxoValidacao } from "./componentes/FluxoValidacao";
import { TelaErro } from "./componentes/TelaErro";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/v/:id" element={<FluxoValidacao />} />
        <Route path="/" element={<FluxoValidacao />} />
        <Route path="*" element={<TelaErro mensagem="Página não encontrada." />} />
      </Routes>
    </BrowserRouter>
  );
}
