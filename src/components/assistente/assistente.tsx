import { Suspense } from "react";
import { MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { assistenteDisponivel } from "@/lib/servidor/assistente";
import { BotaoAssistente } from "./botao-assistente";

/**
 * O "Chat" do canto da tela: Ajuda (o assistente, quando ligado: chave da IA no servidor
 * e opção no admin) e Conversas (os matches de quem tem conta).
 */
export function Assistente() {
  return (
    <Suspense fallback={null}>
      <SeDisponivel />
    </Suspense>
  );
}

async function SeDisponivel() {
  const [ajuda, usuario] = await Promise.all([assistenteDisponivel(), MODO_DEMO ? null : obterUsuario()]);
  // sem assistente e sem conta, não há o que mostrar no chat
  if (!ajuda && !usuario) return null;
  return <BotaoAssistente ajuda={ajuda} usuarioId={usuario?.id ?? null} />;
}
