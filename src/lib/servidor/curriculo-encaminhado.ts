import "server-only";
import { SITE_URL } from "@/lib/config";
import { mensagemDoConvite } from "@/lib/convite-candidato";
import {
  camposLidos,
  lerCurriculoDoArquivoComMotivo,
} from "@/lib/ia/curriculo-do-arquivo";
import { comOrigem } from "@/lib/origem";
import type { ClienteBanco } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/tipos-banco";
import { urlDosEmails } from "./ambiente";

// Encaminhar o currículo pelo WhatsApp (migração 20271018120000; claude/plano-concentrar-contratacoes.md, parte 1).
// Quem contrata encaminha para o WhatsApp do Publike o currículo que chegou no WhatsApp dela. O Publike reconhece a conta
// pelo número, lê o currículo (sem guardar o arquivo nem o contato), pergunta para qual vaga e cria o convite do
// Candidato de fora. A resposta traz a mensagem pronta para a empresa encaminhar à pessoa: o Publike não escreve para
// ela, o contato é da empresa. Quando a pessoa confirma pelo link, entra nos candidatos da vaga.

/** O toque na lista das vagas: "a:fora:<id da vaga>". */
export const PAYLOAD_DA_VAGA_DE_FORA = "a:fora:";
/** A marca da pergunta "Para qual vaga?" (a resposta escrita depois dela ganha a dica de tocar na lista). */
export const MARCA_DA_VAGA_DE_FORA = "Para qual vaga é esse candidato?";

export type RespostaDoEncaminhado = {
  texto: string;
  /** a mensagem pronta para a empresa encaminhar à pessoa (sai separada, para encaminhar com um toque) */
  paraEncaminhar?: string;
  lista?: {
    botao: string;
    secao?: string;
    linhas: { id: string; titulo: string; descricao?: string }[];
  };
  botao?: { titulo: string; caminho: string };
};

type VagaDaConta = { id: string; titulo: string; cliente: string | null };
type DaConta = {
  conta: string;
  nome: string;
  tipo: string;
  total: number;
  vagas: VagaDaConta[];
};

/** A conta que contrata deste número e as vagas no ar; null: o número não é de quem contrata (ou sem a migração). */
export async function vagasDaConta(
  banco: ClienteBanco,
  chave: string,
  conversa: string,
): Promise<DaConta | null> {
  const { data, error } = await banco.rpc("servidor_whatsapp_vagas_da_conta", {
    p_chave: chave,
    p_conversa: conversa,
  });
  if (error) {
    if (error.code !== "PGRST202")
      console.error(
        "Publike: não deu para ler as vagas da conta:",
        error.message,
      );
    return null;
  }
  const r = (data ?? {}) as Partial<DaConta> & { conta?: string | null };
  if (!r.conta) return null;
  return {
    conta: r.conta,
    nome: r.nome ?? "",
    tipo: r.tipo ?? "empresa",
    total: Number(r.total) || 0,
    vagas: Array.isArray(r.vagas) ? r.vagas : [],
  };
}

/** "Maria S." (o nome e a inicial do sobrenome, como na lista dos candidatos). */
const nomeCurto = (nome: string) => {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1
    ? `${partes[0]} ${partes.at(-1)?.[0]?.toUpperCase()}.`
    : (partes[0] ?? "");
};

/** "auxiliar de cozinha, 3 experiências" (o que a leitura achou, para a empresa saber que leu o certo). */
function resumoDoLido(lido: { titulo: string; experiencias: unknown[] }) {
  const n = lido.experiencias.length;
  const partes = [
    lido.titulo.toLowerCase(),
    n ? `${n} ${n === 1 ? "experiência" : "experiências"}` : "",
  ].filter(Boolean);
  return partes.join(", ");
}

const tituloDaLinha = (v: VagaDaConta) =>
  v.titulo.replace(/\s*\(banco de reserva\)$/, "");

/**
 * O currículo que a leitura das fotos e PDFs achou, vindo de quem contrata. null: o número não é de uma conta que
 * contrata (o currículo é da própria pessoa e segue como antes).
 */
export async function encaminharCurriculo(p: {
  banco: ClienteBanco;
  chave: string;
  conversa: string;
  imagens: string[];
  pdf: string | null;
  /** os PDFs que vieram nesta vez (só o primeiro é lido) */
  pdfs: number;
  modelo: () => Promise<string | null>;
  agora: Date;
}): Promise<RespostaDoEncaminhado | null> {
  const daConta = await vagasDaConta(p.banco, p.chave, p.conversa);
  if (!daConta) return null;
  if (!daConta.vagas.length)
    return {
      texto:
        "Recebi um currículo! 📄 Para eu pôr essa pessoa nos candidatos de uma vaga sua, a vaga precisa estar no ar. Quer publicar? Mande aqui a foto ou o texto do anúncio que eu preparo para você.",
    };
  const modelo = await p.modelo();
  if (!modelo || (!p.imagens.length && !p.pdf))
    return {
      texto:
        "Recebi o currículo, mas não consegui ler agora. Pode mandar de novo daqui a pouco?",
    };
  const hoje = new Date(p.agora.getTime() - 3 * 3600_000)
    .toISOString()
    .slice(0, 7);
  let lido;
  let nome = "";
  try {
    ({ lido, nome } = await lerCurriculoDoArquivoComMotivo(
      {
        pdf: p.pdf ? { nome: "curriculo.pdf", dados: p.pdf } : null,
        fotos: p.imagens,
      },
      modelo,
      hoje,
      { comNome: true },
    ));
  } catch (e) {
    console.error(
      "Publike: o currículo encaminhado não foi lido:",
      e instanceof Error ? e.message : e,
    );
    return {
      texto:
        "Não consegui ler o currículo agora. Pode mandar de novo daqui a pouco?",
    };
  }
  if (!lido || !camposLidos(lido))
    return {
      texto: p.pdf
        ? "Não consegui ler esse currículo. Se tiver, mande a foto da folha inteira, de perto e com boa luz."
        : "Não consegui ler esse currículo. Tire a foto de perto, com a folha inteira e boa luz, ou mande o PDF.",
    };
  if (!nome)
    return {
      texto:
        "Li o currículo, mas não achei o nome da pessoa. Pelo painel dá para chamar com o nome: abra a vaga e toque em *Chamar candidato de fora*.",
      botao: { titulo: "Abrir o painel", caminho: "/painel/anuncios" },
    };
  const { data: id, error } = await p.banco.rpc(
    "servidor_whatsapp_guardar_encaminhado",
    {
      p_chave: p.chave,
      p_conversa: p.conversa,
      p_conta: daConta.conta,
      p_nome: nome,
      p_curriculo: lido as unknown as Json,
    },
  );
  if (error || typeof id !== "string") {
    console.error(
      "Publike: o currículo encaminhado não foi guardado:",
      error?.message,
    );
    return {
      texto:
        "Não consegui guardar o currículo agora. Pode mandar de novo daqui a pouco?",
    };
  }
  const outros =
    p.pdfs > 1
      ? `\n\nLi só o primeiro arquivo. Mande os outros currículos um de cada vez. 🙂`
      : "";
  const leu = `Recebi o currículo de *${nomeCurto(nome)}* (${resumoDoLido(lido)}).`;
  // uma vaga só: o convite já sai
  if (daConta.vagas.length === 1 && daConta.total === 1) {
    const criado = await criarConvite(
      p.banco,
      p.chave,
      p.conversa,
      daConta.vagas[0].id,
      id,
    );
    return { ...criado, texto: `${leu}\n\n${criado.texto}${outros}` };
  }
  const mais =
    daConta.total > daConta.vagas.length
      ? ` Aqui estão as ${daConta.vagas.length} mais recentes.`
      : "";
  return {
    texto: `${leu} ${MARCA_DA_VAGA_DE_FORA} Toque em *Escolher a vaga*.${mais}${outros}`,
    lista: {
      botao: "Escolher a vaga",
      secao: "Suas vagas no ar",
      linhas: daConta.vagas.map((v) => ({
        id: `${PAYLOAD_DA_VAGA_DE_FORA}${v.id}`,
        titulo: tituloDaLinha(v).slice(0, 24),
        ...(v.cliente ? { descricao: v.cliente.slice(0, 72) } : {}),
      })),
    },
  };
}

/** O toque na vaga da lista. null: não é esse toque. */
export async function respostaDoEncaminhado(
  banco: ClienteBanco,
  chave: string,
  conversa: string,
  payload: string | null | undefined,
): Promise<RespostaDoEncaminhado | null> {
  if (!payload?.startsWith(PAYLOAD_DA_VAGA_DE_FORA)) return null;
  const anuncio = payload.slice(PAYLOAD_DA_VAGA_DE_FORA.length);
  if (!/^[0-9a-f-]{36}$/i.test(anuncio)) return null;
  return criarConvite(banco, chave, conversa, anuncio, null);
}

async function criarConvite(
  banco: ClienteBanco,
  chave: string,
  conversa: string,
  anuncio: string,
  encaminhado: string | null,
): Promise<RespostaDoEncaminhado> {
  const { data, error } = await banco.rpc("servidor_whatsapp_convite_de_fora", {
    p_chave: chave,
    p_conversa: conversa,
    p_anuncio: anuncio,
    p_encaminhado: encaminhado,
  });
  if (error) {
    console.error(
      "Publike: o convite do currículo encaminhado não saiu:",
      error.message,
    );
    return {
      texto: "Não consegui criar o convite agora. Tente de novo daqui a pouco.",
    };
  }
  const r = (data ?? {}) as {
    ok?: boolean;
    erro?: string;
    token?: string;
    nome?: string;
    titulo?: string;
    anuncio_id?: string;
    quem?: string;
    com_curriculo?: boolean;
  };
  if (!r.ok || !r.token) {
    const titulo = r.titulo ? `*${r.titulo}*` : "essa vaga";
    const texto =
      r.erro === "sem_curriculo"
        ? "Esse currículo já foi usado ou passou da hora (guardo por 6 horas). Mande o currículo de novo, por favor."
        : r.erro === "fora_do_ar"
          ? `A vaga ${titulo} não está mais no ar. Mande o currículo de novo e escolha outra.`
          : r.erro === "limite_vaga"
            ? `A vaga ${titulo} já tem 50 convites esperando resposta. Cancele os que não vão mais no painel.`
            : r.erro === "limite_dia"
              ? "Você chamou muita gente hoje. Tente de novo amanhã."
              : "Não consegui criar o convite. Mande o currículo de novo, por favor.";
    return { texto };
  }
  const site = urlDosEmails() ?? SITE_URL;
  const url = comOrigem(
    `${site}/candidatura/${r.token}`,
    "convite",
    "candidato",
  );
  const nome = r.nome ?? "";
  return {
    texto: `Pronto! ✅ O convite de *${nomeCurto(nome)}* para *${r.titulo}* está criado. Encaminhe à pessoa a mensagem que vem a seguir: quando ela confirmar pelo link, aparece nos candidatos da vaga, com o currículo já preenchido. O link vale 14 dias.`,
    paraEncaminhar: mensagemDoConvite({
      nome,
      quem: r.quem ?? "empresa",
      vaga: r.titulo ?? "",
      url,
      comCurriculo: Boolean(r.com_curriculo),
    }),
    botao: {
      titulo: "Ver os convites",
      caminho: `/painel/anuncio/${r.anuncio_id}/convidar`,
    },
  };
}
