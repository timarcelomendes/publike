import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { MANDE_UM_OI } from "@/lib/whatsapp-oficial";
import { acessoFila } from "./filas";
import {
  codigoPeloModeloPode,
  configMeta,
  enviarCodigoPeloModelo,
  enviarTexto,
  type ConfigMeta,
  type SituacaoModelos,
} from "./whatsapp";

// O código de entrar pelo WhatsApp (20/11/2026; migrações 20270817120000 e 20270818120000). O Supabase Auth, com o
// login por celular ligado, gera o código e chama o gancho "Send SMS" (Authentication › Hooks, HTTPS, com o segredo em
// SUPABASE_SMS_HOOK_SECRET); este arquivo confere a assinatura (Standard Webhooks) e manda o código pela conversa do
// Publike. Só na janela de 24 horas da Meta: fora dela, devolve o erro com o que fazer (mandar um "oi" antes).
//
// O Auth acha a conta pelo celular do login. A mensagem diz em qual conta o código entra (o e-mail escondido) e, para
// quem está criando conta pelo celular, avisa quando o número está no cadastro de uma conta com e-mail ("entre por
// ela"): o aviso vai só para o WhatsApp do número, nunca para a tela. A troca de celular pelo Auth (o "new_phone" no
// gancho) é recusada: ligar o WhatsApp à conta é pelo código do Publike, em Meu perfil (src/lib/acoes/whatsapp-de-acesso.ts).

export const MARCA_DO_CODIGO = "[Código de acesso enviado]";
export const MARCA_DO_CODIGO_DE_LIGAR = "[Código para ligar o WhatsApp à conta enviado]";
export const FORA_DA_JANELA = MANDE_UM_OI;
/**
 * O status do "mande antes um oi". O Auth não repassa a mensagem do gancho: troca o 400 por "Invalid payload sent to
 * hook" e o resto por "Unexpected status code returned from hook: <status>" (e a resposta 200, mesmo com "error" no
 * corpo, vale como enviado). Um status só deste caso deixa a tela de entrar reconhecer o "fora da janela" pela
 * mensagem do Auth (`ehForaDaJanela` em src/components/form-entrar.tsx).
 */
export const STATUS_FORA_DA_JANELA = 403;
export const TROCA_PELO_PERFIL = "Para vincular o WhatsApp à sua conta, use Meu perfil, no Publike.";
export const EQUIPE_SO_COM_EMAIL = "Conta da equipe do Publike: entre com o e-mail.";
const NAO_PASSE = "Não passe este código para ninguém: o Publike nunca pede ele por mensagem.";

/**
 * A mensagem com o código (o código nunca fica guardado: a conversa registra só a marca). `conta`: o e-mail escondido
 * da conta em que o código entra. `declaradas`: para quem está criando conta, os e-mails escondidos das contas que têm
 * este número no cadastro.
 */
export function textoDoCodigo(codigo: string, extra: { conta?: string | null; declaradas?: string[] } = {}) {
  const partes = [`Seu código para entrar no Publike: *${codigo}*`];
  if (extra.conta) partes.push(`Ele entra na sua conta com o e-mail ${extra.conta}.`);
  else if (extra.declaradas?.length) {
    const quais =
      extra.declaradas.length === 1
        ? `de uma conta com o e-mail ${extra.declaradas[0]}`
        : `de contas com os e-mails ${extra.declaradas.join(" e ")}`;
    partes.push(
      `Atenção: este WhatsApp está no cadastro ${quais}. Se a conta é sua, entre por ela com o e-mail e, depois, vincule este WhatsApp em Meu perfil. Com o código acima, você cria uma conta nova.`,
    );
  }
  partes.push(`Digite no site para continuar. ${NAO_PASSE}`);
  return partes.join("\n\n");
}

/** A mensagem do código de ligar o WhatsApp à conta (Meu perfil › Entrar também pelo WhatsApp). */
export function textoDoCodigoDeLigar(codigo: string) {
  return `Seu código para vincular este WhatsApp à sua conta do Publike: *${codigo}*\n\nDigite no site para confirmar. Depois, você entra no Publike com um código que chega aqui. ${NAO_PASSE}`;
}

/**
 * Standard Webhooks: "webhook-signature" traz uma ou mais "v1,<base64>", a HMAC-SHA256 de "<id>.<timestamp>.<corpo>"
 * com o segredo (o que vem depois de "v1,whsec_", em base64). Aceita até 5 minutos de diferença no relógio.
 */
export function assinaturaDoGanchoValida(
  segredo: string,
  cab: { id: string | null; timestamp: string | null; assinatura: string | null },
  corpo: string,
  agoraSeg = Math.floor(Date.now() / 1000),
) {
  const chave = segredo.trim().replace(/^v1,/, "").replace(/^whsec_/, "");
  if (!chave || !cab.id || !cab.timestamp || !cab.assinatura) return false;
  const ts = Number(cab.timestamp);
  if (!Number.isFinite(ts) || Math.abs(agoraSeg - ts) > 300) return false;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(chave, "base64");
  } catch {
    return false;
  }
  if (!bytes.length) return false;
  const esperada = createHmac("sha256", bytes).update(`${cab.id}.${cab.timestamp}.${corpo}`).digest();
  return cab.assinatura.split(" ").some((parte) => {
    const [versao, valor] = parte.split(",");
    if (versao !== "v1" || !valor) return false;
    const recebida = Buffer.from(valor, "base64");
    return recebida.length === esperada.length && timingSafeEqual(recebida, esperada);
  });
}

/** O que o gancho recebe do Auth sobre a conta (só o que usamos). */
export type UsuarioDoGancho = {
  id?: string;
  phone?: string;
  email?: string;
  new_phone?: string;
  phone_confirmed_at?: string;
};

export type ResultadoDoCodigo = { ok: true } | { ok: false; status: number; mensagem: string };

/**
 * O gancho: decide para onde vai o código e o que a mensagem diz, e manda. A troca de celular pelo Auth ("new_phone")
 * é recusada; o código vai sempre para o celular do login da conta.
 */
export async function codigoDoGancho(usuario: UsuarioDoGancho, codigo: string): Promise<ResultadoDoCodigo> {
  if (usuario.new_phone) return { ok: false, status: 400, mensagem: TROCA_PELO_PERFIL };
  const telefone = (usuario.phone ?? "").replace(/\D/g, "");
  if (!telefone) return { ok: false, status: 400, mensagem: TROCA_PELO_PERFIL };
  const nova = !usuario.email && !usuario.phone_confirmed_at;
  return mandarCodigoPeloWhatsapp(telefone, codigo, { usuarioId: usuario.id ?? null, temEmail: Boolean(usuario.email), nova });
}

/**
 * Manda o código pelo WhatsApp do Publike para o celular do pedido. Com `conta` (o gancho), a mensagem diz em qual
 * conta entra (quem tem e-mail) ou avisa das contas com o número no cadastro (quem está criando conta), e a conta da
 * equipe do Publike ou da moderação não recebe o código.
 */
export async function mandarCodigoPeloWhatsapp(
  telefone: string,
  codigo: string,
  conta?: { usuarioId: string | null; temEmail: boolean; nova: boolean },
): Promise<ResultadoDoCodigo> {
  if (!/^\d{4,10}$/.test(codigo)) return { ok: false, status: 400, mensagem: "Código inválido." };
  const acesso = acessoFila();
  const cfg = configMeta();
  if (!acesso || !cfg) return { ok: false, status: 503, mensagem: "O WhatsApp do Publike não está ligado." };
  const { cliente: banco, chave } = acesso;
  // a conta do pedido: da equipe? em qual entra? quem tem o número no cadastro? (sem a migração 20270818120000, a
  // função não existe: só o código)
  let extra: { conta?: string | null; declaradas?: string[] } = {};
  if (conta?.usuarioId) {
    const { data: contas, error: erroContas } = await banco.rpc("servidor_whatsapp_contas_do_numero", {
      p_chave: chave,
      p_numero: telefone,
      p_usuario: conta.usuarioId,
    });
    const info = (erroContas ? null : contas) as { conta?: string | null; declaradas?: string[]; equipe?: boolean } | null;
    if (info?.equipe) return { ok: false, status: 400, mensagem: EQUIPE_SO_COM_EMAIL };
    if (info && conta.temEmail) extra = { conta: info.conta ?? null };
    else if (info && conta.nova) extra = { declaradas: (info.declaradas ?? []).slice(0, 2) };
  }
  // entrar com um toque (migração 20270920120000): o site tocou no link da conversa deste número no último minuto e
  // pega o código ele mesmo; não vai mensagem. Sem a migração, segue como antes
  const { data: pego } = await banco.rpc("servidor_guardar_codigo_pego", { p_chave: chave, p_numero: telefone, p_codigo: codigo });
  if (pego === true) return { ok: true };
  const { data, error } = await banco.rpc("servidor_whatsapp_codigo", { p_chave: chave, p_numero: telefone });
  if (error) return { ok: false, status: 503, mensagem: "Não deu para conferir a conversa agora." };
  const c = data as unknown as { conversa: string | null; numero: string | null; na_janela: boolean };
  if (!c.conversa || !c.numero || !c.na_janela) {
    // fora da janela de 24 horas (23/11/2026; Marcelo: "acho necessário"): a conta que já existe recebe pelo modelo de
    // autenticação da Meta, sem o "oi" antes. Quem está criando conta continua mandando o "oi": o modelo é pago, e o
    // número digitado no site ainda não provou ser de ninguém
    if (conta?.usuarioId && !conta.nova) {
      const r = await codigoPeloModelo(cfg, banco, chave, c.numero ?? telefone, codigo);
      if (typeof r === "object") {
        if (c.conversa) {
          await banco.rpc("servidor_whatsapp_conversa_saida", {
            p_chave: chave,
            p_conversa: c.conversa,
            p_texto: MARCA_DO_CODIGO,
            p_wamid: r.wamid,
          });
        }
        return { ok: true };
      }
      if (r === "falhou")
        return { ok: false, status: 502, mensagem: "O WhatsApp não mandou o código agora. Tente de novo em instantes." };
    }
    return { ok: false, status: STATUS_FORA_DA_JANELA, mensagem: FORA_DA_JANELA };
  }
  const r = await enviarTexto(cfg, c.numero, textoDoCodigo(codigo, extra));
  if (!r.ok) {
    console.error("Publike: o código de acesso não saiu pelo WhatsApp:", r.erro);
    return { ok: false, status: 502, mensagem: "O WhatsApp não mandou o código agora. Tente de novo em instantes." };
  }
  await banco.rpc("servidor_whatsapp_conversa_saida", {
    p_chave: chave,
    p_conversa: c.conversa,
    p_texto: MARCA_DO_CODIGO,
    p_wamid: r.wamid,
  });
  return { ok: true };
}

/**
 * A impressão do código de ligar (o banco guarda só ela): HMAC-SHA256 com o segredo do gancho, sobre a pessoa, o número
 * do login e o código. Sem o segredo, null (o recurso está desligado).
 */
export function impressaoDoCodigoDeLigar(usuarioId: string, numero: string, codigo: string): string | null {
  const segredo = (process.env.SUPABASE_SMS_HOOK_SECRET ?? "").trim();
  if (!segredo) return null;
  return createHmac("sha256", segredo).update(`ligar|${usuarioId}|${numero}|${codigo}`).digest("hex");
}

/**
 * O código pelo modelo de autenticação, se a Meta já aprovou (o `conferirModelos` cadastra). "sem_modelo": ainda não
 * pode (o "oi" de antes). O `servidor_whatsapp_codigo` dá a conversa só quando ela existe: sem ela, vai para o
 * celular do login.
 */
async function codigoPeloModelo(
  cfg: ConfigMeta,
  banco: NonNullable<ReturnType<typeof acessoFila>>["cliente"],
  chave: string,
  numero: string,
  codigo: string,
): Promise<{ wamid: string } | "falhou" | "sem_modelo"> {
  const { data, error } = await banco.rpc("servidor_whatsapp_config", { p_chave: chave });
  if (error) return "sem_modelo";
  const conf = (data ?? {}) as { ativo?: boolean; modelos?: SituacaoModelos };
  if (!conf.ativo || !codigoPeloModeloPode(conf.modelos ?? {})) return "sem_modelo";
  const r = await enviarCodigoPeloModelo(cfg, numero, codigo);
  if (!r.ok) {
    console.error("Publike: o código de acesso não saiu pelo modelo:", r.erro);
    return "falhou";
  }
  return { wamid: r.wamid };
}
