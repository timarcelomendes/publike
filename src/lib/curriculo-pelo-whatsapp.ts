import { AVISO_DA_IA_MONTAR } from "@/lib/aceite-da-ia";
import { nomeDisponibilidade, nomeEscolaridade } from "@/lib/constantes";

// O currículo pelo WhatsApp (22/11/2026; claude/plano-curriculo-otimizado.md, fase 1; migração 20270902120000): os
// textos da conversa, os passos e a prévia. Sem nada do servidor (os testes e o admin usam). A IA e o envio ficam em
// src/lib/servidor/curriculo-pelo-whatsapp.ts.
//
// A conversa tem 3 passos e a prévia. O passo de agora sai da última mensagem do Publike (a marca no começo dela),
// como as 3 perguntas da vaga: nada a guardar fora da conversa.
//   1. o que a pessoa procura e onde já trabalhou (vale bico, diária, por conta própria, ajudar a família);
//   2. as perguntas que um recrutador faria sobre o que ela contou (a IA escreve; sem a IA, as de sempre);
//   3. estudo, cursos, carteira de motorista e horário (as de sempre);
//   e a prévia, com o botão "Conferir e salvar", que abre o formulário do site já preenchido.

export const MARCAS_DO_CURRICULO = {
  passo1: "📝 *Currículo 1 de 3:*",
  /** as 3 perguntas do passo 2 antes de 22/11/2026, numa mensagem só (as conversas que já estavam nele) */
  passo2: "📝 *Currículo 2 de 3:*",
  pergunta1: "📝 *Currículo 2 de 3 · pergunta 1 de 3:*",
  pergunta2: "📝 *Currículo 2 de 3 · pergunta 2 de 3:*",
  pergunta3: "📝 *Currículo 2 de 3 · pergunta 3 de 3:*",
  passo3: "📝 *Currículo 3 de 3:*",
  previa: "📝 *Seu currículo ficou assim:*",
  falha: "📝 *Não consegui terminar o currículo agora.*",
  /** depois do cartão ou do PDF: vale como a prévia (corrigir ainda refaz) */
  arquivos: "📎 *Seu currículo",
} as const;
export type PassoDoCurriculo = keyof typeof MARCAS_DO_CURRICULO;

/** O botão que começa (o nome vai até 20 letras). */
export const BOTAO_MONTAR_CURRICULO = { id: "a:cv-montar", titulo: "Montar meu currículo" } as const;
/** Quem já tem o currículo pronto: o Publike pede o PDF ou a foto aqui mesmo (27/11/2026, depois da candidatura). */
export const BOTAO_ENVIAR_CURRICULO = { id: "a:cv-enviar", titulo: "Enviar meu currículo" } as const;
/** O id dos botões das opções de uma pergunta ("a:cv-op:1"): a resposta é o nome do botão. */
export const OPCAO_DO_CURRICULO = "a:cv-op:";
/** O "Agora não" da pergunta depois das vagas. */
export const BOTAO_AGORA_NAO = { id: "a:cv-nao", titulo: "Agora não" } as const;
/** O botão da prévia, que abre o formulário do site preenchido. */
export const TITULO_CONFERIR_E_SALVAR = "Conferir e salvar";

export const TEXTOS_DO_CURRICULO = {
  passo1: [
    `${MARCAS_DO_CURRICULO.passo1} vamos montar o seu currículo aqui mesmo. É grátis, leva uns 5 minutos e você pode responder escrevendo ou mandando áudio. 🎤`,
    "*Que trabalho você procura e onde você já trabalhou?* Conta tudo: emprego com carteira, bico, diária, freelance, trabalho por conta própria ou ajudando a família. Tudo isso conta.",
    "Por exemplo: _quero trabalhar de auxiliar de cozinha. Trabalhei 2 anos numa lanchonete em Campinas e faço salgado para vender_.",
    // o aceite da IA (migração 20271001120000): responder é o aceite
    AVISO_DA_IA_MONTAR,
  ].join("\n\n"),
  /** quando a pessoa só respondeu "ok" ou "sim" no passo 1 */
  passo1DeNovo: `${MARCAS_DO_CURRICULO.passo1} pode contar! 😊 *Que trabalho você procura e onde você já trabalhou?* Pode ser escrito ou em áudio.`,
  passo2: (perguntas: string[]) =>
    [
      `${MARCAS_DO_CURRICULO.passo2} boa! Agora umas perguntas que o recrutador faria. Responda do seu jeito, numa mensagem ou num áudio:`,
      perguntas.map((p, i) => `${i + 1}. ${p}`).join("\n"),
    ].join("\n\n"),
  /** uma pergunta do passo 2 por mensagem, com as opções em botões quando cabem */
  perguntaDoPasso2: (n: 1 | 2 | 3, texto: string, comOpcoes: boolean) =>
    [
      `${MARCAS_DO_CURRICULO[`pergunta${n}`]}${n === 1 ? " boa! Agora umas perguntas que o recrutador faria." : ""}`,
      texto,
      comOpcoes ? "_Toque numa opção ou responda do seu jeito, escrito ou em áudio._" : "_Responda do seu jeito, escrito ou em áudio._",
    ].join("\n\n"),
  passo3: [
    `${MARCAS_DO_CURRICULO.passo3} quase pronto! Por último, me conta:`,
    "• até que ano você estudou;\n• se fez algum curso (de qualquer coisa);\n• se tem carteira de motorista, e qual;\n• e quando você pode trabalhar (manhã, tarde, noite, fim de semana).",
    "O que não tiver, é só pular.",
  ].join("\n\n"),
  previa: (previa: string) =>
    [
      `${MARCAS_DO_CURRICULO.previa}`,
      previa,
      "Escrevi só o que você me contou. Se quiser mudar ou acrescentar alguma coisa, é só me dizer aqui. Para mandar nos grupos ou imprimir, escreva *cartão* ou *PDF*.",
      `Se estiver bom, toque em *${TITULO_CONFERIR_E_SALVAR}*: você entra com este WhatsApp, sem digitar código, confere e salva. Aí as empresas da região já te acham. 😊`,
    ].join("\n\n"),
  falha: `${MARCAS_DO_CURRICULO.falha} 😕 Me manda qualquer mensagem daqui a pouco que eu tento de novo, com tudo o que você já me contou.`,
  /** o que a pessoa contou não deu um currículo (nada de trabalho, estudo nem do que sabe fazer) */
  semNada: `${MARCAS_DO_CURRICULO.passo1} não consegui montar o currículo com o que você me contou. 😕 Me conta de novo, com calma: *que trabalho você procura e o que você já fez?* Vale bico e trabalho sem carteira. Pode mandar áudio.`,
  semAudio: (passo: PassoDoCurriculo) =>
    `${MARCAS_DO_CURRICULO[passo === "previa" || passo === "falha" || passo === "arquivos" ? "passo3" : passo]} não consegui ouvir esse áudio. 😕 Pode mandar de novo ou escrever?`,
  parou: "Tudo bem! Quando quiser, é só escrever *currículo* que a gente monta junto. 😊",
  /** a pergunta separada, uns 10 minutos depois das vagas (uma vez por conversa), com Montar meu currículo e Agora não */
  pergunta:
    "📝 Quer que eu monte o seu currículo agora, aqui no WhatsApp? Leva uns 5 minutos, pode ser por áudio, e as empresas da região passam a te achar.",
  cartao: `${MARCAS_DO_CURRICULO.arquivos} em cartão* 📎 Mande nos grupos de vagas e no seu status. Quem se interessar fala com você.`,
  pdf: `${MARCAS_DO_CURRICULO.arquivos} em PDF* 📎 Para imprimir e entregar. Lembre de salvar também no Publike, pelo botão *${TITULO_CONFERIR_E_SALVAR}*.`,
  semArquivo: "Não achei o seu currículo montado nos últimos 7 dias. 😕 Escreva *currículo* que a gente monta de novo.",
  arquivoFalhou: "Não consegui mandar o arquivo agora. 😕 Tente de novo daqui a pouco.",
} as const;

/** A oferta de montar conversando, depois do arquivo que não deu currículo (o "sim" escrito vale como o botão). */
export const OFERTA_DE_MONTAR = "Se preferir, a gente monta o seu currículo agora, conversando";

/** O porquê de um arquivo não ter virado currículo (src/lib/servidor/curriculo-por-arquivo.ts, `ArquivoNaoLido`). */
export type ArquivoNaoLidoNaConversa = { tipo: string; oQueE?: string; tamanho?: string };

/** O que houve com o arquivo, numa frase sem ponto ("o arquivo é grande demais para eu abrir aqui (23,1 MB)"). */
function oQueHouve(r: ArquivoNaoLidoNaConversa) {
  if (r.tipo === "grande") return `o arquivo é grande demais para eu abrir aqui${r.tamanho ? ` (${r.tamanho})` : ""}`;
  if (r.tipo === "nao_e_curriculo")
    return r.oQueE ? `abri o arquivo, mas ele parece ser ${r.oQueE}, e não um currículo` : "abri o arquivo, mas não achei um currículo nele";
  if (r.tipo === "sem_campos") return "abri o seu currículo, mas não consegui ler o que está escrito";
  if (r.tipo === "limite") return "por hoje eu já li todos os arquivos que dava para ler deste número";
  if (r.tipo === "formato") return "esse tipo de arquivo eu não consigo abrir";
  return "não consegui abrir o seu arquivo agora";
}

/** O que a pessoa pode fazer, depois do que houve. */
function comoMandar(r: ArquivoNaoLidoNaConversa) {
  if (r.tipo === "grande") return "Se for o seu currículo, mande uma foto de cada página, que eu leio na hora.";
  if (r.tipo === "nao_e_curriculo") return "Se tiver o currículo, mande o PDF ou uma foto de cada página.";
  if (r.tipo === "sem_campos") return "Pode mandar uma foto de cada página, de perto, com a folha inteira e boa luz?";
  if (r.tipo === "limite") return "Amanhã eu leio de novo.";
  if (r.tipo === "formato") return "Se for o seu currículo, mande em PDF ou uma foto de cada página, que eu leio na hora.";
  return "Pode mandar de novo? Se for o currículo, também dá para mandar uma foto de cada página.";
}

const comMaiuscula = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`;

/**
 * O arquivo de quem procura trabalho que não virou currículo (25/11/2026: a Arlete ouviu "por aqui eu não consigo
 * abrir" e foi mandada ao site): o que houve, o que fazer e, com o currículo pelo WhatsApp ligado, a oferta de montar
 * conversando (com os botões Montar meu currículo e Agora não).
 */
export function arquivoNaoLido(r: ArquivoNaoLidoNaConversa, comMontar: boolean) {
  return [
    `${comMaiuscula(oQueHouve(r))}. 😕 ${comoMandar(r)}`,
    comMontar
      ? `${OFERTA_DE_MONTAR}: leva uns 5 minutos e pode ser por áudio. 🎤`
      : "Se preferir, dá para fazer o currículo no site, com calma.",
  ].join("\n\n");
}

/**
 * O porquê de verdade para quem ouviu antes "por aqui eu não consigo abrir" (25/11/2026; Marcelo, da Arlete: "devolve
 * isso pra ela"): a correção, com o que houve e a oferta de montar conversando.
 */
export function arquivoNaoLidoDeNovo(r: ArquivoNaoLidoNaConversa, comMontar: boolean, nome: string | null) {
  const texto = arquivoNaoLido(r, comMontar);
  return `${nome ? `Oi, ${nome}!` : "Oi!"} Corrigindo o que eu disse mais cedo: ${texto.charAt(0).toLowerCase()}${texto.slice(1)}`;
}

/** Os porquês que a correção conta (os outros repetiriam o "não consegui abrir" de antes). */
export const PORQUES_DA_CORRECAO = ["nao_e_curriculo", "grande", "sem_campos"];

/** A pergunta de cada passo, quando a última mensagem do Publike não a traz inteira. */
const PERGUNTA_DE_SEMPRE: Partial<Record<PassoDoCurriculo, string>> = {
  passo1:
    "*Que trabalho você procura e onde você já trabalhou?* Vale emprego com carteira, bico, diária e trabalho por conta própria.",
  passo3:
    "• até que ano você estudou;\n• se fez algum curso (de qualquer coisa);\n• se tem carteira de motorista, e qual;\n• e quando você pode trabalhar (manhã, tarde, noite, fim de semana).",
  falha: "Me manda qualquer mensagem que eu tento montar de novo, com tudo o que você já me contou.",
};
/** A pergunta do passo de agora, tirada da última mensagem do Publike (sem a marca nem a dica dos botões). */
export function perguntaDoPasso(passo: PassoDoCurriculo, minhaUltima: string) {
  const paragrafos = minhaUltima
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean);
  const i = paragrafos.findIndex((t) => t.includes(MARCAS_DO_CURRICULO[passo]));
  const depois = i >= 0 ? paragrafos.slice(i + 1).filter((t) => !/^_(Toque numa opção|Responda do seu jeito)/.test(t)) : [];
  if (depois.length) return depois.join("\n\n");
  return PERGUNTA_DE_SEMPRE[passo] ?? "É só responder a pergunta de cima, do seu jeito.";
}

/**
 * O arquivo que chegou no meio do currículo e não virou currículo: o porquê e a mesma pergunta, com a marca do passo
 * (a conversa continua de onde estava). `r` null: o formato que não é foto nem PDF.
 */
export function arquivoNoMeioDoCurriculo(r: ArquivoNaoLidoNaConversa | null, passo: PassoDoCurriculo, minhaUltima: string) {
  const motivo = r ?? { tipo: "formato" };
  const mandar = motivo.tipo === "limite" ? "" : " Se quiser, mande o currículo em PDF ou uma foto de cada página.";
  return [
    `${MARCAS_DO_CURRICULO[passo]} ${oQueHouve(motivo)}. 😕${mandar} Ou seguimos por aqui mesmo, escrevendo ou por áudio 🎤:`,
    perguntaDoPasso(passo, minhaUltima),
  ].join("\n\n");
}

/** Os passos do meio do currículo (uma pergunta esperando resposta): o convite do Instagram não sai neles. */
export const PASSOS_DO_MEIO: PassoDoCurriculo[] = ["passo1", "passo2", "pergunta1", "pergunta2", "pergunta3", "passo3"];

/** A marca do lembrete do currículo pela metade (uma vez por parada; migração 20270929120000). */
export const MARCA_DO_LEMBRETE = "seu currículo ficou pela metade";

/**
 * O lembrete de quem parou no meio do currículo, 2 horas depois (no lugar do convite do Instagram): a marca do passo
 * (a conversa segue de onde estava) e a mesma pergunta.
 */
export function lembreteDoCurriculo(passo: PassoDoCurriculo, ultima: string) {
  return [
    `${MARCAS_DO_CURRICULO[passo]} ${MARCA_DO_LEMBRETE}. 😊 Quer terminar? Falta pouco, e com ele pronto as empresas da região passam a te achar. É só responder por aqui, escrevendo ou em áudio 🎤:`,
    perguntaDoPasso(passo, ultima),
  ].join("\n\n");
}

/** As perguntas de sempre do passo 2 (sem a IA, ou quando a resposta dela não serve). */
export const PERGUNTAS_DE_SEMPRE = [
  "O que você fazia no dia a dia nesses trabalhos? _Ex.: atendia no balcão, fechava o caixa, cuidava do estoque._",
  "Quanto tempo você ficou em cada um, mais ou menos? _Pode ser só o ano._",
  "Sabe usar alguma máquina, ferramenta ou programa? _Ex.: chapa, empilhadeira, maquininha de cartão, Excel._",
];

/** O passo da conversa pela última mensagem do Publike (null: fora do currículo). A marca pode vir depois do "Oi". */
export function passoDoCurriculo(minhaUltima: string): PassoDoCurriculo | null {
  for (const [passo, marca] of Object.entries(MARCAS_DO_CURRICULO) as [PassoDoCurriculo, string][])
    if (minhaUltima.includes(marca)) return passo;
  return null;
}

const simples = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Quem pede para montar o currículo: "currículo", "quero fazer meu currículo", "não tenho currículo", "me ajuda a
 * montar um currículo". Não: "tenho currículo" (vai para o envio do arquivo), "enviei meu currículo", "currículo para a
 * vaga de motorista?" (pergunta, vai para a IA).
 */
export function querMontarCurriculo(texto: string) {
  const t = simples(texto.replace(/^🎤\s*/, ""));
  if (!/\bcurriculo\b/.test(t) || t.length > 90) return false;
  if (/\bnao tenho( um| o)? curriculo\b/.test(t)) return true;
  if (texto.trim().endsWith("?") && !/\b(fazer|montar|criar)\b/.test(t)) return false;
  if (/\b(enviei|mandei|enviar|mandar|anexar|anexei|atualizar|editar|ja tenho|tenho meu|tenho um)\b/.test(t)) return false;
  if (/^(o )?curriculo( por favor)?$/.test(t)) return true;
  return /\b(fazer|montar|criar|preparar|ajuda[r]?( a)?|quero( um)?|preciso( de)?( um)?)\b.*\bcurriculo\b/.test(t);
}

/** Depois da prévia: o cartão em imagem ou o PDF. */
export function pedeArquivo(texto: string): "cartao" | "pdf" | null {
  const t = simples(texto.replace(/^🎤\s*/, ""));
  if (t.length > 40) return null;
  if (/\b(pdf|imprimir|impressao)\b/.test(t)) return "pdf";
  if (/\b(cartao|imagem|foto|figura|status|grupo|grupos)\b/.test(t)) return "cartao";
  return null;
}

/**
 * A mensagem no meio do currículo que não é resposta (27/11/2026; Marcelo testando: o "Ola" de 5 dias depois virou a
 * resposta do passo 1, e "Tem vagas para analista de sistemas" e "quero ver vagas" viraram as respostas das perguntas):
 * o cumprimento sozinho e o pedido de vagas. Ela sai do currículo e o atendimento segue normal; "continuar" ou
 * "currículo" retoma de onde parou (`passoPendente`).
 */
export function saiDoCurriculo(texto: string) {
  const t = simples(texto.replace(/^🎤\s*/, ""));
  if (!t) return false;
  if (
    /^(oi+e?|ola+|opa|ei|hey|hello|bom dia|boa tarde|boa noite|e ai|tudo bem|tudo bom)( (tudo bem|tudo bom|bom dia|boa tarde|boa noite|[a-z]{2,12}))?$/.test(t)
  )
    return true;
  if (t.length > 90) return false;
  if (/^(as |mais |outras )?vagas?( por favor)?$/.test(t)) return true;
  return /^(tem|teria|tens|ha|existe|existem|quais|qual|alguma|algum|quero ver|queria ver|quero|queria|ver|mostra|mostrar|me (mostra|manda|envia|passa)|manda|cade|onde)\b.{0,60}\bvagas?\b/.test(t);
}

/** Quem pede para seguir o currículo que ficou pela metade. */
export function querContinuar(texto: string) {
  return /^(continuar|continua|vamos continuar|quero continuar|seguir|voltar)( (o |meu |com o )?curriculo)?$/.test(simples(texto.replace(/^🎤\s*/, "")));
}

/**
 * O currículo que ficou pela metade: a última mensagem do Publike com a marca de um passo do currículo, se ela é de um
 * passo do meio (depois dela, a conversa foi para outro assunto). Null: não tem ou já acabou.
 */
export function passoPendente(historico: { de: "pessoa" | "robo" | "equipe"; texto: string }[]) {
  for (let i = historico.length - 1; i >= 0; i--) {
    const m = historico[i];
    if (m.de === "pessoa") continue;
    const passo = passoDoCurriculo(m.texto);
    if (!passo) continue;
    return PASSOS_DO_MEIO.includes(passo) ? { passo, texto: m.texto } : null;
  }
  return null;
}

/** A volta ao currículo pela metade: a marca do passo (a conversa segue de onde estava) e a mesma pergunta. */
export function retomarCurriculo(passo: PassoDoCurriculo, ultima: string) {
  return [
    `${MARCAS_DO_CURRICULO[passo]} vamos continuar de onde paramos. 😊 É só responder por aqui, escrevendo ou em áudio 🎤:`,
    perguntaDoPasso(passo, ultima),
  ].join("\n\n");
}

/** A pessoa quer parar no meio. */
export function querParar(texto: string) {
  const t = simples(texto.replace(/^🎤\s*/, ""));
  return /^(cancela[r]?|para[r]?|sair|desisto|desistir|depois|agora nao|deixa (pra|para) (la|depois)|nao quero( mais)?|outra hora)( obrigad[oa])?$/.test(t);
}

// --- A prévia --------------------------------------------------------------------------------------------------------

export type CurriculoMontado = {
  titulo: string;
  resumo: string;
  habilidades: string[];
  escolaridade: string;
  curso: string;
  estudos: { nivel: string; curso: string }[];
  experiencias: { cargo: string; onde: string; inicio: string; fim: string; atual: boolean; descricao: string }[];
  cursos: string[];
  cnh: string;
  disponibilidade: string[];
};

/** "cerca de 2 anos", "uns 8 meses", "desde 2023" (o tempo do jeito que a pessoa entende). */
export function tempoDoTrabalho(x: { inicio: string; fim: string; atual: boolean }, hoje: string) {
  if (!x.inicio) return "";
  const [ai, mi] = x.inicio.split("-").map(Number);
  const [af, mf] = (x.atual || !x.fim ? hoje : x.fim).split("-").map(Number);
  const meses = (af - ai) * 12 + (mf - mi) + 1;
  if (!Number.isFinite(meses) || meses <= 0) return "";
  const tempo =
    meses < 12
      ? `${meses} ${meses === 1 ? "mês" : "meses"}`
      : meses % 12 >= 6 && meses < 60
        ? `${Math.floor(meses / 12)} anos e meio`.replace(/^1 anos/, "1 ano")
        : `${Math.round(meses / 12)} ${Math.round(meses / 12) === 1 ? "ano" : "anos"}`;
  return x.atual ? `há ${tempo}, até hoje` : `${tempo}`;
}

const cortar = (t: string, max: number) => (t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`);

/** A prévia que vai na conversa (até ~560 letras: a mensagem com botão vai até 1.000). */
export function previaDoCurriculo(c: CurriculoMontado, hoje: string, max = 560) {
  const partes: string[] = [];
  if (c.titulo) partes.push(`*${c.titulo}*`);
  if (c.resumo) partes.push(`_${c.resumo}_`);
  const experiencias = c.experiencias.map((x) => {
    const tempo = tempoDoTrabalho(x, hoje);
    const linha = `• ${x.cargo}${x.onde ? ` – ${x.onde}` : ""}${tempo ? ` (${tempo})` : ""}`;
    return x.descricao ? `${linha}\n  ${cortar(x.descricao, 110)}` : linha;
  });
  if (experiencias.length) partes.push(`*Experiência*\n${experiencias.join("\n")}`);
  const estudo = [c.escolaridade ? nomeEscolaridade(c.escolaridade) : "", c.curso].filter(Boolean).join(": ");
  if (estudo) partes.push(`*Estudo:* ${estudo}`);
  if (c.cursos.length) partes.push(`*Cursos:* ${c.cursos.join(", ")}`);
  if (c.habilidades.length) partes.push(`*Sabe fazer:* ${c.habilidades.join(", ")}`);
  const extra = [
    c.cnh ? `CNH ${c.cnh}` : "",
    c.disponibilidade.length ? `pode trabalhar: ${c.disponibilidade.map((d) => nomeDisponibilidade(d).replace(/ \(.*\)$/, "").toLowerCase()).join(", ")}` : "",
  ].filter(Boolean);
  if (extra.length) {
    const linha = extra.join(" · ");
    partes.push(linha[0].toUpperCase() + linha.slice(1));
  }
  // não coube: tira primeiro as descrições, depois as experiências mais antigas (o site mostra tudo)
  let texto = partes.join("\n\n");
  if (texto.length > max) texto = texto.replace(/\n {2}[^\n]*/g, "");
  while (texto.length > max) {
    const antes = texto;
    texto = texto.replace(/\n• [^\n]*(?=\n\n|$)(?![\s\S]*\n• )/, "");
    if (texto === antes) {
      texto = cortar(texto, max);
      break;
    }
  }
  return texto;
}

/** A conversa do currículo (da primeira pergunta até agora), para a IA: "Publike: …" e "Pessoa: …". */
export function conversaDoCurriculo(historico: { de: "pessoa" | "robo" | "equipe"; texto: string }[]) {
  const inicio = historico.findLastIndex((m) => m.de !== "pessoa" && m.texto.includes(MARCAS_DO_CURRICULO.passo1));
  if (inicio < 0) return "";
  return historico
    .slice(inicio)
    .map((m) => `${m.de === "pessoa" ? "Pessoa" : "Publike"}: ${m.texto.replace(/\s*\[Bot(ão|ões):[^\]]*\]\s*$/, "").trim()}`)
    .join("\n\n")
    .slice(-9000);
}

/** O que a pessoa contou no passo 1 (para as perguntas do passo 2), sem o "🎤". */
export function relatoDoPasso1(agora: string[]) {
  return agora.join("\n").replace(/^🎤\s*/gm, "").trim().slice(0, 3000);
}
