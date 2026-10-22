"use server";

import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { hrefFiltros, lerFiltros } from "@/lib/filtros";
import { obterLocal } from "@/lib/local";
import { dadosDaBusca, partirDoLocal, rotuloDaBusca } from "@/lib/servidor/busca-salva";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { cidadeDaVisita } from "@/lib/servidor/cidade";

// "Me avise de vagas assim": guarda a busca da página inicial e o banco avisa quando
// entrar no ar uma vaga nova que bate (privado.avisar_buscas). Tudo é lido de novo
// aqui a partir do endereço da busca: nada do que vem do navegador vai direto.

/** Salva a busca do endereço ("/?tipo=vaga&q=caixa"). O id serve para parar sem recarregar. */
export async function salvarBusca(caminho: string): Promise<Resultado & { id?: number }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const voltar = caminho.startsWith("/") ? caminho : "/";
  if (!(await obterUsuario())) {
    return { ok: false, erro: "Entre na sua conta para continuar.", ir: `/entrar?next=${encodeURIComponent(voltar)}` };
  }
  let params: Record<string, string>;
  try {
    params = Object.fromEntries(new URL(caminho.slice(0, 500), "https://publike.local").searchParams);
  } catch {
    return { ok: false, erro: "Busca inválida." };
  }
  const filtros = lerFiltros(params);
  if (filtros.tipo !== "vaga" || filtros.meus) return { ok: false, erro: "O aviso é para busca de vagas." };
  const [local, { praca }] = await Promise.all([obterLocal(), cidadeDaVisita()]);
  const cidade = praca.cidade;
  const f = partirDoLocal(filtros, local, cidade);
  const d = dadosDaBusca(f);
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("salvar_busca", {
    p_texto: d.texto,
    p_categoria: d.categoria,
    p_regime: d.regime,
    p_turno: d.turno,
    p_lat: d.lat,
    p_lng: d.lng,
    p_raio_km: d.raio_km,
    p_rotulo: rotuloDaBusca(f, local, cidade),
    p_caminho: hrefFiltros(filtros),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar o aviso agora.") };
  return { ok: true, id: data ?? undefined, mensagem: "Pronto: quando sair vaga assim, você recebe um aviso." };
}

/** Para de avisar (a busca some da lista em Painel › Seguindo). */
export async function apagarBusca(id: number): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre na sua conta para continuar.", ir: "/entrar" };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("buscas_salvas").delete().eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para parar o aviso agora.") };
  return { ok: true };
}
