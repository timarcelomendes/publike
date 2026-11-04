import "server-only";
import { estudosDoBanco } from "@/lib/estudos";
import { montarPerguntasDoMatch, type VagaDasPerguntas } from "@/lib/perguntas-do-match";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { acessoFila } from "./filas";

// O robô das perguntas do match (migração 20270202120000): pega os matches novos, monta as perguntas com o que a vaga
// pede e o currículo mostra, e pede ao banco para começar a conversa. Roda logo depois das ações (dentro de
// processarFilas) e na tarefa de 5 em 5 minutos.

type Pendente = {
  anuncio_id: string;
  perfil_id: string;
  vaga: VagaDasPerguntas | null;
  curriculo: {
    escolaridade: string | null;
    estudos: unknown;
    cnh: string | null;
    disponibilidade: string[] | null;
    experiencias: number | null;
  } | null;
};

export async function perguntarNosMatches(limite = 20): Promise<{ perguntados: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { perguntados: 0 };
  const { data, error } = await acesso.cliente.rpc("servidor_perguntas_para_montar", {
    p_chave: acesso.chave,
    p_limite: limite,
  });
  if (error) {
    // banco sem a migração: nada a fazer
    if (error.code === "PGRST202") return { perguntados: 0 };
    console.error("Publike: falha ao pegar os matches para perguntar:", error.message);
    return { perguntados: 0, motivo: "Não foi possível montar as perguntas do match." };
  }
  let perguntados = 0;
  for (const p of (Array.isArray(data) ? data : []) as Pendente[]) {
    if (!p.vaga) continue;
    const cv = p.curriculo
      ? {
          escolaridade: p.curriculo.escolaridade ?? null,
          estudos: estudosDoBanco(p.curriculo.estudos),
          cnh: p.curriculo.cnh ?? null,
          disponibilidade: p.curriculo.disponibilidade ?? [],
          experiencias: Number(p.curriculo.experiencias) || 0,
        }
      : null;
    const { data: n, error: erro } = await acesso.cliente.rpc("servidor_comecar_perguntas", {
      p_chave: acesso.chave,
      p_anuncio: p.anuncio_id,
      p_perfil: p.perfil_id,
      p_perguntas: montarPerguntasDoMatch(p.vaga, cv),
    });
    // o que não foi volta para a fila em 10 minutos
    if (erro) console.error("Publike: falha ao começar as perguntas do match:", erro.message);
    else if (Number(n) > 0) perguntados++;
  }
  return { perguntados };
}

export type RespostaDoChat = { rotulo: string; resposta: string | null };

/** As respostas às perguntas do match de cada candidato da vaga, para o quadro (null: sem a migração). */
export async function respostasDoChatDaVaga(anuncioId: string): Promise<Map<string, RespostaDoChat[]> | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("respostas_do_chat_da_vaga", { p_anuncio: anuncioId });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler as respostas do chat: ${error.message}`);
    return null;
  }
  const mapa = new Map<string, RespostaDoChat[]>();
  for (const [perfil, lista] of Object.entries((data ?? {}) as Record<string, unknown>)) {
    if (!Array.isArray(lista)) continue;
    mapa.set(
      perfil,
      lista
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
        .map((x) => ({
          rotulo: String(x.rotulo ?? ""),
          resposta: typeof x.resposta === "string" ? x.resposta : null,
        })),
    );
  }
  return mapa;
}
