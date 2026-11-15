import "server-only";
import { ocupacao } from "@/lib/cbo";
import { funcaoPeloTitulo, tituloDaFuncao } from "@/lib/funcao-cbo";
import { obterLocal } from "@/lib/local";
import type { Curriculo, MeuPerfil } from "@/lib/tipos";
import { centroDoBairro } from "./cep";
import { comFuncoesDoCurriculo } from "./funcoes-pelo-contexto";

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
