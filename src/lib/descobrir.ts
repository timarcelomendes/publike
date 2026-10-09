import { categoria } from "./constantes";
import { chaveBairro, chavesDaRegiao, type Local } from "./regioes";
import type { VagaDescobrir } from "./tipos";

// "Descobrir": quanto cada vaga combina com a pessoa. As regras valem para
// todo mundo e não custam nada; a IA (quando ligada) só afina a ordem.
//   perto de casa ........ 35   área / o que faz ..... 30
//   horário .............. 10   nova ................. 10
//   CNH ...................  5   estudo (estágio) .....  5
//   valor informado .......  5

export type Motivo = { tipo: "perto" | "area" | "horario" | "cnh" | "estudo" | "nova" | "curriculo"; texto: string };

export type QuemProcura = {
  /** "o que faz" do perfil */
  servicos: string[];
  cargos: string[];
  cursos: string[];
  curso: string | null;
  escolaridade: string | null;
  cnh: string | null;
  disponibilidade: string[];
  /** "O que você procura?" */
  procuro: string | null;
  temCurriculo: boolean;
};

export type VagaIndicada = VagaDescobrir & {
  nota: number;
  motivos: Motivo[];
  distanciaKm: number | null;
  /** 0 = no bairro, 1 = na região, 2 = na cidade, 3 = mais longe */
  perto: 0 | 1 | 2 | 3;
};

const PALAVRAS_VAZIAS = new Set(
  (
    "para com sem mais menos que uma umas uns como trabalho trabalhar vaga vagas procuro quero queria " +
    "gostaria perto setor bairro regiao goiania aparecida empresa pessoa pessoas algum alguma qualquer " +
    "tenho tambem muito pouco onde quando todo toda todos dias semana horario fazer servico servicos area " +
    "experiencia anos desde meio periodo"
  ).split(" "),
);

export function semAcento(texto: string) {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Palavras que importam, cortadas em 5 letras (cozinha, cozinheiro e cozinheira viram "cozin"). */
function chaves(texto: string | null | undefined) {
  const mapa = new Map<string, string>();
  for (const palavra of semAcento(texto ?? "").split(/[^a-z0-9]+/)) {
    if (palavra.length < 4 || PALAVRAS_VAZIAS.has(palavra) || /^\d+$/.test(palavra)) continue;
    const chave = palavra.length > 5 ? palavra.slice(0, 5) : palavra;
    if (!mapa.has(chave)) mapa.set(chave, palavra);
  }
  return mapa;
}

export function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

const HORARIOS: { valor: string; nome: string; teste: RegExp }[] = [
  { valor: "manha", nome: "manhã", teste: /manha|matutin|\b(5|6|7|8)h/ },
  { valor: "tarde", nome: "tarde", teste: /tarde|vespertin|\b(13|14)h/ },
  { valor: "noite", nome: "noite", teste: /noite|noturn|madrugada|\b(18|19|20|22)h/ },
  { valor: "fim_de_semana", nome: "fim de semana", teste: /fim de semana|fins de semana|sabado|domingo/ },
  { valor: "escala", nome: "escala", teste: /12x36|6x1|5x2|escala/ },
];

const PEDE_CNH = /\bcnh\b|habilitac|motorista|\bmoto\b|motoboy|motociclista|entregador|carro proprio/;

export function pontuar(v: VagaDescobrir, q: QuemProcura | null, local: Local | null, ponto: { lat: number; lng: number } | null, agora: number): VagaIndicada {
  const motivos: Motivo[] = [];
  let nota = 0;

  // perto de casa
  let perto: VagaIndicada["perto"] = 3;
  let pontosPerto = 0;
  if (local && v.cidade === local.cidade) {
    const chave = chaveBairro(v.bairro);
    if (local.bairro && chave === chaveBairro(local.bairro)) {
      perto = 0;
      pontosPerto = 35;
      motivos.push({ tipo: "perto", texto: "No seu bairro" });
    } else if (local.regiao && chavesDaRegiao(local.regiao).includes(chave)) {
      perto = 1;
      pontosPerto = 26;
      motivos.push({ tipo: "perto", texto: `Na região ${local.regiao}` });
    } else {
      perto = 2;
      pontosPerto = 14;
    }
  }
  const distancia = ponto ? Math.round(distanciaKm(ponto.lat, ponto.lng, v.lat, v.lng) * 10) / 10 : null;
  if (distancia != null) {
    const porDistancia = distancia <= 1.5 ? 35 : distancia <= 4 ? 28 : distancia <= 8 ? 20 : distancia <= 15 ? 12 : distancia <= 30 ? 5 : 0;
    if (porDistancia > pontosPerto) {
      pontosPerto = porDistancia;
      if (perto > 0 && distancia <= 8) {
        motivos.push({ tipo: "perto", texto: `A ${distancia.toLocaleString("pt-BR")} km de você` });
      }
    }
  }
  nota += pontosPerto;

  const texto = semAcento(`${v.titulo} ${v.horario ?? ""} ${v.descricao}`);

  // área: o que a pessoa faz, as experiências, os cursos e o que ela procura
  if (q) {
    const dela = chaves([...q.servicos, ...q.cargos, ...q.cursos, q.curso ?? "", q.procuro ?? ""].join(" "));
    const titulo = chaves(v.titulo);
    const resto = chaves(`${v.descricao} ${categoria(v.categoria).nome}`);
    let area = 0;
    let exemplo: string | null = null;
    for (const [chave, palavra] of dela) {
      if (titulo.has(chave)) {
        area += 15;
        exemplo ??= palavra;
      } else if (resto.has(chave)) {
        area += 5;
        exemplo ??= palavra;
      }
    }
    area = Math.min(30, area);
    nota += area;
    if (exemplo && area >= 10) motivos.push({ tipo: "area", texto: `Combina com “${exemplo}”` });
  }

  // horário
  const horarios = HORARIOS.filter((h) => h.teste.test(texto));
  if (!horarios.length || !q?.disponibilidade.length) {
    nota += 4;
  } else {
    const bate = horarios.find((h) => q.disponibilidade.includes(h.valor));
    if (bate) {
      nota += 10;
      motivos.push({ tipo: "horario", texto: `De ${bate.nome}, como você pode` });
    }
  }

  // nova
  const horas = (agora - new Date(v.criado_em).getTime()) / 3600000;
  if (horas < 48) {
    nota += 10;
    motivos.push({ tipo: "nova", texto: "Nova" });
  } else nota += horas < 24 * 7 ? 6 : 2;

  // CNH
  if (PEDE_CNH.test(texto)) {
    if (q?.cnh) {
      nota += 5;
      motivos.push({ tipo: "cnh", texto: `Você tem CNH ${q.cnh}` });
    }
  } else nota += 3;

  // estágio é para estudante
  if (v.regime === "estagio") {
    if (q?.escolaridade && ["medio_incompleto", "tecnico", "superior_incompleto"].includes(q.escolaridade)) {
      nota += 5;
      motivos.push({ tipo: "estudo", texto: "Para estudantes, como você" });
    }
  } else nota += 3;

  if (v.pagamento_valor != null) nota += 5;
  if (v.pede_curriculo && q?.temCurriculo) motivos.push({ tipo: "curriculo", texto: "Seu currículo está pronto" });

  return { ...v, nota: Math.max(1, Math.min(99, Math.round(nota))), motivos, distanciaKm: distancia, perto };
}

/** Em alta: curtidas e salvas da semana, com um empurrão para as novas. */
export function calorDaVaga(v: VagaDescobrir, agora: number) {
  const horas = (agora - new Date(v.criado_em).getTime()) / 3600000;
  return v.curtidas_7d * 3 + v.salvas_7d * 2 + (horas < 48 ? 1 : 0);
}

