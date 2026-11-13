import "server-only";
import { MODO_DEMO } from "@/lib/config";
import {
  fechadaNaGupy,
  lerPaginaDaGupy,
  linkLimpoDaGupy,
  paginaDeVagasDaGupy,
  vagasDaPaginaDaGupy,
  type VagaDaGupy,
} from "@/lib/gupy";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { acessoFila } from "./filas";

// O link das vagas com candidatura no site da empresa (claude/plano-candidatura-no-site-da-empresa.md, partes 4 e 5):
// ler a vaga da Gupy para o "Puxar do link" do admin e conferir, uma vez por dia, se a vaga ainda está aberta lá.
// Quando a Gupy muda a página e o Publike deixa de entender, a equipe recebe um e-mail e vê no Painel do admin
// ("Precisa de você"), só na primeira vez, até voltar a funcionar (servidor_alerta, migração 20270513120000).

const AGENTE = "Mozilla/5.0 (compatible; Publike/1.0; +https://publike.org)";
/** A página da vaga na Gupy tem uns 300 KB; mais que isto, não é a página da vaga. */
const MAX_BYTES = 4 * 1024 * 1024;

/** O alerta do formato da Gupy (privado.alertas_do_sistema). */
export const ALERTA_FORMATO_GUPY = "formato_gupy";

/** Nos testes, os links vão para um servidor falso: https://x.gupy.io/jobs/1 vira <base>/x.gupy.io/jobs/1. */
function enderecoDoPedido(link: string) {
  const teste = process.env.LINKS_CONFERIR_URL;
  return teste ? `${teste.replace(/\/+$/, "")}/${link.replace(/^https:\/\//, "")}` : link;
}

/** Um endereço público de verdade: nada de IP, localhost ou nome sem ponto (o link vem de quem publica). */
function hostPublico(host: string) {
  const h = host.toLowerCase();
  if (!h.includes(".") || h.startsWith("[") || h.includes(":")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false;
  return !/(^|\.)(localhost|local|internal|localdomain|home|lan|test|invalid|example)$/.test(h);
}

async function lerCorpo(r: Response): Promise<string | null> {
  const leitor = r.body?.getReader();
  if (!leitor) return null;
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await leitor.cancel().catch(() => {});
      return null;
    }
    partes.push(value);
  }
  return Buffer.concat(partes).toString("utf8");
}

type Pagina = { status: number; html: string | null; final: string } | { erro: string };

/** Abre o link seguindo até 4 redirecionamentos, só para endereços https públicos. */
async function abrir(link: string, { corpo = true } = {}): Promise<Pagina> {
  let atual = link;
  for (let salto = 0; salto <= 4; salto++) {
    let u: URL;
    try {
      u = new URL(atual);
    } catch {
      return { erro: "o link não é um endereço" };
    }
    if (u.protocol !== "https:" || !hostPublico(u.hostname))
      return { erro: `o link leva para um endereço que o Publike não abre (${u.protocol}//${u.hostname})` };
    let r: Response;
    try {
      r = await fetch(enderecoDoPedido(u.toString()), {
        headers: { "user-agent": AGENTE, accept: "text/html,application/xhtml+xml", "accept-language": "pt-BR" },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
    } catch (e) {
      return { erro: e instanceof Error && e.name === "TimeoutError" ? "o site não respondeu em 10 s" : "o site não abriu" };
    }
    const destino = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (destino) {
      await r.body?.cancel().catch(() => {});
      atual = new URL(destino, u).toString();
      continue;
    }
    const html =
      corpo && (r.headers.get("content-type") ?? "").includes("html") ? await lerCorpo(r).catch(() => null) : null;
    if (!corpo || html === null) await r.body?.cancel().catch(() => {});
    return { status: r.status, html, final: atual };
  }
  return { erro: "o link redireciona vezes demais" };
}

export type BuscaDaGupy =
  | { tipo: "vaga"; vaga: VagaDaGupy }
  | { tipo: "nao_existe" }
  | { tipo: "falhou"; erro: string }
  /** a página abriu, mas o Publike não entendeu (a Gupy mudou o formato) */
  | { tipo: "formato"; detalhe: string };

/** Lê a vaga da página dela na Gupy. */
export async function buscarVagaDaGupy(link: string): Promise<BuscaDaGupy> {
  const limpo = linkLimpoDaGupy(link);
  if (!limpo) return { tipo: "falhou", erro: "não é o link de uma vaga na Gupy (https://empresa.gupy.io/jobs/…)" };
  const p = await abrir(limpo);
  if ("erro" in p) return { tipo: "falhou", erro: p.erro };
  if (p.status === 404 || p.status === 410) return { tipo: "nao_existe" };
  if (p.status !== 200) return { tipo: "falhou", erro: `a Gupy respondeu ${p.status}` };
  // levou para outra página (a de carreiras, o login): sem como saber se a vaga fechou; tenta de novo outro dia
  const final = linkLimpoDaGupy(p.final);
  if (final !== limpo) return { tipo: "falhou", erro: `a Gupy levou o link para outra página (${p.final})` };
  if (!p.html) return { tipo: "formato", detalhe: "a página da vaga não veio em HTML" };
  const lida = lerPaginaDaGupy(p.html, limpo);
  return lida.ok ? { tipo: "vaga", vaga: lida.vaga } : { tipo: "formato", detalhe: lida.formato };
}

export type ListaDaGupy =
  | { tipo: "lista"; pagina: string; vagas: VagaDaGupy[]; total: number; naoAbriram: number }
  | { tipo: "nao_existe" }
  | { tipo: "falhou"; erro: string }
  | { tipo: "formato"; detalhe: string; link: string };

/**
 * As vagas da página de vagas da empresa na Gupy (https://<empresa>.gupy.io/), cada uma lida da página dela (a
 * mesma leitura do "Puxar do link"), até `limite`, 4 de cada vez. `total`: quantas a página tem.
 */
export async function buscarVagasDaPaginaDaGupy(link: string, limite = 40): Promise<ListaDaGupy> {
  const pagina = paginaDeVagasDaGupy(link);
  if (!pagina) return { tipo: "falhou", erro: "não é o link de uma página de vagas da Gupy (https://empresa.gupy.io)" };
  const p = await abrir(pagina);
  if ("erro" in p) return { tipo: "falhou", erro: p.erro };
  if (p.status === 404 || p.status === 410) return { tipo: "nao_existe" };
  if (p.status !== 200) return { tipo: "falhou", erro: `a Gupy respondeu ${p.status}` };
  if (!p.html) return { tipo: "formato", detalhe: "a página de vagas não veio em HTML", link: pagina };
  const lidos = vagasDaPaginaDaGupy(p.html, pagina);
  if (lidos.formato) return { tipo: "formato", detalhe: lidos.formato, link: pagina };
  const ids = lidos.ids.slice(0, Math.max(1, limite));
  const vagas: VagaDaGupy[] = [];
  let naoAbriram = 0;
  let formato: { detalhe: string; link: string } | null = null;
  for (let i = 0; i < ids.length; i += 4) {
    const lote = await Promise.all(ids.slice(i, i + 4).map((id) => buscarVagaDaGupy(`${pagina}jobs/${id}`)));
    for (const [j, b] of lote.entries()) {
      if (b.tipo === "vaga") vagas.push(b.vaga);
      else {
        naoAbriram++;
        if (b.tipo === "formato") formato ??= { detalhe: b.detalhe, link: `${pagina}jobs/${ids[i + j]}` };
      }
    }
  }
  // nenhuma vaga entendida e alguma com o formato mudado: é a Gupy que mudou
  if (!vagas.length && formato) return { tipo: "formato", ...formato };
  return { tipo: "lista", pagina, vagas, total: lidos.ids.length, naoAbriram };
}

export type Conferencia =
  | { situacao: "aberta"; entendeuGupy: boolean }
  | { situacao: "fechada"; motivo: string; entendeuGupy: boolean }
  | { situacao: "falhou"; erro: string }
  | { situacao: "formato"; detalhe: string };

/** Hoje em Brasília ("2026-11-13"). */
export const hojeEmBrasilia = (agora = Date.now()) =>
  new Date(agora).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/**
 * A vaga ainda está aberta no site da empresa? Na Gupy, pela situação e pelo fim da publicação; nos outros sites,
 * pela resposta da página (404 ou 410: não existe mais). Site fora do ar não fecha a vaga (tenta de novo).
 */
export async function conferirLink(link: string, hoje = hojeEmBrasilia()): Promise<Conferencia> {
  if (linkLimpoDaGupy(link)) {
    const b = await buscarVagaDaGupy(link);
    if (b.tipo === "vaga") {
      const motivo = fechadaNaGupy(b.vaga, hoje);
      return motivo ? { situacao: "fechada", motivo, entendeuGupy: true } : { situacao: "aberta", entendeuGupy: true };
    }
    if (b.tipo === "nao_existe")
      return { situacao: "fechada", motivo: "a página da vaga não existe mais na Gupy", entendeuGupy: false };
    if (b.tipo === "formato") return { situacao: "formato", detalhe: b.detalhe };
    return { situacao: "falhou", erro: b.erro };
  }
  const p = await abrir(link, { corpo: false });
  if ("erro" in p) return { situacao: "falhou", erro: p.erro };
  if (p.status === 404 || p.status === 410)
    return { situacao: "fechada", motivo: "a página da vaga não existe mais", entendeuGupy: false };
  if (p.status >= 200 && p.status < 300) return { situacao: "aberta", entendeuGupy: false };
  return { situacao: "falhou", erro: `o site respondeu ${p.status}` };
}

/**
 * A Gupy mudou a página e o Publike não entendeu: abre o alerta. Só na primeira vez (até voltar a funcionar) a equipe
 * recebe o e-mail; o Painel do admin mostra enquanto estiver aberto. true: o e-mail entrou na fila agora.
 */
export async function avisarFormatoDaGupy(
  detalhe: string,
  link: string,
  acesso: { cliente: ClienteBanco; chave: string } | null = acessoFila(),
): Promise<boolean> {
  if (!acesso) return false;
  const { data, error } = await acesso.cliente.rpc("servidor_alerta", {
    p_chave: acesso.chave,
    p_alerta: ALERTA_FORMATO_GUPY,
    p_titulo: "A Gupy mudou a página das vagas",
    p_detalhe:
      `O Publike não entendeu a página da vaga ${link}: ${detalhe}. Enquanto não for ajustado, o “Puxar do link” ` +
      "não preenche o formulário (preencha à mão ou use Importar com a IA) e a conferência diária não fecha as vagas " +
      "da Gupy. A leitura fica em src/lib/gupy.ts.",
  });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: não deu para abrir o alerta da Gupy: ${error.message}`);
    return false;
  }
  console.warn(`Publike: a Gupy mudou a página das vagas (${detalhe}).`);
  return data === true;
}

/** O Publike voltou a entender a página da Gupy: fecha o alerta (se quebrar de novo, avisa de novo). */
export async function formatoDaGupyVoltou(acesso: { cliente: ClienteBanco; chave: string } | null = acessoFila()) {
  if (!acesso) return;
  const { error } = await acesso.cliente.rpc("servidor_alerta_resolvido", {
    p_chave: acesso.chave,
    p_alerta: ALERTA_FORMATO_GUPY,
  });
  if (error && error.code !== "PGRST202") console.error(`Publike: não deu para fechar o alerta da Gupy: ${error.message}`);
}

/**
 * A conferência diária (o robô das filas): até `limite` vagas do site por volta, cada uma uma vez por dia. A vaga que
 * fechou lá sai do Publike (encerrada); site fora do ar tenta de novo; a Gupy com outro formato abre o alerta e não
 * mexe na vaga.
 */
export async function conferirLinksDeCandidatura(
  limite = 5,
): Promise<{ conferidos: number; fechadas: number; motivo?: string }> {
  const vazio = { conferidos: 0, fechadas: 0 };
  if (MODO_DEMO) return vazio;
  const acesso = acessoFila();
  if (!acesso) return vazio;
  const { cliente, chave } = acesso;
  const { data, error } = await cliente.rpc("servidor_links_para_conferir", { p_chave: chave, p_limite: limite });
  // antes da migração 20270513120000, nada a conferir
  if (error) return error.code === "PGRST202" ? vazio : { ...vazio, motivo: `Links das vagas do site: ${error.message}` };
  const hoje = hojeEmBrasilia();
  let fechadas = 0;
  let formato: { detalhe: string; link: string } | null = null;
  let entendeu = false;
  for (const l of data ?? []) {
    const c = await conferirLink(l.link, hoje);
    if (c.situacao === "formato") {
      // não fecha nem conta como falha: a vaga fica no ar e o robô olha de novo amanhã
      formato ??= { detalhe: c.detalhe, link: l.link };
      continue;
    }
    if (c.situacao !== "falhou" && c.entendeuGupy) entendeu = true;
    const { error: e } = await cliente.rpc("servidor_link_conferido", {
      p_chave: chave,
      p_anuncio: l.anuncio_id,
      p_situacao: c.situacao,
      p_motivo: c.situacao === "fechada" ? c.motivo : c.situacao === "falhou" ? c.erro : null,
    });
    if (e) console.error(`Publike: não deu para guardar a conferência do link da vaga ${l.anuncio_id}: ${e.message}`);
    else if (c.situacao === "fechada") fechadas++;
  }
  if (formato) await avisarFormatoDaGupy(formato.detalhe, formato.link, acesso);
  else if (entendeu) await formatoDaGupyVoltou(acesso);
  return { conferidos: data?.length ?? 0, fechadas };
}
