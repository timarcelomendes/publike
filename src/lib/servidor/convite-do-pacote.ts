import "server-only";
import { matchComAVaga, outraArea, type CamposDaVaga } from "@/lib/aderencia";
import type { Curriculo } from "@/lib/tipos";
import { cidadesPerto, comoCurriculo, MINIMO } from "./combinam";
import { acessoFila } from "./filas";
import { comFuncaoDasVagas, comFuncoes } from "./funcoes-pelo-contexto";

// O convite do pacote (18/11/2026, claude/plano-ritmo-do-pacote.md; migração 20270717120000). Com o pacote de
// candidatos no ar, o Publike convida para a vaga quem tem currículo em Talentos e combina com ela: a conta do site
// (70% ou mais, sem "Outra área"), do mais perto para o mais longe (o centro do bairro do perfil, até 15 km; sem o
// bairro localizado, a mesma praça, por último). O banco escolhe a hora (das 8h às 21h), a rodada (a cada 15 minutos),
// quem pode receber (as regras do convite, os 2 automáticos da semana, quem não quer) e o máximo do pacote, e confere
// tudo de novo ao convidar. A curtida de quem foi convidado conta no pacote (o gatilho na curtida).

/** Até quantas pessoas por pacote em cada rodada. */
const POR_RODADA = 10;
/** Até onde é "perto" para quem tem o bairro localizado. */
const RAIO_KM = 15;

type PacoteParaConvidar = {
  impulso_id: string;
  conta_id: string;
  restam: number;
  vaga: CamposDaVaga & { id: string };
};

type TalentoDoPacote = {
  perfil_id: string;
  nome: string;
  cidade: string | null;
  bairro: string | null;
  curriculo: unknown;
  km: number | string | null;
};

export async function convidarPelosPacotes(): Promise<{ convidados: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { convidados: 0 };
  const { cliente, chave } = acesso;
  const { data, error } = await cliente.rpc("servidor_pacotes_para_convidar", { p_chave: chave });
  if (error) {
    // sem a migração: nenhum convite
    if (error.code === "PGRST202") return { convidados: 0 };
    console.error("Publike: falha ao ler os pacotes para o convite:", error.message);
    return { convidados: 0, motivo: "Não foi possível ler os pacotes para o convite do pacote." };
  }
  const pacotes = (Array.isArray(data) ? data : []) as PacoteParaConvidar[];
  if (!pacotes.length) return { convidados: 0 };

  // a função (CBO) que a IA leu de cada vaga: o % pelo contexto, como no site
  const comCbo = new Map((await comFuncaoDasVagas(pacotes.map((p) => p.vaga))).map((v) => [v.id, v]));
  const agora = Date.now();
  let convidados = 0;
  let falhou = false;
  for (const p of pacotes) {
    const quantos = Math.min(POR_RODADA, Number(p.restam) || 0);
    if (quantos <= 0) continue;
    const vaga = comCbo.get(p.vaga.id) ?? p.vaga;
    const { data: lista, error: e2 } = await cliente.rpc("servidor_talentos_para_o_pacote", {
      p_chave: chave,
      p_impulso: p.impulso_id,
    });
    if (e2) {
      console.error("Publike: falha ao ler os talentos do pacote:", e2.message);
      falhou = true;
      continue;
    }
    const perto = cidadesPerto(vaga.cidade);
    const brutos = ((lista ?? []) as TalentoDoPacote[])
      .map((t) => ({ ...t, km: t.km == null ? null : Number(t.km), cv: comoCurriculo(t.curriculo) }))
      .filter((t): t is typeof t & { cv: Curriculo } => t.cv !== null)
      .filter((t) => (t.km != null && Number.isFinite(t.km) ? t.km <= RAIO_KM : perto.includes(t.cidade ?? "")));
    if (!brutos.length) continue;
    const cvs = await comFuncoes(brutos.map((t) => t.cv));
    const escolhidos = brutos
      .map((t, i) => ({ t, m: matchComAVaga(vaga, { curriculo: cvs[i], cidade: t.cidade, bairro: t.bairro }, agora) }))
      .filter((x) => x.m !== null && (x.m.nota ?? 0) >= MINIMO && !outraArea(x.m))
      // o mais perto primeiro; sem o bairro localizado, por último; no empate, quem combina mais
      .sort((a, b) => (a.t.km ?? Infinity) - (b.t.km ?? Infinity) || (b.m?.nota ?? 0) - (a.m?.nota ?? 0))
      .slice(0, quantos);
    for (const { t } of escolhidos) {
      const { data: foi, error: e3 } = await cliente.rpc("servidor_convidar_pelo_pacote", {
        p_chave: chave,
        p_impulso: p.impulso_id,
        p_perfil: t.perfil_id,
      });
      if (e3) {
        console.error("Publike: falha no convite do pacote:", e3.message);
        falhou = true;
        break;
      }
      if (foi === true) convidados++;
    }
  }
  return falhou
    ? { convidados, motivo: "Parte do convite do pacote não saiu; o robô tenta de novo na próxima rodada." }
    : { convidados };
}
