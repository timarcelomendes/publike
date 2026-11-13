"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ValoresAnuncio } from "@/components/form-anuncio";
import { fechadaNaGupy, linkLimpoDaGupy } from "@/lib/gupy";
import { MAX_NA_LISTA, type ListaParaImportar, type ResultadoImportacao } from "@/lib/importar-gupy";
import { gravarVaga } from "@/lib/servidor/comeca-ja";
import { processarFilas } from "@/lib/servidor/filas";
import { importarDaGupy, linksJaNoPublike, listarDaGupy } from "@/lib/servidor/importar-gupy";
import {
  avisarFormatoDaGupy,
  buscarVagaDaGupy,
  formatoDaGupyVoltou,
  hojeEmBrasilia,
} from "@/lib/servidor/links-de-candidatura";
import { avisosDaVagaDaGupy, camposDaVagaDaGupy, lugarDaVagaDaGupy } from "@/lib/servidor/vaga-da-gupy";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import { UUID } from "@/lib/validacao";

// Admin › Publicar vaga em nome de uma conta › "Puxar do link da Gupy" (claude/plano-candidatura-no-site-da-empresa.md,
// parte 4): o link de uma vaga preenche o formulário para a equipe conferir; o link da página de vagas da empresa
// lista todas, para publicar as escolhidas de uma vez. Sempre com a candidatura no site da empresa, e só com as vagas
// que a empresa autorizou.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";

export type VagaPuxada = {
  /** o que vai para o formulário (o resto fica como está) */
  campos: Partial<ValoresAnuncio>;
  /** o que a equipe precisa conferir antes de publicar */
  avisos: string[];
  /** o nome da empresa na página de carreiras da Gupy */
  empresa: string | null;
};

export async function puxarVagaDoLink(
  link: string,
): Promise<{ ok: true; vaga: VagaPuxada } | { ok: false; erro: string }> {
  if (!(await clienteAdminOuNulo())) return { ok: false, erro: FORA };
  const limpo = linkLimpoDaGupy(link);
  if (!limpo)
    return {
      ok: false,
      erro: "Por enquanto, o “Puxar do link” lê só vagas da Gupy (https://empresa.gupy.io/jobs/…). De outro site, preencha à mão ou cole o texto em Importar com a IA.",
    };
  const busca = await buscarVagaDaGupy(limpo);
  if (busca.tipo === "falhou") return { ok: false, erro: `Não deu para abrir a vaga na Gupy: ${busca.erro}. Tente de novo.` };
  if (busca.tipo === "nao_existe") return { ok: false, erro: "Essa vaga não existe mais na Gupy (página não encontrada)." };
  if (busca.tipo === "formato") {
    // a primeira vez: o e-mail para a equipe sai logo (os e-mails da fila)
    if (await avisarFormatoDaGupy(busca.detalhe, limpo)) after(processarFilas);
    return {
      ok: false,
      erro: "A Gupy mudou a página das vagas, e o Publike não conseguiu ler esta. A equipe recebe o aviso por e-mail e no Painel. Por enquanto, preencha à mão ou cole o texto em Importar com a IA.",
    };
  }
  after(() => formatoDaGupyVoltou());
  const v = busca.vaga;
  const hoje = hojeEmBrasilia();
  const fechada = fechadaNaGupy(v, hoje);
  if (fechada) return { ok: false, erro: `Essa vaga não está aberta: ${fechada}.` };
  const { lugar, aviso } = await lugarDaVagaDaGupy(v);
  const avisos = avisosDaVagaDaGupy(v);
  if (aviso) avisos.push(lugar ? aviso : `${aviso} A moderação segura vaga fora de Goiás.`);
  return { ok: true, vaga: { empresa: v.empresa, avisos, campos: camposDaVagaDaGupy(v, lugar, hoje) } };
}

/** A lista das vagas da página de vagas da empresa na Gupy, para publicar em nome da conta. */
export async function listarVagasDaGupyDaConta(contaId: string, link: string): Promise<ListaParaImportar> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(contaId)) return { ok: false, erro: "Conta não encontrada." };
  // a equipe não tem o limite de vagas por dia: até a lista inteira de uma vez
  return listarDaGupy(link, await linksJaNoPublike(c, contaId), MAX_NA_LISTA);
}

/** Publica em nome da conta as vagas escolhidas da Gupy, como se ela mesma tivesse publicado. */
export async function importarVagasDaGupyEmNomeDe(
  contaId: string,
  links: string[],
  autorizou: boolean,
): Promise<ResultadoImportacao> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(contaId)) return { ok: false, erro: "Conta não encontrada." };
  if (autorizou !== true) return { ok: false, erro: "Marque que a empresa autorizou a divulgação das vagas." };
  const { data: perfil } = await c
    .from("perfis")
    .select("tipo, cidade, bairro, suspenso_ate")
    .eq("id", contaId)
    .maybeSingle();
  if (!perfil) return { ok: false, erro: "Esta conta ainda não tem perfil. Crie o perfil antes de publicar." };
  if (perfil.suspenso_ate && new Date(perfil.suspenso_ate).getTime() > Date.now())
    return { ok: false, erro: "A conta está suspensa: não dá para publicar em nome dela." };
  const r = await importarDaGupy({
    links,
    existentes: await linksJaNoPublike(c, contaId),
    gravar: (registro) =>
      gravarVaga(registro, (dados) =>
        c
          .from("anuncios")
          .insert({ ...dados, tipo: "vaga", autor_id: contaId })
          .select("id")
          .single(),
      ),
    base: { cidade: perfil.cidade, bairro: perfil.bairro },
    agencia: perfil.tipo === "agencia",
    equipe: true,
    maximo: MAX_NA_LISTA,
  });
  if (r.ok && r.publicadas) revalidatePath("/");
  return r;
}
