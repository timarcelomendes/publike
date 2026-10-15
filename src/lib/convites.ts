// Convites às empresas (admin): a lista, o arquivo modelo e a mensagem do convite.

export const ESTADOS_CONVITE = [
  { id: "a_enviar", nome: "A enviar", filtro: "A enviar" },
  { id: "enviada", nome: "Enviei", filtro: "Enviados" },
  { id: "autorizou", nome: "Autorizou", filtro: "Autorizaram" },
  { id: "recusou", nome: "Não quis", filtro: "Não quiseram" },
  { id: "sem_contato", nome: "Contato não serve", filtro: "Contato não serve" },
] as const;
export type StatusConvite = (typeof ESTADOS_CONVITE)[number]["id"];
export const STATUS_CONVITE = ESTADOS_CONVITE.map((e) => e.id) as StatusConvite[];

export type TipoConvite = "empresa" | "agencia";

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
};

/** O que vem de uma linha do arquivo (ou do formulário), já limpo. */
export type NovoConvite = Pick<Convite, "nome" | "tipo" | "vagas" | "whatsapp" | "telefones" | "email" | "observacao">;

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
      tipo: /ag[eê]ncia|rh/i.test(col(l, "tipo")) ? "agencia" : "empresa",
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

export function mensagemConvite(c: Pick<Convite, "nome" | "tipo" | "vagas">, assinatura: string) {
  const vagas = juntar(c.vagas.map(minusculo));
  const essa = c.vagas.length > 1 ? "essas vagas" : "essa vaga";
  const quem = assinatura.trim() ? `Sou ${assinatura.trim()}, do Publike` : "Aqui é do Publike";
  const abre = `Olá, pessoal da ${c.nome}! Tudo bem? ${quem} (publike.org), um site gratuito de vagas e serviços de Goiânia e região.`;
  const fecha = `Se não tiver interesse, é só responder "não" que eu não mando mais mensagens. Obrigado!`;
  if (c.tipo === "agencia") {
    return [
      abre,
      vagas
        ? `Vi que vocês estão com vaga de ${vagas}. Posso publicar ${essa} no Publike em nome da agência, sem custo?`
        : "Posso publicar as vagas de vocês no Publike em nome da agência, sem custo?",
      `• Não concorremos com agências: a vaga sai com o nome de vocês e o selo "Vaga de agência".\n• Quando vocês aceitam um candidato, ele recebe o WhatsApp e o e-mail da agência, nunca os do cliente. O cliente pode aparecer como empresa confidencial.\n• É grátis: sem plano e sem taxa por candidato.`,
      `Se puder, responda "pode publicar" e me diga qual WhatsApp e qual e-mail devem aparecer nas vagas. Eu cadastro e mando o acesso para vocês acompanharem.`,
      fecha,
    ].join("\n\n");
  }
  return [
    abre,
    vagas
      ? `Vi que vocês estão contratando ${vagas}. Posso publicar ${essa} no Publike, sem custo, para mais gente da região ficar sabendo?`
      : "Posso publicar as vagas de vocês no Publike, sem custo, para mais gente da região ficar sabendo?",
    `• É grátis para a empresa e para o candidato: sem plano e sem taxa.\n• Não somos agência: quem se interessa curte a vaga, e vocês decidem com quem conversar. Ao aceitar, o contato é direto com vocês.\n• A vaga aparece primeiro para quem mora perto, com a distância e o tempo de ônibus até a empresa.`,
    `Se puder, responda "pode publicar" e me diga qual WhatsApp ou e-mail deve receber os candidatos. Eu cadastro e mando o acesso para vocês acompanharem.`,
    fecha,
  ].join("\n\n");
}

export function assuntoConvite(c: Pick<Convite, "vagas">) {
  return c.vagas.length
    ? `Vaga de ${minusculo(c.vagas[0])}: divulgação grátis no Publike`
    : "Divulgação grátis das suas vagas no Publike";
}
