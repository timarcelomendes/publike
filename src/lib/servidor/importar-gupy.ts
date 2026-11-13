import "server-only";
import { after } from "next/server";
import { tituloLegivel } from "@/lib/conferir-anuncio";
import { anuncioRepetido, mensagemDeErro } from "@/lib/erros";
import { fechadaNaGupy, linkLimpoDaGupy } from "@/lib/gupy";
import { MAX_NA_LISTA, type ListaParaImportar, type ResultadoImportacao, type VagaParaImportar } from "@/lib/importar-gupy";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { lerAnuncio, registroDoAnuncio } from "@/lib/validacao";
import { ajustarErros, completarAnuncio } from "./completar-anuncio";
import { processarFilas } from "./filas";
import {
  avisarFormatoDaGupy,
  buscarVagaDaGupy,
  buscarVagasDaPaginaDaGupy,
  formatoDaGupyVoltou,
  hojeEmBrasilia,
} from "./links-de-candidatura";
import {
  cidadeDoPublike,
  formularioDaVagaDaGupy,
  lugarDaVagaDaGupy,
  ondeNaGupy,
  resumoDaVagaDaGupy,
} from "./vaga-da-gupy";

// Importar as vagas da página de vagas da empresa na Gupy (claude/plano-candidatura-no-site-da-empresa.md): a lista
// para escolher e a publicação das escolhidas, cada uma como se quem publica tivesse preenchido o formulário (as
// mesmas regras de `lerAnuncio` e do banco, com a candidatura no site da empresa). Quem chama (a empresa ou o admin)
// diz como gravar.

const ERRO_FORMATO =
  "A Gupy mudou a página das vagas, e o Publike não conseguiu ler agora. A equipe do Publike já foi avisada; tente de novo mais tarde ou publique pelo formulário.";

/**
 * As vagas da conta que já estão no Publike com o link de uma vaga da Gupy (no ar, pausadas ou em análise), pelo link
 * limpo. Antes da migração 20270513120000, nenhuma.
 */
export async function linksJaNoPublike(cliente: ClienteBanco, contaId: string): Promise<Set<string>> {
  const { data, error } = await cliente
    .from("anuncios")
    .select("link_candidatura")
    .eq("autor_id", contaId)
    .eq("candidatura", "site")
    .in("status", ["ativo", "pausado", "em_analise"])
    .limit(1000);
  if (error) return new Set();
  return new Set(
    (data ?? []).map((a) => linkLimpoDaGupy(a.link_candidatura)).filter((l): l is string => Boolean(l)),
  );
}

/** A lista para escolher: as vagas da página, cada uma com o que impede de importar (fora, fechada, já no Publike). */
export async function listarDaGupy(link: string, existentes: Set<string>, maximo: number): Promise<ListaParaImportar> {
  const b = await buscarVagasDaPaginaDaGupy(link, MAX_NA_LISTA);
  if (b.tipo === "falhou")
    return { ok: false, erro: `Não deu para abrir a página da Gupy: ${b.erro}. Confira o link e tente de novo.` };
  if (b.tipo === "nao_existe")
    return { ok: false, erro: "Essa página de vagas não existe na Gupy. Confira o link (https://suaempresa.gupy.io)." };
  if (b.tipo === "formato") {
    // a primeira vez: o e-mail para a equipe sai logo (os e-mails da fila)
    if (await avisarFormatoDaGupy(b.detalhe, b.link)) after(processarFilas);
    return { ok: false, erro: ERRO_FORMATO };
  }
  if (b.vagas.length) after(() => formatoDaGupyVoltou());
  if (!b.vagas.length)
    return {
      ok: false,
      erro: b.total
        ? "As vagas dessa página não abriram agora. Tente de novo em instantes."
        : "Essa página da Gupy não tem vaga aberta agora.",
    };
  const hoje = hojeEmBrasilia();
  const vagas: VagaParaImportar[] = b.vagas.map((v) => ({
    link: v.link,
    titulo: tituloLegivel(v.titulo),
    lugar: ondeNaGupy(v),
    resumo: resumoDaVagaDaGupy(v),
    situacao: existentes.has(v.link)
      ? "ja"
      : fechadaNaGupy(v, hoje)
        ? "fechada"
        : cidadeDoPublike(v.cidade)
          ? "pode"
          : "fora",
  }));
  return {
    ok: true,
    pagina: b.pagina,
    empresa: b.vagas.find((v) => v.empresa)?.empresa ?? null,
    vagas,
    total: b.total,
    naoAbriram: b.naoAbriram,
    maximo,
  };
}

type Gravar = (registro: ReturnType<typeof registroDoAnuncio>) => PromiseLike<{
  error: { code?: string; message?: string; hint?: string | null; details?: string | null } | null;
}>;

/**
 * Publica as vagas escolhidas, uma de cada vez (a Gupy de novo, o lugar pelo CEP, as regras de sempre). O limite de
 * vagas por dia ou de vagas no ar para o resto, que volta como falha.
 */
export async function importarDaGupy({
  links,
  existentes,
  gravar,
  base,
  agencia,
  equipe,
  maximo,
}: {
  links: string[];
  existentes: Set<string>;
  gravar: Gravar;
  /** o lugar da conta: o bairro quando a Gupy não diz */
  base: { cidade: string; bairro: string | null };
  agencia: boolean;
  /** a equipe do Publike (o admin): o link de qualquer site vale */
  equipe: boolean;
  maximo: number;
}): Promise<ResultadoImportacao> {
  if (!Array.isArray(links)) return { ok: false, erro: "Escolha as vagas." };
  const escolhidos = [
    ...new Set(links.map((l) => linkLimpoDaGupy(typeof l === "string" ? l : null)).filter((l): l is string => Boolean(l))),
  ];
  if (!escolhidos.length) return { ok: false, erro: "Escolha pelo menos uma vaga." };
  if (escolhidos.length > maximo)
    return { ok: false, erro: `Dá para publicar até ${maximo} vagas de uma vez. Escolha menos e publique o resto amanhã.` };
  const hoje = hojeEmBrasilia();
  let publicadas = 0;
  const falhas: { link: string; titulo: string; erro: string }[] = [];
  let parou: string | null = null;
  for (const link of escolhidos) {
    if (parou) {
      falhas.push({ link, titulo: link, erro: parou });
      continue;
    }
    if (existentes.has(link)) {
      falhas.push({ link, titulo: link, erro: "Já está no Publike." });
      continue;
    }
    const b = await buscarVagaDaGupy(link);
    if (b.tipo !== "vaga") {
      if (b.tipo === "formato" && (await avisarFormatoDaGupy(b.detalhe, link))) after(processarFilas);
      falhas.push({
        link,
        titulo: link,
        erro:
          b.tipo === "nao_existe"
            ? "A vaga não existe mais na Gupy."
            : b.tipo === "formato"
              ? ERRO_FORMATO
              : `A página da vaga não abriu agora (${b.erro}).`,
      });
      continue;
    }
    const v = b.vaga;
    const titulo = tituloLegivel(v.titulo);
    const fechada = fechadaNaGupy(v, hoje);
    if (fechada) {
      falhas.push({ link, titulo, erro: `Não está aberta: ${fechada}.` });
      continue;
    }
    const { lugar, aviso } = await lugarDaVagaDaGupy(v);
    if (!lugar) {
      falhas.push({ link, titulo, erro: aviso ?? "Fora das cidades do Publike." });
      continue;
    }
    const formulario = formularioDaVagaDaGupy(v, lugar, { hoje, base, agencia });
    const trocas = await completarAnuncio(formulario);
    const leitura = lerAnuncio(formulario, { equipe });
    if (!leitura.ok) {
      falhas.push({
        link,
        titulo,
        erro: Object.values(ajustarErros(leitura.erros, trocas)).join(" ") || "Confira os dados da vaga.",
      });
      continue;
    }
    const { error } = await gravar(registroDoAnuncio(leitura.dados));
    if (error) {
      const erro = anuncioRepetido(error) ? "Já está no Publike." : mensagemDeErro(error);
      // o limite do dia ou das vagas no ar: as próximas também não saem
      if (error.hint === "limite_anuncio" || error.hint === "limite_ativos") parou = erro;
      falhas.push({ link, titulo, erro });
      continue;
    }
    publicadas++;
  }
  // a IA revisa o texto logo depois, como em qualquer vaga
  if (publicadas) after(processarFilas);
  return { ok: true, publicadas, falhas };
}
