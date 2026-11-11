"use server";

import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { mensagemDeErro } from "@/lib/erros";
import { chaveDeEntrada, dailyConfigurado, salaDaEntrevista } from "@/lib/servidor/daily";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// A entrevista ao vivo pelo Publike (migração 20270106120000): a sala da Daily nasce na primeira entrada.

export type ParaEntrar = {
  id: string;
  anuncio_id: string;
  quando: string;
  duracao_min: number;
  situacao: string;
  formato: string;
  sala: string | null;
  papel: "empresa" | "candidato";
  nome: string;
  vaga: string;
  empresa: string;
  candidato: string;
  abre_em: string;
  fecha_em: string;
};

/** Entra na chamada: devolve o endereço da sala com a chave da pessoa (vale até a sala fechar). */
export async function entrarNaEntrevista(id: string): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  if (!dailyConfigurado()) return { ok: false, erro: "A chamada de vídeo não está disponível agora." };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("entrevista_para_entrar", { p_id: id });
  if (error || !data) return { ok: false, erro: mensagemDeErro(error, "Entrevista não encontrada.") };
  const e = data as unknown as ParaEntrar;
  if (e.formato !== "publike") return { ok: false, erro: "Esta entrevista não é pelo Publike." };
  if (!["marcada", "confirmada", "remarcar"].includes(e.situacao))
    return { ok: false, erro: "Esta entrevista não está mais marcada." };
  const agora = Date.now();
  const abre = new Date(e.abre_em);
  const fecha = new Date(e.fecha_em);
  if (agora < abre.getTime()) return { ok: false, erro: "A sala ainda não abriu: ela abre 10 minutos antes." };
  if (agora > fecha.getTime()) return { ok: false, erro: "A entrevista já passou." };
  try {
    let sala = e.sala;
    if (!sala) {
      sala = await salaDaEntrevista({ id: e.id, abre, fecha });
      await supabase.rpc("entrevista_guardar_sala", { p_id: e.id, p_sala: sala });
    }
    const chave = await chaveDeEntrada({ sala, nome: e.nome, dono: e.papel === "empresa", fecha });
    return { ok: true, url: `${sala}?t=${encodeURIComponent(chave)}` };
  } catch (erro) {
    console.error("Publike: a sala da entrevista falhou:", erro instanceof Error ? erro.message : erro);
    return { ok: false, erro: "Não deu para abrir a sala agora. Tente de novo em instantes." };
  }
}
