import "server-only";
import type { AtividadesDaVaga, CamposDaVaga } from "@/lib/aderencia";
import { lerExperiencias } from "@/lib/dados";
import { estudosDoBanco } from "@/lib/estudos";
import { lerDiaADia, lerJeito } from "@/lib/jeito-de-trabalhar";
import { aderenciasDaVaga, type TalentoParaAderencia } from "@/lib/talentos-da-vaga";
import { comFuncaoDasVagas, comFuncoes } from "./funcoes-pelo-contexto";
import { acessoFila } from "./filas";

// Quem atende a sua vaga e ainda não curtiu (migração 20270908120000; 22/11/2026). O banco manda as vagas da vez e os
// talentos de cada uma; aqui sai a mesma conta do "Atende a vaga" de Talentos (src/lib/talentos-da-vaga.ts) e, com
// pessoas novas suficientes (3, no Admin), o pedido do aviso. Começa desligado (Admin › Procuradas sem vaga).

/** Cada rodada olha no máximo isso (a rota das filas tem outras tarefas depois). */
const TEMPO = 8_000;

type Dados = {
  vaga: CamposDaVaga & { id: string; dia_a_dia?: unknown };
  avisados: string[];
  talentos: (Record<string, unknown> & { perfil_id: string; atividades: AtividadesDaVaga | null })[];
} | null;

/** "3 pessoas que atendem tudo o que “Pedreiro” pede ainda não viram o anúncio. Convide: ..." */
export function textoDoAviso(n: number, titulo: string) {
  return `${n === 1 ? "1 pessoa que atende" : `${n} pessoas que atendem`} tudo o que “${titulo.slice(0, 80)}” pede ${
    n === 1 ? "ainda não viu" : "ainda não viram"
  } o anúncio. Convide: a pessoa recebe a vaga e, se curtir, chega na sua caixa de entrada.`;
}

/** Quem atende a vaga agora e ainda não foi avisado (a mesma conta de Talentos). */
export async function novosQueAtendem(dados: NonNullable<Dados>, agora: number) {
  const talentos: TalentoParaAderencia[] = dados.talentos.map((t) => ({
    perfil_id: t.perfil_id,
    cidade: (t.cidade as string | null) ?? null,
    bairro: (t.bairro as string | null) ?? null,
    escolaridade: (t.escolaridade as string | null) ?? null,
    curso: (t.curso as string | null) ?? null,
    experiencias: lerExperiencias(t.experiencias),
    cursos: (t.cursos as string[] | null) ?? [],
    cnh: (t.cnh as string | null) ?? null,
    disponibilidade: (t.disponibilidade as string[] | null) ?? [],
    estudos: estudosDoBanco(t.estudos),
    titulo: (t.titulo as string | null) ?? null,
    habilidades: (t.habilidades as string[] | null) ?? [],
    jeito: lerJeito(t.jeito),
  }));
  const [[vaga], experiencias] = await Promise.all([
    comFuncaoDasVagas([dados.vaga]),
    comFuncoes(talentos.map((t) => ({ experiencias: t.experiencias }))),
  ]);
  const atividades = new Map(
    dados.talentos.flatMap((t) => (t.atividades ? [[t.perfil_id, t.atividades] as const] : [])),
  );
  const { rigidos } = aderenciasDaVaga(
    vaga,
    talentos,
    { experiencias: experiencias.map((e) => e.experiencias), diaADia: lerDiaADia(dados.vaga.dia_a_dia), atividades },
    agora,
  );
  const avisados = new Set(dados.avisados);
  return rigidos.map(({ t }) => t.perfil_id).filter((id) => !avisados.has(id));
}

/** A rodada das filas (e o "Mandar agora" do Admin, com `agora`: fora do horário e com o envio desligado). */
export async function avisarQuemAtende(agora = false): Promise<{ avisos: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { avisos: 0 };
  const { cliente, chave } = acesso;
  const { data: vagas, error } = await cliente.rpc("servidor_atendem_vagas", {
    p_chave: chave,
    p_limite: agora ? 50 : 10,
    p_agora: agora,
  });
  if (error) {
    if (error.code === "PGRST202") return { avisos: 0 };
    console.error("Publike: falha ao ler as vagas de quem atende:", error.message);
    return { avisos: 0, motivo: "Não foi possível ler as vagas de quem atende." };
  }
  const inicio = Date.now();
  let avisos = 0;
  for (const v of vagas ?? []) {
    if (!agora && Date.now() - inicio > TEMPO) break;
    try {
      const { data, error: e } = await cliente.rpc("servidor_atendem_dados", { p_chave: chave, p_anuncio: v.anuncio_id });
      if (e) throw new Error(e.message);
      const dados = data as unknown as Dados;
      if (!dados?.vaga) continue;
      const novos = await novosQueAtendem(dados, Date.now());
      if (novos.length < Math.max(1, v.minimo)) continue;
      const { data: ok, error: e2 } = await cliente.rpc("servidor_atendem_avisar", {
        p_chave: chave,
        p_anuncio: v.anuncio_id,
        p_perfis: novos,
        p_texto: textoDoAviso(novos.length, v.titulo),
      });
      if (e2) throw new Error(e2.message);
      if (ok) avisos++;
    } catch (e) {
      console.error("Publike: falha no aviso de quem atende a vaga:", e instanceof Error ? e.message : e);
    }
  }
  return { avisos };
}
