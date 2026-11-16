import "server-only";
import { cookies } from "next/headers";
import { ocupacao } from "@/lib/cbo";
import type { Cidade } from "@/lib/constantes";
import { distanciaKm } from "@/lib/descobrir";
import { funcaoPeloTitulo, tituloDaFuncao } from "@/lib/funcao-cbo";
import { obterLocal } from "@/lib/local";
import { COOKIE_PERTO, lerPerto } from "@/lib/perto-guardado";
import { PRACA_PADRAO, pracaDoPonto } from "@/lib/pracas";
import { centroDaCidade } from "@/lib/regioes";
import type { Curriculo, MeuPerfil } from "@/lib/tipos";
import { MODO_DEMO } from "@/lib/config";
import { centroDoBairro, enderecoDoPonto } from "./cep";
import { cidadeDaVisita } from "./cidade";
import { comFuncoesDoCurriculo } from "./funcoes-pelo-contexto";
import { anunciosNoAr, type AnuncioNoAr } from "./paginas-busca";
import { funcoesDasVagasDaPraca } from "./paginas-funcao";

// O que a Rota do currículo e o "Abriu perto de você" usam de quem está vendo: as funções do currículo (pelas regras do
// título e, sem elas, pela função que a IA já leu de cada experiência, como "Product Manager") e o ponto de partida
// (o CEP de casa, o bairro escolhido neste aparelho ou o meio do bairro do perfil).

export async function funcoesParaARota(c: Curriculo | null) {
  if (!c) return [];
  const comCbo = await comFuncoesDoCurriculo(c).catch(() => c);
  const vistas = new Map<string, string>();
  const peloTitulo = funcaoPeloTitulo(c.titulo);
  if (peloTitulo) vistas.set(peloTitulo.cbo, tituloDaFuncao(peloTitulo.cbo) ?? peloTitulo.nome);
  for (const e of comCbo.experiencias ?? []) {
    const f = funcaoPeloTitulo(e.cargo);
    if (f && !vistas.has(f.cbo)) vistas.set(f.cbo, tituloDaFuncao(f.cbo) ?? f.nome);
    const lida = (e as { cbo?: string }).cbo;
    if (!f && lida && !vistas.has(lida)) vistas.set(lida, ocupacao(lida)?.nome ?? e.cargo);
  }
  return [...vistas].map(([cbo, titulo]) => ({ cbo, titulo }));
}

export async function pontoDaPessoa(perfil: MeuPerfil | null) {
  const local = await obterLocal();
  const ponto = local?.ponto ?? local?.centro ?? null;
  if (ponto) return { ponto, deCasa: Boolean(local?.ponto) };
  if (perfil?.bairro && perfil.cidade) {
    const centro = await centroDoBairro(perfil.bairro, perfil.cidade).catch(() => null);
    if (centro) return { ponto: centro, deCasa: false };
  }
  return null;
}

export type OrigemDaRota = {
  ponto: { lat: number; lng: number };
  /**
   * casa: o CEP; aqui: a localização do aparelho (guardada por 24 horas); bairro: o meio do bairro escolhido ou do
   * perfil; cidade: o centro da cidade, enquanto a pessoa não diz de onde sai (o mapa abre do mesmo jeito)
   */
  tipo: "casa" | "aqui" | "bairro" | "cidade";
  /** o nome no botão: "Setor Bueno", "Onde você está", "Centro de Goiânia" */
  nome: string;
  /** a cidade da praça, para as vagas do Publike e os textos */
  cidade: Cidade;
};

/**
 * De onde a Rota do currículo conta a distância (16/11/2026, "que as pessoas vejam o mapa de cara"): o CEP de casa, a
 * localização do aparelho, o bairro escolhido neste aparelho, o bairro do perfil e, sem nada disso, o centro da cidade
 * de quem visita. A página e o "Imprimir" usam a mesma, para a folha da rota sair na ordem que a pessoa viu.
 */
export async function origemDaRota(perfil: MeuPerfil | null): Promise<OrigemDaRota> {
  const local = await obterLocal();
  if (local?.ponto) return { ponto: local.ponto, tipo: "casa", nome: local.bairro || "Sua casa", cidade: local.cidade };
  const aqui = lerPerto((await cookies()).get(COOKIE_PERTO)?.value);
  if (aqui) return { ponto: aqui, tipo: "aqui", nome: "Onde você está", cidade: (pracaDoPonto(aqui) ?? PRACA_PADRAO).cidade };
  if (local?.centro) return { ponto: local.centro, tipo: "bairro", nome: local.bairro || local.cidade, cidade: local.cidade };
  if (perfil?.bairro && perfil.cidade) {
    const centro = await centroDoBairro(perfil.bairro, perfil.cidade).catch(() => null);
    if (centro) return { ponto: centro, tipo: "bairro", nome: perfil.bairro, cidade: (local?.cidade ?? perfil.cidade) as Cidade };
  }
  const { cidade } = await cidadeDaVisita();
  return { ponto: centroDaCidade(cidade), tipo: "cidade", nome: `Centro de ${cidade}`, cidade };
}

/**
 * O bairro de onde a pessoa está, pelo OpenStreetMap (o mesmo do "Usar minha localização" ao publicar), para o botão
 * "Saindo de" mostrar o lugar e não só "Onde você está" (16/11/2026, Marcelo: "faltou minha localização"). O ponto
 * vem arredondado (~100 m) e a resposta fica guardada por um dia; sem bairro no mapa, a rua; sem nada, null.
 */
export async function nomeDoLugarAqui(ponto: { lat: number; lng: number }): Promise<string | null> {
  if (MODO_DEMO) return null;
  const r = await enderecoDoPonto(ponto.lat, ponto.lng).catch(() => null);
  if (!r?.ok) return null;
  return r.endereco.bairro ?? r.endereco.rua ?? null;
}

export type VagaDaRota = AnuncioNoAr & { distancia_km: number };

/**
 * As vagas no ar no Publike da mesma função (a CBO que o site acha para cada vaga), da mais perto para a mais longe:
 * as do raio vão para o mapa da rota; o total da praça vira o link para a página de vagas da função.
 */
export async function vagasDaFuncaoPerto(cbo: string, ponto: { lat: number; lng: number }, raioKm: number, cidade: string) {
  const [vagas, funcoes] = await Promise.all([
    anunciosNoAr("vaga", cidade).catch(() => [] as AnuncioNoAr[]),
    funcoesDasVagasDaPraca(cidade).catch(() => ({}) as Record<string, string>),
  ]);
  const daFuncao: VagaDaRota[] = vagas
    .filter((v) => funcoes[v.id] === cbo && Number.isFinite(v.lat) && Number.isFinite(v.lng))
    .map((v) => ({ ...v, distancia_km: distanciaKm(ponto.lat, ponto.lng, v.lat, v.lng) }))
    .sort((a, b) => a.distancia_km - b.distancia_km);
  return { perto: daFuncao.filter((v) => v.distancia_km <= raioKm), naPraca: daFuncao.length };
}
