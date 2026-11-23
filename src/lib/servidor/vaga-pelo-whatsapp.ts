import "server-only";
import { LOGIN_CELULAR } from "@/lib/config";
import { SITE_URL } from "@/lib/config";
import { modeloPara } from "@/lib/ia/funcionalidades";
import { lerVagas } from "@/lib/ia/ler-vagas";
import { iaConfigurada } from "@/lib/ia/openai";
import { pareceVaga, type LeituraDeVagas } from "@/lib/leitura-de-vagas";
import { comOrigem } from "@/lib/origem";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { criarClientePublico } from "@/lib/supabase/servidor";
import type { Json } from "@/lib/supabase/tipos-banco";
import type { RascunhoConvite } from "@/lib/convites";
import { lugarDaResposta } from "@/lib/lugar-da-resposta";
import {
  caminhoDaVagaDoWhatsapp,
  lugarDoLote,
  perguntaDoLugar,
  respostaDasVagas,
  semLugar,
  textoDasVagas,
  type ChaveTextoVagas,
} from "@/lib/vagas-pelo-whatsapp";
import { urlDosEmails } from "./ambiente";
import { acessoFila } from "./filas";
import { botoesDaVagaPreparada, botoesDoLotePreparado, botoesDoLugar, podePublicarAqui } from "./publicar-no-whatsapp";
import {
  baixarFotoOuPdf,
  codigoPeloModeloPode,
  configMeta,
  enviarComBotoes,
  enviarComLink,
  marcarLidaDigitando,
  type ConfigMeta,
  type SituacaoModelos,
} from "./whatsapp";

// Publicar pelo WhatsApp (19/11/2026; migração 20270806120000; claude/plano-vagas-novas.md, item 3). A empresa manda
// para o número do Publike a foto do anúncio (ou várias), o PDF ou o texto da vaga; a IA lê (src/lib/ia/ler-vagas.ts)
// e a resposta traz o resumo de cada vaga com o botão que abre o publicar já preenchido. Publicada a vaga, o WhatsApp
// avisa que está no ar e oferece mandar os candidatos por lá. Tudo liga, desliga e muda de texto em Admin › Publicar
// pelo WhatsApp. Como é a empresa que escreve primeiro, as respostas vão na janela de 24 horas, sem modelo da Meta.

export type ConfigVagasWhatsapp = {
  ligado: boolean;
  fotos: boolean;
  pdf: boolean;
  texto: boolean;
  por_mensagem: number;
  leituras_dia: number;
  confirmar: boolean;
  oferecer_avisos: boolean;
  /** a vaga preparada (uma só) vem com "Sim, publicar" e sai daqui mesmo (migração 20270914120000) */
  publicar_aqui: boolean;
  textos: Partial<Record<ChaveTextoVagas, string>>;
};

type Botao = { titulo: string; caminho: string };
/** A saída do atendimento: manda e guarda a resposta na conversa (src/lib/servidor/atendimento-whatsapp.ts). */
export type Saida = (
  texto: string,
  extra?: {
    perfil?: string | null;
    equipe?: boolean;
    motivo?: string;
    menu?: boolean;
    botao?: Botao | null;
    botoes?: { id: string; titulo: string }[];
  },
) => Promise<void>;

/** O que a IA tem para ler, no máximo: 4 fotos e 2 PDFs de cada vez, até 8 MB cada. */
const MAX_FOTOS = 4;
const MAX_PDFS = 2;
/** A IA tem até 38 segundos: a resposta sai dentro do mesmo pedido do webhook (60 segundos, com a espera de 5). */
const TEMPO_DA_IA = 38_000;

/** A configuração do recurso (sem a migração ou com erro: desligado). */
export async function configVagasWhatsapp(banco: ClienteBanco, chave: string): Promise<ConfigVagasWhatsapp | null> {
  const { data, error } = await banco.rpc("servidor_whatsapp_vagas_config", { p_chave: chave });
  if (error || !data) return null;
  const c = data as unknown as Partial<ConfigVagasWhatsapp>;
  if (!c.ligado) return null;
  return {
    ligado: true,
    fotos: c.fotos !== false,
    pdf: c.pdf !== false,
    texto: c.texto !== false,
    por_mensagem: Math.max(1, Math.min(10, Number(c.por_mensagem) || 10)),
    leituras_dia: Math.max(1, Math.min(50, Number(c.leituras_dia) || 10)),
    confirmar: c.confirmar !== false,
    oferecer_avisos: c.oferecer_avisos !== false,
    // sem a migração 20270914120000, o campo não vem: o link de antes
    publicar_aqui: c.publicar_aqui === true,
    textos: c.textos && typeof c.textos === "object" ? (c.textos as ConfigVagasWhatsapp["textos"]) : {},
  };
}

/** O modelo da leitura (Admin › IA › "Ler currículo e vaga"). */
async function modeloDaLeitura() {
  const { data } = await criarClientePublico().rpc("config_publica");
  return modeloPara(data?.[0], "ler");
}

/**
 * A foto em JPEG de até 1.600 pixels (a IA lê igual e o pedido fica leve). Sem a biblioteca de imagem no servidor, vai
 * como veio, se couber.
 */
async function fotoParaLer(bytes: Buffer, mime: string) {
  try {
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp(bytes, { failOn: "none" })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    if (!/^image\/(jpeg|png|webp)$/.test(mime) || bytes.length > 4 * 1024 * 1024) return null;
    return `data:${mime};base64,${bytes.toString("base64")}`;
  }
}

type Midia = { wamid: string; tipo: "imagem" | "pdf"; midia: string; mime: string | null; legenda: string | null };

/** Quando o atendimento deve tentar ler uma vaga: tem foto ou PDF nesta vez, ou o texto parece anúncio de vaga. */
export function deveTentarVaga(textos: string[], perfil: string | null) {
  if (perfil === "trabalho") return false;
  if (textos.some((t) => /^\[a pessoa mandou (uma foto|um arquivo)\]$/.test(t))) return true;
  const escrito = textos.filter((t) => !t.startsWith("[a pessoa mandou")).join("\n");
  return pareceVaga(escrito);
}

/**
 * Lê a vaga do que a pessoa mandou nesta vez e responde. `true`: respondeu (o atendimento para aqui); `false`: não é
 * caso de vaga (o recurso desligado, quem procura trabalho, nada para ler) e o atendimento segue como antes.
 */
export async function tentarVagaPeloWhatsapp(p: {
  cfg: ConfigMeta;
  banco: ClienteBanco;
  chave: string;
  conversa: string;
  numero: string;
  wamid: string;
  perfil: "trabalho" | "contratar" | null;
  /** as mensagens da pessoa desde a última resposta */
  textos: string[];
  saida: Saida;
  /** a apresentação, na primeira mensagem para a pessoa ("Oi, Rita! 👋 Aqui é o Marcelo, do Publike.\n\n") */
  comeco?: string;
  /** o texto da vaga montada nas 3 perguntas ("Montar a vaga comigo"): lê mesmo curto, sem a conferência de "parece vaga" */
  montada?: boolean;
  /** o que a pessoa já disse e a leitura não guarda ("o salário", quando é a combinar): sai do "Faltou dizer" */
  jaDisse?: string[];
}): Promise<boolean> {
  if (!p.montada && !deveTentarVaga(p.textos, p.perfil)) return false;
  const config = await configVagasWhatsapp(p.banco, p.chave);
  if (!config) return false;
  const t = (k: ChaveTextoVagas, marcas?: Record<string, string | number>) => textoDasVagas(config.textos, k, marcas);
  // as respostas prontas levam a apresentação na primeira mensagem (a das vagas conta com ela no tamanho)
  const ola = p.comeco ?? "";
  const saida: Saida = (texto, extra) => p.saida(`${ola}${texto}`, extra);

  const { data: daVez, error: erroDaVez } = await p.banco.rpc("servidor_whatsapp_midias_da_vez", {
    p_chave: p.chave,
    p_conversa: p.conversa,
  });
  if (erroDaVez) return false;
  const vez = (daVez ?? {}) as unknown as { midias?: Midia[]; leituras_hoje?: number };
  const midias = (vez.midias ?? []).filter((m) => (m.tipo === "imagem" ? config.fotos : config.pdf));
  const fotos = midias.filter((m) => m.tipo === "imagem").slice(0, MAX_FOTOS);
  const pdfs = midias.filter((m) => m.tipo === "pdf").slice(0, MAX_PDFS);
  const legendas = midias.map((m) => m.legenda).filter((l): l is string => Boolean(l?.trim()));
  const escrito = [...p.textos.filter((x) => !x.startsWith("[a pessoa mandou")), ...legendas].join("\n").trim();
  const comTexto =
    config.texto && (p.montada ? escrito.length > 0 : escrito.length >= 20 && (fotos.length + pdfs.length > 0 || pareceVaga(escrito)));
  if (!fotos.length && !pdfs.length && !comTexto) return false;
  const fonte = pdfs.length ? "pdf" : fotos.length ? "foto" : "texto";
  const lidas = [...fotos, ...pdfs].map((m) => m.wamid);

  const registrar = (resultado: string, extra: { empresa?: string; motivo?: string; ms?: number; vagas?: unknown[] } = {}) =>
    p.banco.rpc("servidor_whatsapp_leitura", {
      p_chave: p.chave,
      p_conversa: p.conversa,
      p_numero: p.numero,
      p_fonte: fonte,
      p_resultado: resultado,
      p_empresa: extra.empresa ?? null,
      p_motivo: extra.motivo ?? null,
      p_ms: extra.ms ?? null,
      p_vagas: (extra.vagas ?? []) as unknown as Json,
      p_midias: lidas,
    });

  // o limite de leituras por número por dia (Admin): o site continua aberto
  if ((vez.leituras_hoje ?? 0) >= config.leituras_dia) {
    await registrar("limite", { motivo: `${vez.leituras_hoje} leituras nas últimas 24 horas` });
    await saida(
      `Por hoje eu já li ${vez.leituras_hoje} anúncios deste número. Para publicar mais agora, é só usar o site: dá para mandar a foto ou colar o texto lá também.`,
      { perfil: "contratar", botao: { titulo: "Publicar vaga grátis", caminho: "/publicar" } },
    );
    return true;
  }
  if (!iaConfigurada()) return false;

  // baixa as fotos e os PDFs (o "digitando…" fica na tela enquanto lê)
  await marcarLidaDigitando(p.cfg, p.wamid).catch(() => undefined);
  const imagens: string[] = [];
  const arquivos: string[] = [];
  let grande = false;
  for (const m of [...fotos, ...pdfs]) {
    const r = await baixarFotoOuPdf(p.cfg, m.midia);
    if (!r.ok) {
      if ("grande" in r && r.grande) grande = true;
      console.error("Publike: a foto do WhatsApp não baixou:", r.erro);
      continue;
    }
    if (m.tipo === "pdf" || r.mime === "application/pdf") {
      if (r.bytes.length <= 6 * 1024 * 1024) arquivos.push(`data:application/pdf;base64,${r.bytes.toString("base64")}`);
      else grande = true;
      continue;
    }
    const foto = await fotoParaLer(r.bytes, r.mime || m.mime || "");
    if (foto) imagens.push(foto);
    else grande = true;
  }
  if (!imagens.length && !arquivos.length && !comTexto) {
    await registrar(grande ? "grande" : "falhou", { motivo: grande ? "arquivo grande demais" : "não baixou" });
    await saida(
      grande
        ? "A foto (ou o arquivo) ficou grande demais para eu ler. Pode mandar um print da vaga ou escrever o cargo, o salário, o horário e o bairro?"
        : "Não consegui abrir o que você mandou. Pode mandar de novo?",
      { perfil: "contratar" },
    );
    return true;
  }

  let lida: LeituraDeVagas;
  const inicio = Date.now();
  try {
    await marcarLidaDigitando(p.cfg, p.wamid).catch(() => undefined);
    lida = await lerVagas({ imagens, pdfs: arquivos, texto: escrito || null }, await modeloDaLeitura(), {
      tempoLimite: TEMPO_DA_IA,
    });
  } catch (e) {
    console.error("Publike: a leitura da vaga pelo WhatsApp falhou:", e instanceof Error ? e.message : e);
    await registrar("falhou", { motivo: e instanceof Error ? e.message.slice(0, 200) : "erro", ms: Date.now() - inicio });
    await saida(
      "Não consegui ler a vaga agora. Pode mandar de novo daqui a pouco? Se preferir, publique pelo site: dá para mandar a foto ou colar o texto lá.",
      { perfil: "contratar", botao: { titulo: "Publicar vaga grátis", caminho: "/publicar" } },
    );
    return true;
  }
  const ms = Date.now() - inicio;

  if (lida.tipo !== "vaga") {
    await registrar(lida.tipo, { empresa: lida.empresa.nome, motivo: lida.motivo, ms });
    if (lida.tipo === "curriculo")
      await saida(t("curriculo"), {
        perfil: "trabalho",
        botao: { titulo: "Fazer meu currículo", caminho: "/perfil/curriculo" },
      });
    else if (lida.tipo === "servico")
      await saida(t("servico"), { botao: { titulo: "Montar a vitrine", caminho: "/painel/servicos" } });
    else if (lida.tipo === "golpe") await saida(t("golpe"), { perfil: "contratar" });
    else await saida(t("nao_e_vaga"));
    return true;
  }

  // as vagas do mesmo anúncio no mesmo lugar: a que não diz fica com o lugar das outras (migração 20270916150000)
  const vagas = lugarDoLote(lida.vagas.slice(0, config.por_mensagem));
  const { data: gravada, error: erroGravar } = await registrar("vaga", { empresa: lida.empresa.nome, ms, vagas });
  const links = ((gravada as unknown as { vagas?: { token: string }[] } | null)?.vagas ?? []).map((v) => v.token);
  if (erroGravar || !links.length) {
    console.error("Publike: a vaga lida pelo WhatsApp não ficou guardada:", erroGravar?.message);
    await saida(
      "Li a vaga, mas não consegui preparar o link agora. Pode mandar de novo daqui a pouco? Se preferir, publique pelo site.",
      { perfil: "contratar", botao: { titulo: "Publicar vaga grátis", caminho: "/publicar" } },
    );
    return true;
  }
  // publicar aqui mesmo, com os botões, para quem não disse que procura emprego, quando todas as vagas do anúncio foram
  // preparadas e têm o cargo: uma vaga (migração 20270914120000) ou várias (20270916140000). Faltando o bairro ou a
  // cidade, a pergunta do lugar (20270916150000); sem o cargo, ou com mais vagas que o limite do Admin: o link do site
  const todas =
    config.publicar_aqui && p.perfil !== "trabalho" && vagas.length === lida.vagas.length && links.length === vagas.length &&
    vagas.every((v) => (v.titulo ?? "").trim().length >= 5);
  if (todas && vagas.every(podePublicarAqui)) {
    const r = respostaDasVagas(config.textos, vagas, vagas.length, ola, p.jaDisse, { publicarAqui: true });
    await p.saida(r.texto, {
      perfil: "contratar",
      botoes: vagas.length === 1 ? botoesDaVagaPreparada(links[0]) : botoesDoLotePreparado(links[0], vagas.length),
    });
    return true;
  }
  // a pergunta do lugar só sai com a resposta garantida (a função do banco no ar e o recurso ligado)
  if (todas && vagas.some(semLugar) && (await vagasParaOLugar(p.banco, p.chave, p.conversa))) {
    const r = respostaDasVagas(config.textos, vagas, vagas.length, ola, p.jaDisse, { perguntarLugar: true });
    await p.saida(r.texto, { perfil: "contratar", botoes: botoesDoLugar(links[0], vagas.length) });
    return true;
  }
  const resposta = respostaDasVagas(config.textos, vagas, lida.vagas.length, ola, p.jaDisse);
  // com a entrada pelo código no WhatsApp ligada, a pessoa já sabe que não precisa de e-mail para publicar
  const comCodigo = LOGIN_CELULAR ? `${resposta.texto}\n\nPara publicar, você recebe um código aqui mesmo no WhatsApp: não precisa de e-mail nem senha.` : resposta.texto;
  await p.saida(comCodigo.length <= 1024 ? comCodigo : resposta.texto, {
    perfil: "contratar",
    botao: { titulo: resposta.botao, caminho: caminhoDaVagaDoWhatsapp(links[0], resposta.lote) },
  });
  return true;
}

// --- O lugar perguntado na conversa (migração 20270916150000) ------------------------------------------------------

type VagaDoLugar = { token: string; rascunho: RascunhoConvite };

/**
 * As vagas do último anúncio lido na conversa que ainda não foram publicadas, completando antes com o bairro e a
 * cidade respondidos. `null`: sem a função no banco, o recurso desligado, ou nenhuma vaga esperando.
 */
async function vagasParaOLugar(
  banco: ClienteBanco,
  chave: string,
  conversa: string,
  lugar: { bairro: string; cidade: string | null } | null = null,
): Promise<VagaDoLugar[] | null> {
  const { data, error } = await banco.rpc("servidor_whatsapp_lugar_das_vagas", {
    p_chave: chave,
    p_conversa: conversa,
    p_bairro: lugar?.bairro || null,
    p_cidade: lugar?.cidade || null,
  });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: o lugar da vaga do WhatsApp não foi gravado:", error.message);
    return null;
  }
  const r = (data ?? {}) as { ligado?: boolean; ok?: boolean; vagas?: VagaDoLugar[] };
  return r.ligado && r.ok && r.vagas?.length ? r.vagas : null;
}

/**
 * A resposta à pergunta do lugar: completa as vagas e manda a vaga preparada com "Sim, publicar" (ou, faltando ainda a
 * cidade ou o bairro, pergunta o que falta). `null`: a mensagem não parece um lugar, ou não há vaga esperando o lugar
 * (o atendimento segue normal).
 */
export async function lugarRespondido(
  banco: ClienteBanco,
  chave: string,
  conversa: string,
  texto: string,
): Promise<{ texto: string; botoes?: { id: string; titulo: string }[]; botao?: { titulo: string; caminho: string } } | null> {
  const antes = await vagasParaOLugar(banco, chave, conversa);
  if (!antes || !antes.some((v) => semLugar(v.rascunho))) return null;
  const cidades = [...new Set(antes.map((v) => (v.rascunho.cidade ?? "").trim()).filter(Boolean))];
  const lugar = lugarDaResposta(texto, cidades.length === 1 ? cidades[0] : null);
  if (!lugar) return null;
  const depois = await vagasParaOLugar(banco, chave, conversa, lugar);
  if (!depois) return null;
  const rascunhos = depois.map((v) => v.rascunho);
  const primeiro = depois[0].token;
  if (rascunhos.some(semLugar)) return { texto: perguntaDoLugar(rascunhos), botoes: botoesDoLugar(primeiro, depois.length) };
  if (!rascunhos.every(podePublicarAqui))
    return {
      texto: "Anotado! Para publicar, falta acertar uma coisa na vaga: toque no botão para completar no site, já preenchido.",
      botao: {
        titulo: depois.length > 1 ? "Conferir as vagas" : "Conferir e publicar",
        caminho: caminhoDaVagaDoWhatsapp(primeiro, depois.length > 1),
      },
    };
  const textos = (await configVagasWhatsapp(banco, chave))?.textos ?? {};
  const r = respostaDasVagas(textos, rascunhos, rascunhos.length, "Anotado! ✅", [], { publicarAqui: true });
  return {
    texto: r.texto,
    botoes: depois.length === 1 ? botoesDaVagaPreparada(primeiro) : botoesDoLotePreparado(primeiro, depois.length),
  };
}

// --- Depois de publicar ------------------------------------------------------------------------------------------

/**
 * A vaga do WhatsApp foi publicada: "Sua vaga está no ar" (uma vez, se a empresa falou com o Publike nas últimas 23
 * horas) e, para quem ainda não recebe, a oferta dos candidatos pelo WhatsApp. Roda depois da resposta do publicar.
 */
/**
 * A conta criada no "Sim, publicar": como entrar depois (23/11/2026; Marcelo: "seria bom ela ter essa informação, logo
 * após publicar a vaga"). Fora das 24 horas, o código chega pelo modelo de autenticação (src/lib/servidor/codigo-whatsapp.ts).
 */
export const CONTA_NOVA_PELO_WHATSAPP =
  "Criei sua conta no Publike com este WhatsApp. Para ver os candidatos quando quiser: entre em publike.org/entrar, toque em *Entrar com o WhatsApp* e digite este número. O código para entrar chega aqui, nesta conversa. Não precisa de e-mail nem de senha.";
/**
 * Enquanto a Meta não libera o modelo de autenticação (23/11/2026: "Esta conta do WhatsApp Business não tem permissão
 * para criar um modelo de mensagem"; além da empresa verificada, pede o número numa faixa de limite alta), o código só sai nas 24 horas depois da última
 * mensagem da pessoa: a conta nova fica sabendo do "oi".
 */
export const CONTA_NOVA_SEM_MODELO = "Se fizer mais de um dia que você não fala com o Publike, mande um *oi* aqui antes de pedir o código.";

export async function confirmarVagaPublicada(
  token: string,
  /**
   * publicada aqui mesmo (migração 20270914120000): o "está no ar" sai sempre (é a resposta do botão), e a conta nova
   * ganha a explicação de como entrar
   */
  opcoes: { aqui?: boolean; contaNova?: boolean; lote?: string[] } = {},
) {
  const acesso = acessoFila();
  const cfg = configMeta();
  if (!acesso || !cfg) return;
  const { cliente: banco, chave } = acesso;
  const config = await configVagasWhatsapp(banco, chave);
  if (!config || (!config.confirmar && !opcoes.aqui)) return;
  const { data, error } = await banco.rpc("servidor_whatsapp_vaga_publicada", { p_chave: chave, p_token: token });
  if (error || !data) return;
  const v = data as unknown as {
    id: string;
    numero: string;
    conversa: string;
    anuncio_id: string;
    titulo: string;
    na_janela: boolean;
    situacao: string | null;
    restantes: number;
    ja_recebe: boolean;
  };
  if (!v.na_janela || v.situacao === "equipe") return;
  const t = (k: ChaveTextoVagas, marcas?: Record<string, string | number>) => textoDasVagas(config.textos, k, marcas);
  const guardar = (texto: string, wamid: string | null) =>
    banco.rpc("servidor_whatsapp_conversa_saida", {
      p_chave: chave,
      p_conversa: v.conversa,
      p_texto: texto,
      p_wamid: wamid,
      p_perfil: "contratar",
    });
  // no lote publicado aqui, as que faltam ganham a mensagem delas (atendimento-whatsapp.ts)
  const restantes =
    v.restantes > 0 && !opcoes.lote
      ? `\n\n${v.restantes === 1 ? "Ainda falta 1 vaga" : `Ainda faltam ${v.restantes} vagas`} do seu anúncio: é só voltar ao link e publicar.`
      : "";
  const conta = opcoes.contaNova
    ? LOGIN_CELULAR
      ? `\n\n${CONTA_NOVA_PELO_WHATSAPP}${(await modeloDoCodigoLiberado(banco, chave)) ? "" : ` ${CONTA_NOVA_SEM_MODELO}`}`
      : "\n\nCriei sua conta no Publike com este WhatsApp: os candidatos ficam guardados nela."
    : "";
  // o lote publicado aqui (migração 20270916140000): um "estão no ar" só, com as vagas e o painel
  const lote = (opcoes.lote ?? []).length > 1 ? opcoes.lote! : null;
  const texto = lote
    ? `Pronto! As ${lote.length} vagas estão no ar ✅\n${lote.map((x) => `• ${x}`).join("\n")}\n\nQuando alguém se candidatar, os currículos chegam no seu painel do Publike.${restantes}${conta}`
    : `${t("no_ar", { titulo: v.titulo })}${restantes}${conta}`;
  const url = lote
    ? comOrigem(`${urlDosEmails() ?? SITE_URL}/painel`, "whatsapp", "publicar-pelo-whatsapp")
    : comOrigem(`${urlDosEmails() ?? SITE_URL}/anuncio/${v.anuncio_id}`, "whatsapp", "publicar-pelo-whatsapp");
  const titulo = lote ? "Ver minhas vagas" : "Ver a vaga";
  const r = await enviarComLink(cfg, v.numero, texto, { titulo, url });
  if (!r.ok) {
    console.error("Publike: o \"está no ar\" do WhatsApp não saiu:", r.erro);
    return;
  }
  await guardar(`${texto}\n\n[Botão: ${titulo}]`, r.wamid);
  if (!config.oferecer_avisos || v.ja_recebe) return;
  // no lote, "destas vagas" (o texto do Admin pode não ter "desta vaga": aí fica como está)
  const oferta = lote ? t("oferta").replace(/\bdesta vaga\b/i, "destas vagas") : t("oferta");
  const o = await enviarComBotoes(cfg, v.numero, oferta, [
    { id: `a:receber:${v.id}`, titulo: "Sim, quero receber" },
    { id: "a:nao_receber", titulo: "Agora não" },
  ]);
  if (o.ok) await guardar(`${oferta}\n\n[Botões: Sim, quero receber · Agora não]`, o.wamid);
  else console.error("Publike: a oferta dos avisos pelo WhatsApp não saiu:", o.erro);
}

/**
 * O toque na oferta: "Sim, quero receber" vira o aceite dos avisos (com o número da conversa); "Agora não" só responde.
 * `null`: não é um desses botões.
 */
export async function respostaDaOferta(
  banco: ClienteBanco,
  chave: string,
  conversa: string,
  payload: string | null,
): Promise<string | null> {
  if (payload === "a:nao_receber")
    return "Tudo bem! Os candidatos ficam no painel do Publike, e o e-mail avisa quando chega alguém.";
  const m = /^a:receber:([0-9a-f-]{36})$/.exec(payload ?? "");
  if (!m) return null;
  const { data, error } = await banco.rpc("servidor_whatsapp_aceite_pela_vaga", {
    p_chave: chave,
    p_conversa: conversa,
    p_vaga: m[1],
  });
  if (error || !(data as { ok?: boolean } | null)?.ok)
    return "Não consegui ligar os avisos por aqui agora. Dá para ligar no Publike, em Preferências › WhatsApp.";
  const combinado =
    "Combinado! Quando alguém se candidatar às suas vagas, eu aviso por aqui. Para parar, é só responder PARAR.";
  // com o entrar pelo WhatsApp ligado: o mesmo número no cadastro da conta liga o login (migração 20270818120000;
  // as duas pontas dizem a mesma coisa). Sem a migração, ou sem ligar, só o combinado.
  if (!LOGIN_CELULAR) return combinado;
  const { data: login, error: erroLogin } = await banco.rpc("servidor_whatsapp_login_pela_vaga", {
    p_chave: chave,
    p_conversa: conversa,
    p_vaga: m[1],
  });
  return !erroLogin && (login as { ligou?: boolean } | null)?.ligou
    ? `${combinado}\n\nE este WhatsApp ficou vinculado à sua conta: da próxima vez, você entra no Publike com um código que chega aqui, sem e-mail. Para desvincular, é em Meu perfil.`
    : combinado;
}

/** O modelo de autenticação do código de entrar já pode sair (src/lib/servidor/codigo-whatsapp.ts). */
async function modeloDoCodigoLiberado(banco: ClienteBanco, chave: string) {
  const { data, error } = await banco.rpc("servidor_whatsapp_config", { p_chave: chave });
  if (error) return false;
  return codigoPeloModeloPode(((data ?? {}) as { modelos?: SituacaoModelos }).modelos ?? {});
}
