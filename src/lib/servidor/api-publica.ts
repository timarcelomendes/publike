import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { CAMINHO_CHAVES, ehEtapaApi, ETAPAS_API, FORMATO_CHAVE_API, type AcaoApi } from "@/lib/api-publica";
import { SITE_URL } from "@/lib/config";
import { ETAPAS_CANDIDATO, nomeEscolaridade, type EtapaCandidato } from "@/lib/constantes";
import { urlDaFoto } from "@/lib/formato";
import { ehMotivoSaida, MOTIVOS_SAIDA } from "@/lib/processo";
import { acessoFila, processarFilas } from "@/lib/servidor/filas";
import type { Json } from "@/lib/supabase/tipos-banco";
import { UUID } from "@/lib/validacao";
import { lerPerguntas, respostasDoBanco, textoDaResposta, type Pergunta } from "@/lib/vaga-extra";

// O servidor da API pública (/api/v1; migração 20270713120000_api_publica.sql). A chave chega no cabeçalho, vai para o
// banco só como sha256, com a chave do servidor; o banco confere, conta a chamada no dia e age como a conta. Os erros
// saem sempre no mesmo formato ({ erro: { codigo, mensagem } }) e com o código HTTP certo.

const SEM_CACHE = { "cache-control": "no-store" } as const;

export function erroDaApi(status: number, codigo: string, mensagem: string, extra: Record<string, unknown> = {}) {
  return Response.json({ erro: { codigo, mensagem, ...extra } }, { status, headers: SEM_CACHE });
}

const ok = (corpo: unknown) => Response.json(corpo, { headers: SEM_CACHE });

type ErroDoBanco = { code?: string; message: string; hint?: string | null };

/** O erro do banco no código HTTP (os hints vêm de privado.api_entrar e das funções do site). */
function respostaDoErro(error: ErroDoBanco): Response {
  const hint = error.hint ?? "";
  const codigo = error.code ?? "";
  // o site novo antes da migração: a função ainda não existe
  if (codigo === "PGRST202" || codigo === "42883") {
    return erroDaApi(503, "indisponivel", "A API está sendo ligada. Tente de novo em alguns minutos.");
  }
  if (hint === "chave_invalida") return erroDaApi(401, hint, error.message);
  if (hint === "api_desligada") return erroDaApi(503, hint, error.message);
  if (hint === "limite" || hint.startsWith("limite_")) return erroDaApi(429, hint, error.message);
  if (hint === "nao_encontrada" || codigo === "P0002") return erroDaApi(404, "nao_encontrada", error.message);
  if (codigo === "22023" || codigo === "22P02" || codigo === "22007" || codigo === "22008") {
    return erroDaApi(400, hint || "pedido_invalido", error.message);
  }
  // as regras do site (match já feito, etapa só depois do match, vaga na moderação, falta o contato...)
  if (codigo === "P0001") return erroDaApi(409, hint || "regra", error.message);
  if (codigo === "42501" && hint) return erroDaApi(403, hint, error.message);
  // a chave do servidor (42501 sem hint) ou outro erro do banco: não é culpa de quem chamou
  console.error(`Publike API: ${codigo} ${error.message}`);
  return erroDaApi(500, "erro_interno", "Algo deu errado do nosso lado. Tente de novo em instantes.");
}

type Cliente = NonNullable<ReturnType<typeof acessoFila>>["cliente"];
type Entrada = { cliente: Cliente; p_chave: string; p_hash: string };

/** A chave do pedido ("Authorization: Bearer publike_api_…" ou "X-Api-Key"), conferida só no formato. */
function entrar(req: Request): Entrada | Response {
  const autorizacao = (req.headers.get("authorization") ?? "").trim();
  const chave = (/^Bearer\s+(.+)$/i.exec(autorizacao)?.[1] ?? req.headers.get("x-api-key") ?? "").trim();
  if (!chave) {
    return erroDaApi(
      401,
      "sem_chave",
      `Mande a chave da API no cabeçalho Authorization: Bearer publike_api_… Crie a chave no Publike, em Configurações › API (${SITE_URL}${CAMINHO_CHAVES}).`,
    );
  }
  if (!FORMATO_CHAVE_API.test(chave)) {
    return erroDaApi(401, "chave_invalida", "Essa não é uma chave da API do Publike (publike_api_ e mais 48 letras).");
  }
  const acesso = acessoFila();
  if (!acesso) return erroDaApi(503, "indisponivel", "A API não está disponível agora. Tente de novo em instantes.");
  return { cliente: acesso.cliente, p_chave: acesso.chave, p_hash: createHash("sha256").update(chave, "utf8").digest("hex") };
}

// ---------------------------------------------------------------- o formato das respostas

type LinhaCandidatura = {
  vaga_id: string;
  vaga_titulo: string;
  vaga_status: string;
  candidato_id: string;
  nome: string;
  foto: string | null;
  cidade: string | null;
  bairro: string | null;
  verificado: boolean;
  situacao: string;
  etapa: string;
  mensagem: string | null;
  whatsapp: string | null;
  email: string | null;
  tem_curriculo: boolean;
  candidatou_em: string;
  respondida_em: string | null;
  etapa_em: string | null;
  atualizada_em: string;
};

const nomeDaEtapa = (etapa: string) => ETAPAS_CANDIDATO[etapa as EtapaCandidato]?.nome ?? etapa;

function candidatura(l: LinhaCandidatura) {
  return {
    vaga: { id: l.vaga_id, titulo: l.vaga_titulo, status: l.vaga_status },
    candidato: {
      id: l.candidato_id,
      nome: l.nome,
      foto: urlDaFoto(l.foto),
      cidade: l.cidade,
      bairro: l.bairro,
      verificado: l.verificado,
      // só depois do aceite (e com a vaga fora da moderação), como no painel
      whatsapp: l.whatsapp,
      email: l.email,
    },
    situacao: l.situacao,
    etapa: l.etapa,
    etapa_nome: nomeDaEtapa(l.etapa),
    mensagem: l.mensagem,
    tem_curriculo: l.tem_curriculo,
    candidatou_em: l.candidatou_em,
    respondida_em: l.respondida_em,
    etapa_em: l.etapa_em,
    atualizada_em: l.atualizada_em,
    link: `${SITE_URL}/painel/anuncio/${l.vaga_id}/quadro?candidato=${l.candidato_id}`,
  };
}

/** O cursor da próxima página: a última candidatura da página (base64url, para ir na URL sem escapar). */
const cursorDe = (l: LinhaCandidatura) =>
  Buffer.from(`${l.atualizada_em}|${l.vaga_id}|${l.candidato_id}`, "utf8").toString("base64url");

function lerCursor(cursor: string | null) {
  if (!cursor) return null;
  const texto = Buffer.from(cursor, "base64url").toString("utf8");
  return /^[^|]{10,40}\|[0-9a-f-]{36}\|[0-9a-f-]{36}$/i.test(texto) ? texto : "";
}

// ---------------------------------------------------------------- as chamadas

/** GET /api/v1: a conta da chave, o limite por dia e quantas chamadas já foram hoje. */
export async function contaDaApi(req: Request) {
  const e = entrar(req);
  if (e instanceof Response) return e;
  const { data, error } = await e.cliente.rpc("servidor_api_conta", { p_chave: e.p_chave, p_hash: e.p_hash });
  if (error) return respostaDoErro(error);
  return ok({ conta: data });
}

const STATUS_DA_VAGA = ["ativo", "pausado", "encerrado", "expirado", "em_analise", "removido"];

/** GET /api/v1/vagas?status=ativo: as vagas da conta (as 500 mais novas). */
export async function vagasDaApi(req: Request) {
  const status = new URL(req.url).searchParams.get("status");
  if (status && !STATUS_DA_VAGA.includes(status)) {
    return erroDaApi(400, "status_invalido", `O status vai em branco ou é um destes: ${STATUS_DA_VAGA.join(", ")}.`);
  }
  const e = entrar(req);
  if (e instanceof Response) return e;
  const { data, error } = await e.cliente.rpc("servidor_api_vagas", {
    p_chave: e.p_chave,
    p_hash: e.p_hash,
    p_status: status || null,
  });
  if (error) return respostaDoErro(error);
  const vagas = (Array.isArray(data) ? data : []) as Record<string, Json>[];
  return ok({ vagas: vagas.map((v) => ({ ...v, link: `${SITE_URL}/anuncio/${String(v.id)}` })) });
}

/**
 * GET /api/v1/candidaturas (e /api/v1/vagas/{vaga}/candidaturas): o que mudou, da mudança mais antiga para a mais
 * nova, em páginas de até 100. `desde` (data e hora ISO 8601) começa depois dessa hora; `cursor` continua a página
 * anterior (o `proximo` dela). Guardando o último `proximo`, a próxima consulta traz só o que mudou depois.
 */
export async function candidaturasDaApi(req: Request, vagaDaRota: string | null = null) {
  const sp = new URL(req.url).searchParams;
  const vaga = vagaDaRota ?? sp.get("vaga");
  if (vaga && !UUID.test(vaga)) return erroDaApi(400, "vaga_invalida", "O id da vaga não vale (um UUID).");
  const desde = sp.get("desde");
  if (desde && Number.isNaN(Date.parse(desde))) {
    return erroDaApi(400, "desde_invalido", "Mande `desde` como data e hora ISO 8601, como 2026-11-17T08:00:00-03:00.");
  }
  const limiteBruto = sp.get("limite");
  const limite = limiteBruto === null ? 50 : Number(limiteBruto);
  if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
    return erroDaApi(400, "limite_invalido", "O `limite` vai de 1 a 100 (padrão: 50).");
  }
  const depois = lerCursor(sp.get("cursor"));
  if (depois === "") return erroDaApi(400, "cursor_invalido", "O cursor não vale. Use o `proximo` que a página anterior devolveu.");
  const e = entrar(req);
  if (e instanceof Response) return e;
  const { data, error } = await e.cliente.rpc("servidor_api_candidaturas", {
    p_chave: e.p_chave,
    p_hash: e.p_hash,
    p_vaga: vaga,
    p_desde: desde ? new Date(desde).toISOString() : null,
    p_depois: depois,
    p_limite: limite,
  });
  if (error) return respostaDoErro(error);
  const pagina = (data ?? {}) as { candidaturas?: LinhaCandidatura[]; mais?: boolean };
  const linhas = pagina.candidaturas ?? [];
  const ultima = linhas.at(-1);
  return ok({
    candidaturas: linhas.map(candidatura),
    // sempre que houver uma candidatura na página, o cursor dela: o CRM guarda e pergunta de novo depois
    proximo: ultima ? cursorDe(ultima) : null,
    mais: Boolean(pagina.mais),
  });
}

/** GET /api/v1/vagas/{vaga}/candidaturas/{candidato}: com o currículo e as respostas às perguntas da vaga. */
export async function candidatoDaApi(req: Request, vaga: string, candidato: string) {
  if (!UUID.test(vaga) || !UUID.test(candidato)) {
    return erroDaApi(404, "nao_encontrada", "Candidatura não encontrada.");
  }
  const e = entrar(req);
  if (e instanceof Response) return e;
  const { data, error } = await e.cliente.rpc("servidor_api_candidato", {
    p_chave: e.p_chave,
    p_hash: e.p_hash,
    p_vaga: vaga,
    p_perfil: candidato,
  });
  if (error) return respostaDoErro(error);
  const linha = data as LinhaCandidatura & {
    curriculo: (Record<string, Json> & { escolaridade?: string | null }) | null;
    perguntas: Json;
    respostas: Json;
  };
  const lidas = lerPerguntas(linha.perguntas);
  const perguntas: Pergunta[] = lidas.ok ? lidas.perguntas : [];
  const respostas = respostasDoBanco(linha.respostas);
  return ok({
    candidatura: {
      ...candidatura(linha),
      curriculo: linha.curriculo
        ? { ...linha.curriculo, escolaridade_nome: nomeEscolaridade(linha.curriculo.escolaridade ?? null) || null }
        : null,
      respostas: perguntas.map((p) => ({
        pergunta: p.nome,
        resposta: textoDaResposta(p, respostas[p.id]) || null,
      })),
    },
  });
}

/**
 * POST .../aceitar, POST .../dispensar ({ "motivo": "requisito" }) e PUT .../etapa ({ "etapa": "entrevista",
 * "nota": "..." }): as mesmas regras e os mesmos avisos ao candidato de quando a conta faz pelo site.
 */
export async function responderPelaApi(req: Request, vaga: string, candidato: string, acao: AcaoApi) {
  if (!UUID.test(vaga) || !UUID.test(candidato)) {
    return erroDaApi(404, "nao_encontrada", "Candidatura não encontrada.");
  }
  let corpo: Record<string, unknown> = {};
  const texto = await req.text().catch(() => "");
  if (texto.trim()) {
    try {
      const lido: unknown = JSON.parse(texto);
      if (!lido || typeof lido !== "object" || Array.isArray(lido)) throw new Error("não é objeto");
      corpo = lido as Record<string, unknown>;
    } catch {
      return erroDaApi(400, "json_invalido", "O corpo do pedido precisa ser um objeto JSON.");
    }
  }
  let etapa: string | null = null;
  let motivo: string | null = null;
  let nota: string | null = null;
  if (acao === "etapa") {
    if (!ehEtapaApi(corpo.etapa)) {
      return erroDaApi(400, "etapa_invalida", `Mande a etapa: ${ETAPAS_API.join(", ")}.`, { etapas: ETAPAS_API });
    }
    etapa = corpo.etapa;
    if (corpo.nota !== undefined && corpo.nota !== null) {
      if (typeof corpo.nota !== "string" || corpo.nota.length > 1000) {
        return erroDaApi(400, "nota_invalida", "A `nota` é um texto de até 1000 letras (só quem contrata vê).");
      }
      nota = corpo.nota;
    }
  }
  if (acao === "dispensar" && corpo.motivo !== undefined && corpo.motivo !== null) {
    if (!ehMotivoSaida(corpo.motivo)) {
      return erroDaApi(400, "motivo_invalido", `O motivo é um destes: ${MOTIVOS_SAIDA.map((m) => m.valor).join(", ")}.`, {
        motivos: MOTIVOS_SAIDA,
      });
    }
    motivo = corpo.motivo;
  }
  const e = entrar(req);
  if (e instanceof Response) return e;
  const { data, error } = await e.cliente.rpc("servidor_api_responder", {
    p_chave: e.p_chave,
    p_hash: e.p_hash,
    p_vaga: vaga,
    p_perfil: candidato,
    p_acao: acao,
    p_etapa: etapa,
    p_motivo: motivo,
    p_nota: nota,
  });
  if (error) {
    // a conta pede o motivo para tirar alguém do processo: a lista vai junto
    if (error.hint === "motivo_saida") {
      return erroDaApi(409, "motivo_saida", `${error.message} Mande { "motivo": "…" }.`, { motivos: MOTIVOS_SAIDA });
    }
    return respostaDoErro(error);
  }
  // o aviso ao candidato (e-mail, celular e WhatsApp) sai pela fila: já, como no site
  after(processarFilas);
  return ok({ candidatura: candidatura(data as LinhaCandidatura) });
}
