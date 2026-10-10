import { Suspense } from "react";
import { assistenteDisponivel } from "@/lib/servidor/assistente";
import { BotaoAssistente } from "./botao-assistente";

/** O botão do assistente, quando ele está ligado (chave da IA no servidor e opção no admin). */
export function Assistente() {
  return (
    <Suspense fallback={null}>
      <SeDisponivel />
    </Suspense>
  );
}

async function SeDisponivel() {
  return (await assistenteDisponivel()) ? <BotaoAssistente /> : null;
}
