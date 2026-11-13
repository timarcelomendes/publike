"use server";

import { after } from "next/server";
import type { ValoresAnuncio } from "@/components/form-anuncio";
import { CIDADES } from "@/lib/constantes";
import { tituloLegivel } from "@/lib/conferir-anuncio";
import { fechadaNaGupy, linkLimpoDaGupy, modeloDaGupy, regimeDaGupy } from "@/lib/gupy";
import { consultarCep } from "@/lib/servidor/cep";
import { processarFilas } from "@/lib/servidor/filas";
import {
  avisarFormatoDaGupy,
  buscarVagaDaGupy,
  formatoDaGupyVoltou,
  hojeEmBrasilia,
} from "@/lib/servidor/links-de-candidatura";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";

// Admin › Publicar vaga em nome de uma conta › "Puxar do link" (claude/plano-candidatura-no-site-da-empresa.md,
// parte 4): colado o link da vaga na Gupy, o Publike lê a página dela e preenche o formulário para a equipe conferir,
// com a candidatura no site da empresa. Só com a vaga que a empresa autorizou, uma por vez.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";

export type VagaPuxada = {
  /** o que vai para o formulário (o resto fica como está) */
  campos: Partial<ValoresAnuncio>;
  /** o que a equipe precisa conferir antes de publicar */
  avisos: string[];
  /** o nome da empresa na página de carreiras da Gupy */
  empresa: string | null;
};

/** Em quantos dias a vaga sai do ar: até o fim da publicação na Gupy (de 1 a 365); sem o fim, 30. */
function prazoAte(expiraEm: string | null, hoje: string): number {
  if (!expiraEm) return 30;
  const dias = Math.round((Date.parse(`${expiraEm}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);
  return Math.min(Math.max(dias, 1), 365);
}

const CIDADES_DO_PUBLIKE = new Set<string>(CIDADES);

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

  const avisos: string[] = [];
  const regime = regimeDaGupy(v.tipo);
  if (!regime) avisos.push(`A Gupy diz o tipo “${v.tipo ?? "nenhum"}”, que o Publike não conhece: escolha o tipo de contratação.`);
  if (v.tipo === "vacancy_type_talent_pool")
    avisos.push("Na Gupy, isto é um banco de talentos, não uma vaga aberta. Confira com a empresa antes de publicar.");
  if (v.descricaoCortada) avisos.push("A descrição passou de 3.000 letras: ficou o começo. Confira o fim do texto.");
  if (v.linhasComContato)
    avisos.push(
      `${v.linhasComContato === 1 ? "Saiu 1 linha" : `Saíram ${v.linhasComContato} linhas`} da descrição com telefone, e-mail ou site (o Publike não deixa contato na descrição).`,
    );

  // o lugar: pelo CEP do endereço da vaga (o bairro e o ponto no mapa); sem ele, só a cidade
  let lugar: Partial<ValoresAnuncio> = {};
  const cep = v.cep ? await consultarCep(v.cep).catch(() => null) : null;
  if (cep?.ok && CIDADES_DO_PUBLIKE.has(cep.endereco.cidade)) {
    lugar = {
      cidade: cep.endereco.cidade,
      ...(cep.endereco.bairro ? { bairro: cep.endereco.bairro } : {}),
      cep: cep.endereco.cep,
      endereco: cep.endereco.rua,
      lat: cep.ponto?.lat ?? null,
      lng: cep.ponto?.lng ?? null,
    };
    if (!cep.ponto) avisos.push("Achamos o CEP, mas não o ponto no mapa: marque o pino na região da vaga.");
    else if (cep.precisao === "cep" || cep.precisao === "bairro")
      avisos.push("O pino ficou no meio do CEP ou do bairro: confira no mapa.");
  } else if (v.cidade && CIDADES_DO_PUBLIKE.has(v.cidade)) {
    lugar = { cidade: v.cidade, lat: null, lng: null, cep: null, endereco: null };
    avisos.push("A Gupy não deu um CEP que o Publike ache: escreva o bairro e marque o pino no mapa.");
  } else {
    const onde = v.cidade ? `${v.cidade}${v.uf ? ` (${v.uf})` : ""}` : "um lugar que a Gupy não diz";
    avisos.push(`A vaga é em ${onde}, fora das cidades do Publike. A moderação segura vaga fora de Goiás.`);
  }

  return {
    ok: true,
    vaga: {
      empresa: v.empresa,
      avisos,
      campos: {
        id: undefined,
        tipo: "vaga",
        titulo: tituloLegivel(v.titulo),
        descricao: v.descricao,
        regime,
        modelo: modeloDaGupy(v.modelo),
        pcd: v.pcd ? "tambem" : null,
        // a Gupy quase nunca mostra o salário: a combinar (a equipe muda, se a empresa disser)
        combinar: true,
        pagamento_valor: null,
        pagamento_ate: null,
        pagamento_unidade: "mes",
        vagas: 1,
        prazo_dias: prazoAte(v.expiraEm, hoje),
        candidatura: "site",
        link_candidatura: v.link,
        pede_curriculo: false,
        contato_direto: false,
        perguntas: [],
        ...lugar,
      },
    },
  };
}
