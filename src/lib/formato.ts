import { SUPABASE_URL } from "./config";
import { REGIMES, TIPOS_ANUNCIO, TIPOS_CONTA } from "./constantes";
import type { Regime, TipoAnuncio, TipoConta, Unidade } from "./tipos";

const FUSO = "America/Sao_Paulo";

export function formatarMoeda(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: Number.isInteger(valor) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

/** "R$ 1.900 / mês + vale-transporte", "R$ 120 a diária", "Valor a combinar". */
export function formatarValor(valor: number | null, unidade: string | null, beneficios?: string | null) {
  let texto = "Valor a combinar";
  if (valor != null && unidade) {
    const v = formatarMoeda(valor);
    const porUnidade: Record<Unidade, string> = {
      hora: `${v} / hora`,
      dia: `${v} a diária`,
      semana: `${v} / semana`,
      mes: `${v} / mês`,
      servico: `${v} pelo serviço`,
    };
    texto = porUnidade[unidade as Unidade] ?? v;
  }
  return beneficios ? `${texto} + ${beneficios}` : texto;
}

/** Os locais são aproximados (~500 m), então não mostramos metros. */
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
export function formatarData(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: FUSO }).format(new Date(iso));
}

/** "outubro de 2026" */
export function formatarMesAno(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: FUSO }).format(new Date(iso));
}

/** Selo do card: CLT, Diária, Bico… ou Serviço. */
export function rotuloModalidade(tipo: string, regime: string | null) {
  if (tipo === "vaga" && regime && regime in REGIMES) return REGIMES[regime as Regime].selo;
  return TIPOS_ANUNCIO[(tipo as TipoAnuncio) in TIPOS_ANUNCIO ? (tipo as TipoAnuncio) : "servico"].selo;
}

export function rotuloConta(tipo: string) {
  return TIPOS_CONTA[(tipo as TipoConta) in TIPOS_CONTA ? (tipo as TipoConta) : "pessoa"].minusculo;
}

/** "Setor Bueno" ou "Setor Garavelo, Aparecida de Goiânia". */
export function formatarLugar(bairro: string | null, cidade: string) {
  if (!bairro) return cidade;
  return cidade === "Goiânia" ? bairro : `${bairro}, ${cidade}`;
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

export function primeiro(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor;
}
