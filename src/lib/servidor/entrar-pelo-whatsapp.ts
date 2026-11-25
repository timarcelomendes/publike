import "server-only";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { telefoneDoLogin } from "@/lib/telefone-login";
import { acessoFila } from "./filas";

// Entrar com um toque pelo WhatsApp (migração 20270920120000): o link da conversa (24 horas, uma vez, só aquele
// número). O toque abre /entrar/whatsapp, que mostra o número escondido e o botão; o botão faz o login pelo celular
// sem a pessoa digitar o código (src/app/api/auth/entrar-whatsapp/route.ts).
//
// O botão dos avisos (25/11/2026, migração 20271002120000; a Super Box publicou pelo WhatsApp e o "Ver a candidatura"
// caía no entrar do site): para a conta cujo login é o número do aviso, o mesmo link, por 7 dias. Vencido ou usado,
// quem já está dentro vai direto; quem não está escreve "entrar" na conversa e recebe outro, para o mesmo lugar.

export const TOKEN_ENTRADA = /^[0-9a-f]{64}$/;

/** O link de entrar do aviso vale 7 dias: o aviso pode ser lido dias depois (os lembretes de 1 e 3 dias trazem outro). */
export const HORAS_DO_LINK_DO_AVISO = 168;

/**
 * O fim do link do botão do aviso ("painel/caixa?c=…", sem a barra) trocado pelo de entrar com um toque, para o mesmo
 * destino ("entrar/whatsapp?t=…"). null: fica o de sempre (a conta entra de outro jeito, é da equipe, ou falta a
 * migração 20271002120000).
 */
export async function linkDoAvisoComEntrar(
  acesso: { cliente: ClienteBanco; chave: string },
  aviso: { conta_id: string; numero: string },
  fimDoLink: string,
): Promise<string | null> {
  const destino = `/${fimDoLink.replace(/^\/+/, "")}`;
  if (destino.length > 300 || destinoSeguro(destino) !== destino) return null;
  const { data, error } = await acesso.cliente.rpc("servidor_entrada_para_aviso", {
    p_chave: acesso.chave,
    p_conta: aviso.conta_id,
    p_numero: aviso.numero,
    p_destino: destino,
    p_horas: HORAS_DO_LINK_DO_AVISO,
  });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: o link de entrar do aviso não foi criado:", error.message);
    return null;
  }
  return typeof data === "string" && TOKEN_ENTRADA.test(data) ? `entrar/whatsapp?t=${data}` : null;
}

/**
 * O "entrar" na conversa: o destino do último link do número (dos últimos 7 dias), para o link novo levar aonde o
 * vencido levava (o aviso da candidatura, por exemplo). null: nenhum (ou sem a migração 20271002120000).
 */
export async function ultimoDestinoDeEntrar(numero: string): Promise<string | null> {
  const acesso = acessoFila();
  if (!acesso) return null;
  const { data, error } = await acesso.cliente.rpc("servidor_ultimo_destino_de_entrada", {
    p_chave: acesso.chave,
    p_numero: numero,
  });
  if (error || typeof data !== "string") return null;
  return destinoSeguro(data) === data ? data : null;
}

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

export type LinkDeEntrar = { numero: string; destino: string };

const linkDoBanco = (data: unknown): LinkDeEntrar | null => {
  const v = (data ?? null) as { numero?: unknown; destino?: unknown } | null;
  return typeof v?.numero === "string" && v.numero ? { numero: v.numero, destino: destinoSeguro(v.destino) } : null;
};

/**
 * O link da página /entrar/whatsapp, sem gastar: valendo (`vale`: o botão entra) ou já usado ou vencido (o número e o
 * destino, para quem já está dentro ir direto; migração 20271002120000). null: o link não existe (ou sem o servidor).
 */
export async function verLinkDeEntrar(token: string): Promise<{ vale: boolean; link: LinkDeEntrar } | null> {
  const acesso = acessoFila();
  if (!acesso || !TOKEN_ENTRADA.test(token)) return null;
  const valendo = await acesso.cliente.rpc("servidor_ver_entrada_whatsapp", { p_chave: acesso.chave, p_token: token });
  const link = valendo.error ? null : linkDoBanco(valendo.data);
  if (link) return { vale: true, link };
  const velho = await acesso.cliente.rpc("servidor_destino_da_entrada", { p_chave: acesso.chave, p_token: token });
  const vencido = velho.error ? null : linkDoBanco(velho.data);
  return vencido ? { vale: false, link: vencido } : null;
}

/** Quem já está dentro é a conta do número do link (o login dela é o celular do número, no formato do Auth). */
export function naContaDoNumero(telefoneDaSessao: string | null | undefined, numero: string) {
  const login = telefoneDoLogin(numero);
  return Boolean(login && telefoneDaSessao && telefoneDaSessao.replace(/\D/g, "") === login);
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
