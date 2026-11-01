import "server-only";
import { calcularAderencia, requisitosDaVaga, type CamposDaVaga } from "@/lib/aderencia";
import { lerExperiencias } from "@/lib/dados";
import { lerFaixas, proximosHorarios } from "@/lib/etapas-proprias";
import { estudosDoBanco } from "@/lib/estudos";
import {
  confereRegra,
  lerAcoes,
  lerCondicoes,
  lerGatilho,
  motivoDaDispensa,
  regraDispensa,
  resolverConflitos,
  type ContextoDaPessoa,
  type RegraMontada,
} from "@/lib/regras";
import { distanciaEntreAreas } from "@/lib/regioes";
import { perguntasDoBanco, respostasDoBanco } from "@/lib/vaga-extra";
import { acessoFila } from "./filas";

// O motor das Automações personalizadas (claude/plano-regras-personalizadas.md; migração 20270115120000): lê a fila
// dos acontecimentos, confere as condições aqui (o % que combina e a distância só existem no código do site) e pede
// ao banco para agir, que confere de novo e age como a conta. Roda logo depois das ações (com after(), junto com as
// filas) e na tarefa de 5 em 5 minutos (com os de tempo: parados, teste vencido, depois da entrevista).

type Pendente = {
  evento: { id: number; tipo: string; anuncio_id: string; perfil_id: string; dados: Record<string, unknown> };
  regras: { id: string; nome: string; conta_id: string; gatilho: unknown; condicoes: unknown; acoes: unknown }[];
  vaga: (CamposDaVaga & { id: string; perguntas: unknown; conta_id: string }) | null;
  candidato: {
    nome: string;
    cidade: string | null;
    bairro: string | null;
    status: string;
    respostas: unknown;
    origem: string;
  } | null;
  curriculo: Record<string, unknown> | null;
  teste: number | null;
  triagem: boolean | null;
};

/** O que a regra precisa saber da pessoa, a partir do que o banco mandou. */
function contextoDe(p: Pendente, agora: number): ContextoDaPessoa {
  const perguntas = perguntasDoBanco(p.vaga?.perguntas);
  const respostas = respostasDoBanco(p.candidato?.respostas);
  const cv = p.curriculo
    ? {
        escolaridade: (p.curriculo.escolaridade as string | null) ?? null,
        experiencias: lerExperiencias(p.curriculo.experiencias),
        cnh: (p.curriculo.cnh as string | null) ?? null,
        disponibilidade: (p.curriculo.disponibilidade as string[] | null) ?? [],
        cursos: (p.curriculo.cursos as string[] | null) ?? [],
        estudos: estudosDoBanco(p.curriculo.estudos),
        titulo: (p.curriculo.titulo as string | null) ?? null,
        habilidades: (p.curriculo.habilidades as string[] | null) ?? [],
      }
    : null;
  const combina =
    p.vaga && p.candidato
      ? calcularAderencia(
          { ...requisitosDaVaga(p.vaga), perguntas },
          // o tipo do currículo da conta: os campos que a nota usa
          { curriculo: cv as never, respostas, cidade: p.candidato.cidade, bairro: p.candidato.bairro },
          agora,
        ).nota
      : null;
  const km =
    p.vaga && p.candidato?.cidade
      ? distanciaEntreAreas(
          { cidade: p.candidato.cidade, bairro: p.candidato.bairro },
          { cidade: p.vaga.cidade, bairro: p.vaga.bairro },
        )
      : null;
  return {
    perguntas,
    respostas,
    teste: typeof p.teste === "number" ? p.teste : null,
    combina,
    km: km === null ? null : Math.round(km * 10) / 10,
    triagem: typeof p.triagem === "boolean" ? p.triagem : null,
    temCurriculo: Boolean(p.curriculo),
    origem: p.candidato?.origem === "chamado" ? "chamado" : "publike",
  };
}

/** Esvazia a fila das regras (algumas voltas: uma regra que move pode puxar outra). */
export async function processarRegras(voltas = 3): Promise<{ agiram: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { agiram: 0 };
  const agora = Date.now();
  const horariosDaConta = new Map<string, { faixas: unknown; ocupados: { inicio: string; fim: string }[] } | null>();
  let agiram = 0;
  for (let volta = 0; volta < voltas; volta++) {
    const { data, error } = await acesso.cliente.rpc("servidor_regras_pendentes", {
      p_chave: acesso.chave,
      p_limite: 40,
    });
    if (error) {
      // sem a migração 20270115120000: nada a fazer
      if (error.code === "PGRST202") return { agiram };
      return { agiram, motivo: `Regras: ${error.message}` };
    }
    const lista = (Array.isArray(data) ? data : []) as unknown as Pendente[];
    if (!lista.length) break;
    for (const p of lista) {
      const ctx = contextoDe(p, agora);
      const regras = p.regras.flatMap((r) => {
        const gatilho = lerGatilho(r.gatilho);
        if (!gatilho) return [];
        const regra: RegraMontada & { id: string; conta_id: string } = {
          id: r.id,
          conta_id: r.conta_id,
          nome: r.nome,
          gatilho,
          condicoes: lerCondicoes(r.condicoes),
          acoes: lerAcoes(r.acoes),
          vale_em: "vaga",
        };
        return confereRegra(regra, ctx) ? [regra] : [];
      });
      for (const { regra, indices } of resolverConflitos(regras)) {
        const extras: Record<string, unknown> = {};
        if (regraDispensa(regra)) extras.motivo = motivoDaDispensa(regra);
        const horarios = regra.acoes.find((a, j) => a.tipo === "horarios" && indices.includes(j + 1));
        if (horarios && horarios.tipo === "horarios") {
          if (!horariosDaConta.has(regra.conta_id)) {
            const { data: h } = await acesso.cliente.rpc("servidor_regra_horarios", {
              p_chave: acesso.chave,
              p_conta: regra.conta_id,
            });
            horariosDaConta.set(regra.conta_id, (h as never) ?? null);
          }
          const h = horariosDaConta.get(regra.conta_id);
          const ocupados = (h?.ocupados ?? []).map((o) => ({
            inicio: new Date(o.inicio).getTime(),
            fim: new Date(o.fim).getTime(),
          }));
          const campos = proximosHorarios(lerFaixas(h?.faixas), ocupados, agora, {
            quantos: 3,
            duracaoMin: horarios.duracao,
          });
          // os campos vêm no horário de Brasília; com menos de 2 horários, a ação fica de fora
          if (campos.length >= 2) {
            const opcoes = campos.map((c) => new Date(`${c}:00-03:00`).toISOString());
            extras.horarios = opcoes;
            // o próximo da mesma conta não pega os mesmos horários
            h?.ocupados.push(
              ...opcoes.map((x) => ({
                inicio: x,
                fim: new Date(new Date(x).getTime() + horarios.duracao * 60_000).toISOString(),
              })),
            );
          }
        }
        const { data: r, error: erro } = await acesso.cliente.rpc("servidor_regra_agir", {
          p_chave: acesso.chave,
          p_regra: regra.id,
          p_evento: p.evento.id,
          p_anuncio: p.evento.anuncio_id,
          p_perfil: p.evento.perfil_id,
          p_indices: indices,
          p_extras: extras as never,
        });
        if (erro) console.error(`Publike: a regra ${regra.id} não agiu: ${erro.message}`);
        else if ((r as { ok?: boolean } | null)?.ok) agiram++;
      }
    }
  }
  return { agiram };
}

/** A tarefa de 5 em 5 minutos: os de tempo e as mensagens que esperavam; depois, a fila. */
export async function regrasComOTempo(): Promise<{ agiram: number; mensagens: number; motivo?: string }> {
  const acesso = acessoFila();
  if (!acesso) return { agiram: 0, mensagens: 0 };
  const { data, error } = await acesso.cliente.rpc("servidor_regras_tempo", { p_chave: acesso.chave });
  if (error && error.code !== "PGRST202") return { agiram: 0, mensagens: 0, motivo: `Regras: ${error.message}` };
  const fila = await processarRegras();
  return { ...fila, mensagens: Number((data as { mensagens?: number } | null)?.mensagens ?? 0) };
}
