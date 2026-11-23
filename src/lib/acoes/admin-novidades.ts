"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { caminhoDoSite } from "@/lib/banners";
import { mensagemDeErro } from "@/lib/erros";
import { PARA_NOVIDADE, type ParaNovidade, recadoDaNovidade } from "@/lib/novidades";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Admin › Novidades: as principais evoluções do Publike, escritas uma vez (migração 20270122120000_novidades.sql).
// Publicadas, aparecem em /novidades; daqui também saem como banner e como recado no sino.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";
const SEM_MIGRACAO = "Rode antes a migração 20270122120000_novidades.sql no Supabase.";
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function texto(formData: FormData, nome: string) {
  const v = formData.get(nome);
  return typeof v === "string" ? v.trim() : "";
}

function semTabela(e: { code?: string } | null) {
  return e?.code === "42P01" || e?.code === "PGRST205";
}

/** Cria (sem `id`) ou salva uma novidade. */
export async function salvarNovidade(
  id: string | null,
  _anterior: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (id !== null && !UUID.test(id)) return { ok: false, erro: "Novidade inválida." };

  const erros: Record<string, string> = {};
  const titulo = texto(formData, "titulo");
  const corpo = texto(formData, "texto");
  const caminho = texto(formData, "link");
  const botao = texto(formData, "botao");
  const para = texto(formData, "para") as ParaNovidade;
  const dia = texto(formData, "dia");
  if (titulo.length < 3 || titulo.length > 80) erros.titulo = "Escreva um título de 3 a 80 letras.";
  if (corpo.length < 10 || corpo.length > 400) erros.texto = "Escreva o texto, de 10 a 400 letras.";
  const link = caminho ? caminhoDoSite(caminho) : null;
  if (caminho && !link) erros.link = "Use um endereço do Publike começando com /, como /painel/links.";
  if (link && (botao.length < 2 || botao.length > 30)) erros.botao = "Escreva o texto do botão (2 a 30 letras).";
  if (!(para in PARA_NOVIDADE)) erros.para = "Escolha para quem é.";
  if (!DATA.test(dia) || Number.isNaN(Date.parse(`${dia}T12:00:00-03:00`))) erros.dia = "Escolha o dia.";
  if (Object.keys(erros).length) return { ok: false, erros };

  const dados = {
    titulo,
    texto: corpo,
    link,
    botao: link ? botao : null,
    para,
    dia,
    publicada: formData.get("publicada") === "on",
    atualizada_em: new Date().toISOString(),
  };
  const { error } = id ? await c.from("novidades").update(dados).eq("id", id) : await c.from("novidades").insert(dados);
  if (error) return { ok: false, erro: semTabela(error) ? SEM_MIGRACAO : mensagemDeErro(error) };
  // a página /novidades (no site rodando aqui; na Vercel, em até 15 minutos)
  updateTag("novidades");
  redirect(`/admin/novidades?salvo=${id ? "editada" : "nova"}`);
}

/** Publica ou tira de /novidades. */
export async function publicarNovidade(id: string, publicada: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Novidade inválida." };
  const { error } = await c
    .from("novidades")
    .update({ publicada, atualizada_em: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  updateTag("novidades");
  return { ok: true, mensagem: publicada ? "Publicada em Novidades." : "Saiu de Novidades." };
}

/** Apaga uma novidade (o banner e o recado que saíram dela continuam). */
export async function apagarNovidade(id: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Novidade inválida." };
  const { error } = await c.from("novidades").delete().eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  updateTag("novidades");
  return { ok: true, mensagem: "Novidade apagada." };
}

// "Descobrir novidades" (23/11/2026; Marcelo: "deveria ser automático, você já descobre e envia"): lê o que mudou no
// Publike desde a última novidade (os commits, no computador do dono, onde o admin roda), e a IA escolhe só o que
// quem usa o site percebe e escreve como novidade. Ficam como rascunho para conferir; "Publicar e mandar no sino"
// publica e manda o recado de uma vez.

const DIAS_SEM_NOVIDADE = 14;
const MAX_COMMITS = 400;

type NovidadeDaIA = { titulo: string; texto: string; link: string; botao: string; para: string; dia: string };

const ESQUEMA_NOVIDADES = {
  type: "object",
  additionalProperties: false,
  required: ["novidades"],
  properties: {
    novidades: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titulo", "texto", "link", "botao", "para", "dia"],
        properties: {
          titulo: { type: "string", description: "3 a 60 letras, sem ponto final" },
          texto: { type: "string", description: "80 a 220 letras, o que a pessoa ganha e como usar" },
          link: { type: "string", description: "um caminho da lista (começa com /) ou vazio" },
          botao: { type: "string", description: "2 a 24 letras, o que o botão faz; vazio sem link" },
          para: { type: "string", enum: ["todos", "pessoas", "empresas"] },
          dia: { type: "string", description: "AAAA-MM-DD, o dia da mudança" },
        },
      },
    },
  },
} as const;

function instrucoesDasNovidades() {
  return `Você escreve as Novidades do Publike, um site de vagas de emprego e serviços de Goiânia e Anápolis, para quem procura trabalho (pessoas) e para quem contrata (empresas, comércios, casas). Recebe a lista do que mudou no código (os commits, com a data) e as novidades que já existem.

Escolha só o que quem usa o site ou o WhatsApp do Publike percebe e ganha: uma coisa nova que dá para fazer, algo que ficou bem mais fácil ou rápido. Deixe de fora: correções, ajustes internos, telas do Admin e da equipe, testes, banco, anúncios pagos, notas, campanhas, o que já está nas novidades existentes e o que é pequeno demais para contar. Junte numa novidade só as mudanças do mesmo assunto. Se nada servir, devolva a lista vazia. No máximo 5, da mais importante para a menos.

Escreva em português simples, como quem conversa, para gente com pouca leitura: frases curtas, a pessoa como "você", sem termos técnicos (nada de "commit", "migração", "IA", "API", "template", "opt-in"), sem exagero nem ponto de exclamação. O título diz a coisa nova; o texto diz o que a pessoa ganha e como usar. Não invente nada que não esteja nos commits. "para": "pessoas" se é só para quem procura, "empresas" se é só para quem contrata, "todos" se serve aos dois. "link": a página onde a pessoa usa a novidade, só da lista de caminhos; sem página certa, vazio (e "botao" vazio).`;
}

/** As páginas do site (as pastas de src/app), para o link da novidade. */
async function caminhosDoSite(): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const pastas = await readdir(`${process.cwd()}/src/app`, { withFileTypes: true }).catch(() => []);
  return [
    "/",
    "/?tipo=vaga",
    "/painel",
    "/painel/caixa",
    "/painel/curriculo",
    ...pastas
      .filter((d) => d.isDirectory() && /^[a-z][a-z-]+$/.test(d.name) && !["admin", "api", "auth", "fonts"].includes(d.name))
      .map((d) => `/${d.name}`),
  ];
}

/** Os commits desde um dia ("2026-11-09 Título"), do mais antigo ao mais novo. null: sem git aqui. */
async function commitsDesde(dia: string): Promise<string[] | null> {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve) => {
    execFile(
      "git",
      ["log", `--since=${dia}T00:00:00-03:00`, "--reverse", "--no-merges", "--date=short", "--format=%ad %s", `-n${MAX_COMMITS}`],
      { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024 },
      (erro, saida) => resolve(erro ? null : saida.split("\n").map((l) => l.trim()).filter(Boolean)),
    );
  });
}

/** Lê o que mudou desde a última novidade e cria os rascunhos (a IA escreve). */
export async function descobrirNovidades(): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const { data: existentes, error } = await c
    .from("novidades")
    .select("titulo, texto, dia")
    .order("dia", { ascending: false })
    .limit(40);
  if (error) return { ok: false, erro: semTabela(error) ? SEM_MIGRACAO : mensagemDeErro(error) };
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const limite = new Date(Date.now() - 3 * 3600e3 - 30 * 86400e3).toISOString().slice(0, 10);
  // desde o dia seguinte à última novidade (no máximo 30 dias); sem nenhuma, as 2 últimas semanas
  const ultima = existentes?.[0]?.dia as string | undefined;
  const desde = ultima
    ? [new Date(Date.parse(`${ultima}T12:00:00-03:00`) + 86400e3).toISOString().slice(0, 10), limite].sort()[1]
    : new Date(Date.now() - 3 * 3600e3 - DIAS_SEM_NOVIDADE * 86400e3).toISOString().slice(0, 10);
  const commits = await commitsDesde(desde);
  if (!commits) return { ok: false, erro: "Não consegui ler o histórico do código (o git) neste computador." };
  if (!commits.length) return { ok: true, mensagem: "Nada mudou no Publike desde a última novidade." };

  const { chamarIA, lerJson } = await import("@/lib/ia/openai");
  const { modeloDaFuncionalidade } = await import("@/lib/ia/funcionalidades");
  let lidas: NovidadeDaIA[];
  try {
    const r = await chamarIA({
      uso: "conteudos",
      modelo: await modeloDaFuncionalidade("admin"),
      sistema: instrucoesDasNovidades(),
      mensagem: JSON.stringify({
        hoje,
        o_que_mudou: commits,
        novidades_que_ja_existem: (existentes ?? []).map((n) => `${n.dia} ${n.titulo}: ${n.texto}`),
        caminhos: await caminhosDoSite(),
      }),
      maxTokens: 4000,
      esquema: { nome: "novidades", schema: ESQUEMA_NOVIDADES as unknown as Record<string, unknown> },
      tempoLimite: 120_000,
    });
    lidas = lerJson<{ novidades: NovidadeDaIA[] }>(r.texto).novidades ?? [];
  } catch (e) {
    return { ok: false, erro: `A IA não respondeu: ${e instanceof Error ? e.message : String(e)}` };
  }

  // as mesmas regras do formulário; o que não passa fica de fora
  const caminhos = new Set(await caminhosDoSite());
  const linhas = lidas
    .map((n) => {
      const titulo = n.titulo.trim().replace(/\.$/, "");
      const texto = n.texto.trim();
      const link = n.link.trim() && caminhos.has(n.link.trim().split("?")[0] || "/") ? caminhoDoSite(n.link.trim()) : null;
      const botao = link ? n.botao.trim() : "";
      return {
        titulo,
        texto,
        link: link && botao.length >= 2 && botao.length <= 30 ? link : null,
        botao: link && botao.length >= 2 && botao.length <= 30 ? botao : null,
        para: (n.para in PARA_NOVIDADE ? n.para : "todos") as ParaNovidade,
        dia: DATA.test(n.dia) && n.dia >= desde && n.dia <= hoje ? n.dia : hoje,
        publicada: false,
      };
    })
    .filter((n) => n.titulo.length >= 3 && n.titulo.length <= 80 && n.texto.length >= 10 && n.texto.length <= 400);
  if (!linhas.length) {
    return {
      ok: true,
      mensagem: `Li ${commits.length} mudanças desde ${desde.split("-").reverse().join("/")}: nenhuma é novidade para quem usa o site.`,
    };
  }
  const { error: erroGravar } = await c.from("novidades").insert(linhas);
  if (erroGravar) return { ok: false, erro: mensagemDeErro(erroGravar) };
  refresh();
  return {
    ok: true,
    mensagem: `${linhas.length === 1 ? "1 rascunho novo" : `${linhas.length} rascunhos novos`}, das ${commits.length} mudanças desde ${desde.split("-").reverse().join("/")}. Confira e toque em Publicar e mandar no sino.`,
  };
}

/** Publica a novidade e manda o recado dela no sino do público, de uma vez. */
export async function publicarEMandarNoSino(id: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Novidade inválida." };
  const { data: n, error } = await c
    .from("novidades")
    .update({ publicada: true, atualizada_em: new Date().toISOString() })
    .eq("id", id)
    .select("titulo, texto, link, para")
    .maybeSingle();
  if (error || !n) return { ok: false, erro: error ? mensagemDeErro(error) : "Novidade não encontrada." };
  updateTag("novidades");
  const recado = recadoDaNovidade(n);
  // o sino não manda o mesmo link duas vezes à mesma conta: a marca da novidade deixa o link dela único
  const link = `${recado.link}${recado.link.includes("?") ? "&" : "?"}de=novidade-${id.slice(0, 8)}`;
  const { data: total, error: erroSino } = await c.rpc("admin_enviar_comunicado", {
    p_publico: recado.publico,
    p_texto: recado.texto,
    p_link: link,
  });
  refresh();
  if (erroSino) return { ok: false, erro: `Publicada, mas o sino não saiu: ${mensagemDeErro(erroSino)}` };
  return {
    ok: true,
    mensagem: total
      ? `Publicada e no sino de ${total} conta(s).`
      : "Publicada. No sino, ninguém recebeu: o público está vazio ou já recebeu este link.",
  };
}
