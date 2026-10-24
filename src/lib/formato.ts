import { SUPABASE_URL } from "./config";
import { REGIMES, TIPOS_ANUNCIO, TIPOS_CONTA } from "./constantes";
import type { Regime, TipoAnuncio, TipoConta, Unidade } from "./tipos";
import { ganhosDoBanco, nomesDosGanhos, type GanhoExtra } from "./vaga-extra";
import { cidadeDePraca } from "./pracas";

const FUSO = "America/Sao_Paulo";

export function formatarMoeda(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: Number.isInteger(valor) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

/**
 * "R$ 1.900 / mês + vale-transporte", "R$ 120 a diária", "Valor a combinar".
 * Com faixa: "De R$ 1.800 a R$ 2.200 / mês". Com ganhos a mais: "… + bônus e comissão".
 * No serviço, o preço é de referência: "A partir de R$ 180 a diária".
 */
export function formatarValor(
  valor: number | null,
  unidade: string | null,
  beneficios?: string | null,
  aPartirDe = false,
  extra: { ate?: number | null; comissao?: boolean; ganhos?: GanhoExtra[] } = {},
) {
  let texto = "Valor a combinar";
  if (valor != null && unidade) {
    const v = formatarMoeda(valor);
    const faixa = extra.ate != null && extra.ate > valor;
    const base = faixa ? `De ${v} a ${formatarMoeda(extra.ate as number)}` : v;
    const porUnidade: Record<Unidade, string> = {
      hora: `${base} / hora`,
      dia: faixa ? `${base} / dia` : `${v} a diária`,
      semana: `${base} / semana`,
      mes: `${base} / mês`,
      servico: `${base} pelo serviço`,
      m2: `${base} / m²`,
      visita: faixa ? `${base} / visita` : `${v} a visita`,
    };
    texto = porUnidade[unidade as Unidade] ?? base;
    if (aPartirDe) texto = `A partir de ${texto}`;
  }
  if (extra.ganhos?.length) texto += ` + ${nomesDosGanhos(extra.ganhos)}`;
  else if (extra.comissao) texto += " + comissão";
  return beneficios ? `${texto} + ${beneficios}` : texto;
}

/** O valor bem curto, para o marcador do mapa: "R$ 1.750/mês", "R$ 150/dia", "A combinar". */
export function valorCurto(valor: number | null, unidade: string | null) {
  if (valor == null || !unidade) return "A combinar";
  const v = formatarMoeda(valor);
  const sufixo: Record<string, string> = {
    hora: "/h",
    dia: "/dia",
    semana: "/sem",
    mes: "/mês",
    m2: "/m²",
    visita: "/visita",
    servico: "",
  };
  return `${v}${sufixo[unidade] ?? ""}`;
}

/** Valor de um anúncio: vaga com faixa, ganhos a mais e benefícios; serviço com "a partir de". */
export function valorDoAnuncio(a: {
  tipo: string;
  pagamento_valor: number | null;
  pagamento_unidade: string | null;
  beneficios: string | null;
  pagamento_ate?: number | null;
  comissao?: boolean;
  /** comissão, bônus, gorjeta... (jsonb do banco); sem eles, vale o "comissao" */
  ganhos_extras?: unknown;
}) {
  return a.tipo === "servico"
    ? formatarValor(a.pagamento_valor, a.pagamento_unidade, null, true)
    : formatarValor(a.pagamento_valor, a.pagamento_unidade, a.beneficios, false, {
        ate: a.pagamento_ate,
        ganhos: ganhosDoBanco(a.ganhos_extras, a.comissao),
      });
}

/** Muitos locais são aproximados (~300 a 500 m), então não mostramos metros. */
export function formatarDistancia(km: number | null | undefined) {
  if (km == null) return null;
  if (km < 1) return "menos de 1 km";
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}

/** "há 2 horas", "ontem", "em 12 dias". */
export function tempoRelativo(iso: string, agora: number) {
  const segundos = (new Date(iso).getTime() - agora) / 1000;
  const abs = Math.abs(segundos);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (abs < 60) return segundos <= 0 ? "agora mesmo" : "em instantes";
  if (abs < 3600) return rtf.format(Math.round(segundos / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(segundos / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(segundos / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(segundos / (86400 * 30)), "month");
  return rtf.format(Math.round(segundos / (86400 * 365)), "year");
}

/** "7 de outubro" */
/** Vaga sem prazo para sair do ar: o banco guarda a saída em 31/12/9999. */
export function semPrazo(expiraEm: string | null | undefined) {
  return Boolean(expiraEm) && new Date(expiraEm as string).getUTCFullYear() >= 9999;
}

/** "no ar até 18 de novembro" ou, sem prazo, "no ar até ser encerrada". */
export function ateQuando(expiraEm: string) {
  return semPrazo(expiraEm) ? "até ser encerrada" : `até ${formatarData(expiraEm)}`;
}

export function formatarData(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: FUSO,
  }).format(new Date(iso));
}

/** "outubro de 2026" */
export function formatarMesAno(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: FUSO,
  }).format(new Date(iso));
}

/** Selo do card: CLT, Diária, Freelance… ou Serviço. */
export function rotuloModalidade(tipo: string, regime: string | null) {
  if (tipo === "vaga" && regime && regime in REGIMES) return REGIMES[regime as Regime].selo;
  return TIPOS_ANUNCIO[(tipo as TipoAnuncio) in TIPOS_ANUNCIO ? (tipo as TipoAnuncio) : "servico"].selo;
}

export function rotuloConta(tipo: string) {
  return TIPOS_CONTA[(tipo as TipoConta) in TIPOS_CONTA ? (tipo as TipoConta) : "pessoa"].minusculo;
}

const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e"]);

/**
 * O bairro com as iniciais em maiúscula, como as pessoas escrevem às vezes em minúscula:
 * "Setor sul" → "Setor Sul". Só mexe nas palavras todas em minúscula ("de", "da"... ficam);
 * siglas e o que já veio com maiúscula ("BNH", "Vila São João") ficam como estão.
 */
export function nomeDoBairro(bairro: string) {
  return bairro.replace(/\p{L}[\p{L}'’.-]*/gu, (palavra, posicao: number) =>
    palavra === palavra.toLocaleLowerCase("pt-BR") && (posicao === 0 || !LIGACOES.has(palavra))
      ? palavra.charAt(0).toLocaleUpperCase("pt-BR") + palavra.slice(1)
      : palavra,
  );
}

/** "Setor Bueno" ou "Setor Garavelo, Aparecida de Goiânia": o bairro da cidade que dá nome à praça vai sem a cidade. */
export function formatarLugar(bairro: string | null, cidade: string) {
  // sem bairro, ou só a cidade (vaga de empresa confidencial): a cidade
  if (!bairro || bairro === cidade) return cidade;
  const b = nomeDoBairro(bairro);
  return cidadeDePraca(cidade) ? b : `${b}, ${cidade}`;
}

/** 5562999990001 → (62) 99999-0001 */
export function formatarTelefone(numero: string) {
  const d = numero.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return numero;
}

export function linkWhatsApp(numero: string, texto: string) {
  return `https://wa.me/${numero.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
}

/** Iniciais para o avatar sem foto: "Ana Cozinha" → "AC". */
/**
 * Nas conversas e nos recados, a empresa que mostra o responsável vem como "Ana Souza · Clínica Sorriso"
 * (migração 20261108120000_responsavel_da_conta). As iniciais e a cor do avatar seguem o nome da conta.
 */
export function nomeDaConta(nome: string) {
  const i = nome.lastIndexOf(" · ");
  return i > 0 ? nome.slice(i + 3) : nome;
}

export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const letras = (partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "");
  return letras.toUpperCase() || "?";
}

/** Só aceita caminhos internos ("/painel"), nunca outro site. */
export function caminhoSeguro(valor: unknown, padrao = "/") {
  if (typeof valor !== "string" || !valor.startsWith("/") || valor.startsWith("//")) return padrao;
  // Sem barra invertida nem caracteres de controle (tab, quebra de linha…):
  // o navegador ignora alguns deles e "/\t/site.com" viraria "//site.com".
  for (let i = 0; i < valor.length; i++) {
    const c = valor.charCodeAt(i);
    if (c < 0x20 || c === 0x7f || c === 0x5c) return padrao;
  }
  return valor;
}

/** Endereço público da foto de perfil guardada no Storage. */
export function urlDaFoto(caminho: string | null | undefined) {
  if (!caminho || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${caminho}`;
}

/** Endereço público de uma foto de trabalho (serviços). */
export function urlDaFotoTrabalho(caminho: string | null | undefined) {
  if (!caminho || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/trabalhos/${caminho}`;
}

/** A foto de um recado (bucket público "recados"). */
export function urlDaFotoRecado(caminho: string | null | undefined) {
  if (!caminho || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/recados/${caminho}`;
}

export function primeiro(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor;
}

/** "8 de out. de 2026, 13:05" */
export function formatarDataHora(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO,
  }).format(new Date(iso));
}

/** "08/10/2026" */
export function formatarDataCurta(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: FUSO,
  }).format(new Date(iso));
}

/** Banimento é uma suspensão de 100 anos: daqui a mais de 10 anos, chamamos de "para sempre". */
export function ehParaSempre(iso: string | null | undefined, agora: number) {
  return Boolean(iso && new Date(iso).getTime() - agora > 10 * 365 * 24 * 3600 * 1000);
}

const PROVEDORES: Record<string, string> = {
  email: "E-mail",
  google: "Google",
  facebook: "Facebook",
  linkedin_oidc: "LinkedIn",
  phone: "Celular",
};

export function nomeDoProvedor(provedor: string | null | undefined) {
  return (provedor && PROVEDORES[provedor]) || provedor || "E-mail";
}

/** 4.8 → "4,8" */
export function formatarNota(media: number) {
  return media.toFixed(1).replace(".", ",");
}

/** 1234 → "1.234" */
export function formatarNumero(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n);
}

/** plural(1, "vaga", "vagas") → "1 vaga"; plural(3, …) → "3 vagas" */
export function plural(n: number, singular: string, varios: string) {
  return `${formatarNumero(n)} ${n === 1 ? singular : varios}`;
}
