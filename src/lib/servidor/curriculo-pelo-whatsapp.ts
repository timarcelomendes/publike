import "server-only";
import {
  BOTAO_MONTAR_CURRICULO,
  conversaDoCurriculo,
  passoDoCurriculo,
  previaDoCurriculo,
  querMontarCurriculo,
  querParar,
  relatoDoPasso1,
  TEXTOS_DO_CURRICULO,
  TITULO_CONFERIR_E_SALVAR,
} from "@/lib/curriculo-pelo-whatsapp";
import { limparCurriculoLido, type CurriculoLido } from "@/lib/ia/curriculo-do-arquivo";
import { montarCurriculoDaConversa, perguntasDoRecrutador } from "@/lib/ia/curriculo-pelo-whatsapp";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { criarClientePublico } from "@/lib/supabase/servidor";
import type { Json } from "@/lib/supabase/tipos-banco";

// O currículo pelo WhatsApp dentro do atendimento (migração 20270902120000; os textos e os passos em
// src/lib/curriculo-pelo-whatsapp.ts). Só responde com o recurso ligado em Admin › Qualificados ('teste': só os
// números de teste; 'todos'). Desligado, o atendimento segue como antes: nenhuma mensagem nova sai.

type Mensagem = { de: "pessoa" | "robo" | "equipe"; texto: string };
type Saida = (
  texto: string,
  extra?: { perfil?: string | null; botao?: { titulo: string; caminho: string } | null; botoes?: { id: string; titulo: string }[] },
) => Promise<void>;

/** O recurso vale para este número? (sem a migração ou com falha, não) */
export async function curriculoPeloWhatsappLigado(banco: ClienteBanco, chave: string, numero: string) {
  const { data, error } = await banco.rpc("servidor_curriculo_whatsapp_ligado", { p_chave: chave, p_numero: numero });
  return !error && data === true;
}

/** "Mês de hoje" de Brasília (AAAA-MM). */
const mesDeHoje = (agora: Date) => new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 7);

/**
 * O passo da conversa do currículo. Devolve true quando respondeu; false quando a mensagem não é do currículo (ou o
 * recurso está desligado) e o atendimento segue normal.
 */
export async function seguirCurriculoPeloWhatsapp(p: {
  banco: ClienteBanco;
  chave: string;
  conversa: string;
  numero: string;
  historico: Mensagem[];
  minhaUltima: string;
  payload: string | null;
  /** as mensagens novas da pessoa (o áudio já em texto, "🎤 …") */
  textos: string[];
  midias: (string | null)[];
  /** "ok", "👍", "obrigado", figurinha: não é resposta */
  semConteudo: (t: string) => boolean;
  modelo: () => Promise<string | null>;
  saida: Saida;
  /** o "Oi, Fulana! 👋 Aqui é o Marcelo, do Publike." da primeira mensagem */
  ola: string;
  agora: Date;
  linkEnviarCurriculo: { titulo: string; caminho: string };
}): Promise<boolean> {
  const passo = passoDoCurriculo(p.minhaUltima);
  const comecar =
    p.payload === BOTAO_MONTAR_CURRICULO.id || (!p.payload && !passo && p.textos.some((t) => querMontarCurriculo(t)));
  if (!comecar && !passo) return false;
  if (!(await curriculoPeloWhatsappLigado(p.banco, p.chave, p.numero))) return false;
  const perfil = "trabalho";
  if (comecar) {
    await p.saida(`${p.ola}${TEXTOS_DO_CURRICULO.passo1}`, { perfil });
    return true;
  }
  if (!passo) return false;

  const escrito = p.textos.filter((t, i) => !p.midias[i]).join("\n").trim();
  const noMeio = passo === "passo1" || passo === "passo2" || passo === "passo3";
  if (noMeio && p.textos.some(querParar)) {
    await p.saida(TEXTOS_DO_CURRICULO.parou, { perfil });
    return true;
  }
  // depois da prévia: "ok", "obrigado", a pergunta ("e agora?") e o que não é texto seguem o atendimento normal
  if (passo === "previa" && (!escrito || p.textos.every(p.semConteudo) || escrito.endsWith("?"))) return false;
  if (!escrito) {
    if (p.midias.includes("audio")) {
      await p.saida(TEXTOS_DO_CURRICULO.semAudio(passo), { perfil });
      return true;
    }
    if (p.midias.some((m) => m === "foto" || m === "arquivo")) {
      await p.saida(TEXTOS_DO_CURRICULO.arquivo, { perfil, botao: p.linkEnviarCurriculo });
      return true;
    }
    return false;
  }

  if (passo === "passo1") {
    if (p.textos.every(p.semConteudo)) {
      await p.saida(TEXTOS_DO_CURRICULO.passo1DeNovo, { perfil });
      return true;
    }
    const perguntas = await perguntasDoRecrutador(relatoDoPasso1(p.textos), await p.modelo());
    await p.saida(TEXTOS_DO_CURRICULO.passo2(perguntas), { perfil });
    return true;
  }
  if (passo === "passo2") {
    await p.saida(TEXTOS_DO_CURRICULO.passo3, { perfil });
    return true;
  }

  // o passo 3, a correção depois da prévia ou a tentativa de novo: o currículo, da conversa toda
  const modelo = await p.modelo();
  const conversa = conversaDoCurriculo(p.historico);
  if (!modelo || !conversa) {
    await p.saida(TEXTOS_DO_CURRICULO.falha, { perfil });
    return true;
  }
  const hoje = mesDeHoje(p.agora);
  let montado;
  try {
    montado = await montarCurriculoDaConversa(conversa, modelo, hoje);
  } catch (e) {
    console.error("Publike: a IA não montou o currículo do WhatsApp:", e instanceof Error ? e.message : e);
    await p.saida(TEXTOS_DO_CURRICULO.falha, { perfil });
    return true;
  }
  if (!montado) {
    await p.saida(TEXTOS_DO_CURRICULO.semNada, { perfil });
    return true;
  }
  const { data: token, error } = await p.banco.rpc("servidor_guardar_curriculo_preparado", {
    p_chave: p.chave,
    p_conversa: p.conversa,
    p_dados: montado as unknown as Json,
  });
  if (error || typeof token !== "string") {
    console.error("Publike: o currículo do WhatsApp não foi guardado:", error?.message);
    await p.saida(TEXTOS_DO_CURRICULO.falha, { perfil });
    return true;
  }
  await p.saida(TEXTOS_DO_CURRICULO.previa(previaDoCurriculo(montado, hoje)), {
    perfil,
    botao: { titulo: TITULO_CONFERIR_E_SALVAR, caminho: `/perfil/curriculo?preparado=${token}` },
  });
  return true;
}

/** O link "Conferir e salvar": o currículo montado (os campos do formulário, limpos de novo), por 7 dias. */
export async function curriculoPreparado(token: string, hoje: string): Promise<CurriculoLido | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  try {
    const { data, error } = await criarClientePublico().rpc("curriculo_preparado", { p_token: token });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
    const r = data as Record<string, unknown>;
    return limparCurriculoLido({ ...r, outros_estudos: r.estudos } as Parameters<typeof limparCurriculoLido>[0], hoje);
  } catch {
    return null;
  }
}
