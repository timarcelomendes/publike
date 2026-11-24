import "server-only";
import { telefoneDoLogin } from "@/lib/telefone-login";
import { acessoFila } from "./filas";

// Entrar com um toque pelo WhatsApp (migração 20270920120000): o link da conversa (24 horas, uma vez, só aquele
// número). O toque abre /entrar/whatsapp, que mostra o número escondido e o botão; o botão faz o login pelo celular
// sem a pessoa digitar o código (src/app/api/auth/entrar-whatsapp/route.ts).

export const TOKEN_ENTRADA = /^[0-9a-f]{64}$/;

/** O caminho do link de entrar (para o botão da conversa), ou null (sem a migração ou sem o servidor). */
export async function caminhoDeEntrar(numero: string, destino: string): Promise<string | null> {
  const acesso = acessoFila();
  if (!acesso) return null;
  const { data, error } = await acesso.cliente.rpc("servidor_criar_entrada_whatsapp", {
    p_chave: acesso.chave,
    p_numero: numero,
    p_destino: destino,
  });
  if (error || typeof data !== "string" || !TOKEN_ENTRADA.test(data)) {
    if (error && error.code !== "PGRST202") console.error("Publike: o link de entrar não foi criado:", error.message);
    return null;
  }
  return `/entrar/whatsapp?t=${data}`;
}

/** "5562982028335" ou "556282028335" (o do WhatsApp, sem o 9) → "(62) 9····-8335". */
export function numeroEscondido(numero: string) {
  const d = (telefoneDoLogin(numero) ?? numero.replace(/\D/g, "")).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length < 10) return "seu WhatsApp";
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)}····-${d.slice(-4)}`;
}

/** O destino seguro do link (só caminhos do site). */
export function destinoSeguro(destino: unknown) {
  return typeof destino === "string" && /^\/[A-Za-z0-9/?=&_%.-]*$/.test(destino) && !destino.startsWith("//")
    ? destino
    : "/perfil/curriculo";
}
