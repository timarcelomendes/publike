// Convites às empresas (admin): a lista, o arquivo modelo e a mensagem do convite.

import { LISTA_REGIMES, LISTA_UNIDADES, SLUGS_CATEGORIAS, SLUGS_OFICIOS, VALORES_BENEFICIO } from "./constantes";
import { escaparHtml } from "./email/montar";
import { ONDE_FUNCIONA } from "@/lib/pracas";

export const ESTADOS_CONVITE = [
  { id: "a_enviar", nome: "A enviar", filtro: "A enviar" },
  { id: "enviada", nome: "Enviei", filtro: "Enviados" },
  { id: "autorizou", nome: "Autorizou", filtro: "Autorizaram" },
  { id: "recusou", nome: "Não quis", filtro: "Não quiseram" },
  { id: "sem_contato", nome: "Contato não serve", filtro: "Contato não serve" },
] as const;
export type StatusConvite = (typeof ESTADOS_CONVITE)[number]["id"];
export const STATUS_CONVITE = ESTADOS_CONVITE.map((e) => e.id) as StatusConvite[];

/** prestador: profissional que oferece serviço (eletricista, diarista...): o convite é para a vitrine */
export type TipoConvite = "empresa" | "agencia" | "prestador";

export type Convite = {
  id: string;
  nome: string;
  tipo: TipoConvite;
  vagas: string[];
  whatsapp: string[];
  telefones: string[];
  email: string | null;
  observacao: string | null;
  status: StatusConvite;
  nota: string | null;
  enviada_em: string | null;
  usuario_id: string | null;
  criado_em: string;
  /** o link do convite: /publicar?convite=<token> */
  token: string;
  /** a vaga lida da imagem do anúncio, que vem pronta no formulário de publicar */
  rascunho: RascunhoConvite | null;
  origem: "arquivo" | "imagem" | null;
  /** quando a empresa publicou pela página do convite */
  aceite_em: string | null;
  anuncio_id: string | null;
};

/** A vaga lida do anúncio (imagem), para vir pronta no formulário de publicar. */
export type RascunhoConvite = {
  /** prestador: o ofício do catálogo (eletricista, diarista...), quando dá para saber */
  oficio?: string;
  titulo: string;
  descricao: string;
  categoria: string;
  regime: string;
  salario: number | null;
  salario_ate: number | null;
  unidade: string;
  beneficios: string[];
  cidade: string;
  bairro: string;
  quantidade: number;
};

/** O que vem de uma linha do arquivo (ou do formulário), já limpo. */
export type NovoConvite = Pick<
  Convite,
  "nome" | "tipo" | "vagas" | "whatsapp" | "telefones" | "email" | "observacao"
> & { rascunho?: RascunhoConvite | null; origem?: "arquivo" | "imagem" };

/**
 * Confere o rascunho da vaga (vem da IA ou do navegador do admin): só valores que o formulário
 * de publicar conhece; o resto fica vazio para a empresa preencher.
 */
export function rascunhoValido(x: unknown): RascunhoConvite | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const t = (k: string, max: number) =>
    typeof o[k] === "string" ? (o[k] as string).replace(/\s+/g, " ").trim().slice(0, max) : "";
  const n = (k: string) =>
    typeof o[k] === "number" && Number.isFinite(o[k]) && (o[k] as number) > 0
      ? Math.round((o[k] as number) * 100) / 100
      : null;
  const titulo = t("titulo", 90);
  if (titulo.length < 2) return null;
  const descricao = typeof o.descricao === "string" ? o.descricao.trim().slice(0, 3000) : "";
  const salario = n("salario");
  const ate = n("salario_ate");
  const qtd = n("quantidade");
  const oficio = t("oficio", 40);
  return {
    ...((SLUGS_OFICIOS as readonly string[]).includes(oficio) ? { oficio } : {}),
    titulo,
    descricao,
    categoria: (SLUGS_CATEGORIAS as readonly string[]).includes(t("categoria", 40)) ? t("categoria", 40) : "",
    regime: (LISTA_REGIMES as readonly string[]).includes(t("regime", 20)) ? t("regime", 20) : "",
    salario: salario && salario < 1_000_000 ? salario : null,
    salario_ate: salario && ate && ate > salario && ate < 1_000_000 ? ate : null,
    unidade: (LISTA_UNIDADES as readonly string[]).includes(t("unidade", 20)) ? t("unidade", 20) : "",
    beneficios: Array.isArray(o.beneficios)
      ? [
          ...new Set(
            o.beneficios.filter(
              (b): b is string => typeof b === "string" && (VALORES_BENEFICIO as readonly string[]).includes(b),
            ),
          ),
        ]
      : [],
    cidade: t("cidade", 60),
    bairro: t("bairro", 60),
    quantidade: qtd && qtd >= 1 && qtd <= 999 ? Math.floor(qtd) : 1,
  };
}

/** O link que vai na mensagem: a empresa confere a vaga e publica (é o aceite). */
export function linkDoConvite(site: string, token: string, tipo: TipoConvite = "empresa") {
  const raiz = site.replace(/\/+$/, "");
  // prestador: a página do convite mostra a vitrine pronta e leva para entrar e salvar
  return tipo === "prestador" ? `${raiz}/convite/${token}` : `${raiz}/publicar?convite=${token}`;
}

// ---------------------------------------------------------------------------
// Arquivo modelo (CSV, abre no Excel e no Google Planilhas)

export const COLUNAS_MODELO = ["empresa", "tipo", "vagas", "whatsapp", "telefones", "email", "observacao"] as const;

const EXEMPLOS = [
  [
    "Padaria Exemplo (apague esta linha)",
    "empresa",
    "Atendente de balcão, Auxiliar de padeiro",
    "(62) 99999-0000",
    "(62) 3333-0000",
    "contato@padariaexemplo.com.br",
    "Vaga vista no Instagram",
  ],
  ["Agência Exemplo RH (apague esta linha)", "agencia", "Auxiliar de limpeza", "(62) 98888-0000", "", "", ""],
  [
    "João Eletricista (apague esta linha)",
    "prestador",
    "Eletricista, Instalação de chuveiro",
    "(62) 97777-0000",
    "",
    "",
    "",
  ],
];

/** Texto do modelo, com ";" (o Excel em português abre em colunas) e BOM (acentos certos). */
export function arquivoModelo() {
  return "﻿" + [COLUNAS_MODELO, ...EXEMPLOS].map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}

function celula(v: string) {
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Lê um CSV (";" ou ","), com aspas e quebras de linha dentro das aspas. */
export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const primeira = t.slice(0, t.search(/\r?\n|$/));
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) {
      linha.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += ch;
  }
  if (campo || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((c) => c.trim()));
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// nomes de coluna que também valem (planilhas feitas à mão)
const SINONIMOS: Record<string, (typeof COLUNAS_MODELO)[number]> = {
  empresa: "empresa",
  nome: "empresa",
  tipo: "tipo",
  vagas: "vagas",
  vaga: "vagas",
  cargos: "vagas",
  whatsapp: "whatsapp",
  celular: "whatsapp",
  telefones: "telefones",
  telefone: "telefones",
  fixo: "telefones",
  email: "email",
  "e-mail": "email",
  observacao: "observacao",
  observacoes: "observacao",
  obs: "observacao",
};

/** Só os dígitos, com DDD e sem o 55 do Brasil. Número que não fecha (10 ou 11 dígitos) não entra. */
export function limparTelefone(t: string) {
  let d = t.replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

const listaDeTelefones = (v: string) =>
  [
    ...new Set(
      v
        .split(/[,/|;]| e /)
        .map(limparTelefone)
        .filter((n): n is string => Boolean(n)),
    ),
  ].slice(0, 5);

/**
 * Transforma as linhas do arquivo em convites. Devolve também o que foi
 * ignorado e por quê, para a tela mostrar antes de importar.
 */
export function linhasParaConvites(linhas: string[][]): {
  convites: NovoConvite[];
  ignoradas: { linha: number; motivo: string }[];
  semCabecalho: boolean;
} {
  if (!linhas.length) return { convites: [], ignoradas: [], semCabecalho: true };
  const cab = linhas[0].map((c) => SINONIMOS[semAcento(c)] ?? null);
  if (!cab.includes("empresa")) return { convites: [], ignoradas: [], semCabecalho: true };
  const col = (l: string[], nome: (typeof COLUNAS_MODELO)[number]) => (l[cab.indexOf(nome)] ?? "").trim();

  const convites: NovoConvite[] = [];
  const ignoradas: { linha: number; motivo: string }[] = [];
  const vistos = new Set<string>();
  linhas.slice(1).forEach((l, i) => {
    const n = i + 2;
    const nome = col(l, "empresa").replace(/\s+/g, " ").slice(0, 120);
    if (nome.length < 2) return ignoradas.push({ linha: n, motivo: "sem o nome da empresa" });
    if (/apague esta linha/i.test(nome)) return ignoradas.push({ linha: n, motivo: "linha de exemplo do modelo" });
    if (vistos.has(semAcento(nome))) return ignoradas.push({ linha: n, motivo: `${nome} repetida no arquivo` });
    vistos.add(semAcento(nome));
    const email = col(l, "email").toLowerCase();
    const whatsapp = listaDeTelefones(col(l, "whatsapp"));
    const telefones = listaDeTelefones(col(l, "telefones")).filter((t) => !whatsapp.includes(t));
    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email.slice(0, 200) : null;
    if (!whatsapp.length && !telefones.length && !emailOk)
      return ignoradas.push({ linha: n, motivo: `${nome} sem WhatsApp, telefone ou e-mail que sirva` });
    convites.push({
      nome,
      tipo: /ag[eê]ncia|rh/i.test(col(l, "tipo"))
        ? "agencia"
        : /prestador|profissional|aut[oô]nomo|servi[cç]o/i.test(col(l, "tipo"))
          ? "prestador"
          : "empresa",
      vagas: [
        ...new Set(
          col(l, "vagas")
            .split(/[,|\n]/)
            .map((v) => v.trim().slice(0, 80))
            .filter(Boolean),
        ),
      ].slice(0, 20),
      whatsapp,
      telefones,
      email: emailOk,
      observacao: col(l, "observacao").slice(0, 500) || null,
    });
  });
  return { convites, ignoradas, semCabecalho: false };
}

// ---------------------------------------------------------------------------
// Mensagem do convite

export function formatarFone(n: string) {
  const ddd = n.slice(0, 2);
  const r = n.slice(2);
  return `(${ddd}) ${r.length === 9 ? `${r.slice(0, 5)}-${r.slice(5)}` : `${r.slice(0, 4)}-${r.slice(4)}`}`;
}

// cargo em minúsculas no meio da frase (siglas ficam: RH, TI)
const minusculo = (v: string) => v.replace(/\S+/g, (p) => (/^[A-Z]{2,}$/.test(p) ? p : p.toLowerCase()));
const juntar = (l: string[]) => (l.length < 2 ? l.join("") : `${l.slice(0, -1).join(", ")} e ${l.at(-1)}`);

// O texto muda um pouco de um convite para outro (a saudação, a apresentação, o pedido, a ordem dos
// pontos e a despedida), com o mesmo conteúdo: muitas mensagens idênticas para quem não tem o número
// pesam para o WhatsApp tratar como spam. A escolha sai do token do convite, então a mesma pessoa
// recebe sempre o mesmo texto (o "Copiar mensagem", o WhatsApp e o e-mail batem).

/** Um número de 0 a 2³² a partir do texto (FNV-1a): a mesma semente dá sempre a mesma escolha. */
function sorteio(semente: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < semente.length; i++) {
    h ^= semente.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Escolhe uma das opções pela semente e pela parte da mensagem (cada parte varia por conta própria). */
function escolher<T>(semente: string, parte: string, opcoes: readonly T[]): T {
  return opcoes[sorteio(`${semente}|${parte}`) % opcoes.length];
}

/** A mesma lista em outra ordem, sempre a mesma para a semente. */
function embaralhar<T>(semente: string, parte: string, lista: readonly T[]): T[] {
  return lista
    .map((item, i) => ({ item, n: sorteio(`${semente}|${parte}|${i}`) }))
    .sort((a, b) => a.n - b.n)
    .map((x) => x.item);
}

const DESPEDIDAS = [
  `Se não tiver interesse, é só responder "não" que eu não mando mais mensagens. Obrigado!`,
  `Se não fizer sentido para vocês, é só responder "não" que eu não mando mais nada. Obrigado!`,
  `Caso não tenha interesse, responda "não" e eu paro de mandar mensagens. Valeu!`,
  `Não quer receber? Responda "não" e eu não mando mais mensagens. Obrigado pela atenção!`,
] as const;

const ENTRAR = "(entra com o e-mail, sem senha)";

export function mensagemConvite(
  c: Pick<Convite, "nome" | "tipo" | "vagas"> & { token?: string },
  assinatura: string,
  link?: string | null,
  /** a vaga lida do anúncio já vem pronta no link */
  pronta = false,
) {
  const s = c.token || c.nome;
  const pedido = link
    ? pronta
      ? escolher(s, "pronta", [
          `Já deixei a vaga pronta no site. É só abrir, conferir e tocar em Publicar ${ENTRAR}:\n${link}`,
          `A vaga já está montada no site: falta só vocês conferirem e tocarem em Publicar ${ENTRAR}:\n${link}`,
          `Deixei tudo pronto. Abrindo o link, é só conferir a vaga e tocar em Publicar ${ENTRAR}:\n${link}`,
        ])
      : escolher(s, "link", [
          `Para publicar, é só abrir o link, escrever a vaga e tocar em Publicar ${ENTRAR}:\n${link}`,
          `É rapidinho: abra o link, escreva a vaga e toque em Publicar ${ENTRAR}:\n${link}`,
        ])
    : null;
  const vagas = juntar(c.vagas.map(minusculo));
  const essa = c.vagas.length > 1 ? "essas vagas" : "essa vaga";
  const quem = assinatura.trim() ? `Sou ${assinatura.trim()}, do Publike` : "Aqui é do Publike";
  const apresenta = escolher(s, "apresenta", [
    `${quem} (publike.org), um site gratuito de vagas e serviços de ${ONDE_FUNCIONA}.`,
    `${quem}. O Publike (publike.org) é um site gratuito de vagas e serviços de ${ONDE_FUNCIONA}.`,
    `${quem} (publike.org), um site de vagas e serviços de ${ONDE_FUNCIONA}, sem custo nenhum.`,
  ]);
  const ola = escolher(s, "ola", ["Olá", "Oi"]);
  const tudo = escolher(s, "tudo", ["Tudo bem?", "Tudo certo?", "Como vão?"]);
  const abre = `${ola}, ${escolher(s, "pessoal", ["pessoal", "equipe"])} da ${c.nome}! ${tudo} ${apresenta}`;
  const fecha = escolher(s, "fecha", DESPEDIDAS);
  const pontos = (lista: string[][]) =>
    embaralhar(
      s,
      "pontos",
      lista.map((opcoes, i) => `• ${escolher(s, `ponto${i}`, opcoes)}`),
    ).join("\n");
  if (c.tipo === "prestador") {
    // profissional: a vitrine de serviços (quem disse "pode", o admin monta e manda o acesso)
    const servicos = juntar(c.vagas.map(minusculo));
    return [
      // para uma pessoa só: sem o "Como vão?"
      `${ola}, ${c.nome}! ${escolher(s, "tudo", ["Tudo bem?", "Tudo certo?"])} ${apresenta}`,
      servicos
        ? escolher(s, "pede", [
            `Vi que você faz ${servicos}. Posso montar a sua vitrine de serviços no Publike, sem custo? Quem precisa de ${minusculo(c.vagas[0])} perto de você te encontra pelo site e chama no WhatsApp.`,
            `Vi que você trabalha com ${servicos}. Quer que eu monte a sua vitrine no Publike, de graça? Quem procura ${minusculo(c.vagas[0])} perto de você te acha pelo site e chama no WhatsApp.`,
          ])
        : "Posso montar a sua vitrine de serviços no Publike, sem custo? Quem precisa do seu serviço perto de você te encontra pelo site e chama no WhatsApp.",
      pontos([
        ["É grátis: sem plano, sem taxa e sem comissão.", "Não custa nada: sem plano, sem taxa e sem comissão."],
        [
          "Você aparece primeiro para quem mora perto de onde você atende.",
          "Quem mora perto de onde você atende vê você primeiro.",
        ],
        ["Seu WhatsApp só aparece para quem você aceitar.", "O seu WhatsApp só aparece para quem você aceitar."],
      ]),
      link
        ? pronta
          ? `Já deixei a sua vitrine pronta no site. É só abrir, conferir e tocar em Salvar ${ENTRAR}:\n${link}`
          : `Para aparecer, é só abrir o link, escrever o seu serviço e tocar em Salvar ${ENTRAR}:\n${link}`
        : `Se quiser, é só responder "pode" e me dizer o bairro onde você atende. Eu monto a vitrine e te mando o link para entrar e conferir.`,
      fecha,
    ].join("\n\n");
  }
  if (c.tipo === "agencia") {
    return [
      abre,
      vagas
        ? escolher(s, "pede", [
            `Vi que vocês estão com vaga de ${vagas}. Posso publicar ${essa} no Publike em nome da agência, sem custo?`,
            `Vi o anúncio de ${vagas} de vocês. Querem que eu publique ${essa} no Publike em nome da agência? É sem custo.`,
          ])
        : "Posso publicar as vagas de vocês no Publike em nome da agência, sem custo?",
      pontos([
        [
          `Não concorremos com agências: a vaga sai com o nome de vocês e o selo "Vaga de agência".`,
          `O Publike não concorre com agências: a vaga sai com o nome de vocês e o selo "Vaga de agência".`,
        ],
        [
          "Quando vocês aceitam um candidato, ele recebe o WhatsApp e o e-mail da agência, nunca os do cliente. O cliente pode aparecer como empresa confidencial.",
          "O candidato aceito recebe o WhatsApp e o e-mail da agência, nunca os do cliente, que pode aparecer como empresa confidencial.",
        ],
        ["É grátis: sem plano e sem taxa por candidato.", "Não custa nada: sem plano e sem taxa por candidato."],
      ]),
      pedido ??
        `Se puder, responda "pode publicar" e me diga qual WhatsApp e qual e-mail devem aparecer nas vagas. Eu cadastro e mando o acesso para vocês acompanharem.`,
      fecha,
    ].join("\n\n");
  }
  return [
    abre,
    vagas
      ? escolher(s, "pede", [
          `Vi que vocês estão contratando ${vagas}. Posso publicar ${essa} no Publike, sem custo, para mais gente da região ficar sabendo?`,
          `Vi o anúncio de ${vagas} de vocês. Posso divulgar ${essa} no Publike, de graça, para chegar a mais gente da região?`,
          `Soube que vocês procuram ${vagas}. Querem que eu publique ${essa} no Publike? É sem custo e mais gente da região fica sabendo.`,
        ])
      : "Posso publicar as vagas de vocês no Publike, sem custo, para mais gente da região ficar sabendo?",
    pontos([
      [
        "É grátis para a empresa e para o candidato: sem plano e sem taxa.",
        "Não custa nada, nem para a empresa nem para o candidato: sem plano e sem taxa.",
      ],
      [
        "Não somos agência: quem se interessa curte a vaga, e vocês decidem com quem conversar. Ao aceitar, o contato é direto com vocês.",
        "Não somos agência: quem tem interesse curte a vaga e vocês escolhem com quem conversar. Aceitou, o contato é direto com vocês.",
      ],
      [
        "A vaga aparece primeiro para quem mora perto, com a distância e o tempo de ônibus até a empresa.",
        "Quem mora perto vê a vaga primeiro, com a distância e o tempo de ônibus até a empresa.",
      ],
    ]),
    pedido ??
      `Se puder, responda "pode publicar" e me diga qual WhatsApp ou e-mail deve receber os candidatos. Eu cadastro e mando o acesso para vocês acompanharem.`,
    fecha,
  ].join("\n\n");
}

/**
 * Uma mensagem só para várias empresas com o mesmo WhatsApp (uma agência ou um grupo que anuncia
 * com nomes diferentes): cada vaga com o seu link, e cada link vale o aceite daquela empresa.
 */
export function mensagemConviteAgrupada(
  lista: Pick<Convite, "nome" | "tipo" | "vagas" | "token" | "rascunho">[],
  assinatura: string,
  site: string,
) {
  const s = lista.map((c) => c.token).join("|");
  const quem = assinatura.trim() ? `Sou ${assinatura.trim()}, do Publike` : "Aqui é do Publike";
  const agencia = lista.some((c) => c.tipo === "agencia");
  const itens = lista
    .map((c) => {
      const vagas = juntar(c.vagas.map(minusculo));
      return `• ${c.nome}${vagas ? ` (${vagas})` : ""}:\n${linkDoConvite(site, c.token)}`;
    })
    .join("\n\n");
  return [
    `${escolher(s, "ola", ["Olá", "Oi"])}! ${escolher(s, "tudo", ["Tudo bem?", "Tudo certo?", "Como vão?"])} ${quem} (publike.org), um site gratuito de vagas e serviços de ${ONDE_FUNCIONA}.`,
    escolher(s, "pede", [
      `Vi que vocês estão com vagas abertas. Posso publicar no Publike, sem custo? Já deixei cada uma pronta no site: é só abrir o link, conferir e tocar em Publicar ${ENTRAR}.`,
      `Vi as vagas abertas de vocês. Querem que eu publique no Publike? É sem custo, e cada uma já está pronta no site: é só abrir o link, conferir e tocar em Publicar ${ENTRAR}.`,
    ]),
    itens,
    agencia
      ? `• Não concorremos com agências: a vaga sai com o nome de vocês e o selo "Vaga de agência".\n• É grátis: sem plano e sem taxa por candidato.`
      : `• É grátis para a empresa e para o candidato: sem plano e sem taxa.\n• A vaga aparece primeiro para quem mora perto, com a distância e o tempo de ônibus.`,
    escolher(s, "fecha", DESPEDIDAS),
  ].join("\n\n");
}

/**
 * O e-mail do convite (o mesmo da prévia no admin e do que sai pelo Publike): assunto, texto e
 * HTML, com o link da vaga como botão "Conferir e publicar a vaga".
 */
export function emailDoConvite(
  c: Pick<Convite, "nome" | "tipo" | "vagas" | "token" | "rascunho">,
  assinatura: string,
  site: string,
) {
  const link = linkDoConvite(site, c.token, c.tipo);
  const texto = mensagemConvite(c, assinatura.slice(0, 40), link, Boolean(c.rascunho));
  const botao = c.tipo === "prestador" ? "Conferir e salvar a vitrine" : "Conferir e publicar a vaga";
  const paragrafo = (t: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;">${escaparHtml(t).replace(/\n/g, "<br>")}</p>`;
  const corpo = texto
    .split("\n\n")
    .map((p) =>
      p.includes(link)
        ? paragrafo(p.replace(link, "").trim()) +
          `<p style="margin:-6px 0 20px;"><a href="${escaparHtml(link)}" style="display:inline-block;padding:12px 20px;background:#c2410c;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">${botao}</a></p>`
        : paragrafo(p),
    )
    .join("");
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1f1a14;max-width:560px;">${corpo}</div>`;
  return { assunto: assuntoConvite(c), texto, html };
}

export function assuntoConvite(c: Pick<Convite, "vagas" | "tipo">) {
  if (c.tipo === "prestador")
    return c.vagas.length
      ? `${c.vagas[0]}: sua vitrine de serviços grátis no Publike`
      : "Sua vitrine de serviços grátis no Publike";
  return c.vagas.length
    ? `Vaga de ${minusculo(c.vagas[0])}: divulgação grátis no Publike`
    : "Divulgação grátis das suas vagas no Publike";
}
