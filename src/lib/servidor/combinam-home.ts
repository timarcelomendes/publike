import "server-only";
import { cacheLife } from "next/cache";
import { MODO_DEMO } from "@/lib/config";
import { listarMeusAnuncios, listarMinhasCurtidas, obterMeuCurriculo, requisitosDasVagas } from "@/lib/dados";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import {
  comoCurriculo,
  escolherTalentos,
  escolherVagas,
  oQueFaz,
  type TalentoParaCombinar,
  type VagaParaCombinar,
} from "./combinam";
import { acessoFila } from "./filas";

// O "Combinam com você" da home de quem entrou: a mesma conta do aviso da semana (src/lib/servidor/combinam.ts),
// na hora. Quem procura trabalho vê as vagas no ar do último mês que combinam com o currículo; quem contrata,
// os talentos da aba Talentos que combinam com as vagas dele. As listas de vagas e de talentos são as mesmas
// para todo mundo e ficam guardadas 15 minutos; a escolha é de cada conta.

/** Quantos a home mostra. */
const NA_HOME = 4;

async function vagasDoMes(): Promise<VagaParaCombinar[]> {
  "use cache";
  // 15 minutos ("default"): com "minutes", a página era regravada a cada minuto na Vercel
  cacheLife("default");
  const acesso = acessoFila();
  if (!acesso) return [];
  const { data, error } = await acesso.cliente.rpc("servidor_combinam_vagas", { p_chave: acesso.chave, p_dias: 30 });
  // banco sem a migração 20261119120000: sem a lista (e nada fica guardado)
  if (error) throw new Error(error.message);
  return (data ?? []) as VagaParaCombinar[];
}

async function talentosDaAba(): Promise<TalentoParaCombinar[]> {
  "use cache";
  cacheLife("default");
  const acesso = acessoFila();
  if (!acesso) return [];
  const { data, error } = await acesso.cliente.rpc("servidor_combinam_talentos", { p_chave: acesso.chave });
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((t) => {
    const cv = comoCurriculo(t.curriculo);
    return cv ? [{ perfil_id: t.perfil_id, nome: t.nome, cidade: t.cidade, bairro: t.bairro, cv }] : [];
  });
}

export type VagaQueCombina = {
  id: string;
  titulo: string;
  quem: string;
  bairro: string | null;
  cidade: string;
  nota: number;
};

export type TalentoQueCombina = {
  id: string;
  nome: string;
  faz: string | null;
  bairro: string | null;
  cidade: string | null;
  nota: number;
  vaga: string;
};

/** As vagas que combinam com o currículo de quem entrou (sem as que curtiu ou passou). */
export async function vagasQueCombinamComigo(perfil: {
  id: string;
  cidade: string | null;
  bairro: string | null;
}): Promise<VagaQueCombina[]> {
  if (MODO_DEMO) return [];
  try {
    const [curriculo, vagas, curtidas, dispensas, agora] = await Promise.all([
      obterMeuCurriculo(),
      vagasDoMes(),
      listarMinhasCurtidas().catch(() => []),
      criarClienteServidor().then((c) => c.from("dispensas").select("anuncio_id").eq("perfil_id", perfil.id)),
      agoraDaRequisicao(),
    ]);
    if (!curriculo) return [];
    const ja = new Set([...curtidas.map((c) => c.anuncio_id), ...(dispensas.data ?? []).map((d) => d.anuncio_id)]);
    return escolherVagas({ ...perfil, curriculo: comoCurriculo(curriculo) }, vagas, ja, agora, NA_HOME).map(
      ({ v, m }) => ({
        id: v.id,
        titulo: v.titulo,
        quem: v.autor_nome,
        bairro: v.bairro,
        cidade: v.cidade,
        nota: m.nota ?? 0,
      }),
    );
  } catch (e) {
    console.error(`Publike: falha nas vagas que combinam: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

/** Os talentos que combinam com as vagas no ar de quem contrata (sem os já conectados). */
export async function talentosQueCombinamComigo(contaId: string): Promise<TalentoQueCombina[]> {
  if (MODO_DEMO) return [];
  try {
    const anuncios = (await listarMeusAnuncios()).filter((a) => a.tipo === "vaga" && a.status === "ativo");
    if (!anuncios.length) return [];
    const [vagas, talentos, conexoes, agora] = await Promise.all([
      requisitosDasVagas(anuncios.map((a) => a.id)),
      talentosDaAba(),
      criarClienteServidor().then((c) => c.from("conexoes").select("talento_id").eq("empresa_id", contaId)),
      agoraDaRequisicao(),
    ]);
    const noAr = vagas.filter((v) => !v.preenchida_em);
    const ja = new Set((conexoes.data ?? []).map((c) => c.talento_id));
    return escolherTalentos(contaId, noAr, talentos, ja, agora, NA_HOME).map(({ t, m, vaga }) => ({
      id: t.perfil_id,
      nome: t.nome,
      faz: oQueFaz(t.cv),
      bairro: t.bairro,
      cidade: t.cidade,
      nota: m.nota ?? 0,
      vaga,
    }));
  } catch (e) {
    console.error(`Publike: falha nos talentos que combinam: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
