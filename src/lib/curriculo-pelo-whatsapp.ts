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
  passo2: "📝 *Currículo 2 de 3:*",
  passo3: "📝 *Currículo 3 de 3:*",
  previa: "📝 *Seu currículo ficou assim:*",
  falha: "📝 *Não consegui terminar o currículo agora.*",
  /** depois do cartão ou do PDF: vale como a prévia (corrigir ainda refaz) */
  arquivos: "📎 *Seu currículo",
} as const;
export type PassoDoCurriculo = keyof typeof MARCAS_DO_CURRICULO;

/** O botão que começa (o nome vai até 20 letras). */
export const BOTAO_MONTAR_CURRICULO = { id: "a:cv-montar", titulo: "Montar meu currículo" } as const;
/** O "Agora não" da pergunta depois das vagas. */
export const BOTAO_AGORA_NAO = { id: "a:cv-nao", titulo: "Agora não" } as const;
/** O botão da prévia, que abre o formulário do site preenchido. */
export const TITULO_CONFERIR_E_SALVAR = "Conferir e salvar";

export const TEXTOS_DO_CURRICULO = {
  passo1: [
    `${MARCAS_DO_CURRICULO.passo1} vamos montar o seu currículo aqui mesmo. É grátis, leva uns 5 minutos e você pode responder escrevendo ou mandando áudio. 🎤`,
    "*Que trabalho você procura e onde você já trabalhou?* Conta tudo: emprego com carteira, bico, diária, freelance, trabalho por conta própria ou ajudando a família. Tudo isso conta.",
    "Por exemplo: _quero trabalhar de auxiliar de cozinha. Trabalhei 2 anos numa lanchonete em Campinas e faço salgado para vender_.",
  ].join("\n\n"),
  /** quando a pessoa só respondeu "ok" ou "sim" no passo 1 */
  passo1DeNovo: `${MARCAS_DO_CURRICULO.passo1} pode contar! 😊 *Que trabalho você procura e onde você já trabalhou?* Pode ser escrito ou em áudio.`,
  passo2: (perguntas: string[]) =>
    [
      `${MARCAS_DO_CURRICULO.passo2} boa! Agora umas perguntas que o recrutador faria. Responda do seu jeito, numa mensagem ou num áudio:`,
      perguntas.map((p, i) => `${i + 1}. ${p}`).join("\n"),
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
      `Se estiver bom, toque em *${TITULO_CONFERIR_E_SALVAR}*: você entra com o seu WhatsApp, confere e salva. Aí as empresas da região já te acham. 😊`,
    ].join("\n\n"),
  falha: `${MARCAS_DO_CURRICULO.falha} 😕 Me manda qualquer mensagem daqui a pouco que eu tento de novo, com tudo o que você já me contou.`,
  /** o que a pessoa contou não deu um currículo (nada de trabalho, estudo nem do que sabe fazer) */
  semNada: `${MARCAS_DO_CURRICULO.passo1} não consegui montar o currículo com o que você me contou. 😕 Me conta de novo, com calma: *que trabalho você procura e o que você já fez?* Vale bico e trabalho sem carteira. Pode mandar áudio.`,
  semAudio: (passo: PassoDoCurriculo) =>
    `${MARCAS_DO_CURRICULO[passo === "previa" || passo === "falha" ? "passo3" : passo]} não consegui ouvir esse áudio. 😕 Pode mandar de novo ou escrever?`,
  arquivo:
    "Recebi! Se você já tem o currículo pronto, toque em *Enviar meu currículo* e mande por lá: o Publike lê e preenche tudo para você conferir.",
  parou: "Tudo bem! Quando quiser, é só escrever *currículo* que a gente monta junto. 😊",
  /** a pergunta separada, uns 10 minutos depois das vagas (uma vez por conversa), com Montar meu currículo e Agora não */
  pergunta:
    "📝 Quer que eu monte o seu currículo agora, aqui no WhatsApp? Leva uns 5 minutos, pode ser por áudio, e as empresas da região passam a te achar.",
  cartao: `${MARCAS_DO_CURRICULO.arquivos} em cartão* 📎 Mande nos grupos de vagas e no seu status. Quem se interessar fala com você.`,
  pdf: `${MARCAS_DO_CURRICULO.arquivos} em PDF* 📎 Para imprimir e entregar. Lembre de salvar também no Publike, pelo botão *${TITULO_CONFERIR_E_SALVAR}*.`,
  semArquivo: "Não achei o seu currículo montado nos últimos 7 dias. 😕 Escreva *currículo* que a gente monta de novo.",
  arquivoFalhou: "Não consegui mandar o arquivo agora. 😕 Tente de novo daqui a pouco.",
} as const;

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
