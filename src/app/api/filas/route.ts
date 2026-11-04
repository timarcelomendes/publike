import { timingSafeEqual } from "node:crypto";
import {
  avisarNoticiasDoDia,
  enviarRetornos,
  lembrarEntrevistas,
  prazosDaEntrevistaVideo,
  lembrarParados,
  limparTestesAntigos,
  enviarEmailsPendentes,
  enviarPushPendentes,
  lembrarRespostas,
  liberarContatosParados,
  revisarAnunciosPendentes,
  revisarAvaliacoesPendentes,
  revisarRecadosPendentes,
} from "@/lib/servidor/filas";
import { mandarCombinamDaSemana } from "@/lib/servidor/combinam";
import { funcoesDasVagas } from "@/lib/servidor/funcao";
import { regrasComOTempo } from "@/lib/servidor/regras";
import { triagemAutomatica } from "@/lib/servidor/triagem-automatica";

// A garantia das filas: a tarefa agendada do GitHub (.github/workflows/filas.yml) chama a cada 5 minutos,
// com "Authorization: Bearer <CRON_SECRET>". Esvazia os e-mails e as revisões da IA mesmo sem ninguém
// usando o site (hoje elas só andam em after() das ações). Responde 500 quando a fila não anda (chave do
// servidor recusada, configuração faltando, e-mail com falha): a tarefa falha e o GitHub avisa por e-mail.
export const maxDuration = 60;

function autorizado(cabecalho: string | null) {
  const segredo = (process.env.CRON_SECRET || "").trim();
  if (segredo.length < 16 || !cabecalho) return false;
  const esperado = Buffer.from(`Bearer ${segredo}`);
  const veio = Buffer.from(cabecalho);
  return esperado.length === veio.length && timingSafeEqual(esperado, veio);
}

export async function GET(request: Request) {
  if (!autorizado(request.headers.get("authorization"))) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }
  // Uma tarefa de cada vez (01/11/2026): todas juntas abriam mais de 10 consultas ao mesmo tempo, e o banco pequeno
  // (Nano, 0,5 GB de memória) ficou sem memória e caiu. Passou de 40 s, o resto fica para a próxima rodada (sem
  // contar como problema).
  const inicio = Date.now();
  const comTempo = async <T>(f: () => Promise<T>): Promise<Partial<T>> => (Date.now() - inicio > 40_000 ? {} : f());
  const ia = await comTempo(() => revisarAnunciosPendentes(20));
  // curtida parada há 48 h numa vaga de quem nunca entrou: o "Deu match" sai junto com os e-mails abaixo
  const parados = await comTempo(() => liberarContatosParados());
  // curtida sem resposta: o lembrete para quem publicou (24 h e 72 h) e, em 5 dias, o aviso para quem curtiu
  const lembretes = await comTempo(() => lembrarRespostas());
  // quem foi dispensado há 15 minutos recebe o retorno (das 8h às 20h)
  const retornos = await comTempo(() => enviarRetornos());
  // das 18h às 22h: o lembrete da entrevista de amanhã, para o candidato e para quem marcou
  const vespera = await comTempo(() => lembrarEntrevistas());
  // a entrevista em vídeo: vence quem não respondeu em 5 dias e lembra quando faltam 2
  const video = await comTempo(() => prazosDaEntrevistaVideo());
  // a automação da vaga: o lembrete dos candidatos parados há N dias (das 8h às 20h)
  const automacoes = await comTempo(() => lembrarParados());
  // a Triagem com IA lê sozinha: os critérios das vagas novas e as candidaturas que chegaram
  const triagem = await comTempo(() => triagemAutomatica());
  // as Automações personalizadas: os de tempo, as mensagens que esperavam e a fila (depois da Triagem, que pode
  // ter lido currículos)
  const regras = await comTempo(() => regrasComOTempo());
  const avaliacoes = await comTempo(() => revisarAvaliacoesPendentes(20));
  const recados = await comTempo(() => revisarRecadosPendentes(20));
  // segunda, a partir das 9h: as vagas e os talentos que combinam (ligado no admin), aos poucos
  const combinam = await comTempo(() => mandarCombinamDaSemana());
  // a partir das 18h: as notícias do dia num aviso só (sino e celular), uma vez por dia
  const noticias = await comTempo(() => avisarNoticiasDoDia());
  // os resultados dos testes de vagas fora do ar há 12 meses
  const testes = await comTempo(() => limparTestesAntigos());
  // a função (CBO) das vagas que ainda não têm: as regras do título e, com a IA ligada, a IA (para a faixa de salário)
  const funcoes = await comTempo(() => funcoesDasVagas(15));
  // depois da IA: ela pode ter tirado um anúncio do ar, e esse aviso sai junto. Os e-mails rodam sempre.
  const emails = await enviarEmailsPendentes(20);
  const celular = await enviarPushPendentes(50);

  const problemas = [
    emails.motivo,
    celular.motivo,
    ia.motivo,
    avaliacoes.motivo,
    recados.motivo,
    parados.motivo,
    lembretes.motivo,
    combinam.motivo,
    funcoes.motivo,
    noticias.motivo,
    testes.motivo,
    triagem.motivo,
    retornos.motivo,
    vespera.motivo,
    video.motivo,
    automacoes.motivo,
    regras.motivo,
  ].filter((m): m is string => Boolean(m));
  // só o erro, sem o endereço de ninguém (a resposta aparece no registro da tarefa do GitHub)
  if (emails.falhas > 0) {
    problemas.push(
      `${emails.falhas} e-mail(s) não saíram: ${[...new Set(emails.erros.map((e) => e.erro))].join("; ")}`,
    );
  }
  const ok = problemas.length === 0;
  return Response.json(
    {
      ok,
      problemas,
      emails: { enviados: emails.enviados, falhas: emails.falhas },
      celular,
      contatos_liberados: parados.liberadas,
      lembretes: { empresa: lembretes.empresa, pessoa: lembretes.pessoa },
      funcoes: funcoes.achadas,
      combinam: {
        vagas: combinam.vagas,
        talentos: combinam.talentos,
        reativar: combinam.reativar,
        resumos: combinam.resumos,
        vistos: combinam.vistos,
      },
      ia: { anuncios: ia, avaliacoes, recados },
      triagem: { criterios: triagem.montados, lidos: triagem.lidos },
      retornos: retornos.enviados,
      entrevistas_lembradas: vespera.lembradas,
      video_lembrados: video.lembradas,
      parados_lembrados: automacoes.lembrados,
      regras: { agiram: regras.agiram, mensagens: regras.mensagens },
    },
    { status: ok ? 200 : 500, headers: { "cache-control": "no-store" } },
  );
}
