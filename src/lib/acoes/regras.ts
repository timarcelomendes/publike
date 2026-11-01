"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { listarRespostasDosCandidatos, obterAnuncio, obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { confereRegra, lerAcoes, lerCondicoes, lerGatilho, type Gatilho, type RegraMontada } from "@/lib/regras";
import { distanciaEntreAreas } from "@/lib/regioes";
import { montarCaixa } from "@/lib/servidor/caixa";
import { clientesDasVagas } from "@/lib/servidor/clientes";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";
import { perguntasDoBanco } from "@/lib/vaga-extra";
import { moverCandidatos } from "./recrutamento";

// As Automações personalizadas (migração 20270115120000): salvar, ligar, apagar, rodar para quem já está, a
// prévia e o Desfazer. O banco confere tudo de novo (o recurso pago, a regra, quem pode).

/** A regra que chega da tela, só com o que vale (o banco limpa de novo). */
function limparRegra(r: RegraMontada): RegraMontada | null {
  const gatilho = lerGatilho(r?.gatilho);
  if (!gatilho) return null;
  return {
    nome: String(r.nome ?? "")
      .trim()
      .slice(0, 80),
    gatilho,
    condicoes: lerCondicoes(r.condicoes),
    acoes: lerAcoes(r.acoes),
    vale_em: r.vale_em === "todas" || r.vale_em === "cliente" ? r.vale_em : "vaga",
    anuncio_id: r.anuncio_id && UUID.test(r.anuncio_id) ? r.anuncio_id : null,
    cliente_id: r.cliente_id && UUID.test(r.cliente_id) ? r.cliente_id : null,
    modelo: r.modelo && /^[a-z-]{2,40}$/.test(r.modelo) ? r.modelo : null,
  };
}

export async function salvarRegra(
  id: string | null,
  regra: RegraMontada,
  opcoes: { ligar?: boolean; rodarAgora?: boolean } = {},
): Promise<Resultado & { id?: string; rodou?: number }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (id && !UUID.test(id)) return { ok: false, erro: "Regra não encontrada." };
  const limpa = limparRegra(regra);
  if (!limpa) return { ok: false, erro: "Escolha quando a regra age." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("salvar_regra", { p_id: id, p_regra: limpa as never });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar a regra.") };
  const novo = String(data);
  if (opcoes.ligar) {
    const { error: erro } = await supabase.rpc("ligar_regra", { p_id: novo, p_ligar: true });
    if (erro) return { ok: false, erro: mensagemDeErro(erro, "A regra foi salva, mas não deu para ligar.") };
  }
  let rodou = 0;
  if (opcoes.ligar && opcoes.rodarAgora) {
    const { data: n } = await supabase.rpc("regra_rodar_agora", { p_id: novo });
    rodou = Number(n ?? 0);
    if (rodou) after(processarFilas);
  }
  refresh();
  return {
    ok: true,
    id: novo,
    rodou,
    mensagem: opcoes.ligar
      ? rodou
        ? `Regra salva e ligada. Ela vai olhar agora para ${rodou === 1 ? "1 pessoa" : `${rodou} pessoas`} que já estão na vaga.`
        : "Regra salva e ligada. Ela age em quem chegar de agora em diante."
      : "Regra salva, desligada.",
  };
}

export async function ligarRegra(id: string, ligar: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Regra não encontrada." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("ligar_regra", { p_id: id, p_ligar: ligar });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: ligar ? "Regra ligada." : "Regra desligada." };
}

export async function apagarRegra(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Regra não encontrada." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("apagar_regra", { p_id: id });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Regra apagada." };
}

/** Desfazer o que uma regra fez com uma pessoa: a etapa de antes (sem mensagem) e as mensagens que esperavam. */
export async function desfazerRegra(feitaId: number): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!Number.isInteger(feitaId) || feitaId <= 0) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("regra_marcar_desfeita", { p_feita: feitaId });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  const d = (data ?? {}) as { anuncio_id?: string; perfil_id?: string; antes?: { etapa?: string } };
  if (d.anuncio_id && d.perfil_id) {
    const antes = d.antes?.etapa && d.antes.etapa !== "nao_seguiu" ? d.antes.etapa : "novo";
    const r = await moverCandidatos(d.anuncio_id, [d.perfil_id], antes, { semMensagem: true });
    if (!r.ok) return { ok: false, erro: r.erro };
  }
  refresh();
  return { ok: true, mensagem: "Desfeito: a pessoa voltou para onde estava. Mensagem que já saiu não volta." };
}

export type Previa = { total: number; pegaria: number; nomes: string[]; vagas: number };

type DadosDaPrevia = {
  anuncio_id: string;
  perfil_id: string;
  status: string;
  curtido_em: string;
  etapa: string | null;
  etapa_em: string | null;
  teste: number | null;
  teste_vencido: boolean;
  triagem: boolean | null;
  video: boolean;
  entrevista_em: string | null;
  origem: string;
};

const DIA = 86_400_000;

/** Quem estaria na situação do gatilho (nos últimos 30 dias, ou agora, nos de tempo). */
function noGatilho(g: Gatilho, d: DadosDaPrevia, agora: number) {
  const recente = (iso: string | null) => Boolean(iso) && agora - new Date(iso as string).getTime() <= 30 * DIA;
  switch (g.tipo) {
    case "candidatou":
      return recente(d.curtido_em);
    case "entrou_etapa":
      return g.etapa === "nao_seguiu"
        ? d.status === "dispensada" || d.etapa === "nao_seguiu"
        : d.status === "match" && d.etapa === g.etapa;
    case "parado": {
      if (g.etapa === "novos")
        return d.status === "pendente" && !d.etapa && agora - new Date(d.curtido_em).getTime() >= g.dias * DIA;
      return (
        d.status === "match" &&
        d.etapa === g.etapa &&
        Boolean(d.etapa_em) &&
        agora - new Date(d.etapa_em as string).getTime() >= g.dias * DIA
      );
    }
    case "triagem":
      return d.triagem !== null;
    case "teste_feito":
      return d.teste !== null;
    case "teste_vencido":
      return d.teste_vencido;
    case "video_enviado":
      return d.video;
    case "entrevista_passou":
      return Boolean(d.entrevista_em) && agora - new Date(d.entrevista_em as string).getTime() >= g.horas * 3_600_000;
  }
}

/** A prévia: nas vagas em que a regra vale, quantas pessoas ela pegaria (e os primeiros nomes). */
export async function previaDaRegra(
  regra: RegraMontada,
): Promise<{ ok: true; previa: Previa } | { ok: false; erro: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const r = limparRegra(regra);
  if (!r) return { ok: false, erro: "Escolha quando a regra age." };
  const agora = Date.now();
  const itens = (await montarCaixa(agora)) ?? [];
  let vagas = [...new Set(itens.map((c) => c.anuncio_id))];
  if (r.vale_em === "vaga") vagas = vagas.filter((v) => v === r.anuncio_id);
  if (r.vale_em === "cliente") {
    const usuario = await obterUsuario();
    const doCliente = usuario ? await clientesDasVagas(usuario.id).catch(() => new Map<string, string>()) : new Map();
    vagas = vagas.filter((v) => doCliente.get(v) === r.cliente_id);
  }
  if (!vagas.length) return { ok: true, previa: { total: 0, pegaria: 0, nomes: [], vagas: 0 } };
  const supabase = await criarClienteServidor();
  const [{ data }, respostas, anuncios] = await Promise.all([
    supabase.rpc("regras_previa_dados", { p_anuncios: vagas }),
    listarRespostasDosCandidatos(vagas),
    Promise.all(vagas.map((v) => obterAnuncio(v))),
  ]);
  const perguntasDe = new Map(anuncios.flatMap((a) => (a ? [[a.id, perguntasDoBanco(a.perguntas)] as const] : [])));
  const vagaDe = new Map(anuncios.flatMap((a) => (a ? [[a.id, a] as const] : [])));
  const dados = new Map(
    ((Array.isArray(data) ? data : []) as unknown as DadosDaPrevia[]).map((d) => [`${d.anuncio_id}:${d.perfil_id}`, d]),
  );
  const daVaga = itens.filter((c) => vagas.includes(c.anuncio_id));
  let total = 0;
  const pegos: string[] = [];
  for (const c of daVaga) {
    const d = dados.get(`${c.anuncio_id}:${c.perfil_id}`);
    if (!d || !noGatilho(r.gatilho, d, agora)) continue;
    total++;
    const a = vagaDe.get(c.anuncio_id);
    const km =
      a && c.cidade
        ? distanciaEntreAreas({ cidade: c.cidade, bairro: c.bairro }, { cidade: a.cidade, bairro: a.bairro })
        : null;
    const passa = confereRegra(r, {
      perguntas: perguntasDe.get(c.anuncio_id) ?? [],
      respostas: respostas.get(`${c.anuncio_id}:${c.perfil_id}`) ?? {},
      teste: d.teste,
      combina: c.aderencia?.nota ?? null,
      km,
      triagem: d.triagem,
      temCurriculo: c.tem_curriculo,
      origem: d.origem === "chamado" ? "chamado" : "publike",
    });
    if (passa) pegos.push(c.nome.split(" ")[0] || c.nome);
  }
  return { ok: true, previa: { total, pegaria: pegos.length, nomes: pegos.slice(0, 3), vagas: vagas.length } };
}
