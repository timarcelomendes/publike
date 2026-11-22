import "server-only";
import { ocupacoesNoTexto } from "@/lib/cbo";
import {
  BOTAO_AGORA_NAO,
  BOTAO_MONTAR_CURRICULO,
  conversaDoCurriculo,
  OPCAO_DO_CURRICULO,
  type CurriculoMontado,
  passoDoCurriculo,
  pedeArquivo,
  previaDoCurriculo,
  querMontarCurriculo,
  querParar,
  relatoDoPasso1,
  TEXTOS_DO_CURRICULO,
  TITULO_CONFERIR_E_SALVAR,
} from "@/lib/curriculo-pelo-whatsapp";
import { limparCurriculoLido, type CurriculoLido } from "@/lib/ia/curriculo-do-arquivo";
import {
  montarCurriculoDaConversa,
  perguntasDaFuncaoComIA,
  proximaPergunta,
  type PerguntaGuardada,
} from "@/lib/ia/curriculo-pelo-whatsapp";
import { modeloPara } from "@/lib/ia/funcionalidades";
import { iaConfigurada } from "@/lib/ia/openai";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { criarClientePublico } from "@/lib/supabase/servidor";
import type { Json } from "@/lib/supabase/tipos-banco";
import { acessoFila } from "./filas";

// O currículo pelo WhatsApp dentro do atendimento (migrações 20270902120000 e 20270903120000; os textos e os passos
// em src/lib/curriculo-pelo-whatsapp.ts). Só responde com o recurso ligado em Admin › Qualificados ('teste': só os
// números de teste; 'todos'). Desligado, o atendimento segue como antes: nenhuma mensagem nova sai.

type Mensagem = { de: "pessoa" | "robo" | "equipe"; texto: string };
type Saida = (
  texto: string,
  extra?: { perfil?: string | null; botao?: { titulo: string; caminho: string } | null; botoes?: { id: string; titulo: string }[] },
) => Promise<void>;
/** Manda o cartão ou o PDF pelo link e guarda a legenda na conversa; false: a Meta recusou. */
export type EnviarArquivo = (a: { tipo: "image" | "document"; caminho: string; legenda: string; nome?: string }) => Promise<boolean>;

/** O recurso vale para este número? (sem a migração ou com falha, não) */
export async function curriculoPeloWhatsappLigado(banco: ClienteBanco, chave: string, numero: string) {
  const { data, error } = await banco.rpc("servidor_curriculo_whatsapp_ligado", { p_chave: chave, p_numero: numero });
  return !error && data === true;
}

/** "Mês de hoje" de Brasília (AAAA-MM). */
const mesDeHoje = (agora: Date) => new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 7);

/** O nome do arquivo do PDF ("curriculo-maria-silva.pdf"). */
export function nomeDoPdf(nome: string | null | undefined) {
  const simples = (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return simples ? `curriculo-${simples}.pdf` : "curriculo.pdf";
}

/** As perguntas guardadas das funções que aparecem no que a pessoa contou (a primeira que tiver). */
async function perguntasGuardadas(banco: ClienteBanco, chave: string, relato: string) {
  const cbos = ocupacoesNoTexto(relato, 5).map((o) => o.cbo);
  if (!cbos.length) return null;
  const { data, error } = await banco.rpc("servidor_perguntas_das_funcoes", { p_chave: chave, p_cbos: cbos });
  if (error || !data?.length) return null;
  // na ordem em que as funções aparecem no texto (a mais provável primeiro)
  const porCbo = new Map(data.map((l) => [l.cbo, l.perguntas as unknown as PerguntaGuardada[]]));
  for (const c of cbos) {
    const p = porCbo.get(c);
    if (Array.isArray(p) && p.length) return p;
  }
  return null;
}

/** As perguntas guardadas pelo que a pessoa contou, com a chave do servidor (o "Montar conversando" do site). */
export async function perguntasGuardadasDoTexto(texto: string) {
  const acesso = acessoFila();
  if (!acesso) return null;
  return perguntasGuardadas(acesso.cliente, acesso.chave, texto).catch(() => null);
}

/**
 * O passo da conversa do currículo. Devolve true quando respondeu; false quando a mensagem não é do currículo (ou o
 * recurso está desligado) e o atendimento segue normal.
 */
export async function seguirCurriculoPeloWhatsapp(p: {
  banco: ClienteBanco;
  chave: string;
  conversa: string;
  numero: string;
  /** o nome do perfil do WhatsApp (vai no cartão e no PDF) */
  nome: string | null;
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
  enviarArquivo: EnviarArquivo;
  /** o "Oi, Fulana! 👋 Aqui é o Marcelo, do Publike." da primeira mensagem */
  ola: string;
  agora: Date;
  linkEnviarCurriculo: { titulo: string; caminho: string };
}): Promise<boolean> {
  const passo = passoDoCurriculo(p.minhaUltima);
  const depois = passo === "previa" || passo === "arquivos";
  const arquivo = depois && p.textos.length === 1 && !p.midias[0] ? pedeArquivo(p.textos[0]) : null;
  // o "sim" escrito em resposta à pergunta depois das vagas vale como o botão
  const aceitou =
    !p.payload &&
    p.minhaUltima.includes(TEXTOS_DO_CURRICULO.pergunta.slice(0, 40)) &&
    p.textos.every((t) => /^(sim|quero|pode|pode ser|bora|vamos|claro|ok|okay|beleza|quero sim|sim quero)[!. ]*$/i.test(t.trim()));
  const comecar =
    aceitou ||
    p.payload === BOTAO_MONTAR_CURRICULO.id ||
    (!p.payload && !passo && p.textos.some((t) => querMontarCurriculo(t)));
  const naoAgora = p.payload === BOTAO_AGORA_NAO.id;
  if (!comecar && !passo && !naoAgora) return false;
  if (!(await curriculoPeloWhatsappLigado(p.banco, p.chave, p.numero))) return false;
  const perfil = "trabalho";
  if (naoAgora) {
    await p.saida(TEXTOS_DO_CURRICULO.parou, { perfil });
    return true;
  }
  if (comecar) {
    await p.saida(`${p.ola}${TEXTOS_DO_CURRICULO.passo1}`, { perfil });
    return true;
  }
  if (!passo) return false;

  // depois da prévia: o cartão ou o PDF do último currículo montado
  if (arquivo) {
    const { data: token } = await p.banco.rpc("servidor_ultimo_curriculo_preparado", { p_chave: p.chave, p_conversa: p.conversa });
    if (typeof token !== "string") {
      await p.saida(TEXTOS_DO_CURRICULO.semArquivo, { perfil });
      return true;
    }
    const ok =
      arquivo === "cartao"
        ? await p.enviarArquivo({ tipo: "image", caminho: `/api/curriculo/preparado/${token}/cartao`, legenda: TEXTOS_DO_CURRICULO.cartao })
        : await p.enviarArquivo({
            tipo: "document",
            caminho: `/api/curriculo/preparado/${token}/pdf`,
            legenda: TEXTOS_DO_CURRICULO.pdf,
            nome: nomeDoPdf(p.nome),
          });
    if (!ok) await p.saida(TEXTOS_DO_CURRICULO.arquivoFalhou, { perfil });
    return true;
  }

  const escrito = p.textos.filter((t, i) => !p.midias[i]).join("\n").trim();
  const noMeio = passo === "passo1" || passo === "passo2" || passo === "passo3" || passo.startsWith("pergunta");
  if (noMeio && p.textos.some(querParar)) {
    await p.saida(TEXTOS_DO_CURRICULO.parou, { perfil });
    return true;
  }
  // depois da prévia: "ok", "obrigado", a pergunta ("e agora?") e o que não é texto seguem o atendimento normal
  if (depois && (!escrito || p.textos.every(p.semConteudo) || escrito.endsWith("?"))) return false;
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

  // a próxima pergunta do passo 2 (uma por mensagem, com as opções em botões quando cabem): a IA lê a conversa até
  // aqui, então a pergunta 2 já sabe o que ela respondeu na 1
  const perguntar = async (n: 1 | 2 | 3) => {
    const conversa = conversaDoCurriculo(p.historico);
    const daPessoa = conversa
      .split("\n\n")
      .filter((l) => l.startsWith("Pessoa:"))
      .join(" ");
    const guardadas = await perguntasGuardadas(p.banco, p.chave, daPessoa || relatoDoPasso1(p.textos)).catch(() => null);
    const q = await proximaPergunta(n, conversa || relatoDoPasso1(p.textos), await p.modelo(), guardadas);
    await p.saida(TEXTOS_DO_CURRICULO.perguntaDoPasso2(n, q.texto, q.opcoes.length > 0), {
      perfil,
      ...(q.opcoes.length ? { botoes: q.opcoes.map((o, i) => ({ id: `${OPCAO_DO_CURRICULO}${i + 1}`, titulo: o })) } : {}),
    });
  };

  if (passo === "passo1") {
    if (p.textos.every(p.semConteudo)) {
      await p.saida(TEXTOS_DO_CURRICULO.passo1DeNovo, { perfil });
      return true;
    }
    await perguntar(1);
    return true;
  }
  if (passo === "pergunta1" || passo === "pergunta2") {
    await perguntar(passo === "pergunta1" ? 2 : 3);
    return true;
  }
  if (passo === "passo2" || passo === "pergunta3") {
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
  let montado: CurriculoMontado | null;
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
    p_nome: p.nome ?? "",
    p_telefone: p.numero,
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

/** O cartão e o PDF: o currículo montado, o nome do WhatsApp e (só no PDF) o número. Null: o link venceu. */
export async function curriculoParaArquivo(token: string, hoje: string, comTelefone: boolean) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  try {
    const { data, error } = await criarClientePublico().rpc("curriculo_preparado_para_arquivo", {
      p_token: token,
      p_com_telefone: comTelefone,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
    const r = data as { dados?: Record<string, unknown>; nome?: string | null; telefone?: string | null };
    if (!r.dados) return null;
    const lido = limparCurriculoLido(
      { ...r.dados, outros_estudos: r.dados.estudos } as Parameters<typeof limparCurriculoLido>[0],
      hoje,
    );
    const resumo = typeof r.dados.resumo === "string" ? r.dados.resumo.slice(0, 200) : "";
    return {
      curriculo: { ...lido, resumo } as CurriculoMontado,
      nome: (r.nome ?? "").replace(/[^\p{L}\p{M} '.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 60),
      telefone: r.telefone ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * O robô das filas: as perguntas de recrutador das funções com 3 ou mais vagas em 120 dias (as que faltam ou têm mais
 * de 60 dias), tiradas das vagas do Publike. Só com o currículo pelo WhatsApp ligado (o banco não devolve nada
 * desligado).
 */
export async function perguntasDasFuncoes(limite = 2): Promise<{ geradas: number }> {
  const acesso = acessoFila();
  if (!acesso || !iaConfigurada()) return { geradas: 0 };
  const { cliente, chave } = acesso;
  const { data, error } = await cliente.rpc("servidor_funcoes_para_perguntas", { p_chave: chave, p_limite: limite });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler as funções para as perguntas:", error.message);
    return { geradas: 0 };
  }
  const funcoes = (data ?? []) as unknown as { cbo: string; vagas: number; exemplos: { titulo: string; descricao: string }[] | null }[];
  if (!funcoes.length) return { geradas: 0 };
  const { data: cfg } = await criarClientePublico().rpc("config_publica");
  const modelo = modeloPara(cfg?.[0], "ler");
  let geradas = 0;
  for (const f of funcoes) {
    try {
      const perguntas = await perguntasDaFuncaoComIA(f.cbo, f.exemplos ?? [], modelo);
      if (!perguntas) continue;
      const { error: e } = await cliente.rpc("servidor_guardar_perguntas_da_funcao", {
        p_chave: chave,
        p_cbo: f.cbo,
        p_perguntas: perguntas as unknown as Json,
        p_vagas: Number(f.vagas) || 0,
        p_modelo: modelo,
      });
      if (e) console.error("Publike: falha ao guardar as perguntas da função:", e.message);
      else geradas++;
    } catch (e) {
      console.error("Publike: a IA não fez as perguntas da função:", e instanceof Error ? e.message : e);
    }
  }
  return { geradas };
}
