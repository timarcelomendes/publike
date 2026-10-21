/**
 * As regras da linha do tempo da home (sem servidor, para testar e reaproveitar): a marca
 * "Você parou aqui", a hora e o dia de cada item, os separadores de dia e as novidades por tipo.
 * A linha é cronológica: do mais novo para o mais antigo, sem algoritmo.
 */

const FUSO = "America/Sao_Paulo";
const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** Mais que isso desde a última abertura da home: é uma visita nova (a marca anda). */
export const SESSAO_DA_HOME = 30 * MINUTO;
/** Depois de tanto tempo fora, a marca não aparece (tudo seria "novo"). */
export const MARCA_MAXIMA = 30 * DIA;
/** Quanto tempo o aceite de uma curtida fica na linha. */
export const ACEITE_NA_LINHA = 7 * DIA;

export type TipoNaLinha = "vaga" | "servico" | "recado" | "aceite";

/** Um item da linha: o que é, a chave e quando entrou (ISO). */
export type ItemDaLinha<T> = { tipo: TipoNaLinha; id: string; quando: string; dados: T };

/**
 * Onde fica o "Você parou aqui" agora, a partir do que está guardado: mais de 30 minutos desde a
 * última abertura, a marca é essa abertura (visita nova); dentro dos 30 minutos, continua a que
 * já estava. Na primeira visita, ou depois de 30 dias fora, sem marca.
 */
export function marcaDaVisita(vistaEm: string | null, marcaEm: string | null, agora: number): number | null {
  if (!vistaEm) return null;
  const vista = new Date(vistaEm).getTime();
  const marca = agora - vista > SESSAO_DA_HOME ? vista : marcaEm ? new Date(marcaEm).getTime() : null;
  if (marca === null || Number.isNaN(marca) || agora - marca > MARCA_MAXIMA) return null;
  return marca;
}

/** O que gravar quando a pessoa abre a home (a mesma regra de `marcaDaVisita`). */
export function proximaVisita(vistaEm: string | null, marcaEm: string | null, agora: number) {
  const vista = vistaEm ? new Date(vistaEm).getTime() : null;
  const nova = vista === null || agora - vista > SESSAO_DA_HOME;
  return { home_vista_em: new Date(agora).toISOString(), home_marca_em: nova ? vistaEm : marcaEm };
}

const partes = (quando: number) => {
  const p = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(quando));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { dia: `${v("year")}-${v("month")}-${v("day")}`, hora: `${v("hour")}:${v("minute")}` };
};

/** O dia (no fuso de Goiânia) em "2026-10-21". */
export const diaDe = (quando: number) => partes(quando).dia;

/** Quantos dias de calendário entre o dia de `quando` e o de `agora` (0 = hoje). */
function diasAtras(quando: number, agora: number) {
  const a = Date.parse(`${diaDe(agora)}T00:00:00Z`);
  const q = Date.parse(`${diaDe(quando)}T00:00:00Z`);
  return Math.round((a - q) / DIA);
}

/** A hora ao lado do item: hoje, "agora", "12 min", "3 h"; antes de hoje, a hora do relógio ("20:45"). */
export function horaNaLinha(quando: number, agora: number) {
  const passou = Math.max(0, agora - quando);
  if (diasAtras(quando, agora) === 0) {
    if (passou < MINUTO) return "agora";
    if (passou < HORA) return `${Math.floor(passou / MINUTO)} min`;
    return `${Math.floor(passou / HORA)} h`;
  }
  return partes(quando).hora;
}

const fmt = (opcoes: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, ...opcoes });
const semanaEData = fmt({ weekday: "long", day: "numeric", month: "long" });
const soData = fmt({ day: "numeric", month: "long" });
const soSemana = fmt({ weekday: "long" });

/** "quarta-feira" vira "quarta" (mais curto, como se fala). */
const semFeira = (s: string) => s.replace("-feira", "");

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * O separador de um dia: o nome grande e a data pequena ao lado.
 * Hoje · quarta, 21 de outubro; Ontem · terça, 20 de outubro; Segunda · 19 de outubro; 15 de outubro · quinta.
 */
export function separadorDoDia(quando: number, agora: number): { titulo: string; data: string } {
  const d = diasAtras(quando, agora);
  const data = new Date(quando);
  if (d <= 0) return { titulo: "Hoje", data: semFeira(semanaEData.format(data)) };
  if (d === 1) return { titulo: "Ontem", data: semFeira(semanaEData.format(data)) };
  if (d < 7) return { titulo: maiuscula(semFeira(soSemana.format(data))), data: soData.format(data) };
  return { titulo: soData.format(data), data: semFeira(soSemana.format(data)) };
}

/** "ontem às 21h10", "hoje às 9h05", "segunda às 18h", "15 de outubro" (a frase do topo e a marca). */
export function quandoFoi(quando: number, agora: number) {
  const d = diasAtras(quando, agora);
  const [h, m] = partes(quando).hora.split(":");
  const hora = `${Number(h)}h${m === "00" ? "" : m}`;
  if (d <= 0) return `hoje às ${hora}`;
  if (d === 1) return `ontem às ${hora}`;
  if (d < 7) return `${semFeira(soSemana.format(new Date(quando)))} às ${hora}`;
  return soData.format(new Date(quando));
}

/** As partes da linha, na ordem: separador de dia, a marca e os itens. */
export type ParteDaLinha<T> =
  | { tipo: "dia"; chave: string; titulo: string; data: string }
  | { tipo: "marca"; chave: string; quando: number }
  | { tipo: "item"; chave: string; item: ItemDaLinha<T> };

/** Ordena do mais novo para o mais antigo e põe os separadores de dia e a marca no lugar. */
export function montarLinha<T>(itens: ItemDaLinha<T>[], marca: number | null, agora: number): ParteDaLinha<T>[] {
  const ordenados = [...itens].sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando));
  const partesDaLinha: ParteDaLinha<T>[] = [];
  let diaAtual = "";
  let marcou = marca === null;
  // a marca só faz sentido com algo novo em cima dela e algo já visto embaixo
  const temNovo = marca !== null && ordenados.some((i) => Date.parse(i.quando) > marca);
  const temVisto = marca !== null && ordenados.some((i) => Date.parse(i.quando) <= marca);
  if (!temNovo || !temVisto) marcou = true;
  for (const item of ordenados) {
    const quando = Date.parse(item.quando);
    if (!marcou && marca !== null && quando <= marca) {
      partesDaLinha.push({ tipo: "marca", chave: "marca", quando: marca });
      marcou = true;
    }
    const dia = diaDe(quando);
    if (dia !== diaAtual) {
      diaAtual = dia;
      partesDaLinha.push({ tipo: "dia", chave: `dia-${dia}`, ...separadorDoDia(quando, agora) });
    }
    partesDaLinha.push({ tipo: "item", chave: `${item.tipo}-${item.id}`, item });
  }
  return partesDaLinha;
}

/** No Tudo, quantos recados seguidos aparecem antes de recolher o resto ("Mais 3 recados"). */
export const RECADOS_SEGUIDOS = 2;

/**
 * Agrupa as partes da linha para mostrar: recados seguidos (sem dia ou marca no meio) além de
 * `RECADOS_SEGUIDOS` viram um grupo recolhido. Fora do Tudo, nada recolhe.
 */
export function recolherRecados<T>(
  partesDaLinha: ParteDaLinha<T>[],
  recolher: boolean,
): (ParteDaLinha<T> | { tipo: "recolhidos"; chave: string; itens: ItemDaLinha<T>[] })[] {
  if (!recolher) return partesDaLinha;
  const saida: (ParteDaLinha<T> | { tipo: "recolhidos"; chave: string; itens: ItemDaLinha<T>[] })[] = [];
  let seguidos = 0;
  let grupo: { tipo: "recolhidos"; chave: string; itens: ItemDaLinha<T>[] } | null = null;
  for (const p of partesDaLinha) {
    if (p.tipo === "item" && p.item.tipo === "recado") {
      seguidos++;
      if (seguidos <= RECADOS_SEGUIDOS) {
        saida.push(p);
      } else {
        if (!grupo) {
          grupo = { tipo: "recolhidos", chave: `recolhidos-${p.chave}`, itens: [] };
          saida.push(grupo);
        }
        grupo.itens.push(p.item);
      }
      continue;
    }
    seguidos = 0;
    grupo = null;
    saida.push(p);
  }
  return saida;
}

/** Quantos itens de cada tipo chegaram depois da marca (sem marca: nenhum é "novo"). */
export function novidades<T>(itens: ItemDaLinha<T>[], marca: number | null) {
  const n = { tudo: 0, vaga: 0, servico: 0, recado: 0 };
  if (marca === null) return n;
  for (const i of itens) {
    if (Date.parse(i.quando) <= marca) continue;
    n.tudo++;
    if (i.tipo === "vaga" || i.tipo === "servico" || i.tipo === "recado") n[i.tipo]++;
  }
  return n;
}

/** O número na aba: zero some; acima de 99, "99+". */
export const numeroDaAba = (n: number) => (n <= 0 ? null : n > 99 ? "99+" : String(n));

/** "Boa noite", "Bom dia" ou "Boa tarde", pela hora de Goiânia. */
export function saudacao(agora: number) {
  const h = Number(partes(agora).hora.slice(0, 2));
  return h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite";
}
