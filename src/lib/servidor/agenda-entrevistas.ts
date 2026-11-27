import "server-only";
import { LOGIN_CELULAR, SITE_URL } from "@/lib/config";
import { caminhoDeEntrar } from "./entrar-pelo-whatsapp";
import { acessoFila } from "./filas";
import type { ClienteBanco } from "@/lib/supabase/admin";
import {
  configMeta,
  enviarComBotoes,
  enviarModelo,
  MODELOS,
  podeSair,
  RODAPE_WHATSAPP,
  type SituacaoModelos,
} from "./whatsapp";

// A entrevista marcada pelo WhatsApp, fase 1 (migração 20271013120000; claude/plano-entrevista-marcada.md; 27/11/2026,
// Marcelo: "Sim, execute"). A equipe monta a agenda da vaga em Admin › Entrevistas (os horários que a empresa passou e
// quem chamar); daqui saem:
//   * o convite (`publike_convite_entrevista`, [Quero marcar] [Não tenho interesse]), em ondas, pelo robô das filas;
//   * na conversa, a lista dos horários livres, a confirmação e a troca (respostaDaAgenda, chamada pelo atendimento);
//   * os lembretes: na véspera ([Confirmo] [Não vou mais] [Trocar horário]) e umas 2 horas antes ([Tudo certo]
//     [Não vou mais]; no vídeo pelo Publike, [Entrar na sala] com o link de entrar com um toque).
// Os botões levam o código do convite: g:sim:<token>, g:h:<horário>:<token>, g:conf:<token>…

export const MODELO_CONVITE_ENTREVISTA = "publike_convite_entrevista";
export const MODELO_ENTREVISTA_VESPERA = "publike_entrevista_confirmar";
export const MODELO_ENTREVISTA_HOJE = "publike_entrevista_hoje";
export const MODELO_ENTREVISTA_HOJE_VIDEO = "publike_entrevista_hoje_video";

export const PAYLOAD_AGENDA =
  /^g:(sim|nao|conf|ok|cancelar|remarcar):([0-9a-f]{32})$/;
export const PAYLOAD_HORARIO = /^g:h:(\d{1,18}):([0-9a-f]{32})$/;
/** A marca da mensagem com a lista dos horários: a resposta escrita depois dela ganha a dica de tocar na lista. */
export const MARCA_DOS_HORARIOS = "Escolha o horário da entrevista";

type Horario = { id: number; rotulo: string; quando: string };
export type RespostaDaAgenda = {
  situacao: string;
  empresa?: string;
  vaga?: string;
  formato?: string;
  local?: string | null;
  obs?: string | null;
  como?: string;
  quando?: string | null;
  horarios?: Horario[];
  entrevista_id?: string | null;
  remarcou?: boolean;
  trocando?: boolean;
  mensagem?: string;
};

export type SaidaDaAgenda = {
  texto: string;
  botoes?: { id: string; titulo: string }[];
  lista?: {
    botao: string;
    secao?: string;
    linhas: { id: string; titulo: string; descricao?: string }[];
  };
};

const maiuscula = (t: string) =>
  t ? t.charAt(0).toUpperCase() + t.slice(1) : t;

/** Os botões depois de marcar: trocar o horário ou desistir. */
const botoesDaMarcada = (token: string) => [
  { id: `g:remarcar:${token}`, titulo: "Trocar horário" },
  { id: `g:cancelar:${token}`, titulo: "Não vou mais" },
];

/** A lista dos horários livres (até 10), com a marca para a resposta escrita. */
function listaDosHorarios(
  r: RespostaDaAgenda,
  token: string,
  abertura: string,
): SaidaDaAgenda {
  const horarios = r.horarios ?? [];
  return {
    texto: `${abertura}\n\n${MARCA_DOS_HORARIOS} para a vaga de *${r.vaga}* (${r.empresa}), ${r.como}: toque em *Ver horários* e escolha um.`,
    lista: {
      botao: "Ver horários",
      secao: "Horários livres",
      linhas: horarios.map((h) => ({
        id: `g:h:${h.id}:${token}`,
        titulo: h.rotulo,
      })),
    },
  };
}

/** A confirmação do horário marcado, pelo formato da entrevista. */
export function textoDaMarcada(r: RespostaDaAgenda): string {
  const quando = maiuscula(r.quando ?? "");
  const obs = r.obs ? `\n\n${r.obs}` : "";
  const desistir =
    "Se não puder ir, toque em *Não vou mais*: o horário fica para outra pessoa.";
  const lembrete = "Na véspera, eu te lembro por aqui.";
  const titulo = r.remarcou ? "Horário trocado ✅" : "Marcado ✅";
  switch (r.formato) {
    case "telefone":
      return `${titulo} ${r.empresa} vai te ligar ${r.quando}, neste número, para a entrevista da vaga de *${r.vaga}*. Deixe o celular por perto.${obs}\n\n${lembrete} ${desistir}`;
    case "video":
      return `${titulo} ${quando}, por vídeo, para a vaga de *${r.vaga}* (${r.empresa}). O link da chamada: ${r.local}${obs}\n\n${lembrete} ${desistir}`;
    case "publike":
      return `${titulo} ${quando}, por vídeo pelo Publike, para a vaga de *${r.vaga}* (${r.empresa}). Umas 2 horas antes, eu mando o botão para entrar na sala (ela abre 10 minutos antes).${obs}\n\n${lembrete} ${desistir}`;
    default:
      return `${titulo} ${quando}, na ${r.local}, para a vaga de *${r.vaga}* (${r.empresa}). Leve um documento com foto.${obs}\n\n${lembrete} ${desistir}`;
  }
}

/**
 * O toque num botão da agenda (o convite, a lista de horários, os lembretes, a confirmação): a resposta para a conversa.
 * Outro botão (ou texto): null, e o atendimento segue como sempre.
 */
export async function respostaDaAgenda(
  banco: ClienteBanco,
  chave: string,
  conversa: string,
  payload: string | null,
): Promise<SaidaDaAgenda | null> {
  if (!payload) return null;
  const doBotao = PAYLOAD_AGENDA.exec(payload);
  const daLista = doBotao ? null : PAYLOAD_HORARIO.exec(payload);
  if (!doBotao && !daLista) return null;
  const acao = doBotao ? doBotao[1] : "horario";
  const token = doBotao ? doBotao[2] : daLista![2];
  const { data, error } = await banco.rpc("servidor_agenda_resposta", {
    p_chave: chave,
    p_conversa: conversa,
    p_acao: acao,
    p_token: token,
    p_horario: daLista ? Number(daLista[1]) : null,
  });
  if (error || !data) {
    console.error(
      "Publike: a resposta da agenda de entrevistas falhou:",
      error?.message,
    );
    return {
      texto:
        "Não consegui ver a sua entrevista agora. Tente de novo daqui a pouco.",
    };
  }
  return mensagemDaAgenda(data as unknown as RespostaDaAgenda, token);
}

/** A mensagem de cada situação devolvida pelo banco (servidor_agenda_resposta). */
export function mensagemDaAgenda(
  r: RespostaDaAgenda,
  token: string,
): SaidaDaAgenda {
  switch (r.situacao) {
    case "escolher":
      return listaDosHorarios(
        r,
        token,
        r.trocando ? "Certo, vamos trocar." : "Que bom! 🙌",
      );
    case "ocupado":
      return r.horarios?.length
        ? listaDosHorarios(
            r,
            token,
            "Esse horário acabou de ser escolhido por outra pessoa 😕",
          )
        : {
            texto:
              "Esse horário acabou de ser escolhido por outra pessoa, e os outros também já foram 😕 Se abrir um novo, eu te aviso por aqui.",
          };
    case "sem_horario":
      return {
        texto: `Os horários de entrevista da vaga de *${r.vaga}* já foram todos 😕 Se abrir um novo, eu te aviso por aqui.`,
      };
    case "marcado":
      return { texto: textoDaMarcada(r), botoes: botoesDaMarcada(token) };
    case "ja_marcado":
      return {
        texto: `A sua entrevista para a vaga de *${r.vaga}* (${r.empresa}) já está marcada: ${r.quando}, ${r.como}.`,
        botoes: botoesDaMarcada(token),
      };
    case "sem_outro":
      return {
        texto: `Não tem outro horário livre agora 😕 Mantive o seu: ${r.quando}. Se não puder ir, toque em *Não vou mais*.`,
        botoes: [{ id: `g:cancelar:${token}`, titulo: "Não vou mais" }],
      };
    case "recusou":
      return { texto: "Tudo bem, obrigado por avisar! 🙂" };
    case "cancelado":
      return {
        texto:
          "Tudo bem, cancelei a sua entrevista e avisei a empresa. Obrigado por avisar com antecedência! 🙏",
      };
    case "confirmado":
      return {
        texto: `Combinado! Até amanhã: ${r.quando}, ${r.como}. 👍`,
        botoes: botoesDaMarcada(token),
      };
    case "confirmado_hoje":
      return { texto: "Ótimo! Boa entrevista! 🍀" };
    case "encerrada":
      return {
        texto: `A seleção da vaga de *${r.vaga}* já foi encerrada pela empresa. Obrigado pelo interesse! 🙂`,
      };
    case "sem_candidatura":
      return {
        texto: `Não achei a sua candidatura na vaga de *${r.vaga}*, então não consegui marcar. Se quiser, candidate-se de novo pelo Publike.`,
      };
    case "erro":
      console.error(
        "Publike: a entrevista da agenda não foi marcada:",
        r.mensagem,
      );
      return {
        texto:
          "Não consegui marcar agora 😕 Tente de novo daqui a pouco, ou escolha outro horário.",
      };
    default:
      return {
        texto:
          "Esse botão é de uma entrevista que já mudou. Se precisar de algo, é só me escrever aqui.",
      };
  }
}

type Envio = { ok: true; wamid: string | null; waId?: string | null } | { ok: false; erro: string };

/** O corpo de um modelo com as variáveis. */
function corpoDoModelo(nome: string, params: Record<string, string>) {
  const m = MODELOS.find((x) => x.nome === nome)!;
  return m.corpo.replace(/\{\{(\w+)\}\}/g, (_, k: string) => params[k] ?? "");
}

/** Os botões de resposta de um modelo, com os códigos (para a mensagem comum, na janela de 24 horas). */
function botoesDoModelo(nome: string, respostas: string[]) {
  const m = MODELOS.find((x) => x.nome === nome)!;
  return m.botoes
    .map((b, i) => (b.tipo === "resposta" ? { id: respostas[i] ?? "", titulo: b.texto.slice(0, 20) } : null))
    .filter((b): b is { id: string; titulo: string } => Boolean(b?.id));
}

/** O texto de um modelo com as variáveis, para guardar na conversa o que a pessoa recebeu. */
function textoDoModelo(nome: string, params: Record<string, string>) {
  const m = MODELOS.find((x) => x.nome === nome)!;
  const botoes = m.botoes.map((b) => b.texto).join(" · ");
  return `${corpoDoModelo(nome, params)}\n\n_${RODAPE_WHATSAPP}_\n\n[Botões: ${botoes}]`;
}

export type AgendasDaRodada = {
  convites: number;
  lembretes: number;
  falhas: number;
  /** os modelos ainda não aprovados na Meta (o envio espera) */
  esperando: string[];
  motivo?: string;
};

type ConviteDaVez = {
  convite_id: number;
  token: string;
  numero: string;
  nome: string;
  empresa: string;
  vaga: string;
  formato: string;
  na_janela: boolean;
};
type LembreteDaVez = {
  convite_id: number;
  tipo: "vespera" | "hoje";
  token: string;
  numero: string;
  nome: string;
  empresa: string;
  vaga: string;
  quando: string;
  formato: string;
  como: string;
  entrevista_id: string;
  local: string | null;
  na_janela: boolean;
};

/**
 * O /api/filas: os convites da vez (em ondas, das 8h às 20h, de segunda a sábado: o banco decide quem) e os lembretes
 * (na véspera, das 18h às 22h, e umas 2 horas antes). Só com os modelos aprovados na Meta.
 */
export async function cuidarDasAgendas(
  limite = 20,
  agora?: Date,
): Promise<AgendasDaRodada> {
  const r: AgendasDaRodada = {
    convites: 0,
    lembretes: 0,
    falhas: 0,
    esperando: [],
  };
  const cfg = configMeta();
  const acesso = acessoFila();
  if (!cfg || !acesso) return r;
  const { cliente: banco, chave } = acesso;
  const { data: conf, error: erroConf } = await banco.rpc(
    "servidor_whatsapp_config",
    { p_chave: chave },
  );
  if (erroConf) {
    r.motivo = `Agenda de entrevistas: ${erroConf.message}`.slice(0, 300);
    return r;
  }
  const modelos = ((conf ?? {}) as { modelos?: SituacaoModelos }).modelos ?? {};
  const aprovado = (nome: string) => {
    const ok = podeSair(modelos, nome);
    if (!ok) r.esperando.push(nome);
    return ok;
  };
  const anotar = (convite: number, tipo: string, envio: Envio, texto: string) =>
    banco.rpc("servidor_agenda_enviada", {
      p_chave: chave,
      p_convite: convite,
      p_tipo: tipo,
      p_wamid: envio.ok ? envio.wamid : null,
      p_falhou: envio.ok ? null : envio.erro.slice(0, 300),
      p_texto: envio.ok ? texto : null,
      p_numero: envio.ok ? (envio.waId ?? null) : null,
    });

  // 1. os convites da vez. Quem escreveu ao Publike nas últimas 23 horas recebe uma mensagem comum com os botões (sem
  // modelo, de graça); os outros, o modelo. Sem o modelo aprovado, só os da janela saem (o banco segura os outros)
  const conviteAprovado = aprovado(MODELO_CONVITE_ENTREVISTA);
  {
    const { data, error } = await banco.rpc("servidor_agenda_a_convidar", {
      p_chave: chave,
      p_limite: limite,
      p_so_janela: !conviteAprovado,
      ...(agora ? { p_agora: agora.toISOString() } : {}),
    });
    if (error) {
      if (error.code !== "PGRST202") r.motivo = `Agenda de entrevistas: ${error.message}`.slice(0, 300);
    } else {
      const modelo = MODELOS.find((m) => m.nome === MODELO_CONVITE_ENTREVISTA)!;
      for (const c of (data ?? []) as unknown as ConviteDaVez[]) {
        const params = { nome: c.nome, empresa: c.empresa, vaga: c.vaga, formato: c.formato };
        const respostas = [`g:sim:${c.token}`, `g:nao:${c.token}`];
        let envio: Envio;
        let texto: string;
        if (c.na_janela) {
          texto = corpoDoModelo(modelo.nome, params);
          envio = await enviarComBotoes(cfg, c.numero, texto, botoesDoModelo(modelo.nome, respostas));
          texto = `${texto}\n\n[Botões: ${modelo.botoes.map((b) => b.texto).join(" · ")}]`;
        } else {
          envio = await enviarModelo(cfg, c.numero, modelo, params, { respostas });
          texto = textoDoModelo(modelo.nome, params);
        }
        await anotar(c.convite_id, "convite", envio, texto);
        if (envio.ok) r.convites++;
        else r.falhas++;
      }
    }
  }

  // 2. os lembretes: na janela, mensagem comum; fora dela, os modelos (os três aprovados). O banco anota o lembrete ao
  // entregar a linha
  const lembretesAprovados = [MODELO_ENTREVISTA_VESPERA, MODELO_ENTREVISTA_HOJE, MODELO_ENTREVISTA_HOJE_VIDEO]
    .map(aprovado)
    .every(Boolean);
  {
    const { data, error } = await banco.rpc("servidor_agenda_lembretes", {
      p_chave: chave,
      p_limite: limite * 2,
      p_so_janela: !lembretesAprovados,
      ...(agora ? { p_agora: agora.toISOString() } : {}),
    });
    if (error) {
      if (error.code !== "PGRST202") r.motivo = `Agenda de entrevistas: ${error.message}`.slice(0, 300);
    } else {
      for (const l of (data ?? []) as unknown as LembreteDaVez[]) {
        const quando = `${l.quando}, ${l.como}`;
        let nome: string;
        let params: Record<string, string>;
        let extra: { link?: string; respostas: string[] };
        if (l.tipo === "vespera") {
          nome = MODELO_ENTREVISTA_VESPERA;
          params = { nome: l.nome, vaga: l.vaga, empresa: l.empresa, quando };
          extra = { respostas: [`g:conf:${l.token}`, `g:cancelar:${l.token}`, `g:remarcar:${l.token}`] };
        } else if (l.formato === "publike") {
          nome = MODELO_ENTREVISTA_HOJE_VIDEO;
          const hora = l.quando.split(" às ")[1] ?? l.quando;
          params = { nome: l.nome, vaga: l.vaga, empresa: l.empresa, hora };
          const destino = `/entrevista/${l.entrevista_id}`;
          const entrar = LOGIN_CELULAR ? await caminhoDeEntrar(l.numero, destino).catch(() => null) : null;
          extra = { link: (entrar ?? destino).replace(/^\//, ""), respostas: ["", `g:cancelar:${l.token}`] };
        } else {
          nome = MODELO_ENTREVISTA_HOJE;
          params = { nome: l.nome, vaga: l.vaga, empresa: l.empresa, quando };
          extra = { respostas: [`g:ok:${l.token}`, `g:cancelar:${l.token}`] };
        }
        const modelo = MODELOS.find((m) => m.nome === nome)!;
        let envio: Envio;
        let texto: string;
        if (l.na_janela) {
          // a mensagem comum: o mesmo texto; no vídeo, o link da sala no texto e os botões Tudo certo e Não vou mais
          texto = corpoDoModelo(nome, params);
          let botoes = botoesDoModelo(nome, extra.respostas);
          if (extra.link) {
            texto = `${texto}\n\nA sala: ${SITE_URL}/${extra.link}`;
            botoes = [
              { id: `g:ok:${l.token}`, titulo: "Tudo certo" },
              { id: `g:cancelar:${l.token}`, titulo: "Não vou mais" },
            ];
          }
          envio = await enviarComBotoes(cfg, l.numero, texto, botoes);
          texto = `${texto}\n\n[Botões: ${botoes.map((b) => b.titulo).join(" · ")}]`;
        } else {
          envio = await enviarModelo(cfg, l.numero, modelo, params, extra);
          texto = textoDoModelo(nome, params);
        }
        await anotar(l.convite_id, l.tipo, envio, texto);
        if (envio.ok) r.lembretes++;
        else r.falhas++;
      }
    }
  }
  return r;
}
