// Convites às empresas (admin): a lista, o arquivo modelo e a mensagem do convite.

import {
  CNHS,
  LISTA_REGIMES,
  LISTA_UNIDADES,
  SLUGS_CATEGORIAS,
  SLUGS_OFICIOS,
  VALORES_BENEFICIO,
  VALORES_ESCOLARIDADE,
  VALORES_EXPERIENCIA,
  VALORES_JORNADA,
  VALORES_MODELO,
  VALORES_PCD,
} from "./constantes";
import { LIMITES_EXTRA, lerBeneficiosExtras, lerGanhosExtras, lerHorario, type GanhoExtra, type HorarioDetalhe } from "./vaga-extra";
import { escaparHtml } from "./email/montar";
import { paginaDeVagasDaGupy } from "./gupy";
import { ONDE_FUNCIONA } from "@/lib/pracas";
import { WHATSAPP_OFICIAL } from "@/lib/whatsapp-oficial";
import { emailValido } from "@/lib/email-valido";

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

/**
 * A mensagem do convite (migração 20270724120000): publicar pelo Publike (a de sempre), divulgar as vagas que a
 * empresa já tem na Gupy ou no site dela, com a candidatura lá (`site`), ou retomar a conversa com quem já foi chamado.
 */
export const MENSAGENS_CONVITE = ["publike", "site", "retomar"] as const;
export type MensagemConvite = (typeof MENSAGENS_CONVITE)[number];

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
  /** por onde saiu (migração 20270913120000): o e-mail marca sozinho; o Enviei à mão, o WhatsApp */
  enviada_por?: "whatsapp" | "email" | null;
  usuario_id: string | null;
  criado_em: string;
  /** o link do convite: /publicar?convite=<token> */
  token: string;
  /** a vaga lida da imagem do anúncio, que vem pronta no formulário de publicar */
  rascunho: RascunhoConvite | null;
  origem: "arquivo" | "imagem" | "receita" | null;
  /** quando a empresa publicou pela página do convite */
  aceite_em: string | null;
  anuncio_id: string | null;
  /** a página de vagas da empresa (a Gupy ou outro site); sem a migração 20270724120000, não vem */
  link_vagas?: string | null;
  /** a mensagem escolhida no cartão; vazia, vale a sugerida (`mensagemDoConvite`) */
  mensagem?: MensagemConvite | null;
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
  /**
   * O resto que a leitura da vaga acha (19/11/2026, src/lib/ia/ler-vagas.ts), pronto para o formulário. Só vem o
   * que o anúncio diz; os convites de antes não têm.
   */
  beneficios_extras?: string[];
  ganhos_extras?: GanhoExtra[];
  escolaridade_minima?: string;
  experiencia?: string;
  cnh?: string;
  jornada?: string;
  modelo?: string;
  pcd?: string;
  horario_detalhe?: HorarioDetalhe;
  comeca_ja?: boolean;
  /** a empresa que contrata, quando é uma agência que anuncia */
  contratante?: string;
  /** o que a empresa precisa conferir (o que não estava no anúncio, o que ficou de fora) */
  conferir?: string[];
  /**
   * O lugar de fora de onde o Publike funciona (25/11/2026, src/lib/fora-da-regiao.ts): "Barueri (SP)". A vaga não é
   * publicada pelo WhatsApp, e o site avisa.
   */
  fora?: string;
};

/** O que vem de uma linha do arquivo (ou do formulário), já limpo. */
export type NovoConvite = Pick<
  Convite,
  "nome" | "tipo" | "vagas" | "whatsapp" | "telefones" | "email" | "observacao"
> & {
  rascunho?: RascunhoConvite | null;
  origem?: "arquivo" | "imagem";
  /** a página de vagas da empresa (coluna link_vagas do arquivo) */
  link_vagas?: string | null;
  /** quem já foi chamado (colunas situacao e enviado_em do arquivo) */
  status?: StatusConvite;
  enviada_em?: string | null;
};

/**
 * A página de vagas da empresa, limpa: a da Gupy vira https://empresa.gupy.io/ (mesmo vindo o link de uma vaga);
 * de outro site, o endereço como veio (só http e https, com ponto no nome, até 300 letras).
 */
export function linkDasVagas(link: string | null | undefined): string | null {
  const bruto = (link ?? "").trim();
  if (!bruto) return null;
  const gupy = paginaDeVagasDaGupy(bruto);
  if (gupy) return gupy;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(bruto) ? bruto : `https://${bruto}`);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname.includes(".")) return null;
    const limpo = u.toString();
    return limpo.length <= 300 && !/\s/.test(limpo) ? limpo : null;
  } catch {
    return null;
  }
}

/** As vagas da empresa estão na Gupy: o "Puxar do link da Gupy" lê a página e publica todas de uma vez. */
export const vagasNaGupy = (c: Pick<Convite, "link_vagas">) => Boolean(paginaDeVagasDaGupy(c.link_vagas));

/** As mensagens que o convite pode usar: a das vagas no site só com o link (e nunca para o prestador). */
export function mensagensDoConvite(c: Pick<Convite, "tipo" | "link_vagas">): MensagemConvite[] {
  return c.tipo !== "prestador" && c.link_vagas ? ["publike", "site", "retomar"] : ["publike", "retomar"];
}

/** O nome da mensagem na escolha do cartão. */
export function nomeDaMensagem(qual: MensagemConvite, c: Pick<Convite, "tipo" | "link_vagas">) {
  if (qual === "site") return vagasNaGupy(c) ? "Vagas da Gupy" : "Vagas no site da empresa";
  if (qual === "retomar") return "Retomar a conversa";
  return c.tipo === "prestador" ? "Vitrine no Publike" : "Pelo Publike";
}

/**
 * A mensagem que vale: a escolhida no cartão ou a sugerida. Já chamado (Enviei): retomar a conversa; com o link das
 * vagas: divulgar as vagas que estão lá; senão, a de sempre.
 */
export function mensagemDoConvite(
  c: Pick<Convite, "tipo" | "status"> & { link_vagas?: string | null; mensagem?: MensagemConvite | null },
): MensagemConvite {
  const opcoes = mensagensDoConvite(c);
  if (c.mensagem && opcoes.includes(c.mensagem)) return c.mensagem;
  if (c.status === "enviada") return "retomar";
  return opcoes.includes("site") ? "site" : "publike";
}

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
    ...extrasDoRascunho(o),
  };
}

/** Os campos a mais do rascunho (`RascunhoConvite`): só os que vieram e valem. */
function extrasDoRascunho(o: Record<string, unknown>): Partial<RascunhoConvite> {
  const r: Partial<RascunhoConvite> = {};
  const um = (k: string, valores: readonly string[]) =>
    typeof o[k] === "string" && valores.includes(o[k] as string) ? (o[k] as string) : null;
  const escolaridade = um("escolaridade_minima", VALORES_ESCOLARIDADE);
  if (escolaridade) r.escolaridade_minima = escolaridade;
  const experiencia = um("experiencia", VALORES_EXPERIENCIA);
  if (experiencia) r.experiencia = experiencia;
  const cnh = um("cnh", CNHS);
  if (cnh) r.cnh = cnh;
  const jornada = um("jornada", VALORES_JORNADA);
  if (jornada) r.jornada = jornada;
  const modelo = um("modelo", VALORES_MODELO);
  if (modelo) r.modelo = modelo;
  const pcd = um("pcd", VALORES_PCD);
  if (pcd) r.pcd = pcd;
  if (o.comeca_ja === true) r.comeca_ja = true;
  // o que passa do tamanho fica de fora (em vez de recusar o rascunho inteiro)
  if (Array.isArray(o.beneficios_extras)) {
    const b = lerBeneficiosExtras(
      o.beneficios_extras
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.replace(/\s+/g, " ").trim())
        .filter((x) => x.length >= 2 && x.length <= LIMITES_EXTRA.nomeBeneficio)
        .slice(0, LIMITES_EXTRA.beneficiosExtras),
    );
    if (b.ok && b.lista.length) r.beneficios_extras = b.lista;
  }
  if (Array.isArray(o.ganhos_extras) && o.ganhos_extras.length) {
    const g = lerGanhosExtras(
      o.ganhos_extras
        .map((x) => (x ?? {}) as Record<string, unknown>)
        .map((x) => ({
          nome: typeof x.nome === "string" ? x.nome.replace(/\s+/g, " ").trim() : "",
          detalhe: typeof x.detalhe === "string" ? x.detalhe.replace(/\s+/g, " ").trim().slice(0, LIMITES_EXTRA.detalheGanho) : "",
        }))
        .filter((x) => x.nome.length >= 2 && x.nome.length <= LIMITES_EXTRA.nomeGanho)
        .slice(0, LIMITES_EXTRA.ganhos),
    );
    if (g.ok && g.lista.length) r.ganhos_extras = g.lista;
  }
  if (o.horario_detalhe && typeof o.horario_detalhe === "object") {
    const h = lerHorario(o.horario_detalhe);
    if (h.ok && h.horario && (h.horario.escala || h.horario.dias.length || h.horario.turnos.length || h.horario.obs))
      r.horario_detalhe = h.horario;
  }
  if (typeof o.contratante === "string") {
    const c = o.contratante.replace(/\s+/g, " ").trim().slice(0, 80);
    if (c.length >= 2) r.contratante = c;
  }
  if (typeof o.fora === "string") {
    const f = o.fora.replace(/\s+/g, " ").trim().slice(0, 80);
    if (f.length >= 2) r.fora = f;
  }
  if (Array.isArray(o.conferir)) {
    const lista = o.conferir
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.replace(/\s+/g, " ").trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, 6);
    if (lista.length) r.conferir = lista;
  }
  return r;
}

/** O link que vai na mensagem: a empresa confere a vaga e publica (é o aceite). */
export function linkDoConvite(site: string, token: string, tipo: TipoConvite = "empresa") {
  const raiz = site.replace(/\/+$/, "");
  // prestador: a página do convite mostra a vitrine pronta e leva para entrar e salvar
  return tipo === "prestador" ? `${raiz}/convite/${token}` : `${raiz}/publicar?convite=${token}`;
}

// ---------------------------------------------------------------------------
// Arquivo modelo (CSV, abre no Excel e no Google Planilhas)

export const COLUNAS_MODELO = [
  "empresa",
  "tipo",
  "vagas",
  "whatsapp",
  "telefones",
  "email",
  "observacao",
  "link_vagas",
] as const;
// colunas que também valem, fora do modelo: quem já foi chamado (a situação e o dia)
type Coluna = (typeof COLUNAS_MODELO)[number] | "situacao" | "enviado_em";

const EXEMPLOS = [
  [
    "Padaria Exemplo (apague esta linha)",
    "empresa",
    "Atendente de balcão, Auxiliar de padeiro",
    "(62) 99999-0000",
    "(62) 3333-0000",
    "contato@padariaexemplo.com.br",
    "Vaga vista no Instagram",
    "",
  ],
  [
    "Indústria Exemplo (apague esta linha)",
    "empresa",
    "Auxiliar de produção",
    "(62) 99999-1111",
    "",
    "",
    "Vagas na Gupy",
    "https://industriaexemplo.gupy.io",
  ],
  ["Agência Exemplo RH (apague esta linha)", "agencia", "Auxiliar de limpeza", "(62) 98888-0000", "", "", "", ""],
  [
    "João Eletricista (apague esta linha)",
    "prestador",
    "Eletricista, Instalação de chuveiro",
    "(62) 97777-0000",
    "",
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
const SINONIMOS: Record<string, Coluna> = {
  link_vagas: "link_vagas",
  "link das vagas": "link_vagas",
  "pagina de vagas": "link_vagas",
  "site de vagas": "link_vagas",
  gupy: "link_vagas",
  situacao: "situacao",
  status: "situacao",
  andamento: "situacao",
  enviado_em: "enviado_em",
  enviada_em: "enviado_em",
  "enviado em": "enviado_em",
  "contatado em": "enviado_em",
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
  const col = (l: string[], nome: Coluna) => (cab.includes(nome) ? (l[cab.indexOf(nome)] ?? "").trim() : "");

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
    const emailOk = emailValido(email) ? email.trim().slice(0, 200) : null;
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
      link_vagas: linkDasVagas(col(l, "link_vagas")),
      ...situacaoDoArquivo(col(l, "situacao"), col(l, "enviado_em")),
    });
  });
  return { convites, ignoradas, semCabecalho: false };
}

/**
 * A situação de quem já foi chamado, das colunas situacao ("Enviei", "Contatado"...) e enviado_em (25/11/2026 ou
 * 2026-11-25). Sem a coluna, ou com um texto que não diz nada, o convite entra como A enviar.
 */
function situacaoDoArquivo(situacao: string, dia: string): { status?: StatusConvite; enviada_em?: string | null } {
  const t = semAcento(situacao);
  let status: StatusConvite | null = null;
  if (!t) status = null;
  else if (/^a (enviar|contatar)/.test(t)) status = "a_enviar";
  else if (/contato nao serve|sem contato|numero errado/.test(t)) status = "sem_contato";
  else if (/nao quis|recus|sem interesse/.test(t)) status = "recusou";
  else if (/autoriz|publicou/.test(t)) status = "autorizou";
  else if (/envi|contatad|chamad|mandei/.test(t)) status = "enviada";
  if (!status) return {};
  return { status, enviada_em: status === "a_enviar" ? null : diaDoArquivo(dia) };
}

/** O dia do arquivo (25/11/2026, 25/11/26 ou 2026-11-25) como data e hora, ao meio-dia de Brasília; nunca no futuro. */
function diaDoArquivo(dia: string): string | null {
  const t = dia.trim();
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const partes = br
    ? [br[3].length === 2 ? `20${br[3]}` : br[3], br[2], br[1]]
    : iso
      ? [iso[1], iso[2], iso[3]]
      : null;
  if (!partes) return null;
  const [a, m, d] = partes;
  const quando = new Date(`${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T12:00:00-03:00`);
  const ms = quando.getTime();
  if (!Number.isFinite(ms) || ms > Date.now() + 864e5 || quando.getUTCFullYear() < 2020) return null;
  // 31/02 vira 03/03 no Date: confere se o dia é o mesmo
  if (quando.getUTCDate() !== Number(d)) return null;
  return quando.toISOString();
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

// o pedido das vagas no site: a empresa só responde, e a equipe publica (Admin › Convites › Publicar as vagas por ela)
const PEDIR_SIM = [
  `Podemos divulgar? É só responder "sim" que a gente cuida do resto.`,
  `Topam? Respondam "sim" por aqui que a gente publica as vagas de vocês.`,
  `Querem que a gente divulgue? Basta responder "sim".`,
] as const;

// o outro jeito de publicar (21/11/2026, Marcelo): mandar o anúncio para o WhatsApp do Publike, que devolve a vaga pronta
// (Publicar pelo WhatsApp, migração 20270806120000)
const PELO_WHATSAPP = [
  `Se preferir, mandem a foto do anúncio, o PDF ou o texto da vaga para o WhatsApp do Publike, ${WHATSAPP_OFICIAL.exibicao}: a vaga volta pronta para vocês conferirem e publicarem.`,
  `Outro jeito: mandem a foto ou o texto do anúncio para o WhatsApp do Publike, ${WHATSAPP_OFICIAL.exibicao}, que a vaga volta pronta para conferir e publicar.`,
] as const;

/** Até duas vagas no meio da frase, em minúsculas; com mais, "e outras". */
function vagasDoTexto(vagas: string[]) {
  const l = vagas.map(minusculo);
  return l.length <= 2 ? juntar(l) : `${l.slice(0, 2).join(", ")} e outras`;
}

/** 04/11, no horário de Brasília (o dia em que o convite foi enviado). */
function diaEMes(iso: string | null | undefined) {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms)
    ? new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })
    : null;
}

/** O fim do convite da base da Receita: de onde veio o contato e o link para não receber mais. */
export function rodapeDaReceita(link: string, token: string) {
  let raiz = "https://publike.org";
  try {
    raiz = new URL(link).origin;
  } catch {
    // link relativo: fica o endereço do site
  }
  return `Achamos o contato de vocês nos dados abertos do CNPJ da Receita Federal. Se não quiserem receber mais mensagens do Publike: ${raiz}/convite/${token}/sair`;
}

export function mensagemConvite(
  c: Pick<Convite, "nome" | "tipo" | "vagas"> & {
    token?: string;
    origem?: Convite["origem"];
    link_vagas?: string | null;
    enviada_em?: string | null;
  },
  assinatura: string,
  /** o convite sempre leva o link: a própria empresa publica (o admin publicar por ela é o último recurso) */
  link: string,
  /** a vaga lida do anúncio já vem pronta no link */
  pronta = false,
  /** qual mensagem (`mensagemDoConvite`): a de sempre, a das vagas no site da empresa ou a de retomar */
  qual: MensagemConvite = "publike",
) {
  const s = c.token || c.nome;
  const pedido = pronta
    ? escolher(s, "pronta", [
        `Para adiantar, já deixei a vaga escrita com o que vi no anúncio. Vocês abrem o link, conferem, mudam o que quiserem e tocam em Publicar ${ENTRAR}:\n${link}`,
        `A vaga já está escrita no site com o que vi no anúncio: vocês só conferem, ajustam se precisar e tocam em Publicar ${ENTRAR}:\n${link}`,
        `Deixei a vaga escrita para vocês. Abrindo o link, é só conferir, ajustar o que quiserem e tocar em Publicar ${ENTRAR}:\n${link}`,
      ])
    : escolher(s, "link", [
        `Vocês mesmos publicam em 2 minutos: abram o link, escrevam a vaga e toquem em Publicar ${ENTRAR}:\n${link}`,
        `É rapidinho e vocês mesmos fazem: abram o link, escrevam a vaga e toquem em Publicar ${ENTRAR}:\n${link}`,
      ]);
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
  const daReceita = c.origem === "receita";
  // o contato veio dos dados abertos do CNPJ: o convite diz de onde e traz o "não quero receber"
  const sair = daReceita && c.token ? rodapeDaReceita(link, c.token) : null;
  const fecha = [escolher(s, "fecha", DESPEDIDAS), sair].filter(Boolean).join("\n\n");
  const pontos = (lista: string[][]) =>
    embaralhar(
      s,
      "pontos",
      lista.map((opcoes, i) => `• ${escolher(s, `ponto${i}`, opcoes)}`),
    ).join("\n");
  const gupy = vagasNaGupy(c);
  // as vagas que a empresa já tem na Gupy (ou no site dela): a candidatura continua lá, e a equipe publica
  if (qual === "site" && c.tipo !== "prestador" && c.link_vagas) {
    const pela = gupy ? "pela Gupy" : "pelo site de vocês";
    const la = gupy ? "na Gupy de vocês" : "no site de vocês";
    const lista = vagasDoTexto(c.vagas);
    return [
      abre,
      lista
        ? escolher(s, "site", [
            `Vi que vocês estão contratando ${lista} ${pela}. Dá para divulgar ${essa} no Publike também, de graça, sem mudar nada no processo de vocês.`,
            `Vi que vocês estão com vaga de ${lista} ${pela}. Que tal divulgar no Publike também? É de graça, e o processo de vocês continua o mesmo.`,
          ])
        : `Vi que vocês estão com vagas abertas ${pela}. Dá para divulgar no Publike também, de graça, sem mudar nada no processo de vocês.`,
      pontos([
        [
          `Quem se candidatar pelo Publike cai direto ${la}: o botão da vaga leva para a página dela lá.`,
          `O botão de candidatura leva direto para a vaga ${la}, então os candidatos chegam no processo que vocês já usam.`,
        ],
        [
          "Vocês não precisam criar conta nem cadastrar nada: a gente publica por vocês.",
          "Não precisa criar conta nem publicar de novo: a gente cuida disso.",
        ],
        ...(gupy
          ? [["Quando a vaga fecha na Gupy, ela sai do Publike sozinha.", "A vaga que fecha na Gupy sai do Publike sozinha."]]
          : []),
        [
          "A vaga aparece primeiro para quem mora perto, com a distância e o tempo de ônibus até a empresa.",
          "Quem mora perto vê a vaga primeiro, com a distância e o tempo de ônibus até a empresa.",
        ],
      ]),
      escolher(s, "sim", PEDIR_SIM),
      fecha,
    ].join("\n\n");
  }
  // quem já foi chamado e não respondeu: mais curta, com o dia do primeiro convite e a novidade das vagas no site
  if (qual === "retomar") {
    const dia = diaEMes(c.enviada_em);
    const quando = dia ? `no dia ${dia}` : "há uns dias";
    const tudoCurto = escolher(s, "tudo", ["Tudo bem?", "Tudo certo?"]);
    if (c.tipo === "prestador") {
      return [
        `${ola}, ${c.nome}! ${tudoCurto} ${quem}.`,
        `Mandei uma mensagem ${quando} sobre a sua vitrine de serviços no Publike, de graça. Conseguiu ver? O link continua valendo ${ENTRAR}:\n${link}`,
        fecha,
      ].join("\n\n");
    }
    const oi = `${ola}, ${escolher(s, "pessoal", ["pessoal", "equipe"])} da ${c.nome}! ${tudoCurto} ${quem}.`;
    if (c.link_vagas) {
      return [
        oi,
        `Falei com vocês ${quando} sobre as vagas. Uma novidade: agora dá para divulgar no Publike as vagas que vocês já têm ${gupy ? "na Gupy" : "no site de vocês"}, com o botão de candidatura levando direto ${gupy ? "para a Gupy de vocês" : "para o site de vocês"}. O processo continua o mesmo, é de graça e vocês não precisam criar conta.`,
        escolher(s, "sim", PEDIR_SIM),
        fecha,
      ].join("\n\n");
    }
    return [
      oi,
      escolher(s, "retoma", [
        `Mandei uma mensagem ${quando} sobre publicar as vagas de vocês no Publike, de graça. Conseguiram ver?`,
        `Escrevi para vocês ${quando} sobre divulgar as vagas no Publike, sem custo. Deu para ver?`,
      ]),
      pedido,
      escolher(s, "whatsapp", PELO_WHATSAPP),
      fecha,
    ].join("\n\n");
  }
  if (c.tipo === "prestador") {
    // profissional: a vitrine de serviços, que ele mesmo salva pelo link
    const servicos = juntar(c.vagas.map(minusculo));
    return [
      // para uma pessoa só: sem o "Como vão?"
      `${ola}, ${c.nome}! ${escolher(s, "tudo", ["Tudo bem?", "Tudo certo?"])} ${apresenta}`,
      servicos
        ? escolher(s, "pede", [
            `Vi que você faz ${servicos}. Você pode montar a sua vitrine de serviços no Publike, sem custo: quem precisa de ${minusculo(c.vagas[0])} perto de você te encontra pelo site e chama no WhatsApp.`,
            `Vi que você trabalha com ${servicos}. Que tal montar a sua vitrine no Publike? É de graça, e quem procura ${minusculo(c.vagas[0])} perto de você te acha pelo site e chama no WhatsApp.`,
          ])
        : "Você pode montar a sua vitrine de serviços no Publike, sem custo: quem precisa do seu serviço perto de você te encontra pelo site e chama no WhatsApp.",
      pontos([
        ["É grátis: sem plano, sem taxa e sem comissão.", "Não custa nada: sem plano, sem taxa e sem comissão."],
        [
          "Você aparece primeiro para quem mora perto de onde você atende.",
          "Quem mora perto de onde você atende vê você primeiro.",
        ],
        ["Seu WhatsApp só aparece para quem você aceitar.", "O seu WhatsApp só aparece para quem você aceitar."],
      ]),
      pronta
        ? `Para adiantar, já deixei a sua vitrine escrita. Você abre o link, confere, muda o que quiser e toca em Salvar ${ENTRAR}:\n${link}`
        : `Você mesmo monta em 2 minutos: abra o link, escreva o seu serviço e toque em Salvar ${ENTRAR}:\n${link}`,
      fecha,
    ].join("\n\n");
  }
  if (c.tipo === "agencia") {
    return [
      abre,
      vagas
        ? escolher(s, "pede", [
            `Vi que vocês estão com vaga de ${vagas}. Vocês podem publicar ${essa} no Publike em nome da agência, sem custo.`,
            `Vi o anúncio de ${vagas} de vocês. Que tal publicar ${essa} no Publike em nome da agência? É sem custo.`,
          ])
        : "Vocês podem publicar as vagas de vocês no Publike em nome da agência, sem custo.",
      pontos([
        [
          `Não concorremos com agências: a vaga sai com o nome de vocês e o selo "Vaga de agência".`,
          `O Publike não concorre com agências: a vaga sai com o nome de vocês e o selo "Vaga de agência".`,
        ],
        [
          // 24/11/2026: a agência perguntou "vocês divulgam com nosso número? pras pessoas chegarem no nosso WhatsApp"
          "Os candidatos chegam no WhatsApp de vocês: quem curte a vaga e é aceito recebe o WhatsApp da agência e chama direto (nunca o do cliente, que pode aparecer como empresa confidencial). Com o Contato direto, já chama sem esperar o aceite.",
          "O candidato chega no WhatsApp de vocês: quando vocês aceitam, ele recebe o número da agência e chama direto, nunca o do cliente (que pode aparecer como empresa confidencial). Com o Contato direto, nem precisa esperar o aceite.",
        ],
        ["É grátis: sem plano e sem taxa por candidato.", "Não custa nada: sem plano e sem taxa por candidato."],
      ]),
      pedido,
      escolher(s, "whatsapp", PELO_WHATSAPP),
      fecha,
    ].join("\n\n");
  }
  return [
    abre,
    daReceita
      ? // a empresa da base da Receita: nunca dizer que está contratando (claude/plano-base-de-empresas-da-receita.md)
        `Vi que vocês abriram há pouco. Quando precisarem contratar${vagas ? ` (${vagas}, por exemplo)` : ""}, publiquem a vaga no Publike: é de graça e quem mora perto fica sabendo.`
      : vagas
      ? escolher(s, "pede", [
          `Vi que vocês estão contratando ${vagas}. Vocês podem publicar ${essa} no Publike, de graça, e receber os candidatos direto, sem intermediário.`,
          `Vi o anúncio de ${vagas} de vocês. Que tal publicar ${essa} no Publike? É de graça, leva 2 minutos e mais gente da região fica sabendo.`,
          `Soube que vocês procuram ${vagas}. Publiquem ${essa} no Publike: é sem custo e chega a mais gente da região.`,
        ])
      : "Vocês podem publicar as vagas de vocês no Publike, de graça, e receber os candidatos direto.",
    pontos([
      [
        "É grátis para a empresa e para o candidato: sem plano e sem taxa.",
        "Não custa nada, nem para a empresa nem para o candidato: sem plano e sem taxa.",
      ],
      [
        "Não somos agência: a vaga fica na conta de vocês. Quem se interessa curte, e vocês decidem com quem conversar. Ao aceitar, o contato é direto.",
        "Não somos agência: vocês cuidam da vaga pela própria conta. Quem tem interesse curte e vocês escolhem com quem conversar.",
      ],
      [
        "A vaga aparece primeiro para quem mora perto, com a distância e o tempo de ônibus até a empresa.",
        "Quem mora perto vê a vaga primeiro, com a distância e o tempo de ônibus até a empresa.",
      ],
    ]),
    pedido,
    escolher(s, "whatsapp", PELO_WHATSAPP),
    fecha,
  ].join("\n\n");
}

/**
 * Uma mensagem só para várias empresas com o mesmo WhatsApp (uma agência ou um grupo que anuncia
 * com nomes diferentes): cada vaga com o seu link, e cada link vale o aceite daquela empresa.
 */
export function mensagemConviteAgrupada(
  lista: (Pick<Convite, "nome" | "tipo" | "vagas" | "token" | "rascunho"> & { origem?: Convite["origem"] })[],
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
      `Vi que vocês estão com vagas abertas. Vocês podem publicar no Publike, sem custo. Para adiantar, deixei cada uma escrita no site: é só abrir o link, conferir, ajustar o que quiserem e tocar em Publicar ${ENTRAR}.`,
      `Vi as vagas abertas de vocês. Que tal publicar no Publike? É sem custo, e cada uma já está escrita no site: vocês abrem o link, conferem e tocam em Publicar ${ENTRAR}.`,
    ]),
    itens,
    agencia
      ? `• Não concorremos com agências: a vaga sai com o nome de vocês e o selo "Vaga de agência".\n• Os candidatos chegam no WhatsApp de vocês: quem curte e é aceito chama direto.\n• É grátis: sem plano e sem taxa por candidato.`
      : `• É grátis para a empresa e para o candidato: sem plano e sem taxa.\n• A vaga aparece primeiro para quem mora perto, com a distância e o tempo de ônibus.`,
    escolher(s, "fecha", DESPEDIDAS),
    ...lista
      .filter((c) => c.origem === "receita")
      .slice(0, 1)
      .map((c) => rodapeDaReceita(linkDoConvite(site, c.token), c.token)),
  ].join("\n\n");
}

/**
 * O e-mail do convite (o mesmo da prévia no admin e do que sai pelo Publike): assunto, texto e
 * HTML, com o link da vaga como botão "Conferir e publicar a vaga".
 */
export function emailDoConvite(
  c: Pick<Convite, "nome" | "tipo" | "vagas" | "token" | "rascunho"> & {
    origem?: Convite["origem"];
    link_vagas?: string | null;
    enviada_em?: string | null;
  },
  assinatura: string,
  site: string,
  /** a mensagem escolhida no cartão (`mensagemDoConvite`); a das vagas no site não leva o link nem o botão */
  qual: MensagemConvite = "publike",
) {
  const link = linkDoConvite(site, c.token, c.tipo);
  const texto = mensagemConvite(c, assinatura.slice(0, 40), link, Boolean(c.rascunho), qual);
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
