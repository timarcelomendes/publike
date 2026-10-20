import "server-only";
import { bairroDaReceita } from "@/lib/cnpj";
import {
  cepValido,
  limparCep,
  type ConsultaCep,
  type ConsultaPonto,
  type EnderecoDoCep,
  type Precisao,
} from "@/lib/cep";
import { MODO_DEMO, REGIAO } from "@/lib/config";
import { CIDADES } from "@/lib/constantes";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Do CEP (e do número) para um ponto no mapa, de graça e sem chave:
//   1. o endereço vem da BrasilAPI (CEP v2, que às vezes já traz o ponto) ou,
//      se ela falhar, do ViaCEP;
//   2. o ponto vem do OpenStreetMap (Nominatim): primeiro a rua com o número,
//      depois só a rua (por campos e por texto livre com o bairro), depois o
//      ponto do CEP, depois o bairro. Quem publica confere e ajusta o pino no mapa.
// Cuidados que a vida real pediu:
//   * Para muitos CEPs a BrasilAPI devolve o meio da cidade (o mesmo ponto
//     para CEPs de bairros diferentes). Ponto do CEP colado no centro da
//     cidade não vale.
//   * "Rua JCA7" no CEP é "Rua JCA 7" no mapa: tentamos as duas.
//   * Há "Rua 1" em vários bairros: a rua achada só vale perto do bairro do CEP.
//   * Muita rua de Goiânia não está no mapa (a Rua Puccini, do Jardim Europa, por exemplo),
//     e o mapa tem vários pontos com o nome do mesmo bairro, longe um do outro. Entre os
//     achados, vale o de CEP mais parecido com o pedido (74325-200 fica perto do 74325-100).
//   * Quando um comércio já publicou com o mesmo CEP e número e acertou o pino, esse ponto
//     (público, na vaga) vale mais que o mapa: ponto_conhecido, no banco.
// O Nominatim pede no máximo uma consulta por segundo e um nome de aplicativo:
// a fila abaixo espaça as consultas e as respostas ficam guardadas por um dia.

const BRASILAPI = (process.env.BRASILAPI_URL || "https://brasilapi.com.br").replace(/\/+$/, "");
const VIACEP = (process.env.VIACEP_URL || "https://viacep.com.br").replace(/\/+$/, "");
const NOMINATIM = (process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org").replace(/\/+$/, "");
const APLICATIVO = "Publike/1.0 (https://publike.org)";

const UM_DIA = 24 * 3600 * 1000;

type Ponto = { lat: number; lng: number };

type RespostaBrasilApiCep = {
  cep?: string;
  state?: string;
  city?: string;
  neighborhood?: string | null;
  street?: string | null;
  location?: { coordinates?: { latitude?: string | number; longitude?: string | number } | null } | null;
};

type RespostaViaCep = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
};

type RespostaNominatim = {
  lat?: string;
  lon?: string;
  address?: {
    house_number?: string;
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    quarter?: string;
    city_district?: string;
    postcode?: string;
  };
}[];

function texto(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ") : null;
}

function numero(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Distância em km entre dois pontos (fórmula de haversine). */
function distanciaKm(a: Ponto, b: Ponto) {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Para comparar nomes: sem acento, minúsculo, sem espaços repetidos. */
function chave(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * "Rua JCA7" → ["Rua JCA7", "Rua JCA 7"] e "Rua C-149" → ["Rua C-149", "Rua C 149", "Rua C149"]:
 * no OpenStreetMap, o nome das ruas de Goiânia aparece de jeitos diferentes.
 */
function variantesDaRua(rua: string) {
  const limpa = (v: string) => v.replace(/\s+/g, " ").trim();
  const separada = limpa(rua.replace(/([A-Za-zÀ-ÿ])(?=\d)|(\d)(?=[A-Za-zÀ-ÿ])/g, "$1$2 "));
  const semHifenEspaco = limpa(rua.replace(/(\w)-(?=\d)/g, "$1 "));
  const semHifenJunto = limpa(rua.replace(/(\w)-(?=\d)/g, "$1"));
  return [...new Set([rua, separada, semHifenEspaco, semHifenJunto])];
}

function naRegiao(p: Ponto | null): p is Ponto {
  return (
    p !== null && p.lat >= REGIAO.latMin && p.lat <= REGIAO.latMax && p.lng >= REGIAO.lngMin && p.lng <= REGIAO.lngMax
  );
}

/** "Goiania" e "Goiânia" são a mesma cidade: devolve o nome da nossa lista. */
function cidadeDaLista(nome: string) {
  const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return CIDADES.find((c) => chave(c) === chave(nome)) ?? null;
}

async function buscarJson<T>(
  url: string,
  cabecalhos: Record<string, string> = {},
): Promise<{ status: number; corpo: T | null }> {
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json", ...cabecalhos },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return { status: r.status, corpo: r.ok ? ((await r.json()) as T) : null };
  } catch {
    return { status: 0, corpo: null };
  }
}

// ------------------------------------------------------------------ CEP

const CEPS = new Map<string, { quando: number; r: { endereco: EnderecoDoCep; ponto: Ponto | null } | "nao_achado" }>();

async function enderecoDoCep(
  cep: string,
): Promise<{ endereco: EnderecoDoCep; ponto: Ponto | null } | "nao_achado" | "indisponivel"> {
  const guardado = CEPS.get(cep);
  if (guardado && Date.now() - guardado.quando < UM_DIA) return guardado.r;

  let r: { endereco: EnderecoDoCep; ponto: Ponto | null } | "nao_achado" | "indisponivel";
  const b = await buscarJson<RespostaBrasilApiCep>(`${BRASILAPI}/api/cep/v2/${cep}`);
  if (b.corpo && texto(b.corpo.city)) {
    const lat = numero(b.corpo.location?.coordinates?.latitude);
    const lng = numero(b.corpo.location?.coordinates?.longitude);
    r = {
      endereco: {
        cep,
        rua: texto(b.corpo.street),
        bairro: texto(b.corpo.neighborhood) ? bairroDaReceita(b.corpo.neighborhood) : null,
        cidade: texto(b.corpo.city)!,
        uf: (texto(b.corpo.state) ?? "").toUpperCase(),
      },
      ponto: lat != null && lng != null ? { lat, lng } : null,
    };
  } else {
    const v = await buscarJson<RespostaViaCep>(`${VIACEP}/ws/${cep}/json/`);
    if (v.corpo && !v.corpo.erro && texto(v.corpo.localidade)) {
      r = {
        endereco: {
          cep,
          rua: texto(v.corpo.logradouro),
          bairro: texto(v.corpo.bairro) ? bairroDaReceita(v.corpo.bairro) : null,
          cidade: texto(v.corpo.localidade)!,
          uf: (texto(v.corpo.uf) ?? "").toUpperCase(),
        },
        ponto: null,
      };
    } else if ((b.status === 404 || b.status === 400) && (v.corpo?.erro || v.status === 400)) {
      r = "nao_achado";
    } else if (b.status === 404 && v.status === 0) {
      r = "nao_achado";
    } else {
      r = "indisponivel";
    }
  }
  if (r !== "indisponivel") {
    if (CEPS.size > 2000) CEPS.clear();
    CEPS.set(cep, { quando: Date.now(), r });
  }
  return r;
}

// ------------------------------------------------------------------ mapa

type Achado = { ponto: Ponto; comNumero: boolean; bairro: string | null };
const PONTOS = new Map<string, { quando: number; r: Achado | null }>();
let fila: Promise<unknown> = Promise.resolve();
let ultima = 0;
let naEspera = 0;
// Uma consulta por segundo: com 20 esperando, a próxima levaria uns 20 s. Melhor dizer que o mapa
// está ocupado (quem chamou trata como "fora do ar") do que travar a busca de todo mundo.
const FILA_MAXIMA = 20;

/** Uma consulta por vez, com pelo menos 1,1 s entre elas (regra do Nominatim). */
function naFila<T>(tarefa: () => Promise<{ status: number; corpo: T | null }>): Promise<{ status: number; corpo: T | null }> {
  if (naEspera >= FILA_MAXIMA) return Promise.resolve({ status: 503, corpo: null });
  naEspera++;
  const vez = fila.then(async () => {
    const espera = ultima + 1100 - Date.now();
    if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
    try {
      return await tarefa();
    } finally {
      ultima = Date.now();
      naEspera--;
    }
  });
  fila = vez.catch(() => undefined);
  return vez;
}

/** Quantos números do começo dos dois CEPs são iguais (74325-200 e 74325-100: 5). */
function cepsParecidos(a: string, b: string) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * Um lugar no mapa. Com o CEP, pede alguns achados e fica com o de CEP mais parecido
 * (no empate, o primeiro, que é o que o mapa acha mais certo).
 */
async function procurarNoMapa(params: Record<string, string>, cep?: string): Promise<Achado | null> {
  const q = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    limit: cep ? "5" : "1",
    countrycodes: "br",
    // só dentro de Goiânia e região
    viewbox: `${REGIAO.lngMin},${REGIAO.latMax},${REGIAO.lngMax},${REGIAO.latMin}`,
    bounded: "1",
    ...params,
  });
  const chave = cep ? `${q}#${cep}` : q.toString();
  const guardado = PONTOS.get(chave);
  if (guardado && Date.now() - guardado.quando < UM_DIA) return guardado.r;

  const resposta = await naFila(() =>
    buscarJson<RespostaNominatim>(`${NOMINATIM}/search?${q}`, {
      "user-agent": APLICATIVO,
      referer: "https://publike.org",
    }),
  );
  if (!resposta.corpo) return null; // fora do ar: não guarda
  const naArea = resposta.corpo.filter((a) => naRegiao({ lat: Number(a.lat), lng: Number(a.lon) }));
  let primeiro: (typeof naArea)[number] | undefined = naArea[0];
  if (cep) {
    let melhor = -1;
    for (const a of naArea) {
      // achar a porta vale mais que o CEP parecido
      const parecido = cepsParecidos(cep, limparCep(a.address?.postcode ?? "")) + (a.address?.house_number ? 10 : 0);
      if (parecido > melhor) {
        melhor = parecido;
        primeiro = a;
      }
    }
  }
  const ponto = primeiro ? { lat: Number(primeiro.lat), lng: Number(primeiro.lon) } : null;
  const end = primeiro?.address;
  const r: Achado | null = naRegiao(ponto)
    ? {
        ponto,
        comNumero: Boolean(end?.house_number),
        bairro: end?.suburb ?? end?.neighbourhood ?? end?.quarter ?? end?.city_district ?? null,
      }
    : null;
  if (PONTOS.size > 5000) PONTOS.clear();
  PONTOS.set(chave, { quando: Date.now(), r });
  return r;
}

/** O ponto que o mapa dá para a cidade inteira (o "meio" dela). */
function pontoDaCidade(cidade: string) {
  return procurarNoMapa({ q: `${cidade}, Goiás, Brasil` });
}

type Lugar = { ponto: Ponto; precisao: Precisao };

/** O ponto que outra vaga com endereço público já marcou para este CEP e número. */
async function pontoConhecido(cep: string, num: string): Promise<Ponto | null> {
  const n = num.replace(/[\s-]/g, "");
  if (MODO_DEMO || !/^[0-9]{1,6}[A-Za-z]?$/.test(n)) return null;
  try {
    const supabase = await criarClienteServidor();
    const { data } = await supabase.rpc("ponto_conhecido", { p_cep: cep, p_numero: n });
    const r = data?.[0];
    const p = r ? { lat: Number(r.lat), lng: Number(r.lng) } : null;
    return naRegiao(p) ? p : null;
  } catch {
    return null;
  }
}

async function pontoDoEndereco(
  e: EnderecoDoCep,
  num: string | null,
  doCep: Ponto | null,
): Promise<{ lugar: Lugar | null; cidade: Ponto | null }> {
  const base = { city: e.cidade, state: "Goiás", country: "Brasil" };
  const cidade = (await pontoDaCidade(e.cidade))?.ponto ?? null;
  // O ponto do CEP colado no meio da cidade é o "não sei" da BrasilAPI: não serve.
  const cepBom = naRegiao(doCep) && !(cidade && distanciaKm(doCep, cidade) < 2) ? doCep : null;

  // Referência para conferir a rua achada (há ruas com o mesmo nome em vários bairros).
  let bairro: Achado | null | undefined;
  const pontoDoBairro = async () => {
    if (bairro === undefined)
      bairro = e.bairro ? await procurarNoMapa({ q: `${e.bairro}, ${e.cidade}, Goiás, Brasil` }, e.cep) : null;
    return bairro;
  };
  const daRegiaoCerta = async (r: Achado) => {
    if (
      e.bairro &&
      r.bairro &&
      (chave(r.bairro).includes(chave(e.bairro)) || chave(e.bairro).includes(chave(r.bairro)))
    ) {
      return true;
    }
    const referencia = cepBom ?? (await pontoDoBairro())?.ponto ?? null;
    return !referencia || distanciaKm(r.ponto, referencia) <= 3;
  };

  // já marcado por outra vaga: vale, se ficar perto do bairro do CEP (um pino errado de propósito não leva longe)
  if (num) {
    const conhecido = await pontoConhecido(e.cep, num);
    if (conhecido) {
      const b = await pontoDoBairro();
      if (!b || distanciaKm(conhecido, b.ponto) <= 3)
        return { lugar: { ponto: conhecido, precisao: "conhecido" }, cidade };
    }
  }

  let rua: Achado | null = null;
  const ruas = e.rua ? variantesDaRua(e.rua) : [];
  if (num) {
    for (const nome of ruas) {
      const r = await procurarNoMapa({ ...base, street: `${num} ${nome}` }, e.cep);
      if (!r || !(await daRegiaoCerta(r))) continue;
      if (r.comNumero) return { lugar: { ponto: r.ponto, precisao: "numero" }, cidade };
      // sem o número no mapa, o resultado é a rua
      rua = r;
      break;
    }
  }
  // A rua do CEP vem antes do ponto do CEP: o ponto da BrasilAPI costuma ser o meio
  // do bairro (ou de um trecho grande), e quem digita o CEP espera ver a própria rua.
  if (!rua) {
    for (const nome of ruas) {
      const r = await procurarNoMapa({ ...base, street: nome }, e.cep);
      if (r && (await daRegiaoCerta(r))) {
        rua = r;
        break;
      }
    }
  }
  // a busca por campos às vezes não acha; o texto livre com o bairro acha
  if (!rua && e.bairro) {
    for (const nome of ruas) {
      const r = await procurarNoMapa({ q: `${nome}, ${e.bairro}, ${e.cidade}, Goiás, Brasil` }, e.cep);
      if (r && (await daRegiaoCerta(r))) {
        rua = r;
        break;
      }
    }
  }
  if (rua) return { lugar: { ponto: rua.ponto, precisao: "rua" }, cidade };
  if (cepBom) return { lugar: { ponto: cepBom, precisao: "cep" }, cidade };
  const b = await pontoDoBairro();
  if (b) return { lugar: { ponto: b.ponto, precisao: "bairro" }, cidade };
  return { lugar: null, cidade };
}

/**
 * Endereço e ponto de um CEP de Goiânia e região. Com o número, tenta achar a
 * porta. Sem ponto (o mapa não achou), devolve só o endereço: a pessoa marca
 * no mapa.
 */
export async function consultarCep(valor: string, num?: string | null): Promise<ConsultaCep> {
  const cep = limparCep(valor);
  if (!cepValido(cep)) return { ok: false, motivo: "invalido", erro: "O CEP tem 8 números." };
  const achado = await enderecoDoCep(cep);
  if (achado === "nao_achado")
    return { ok: false, motivo: "nao_achado", erro: "Não achamos esse CEP. Confira os números." };
  if (achado === "indisponivel") {
    return {
      ok: false,
      motivo: "indisponivel",
      erro: "Não deu para consultar o CEP agora. Escreva o bairro e marque o local no mapa.",
    };
  }
  const { endereco } = achado;
  const cidade = cidadeDaLista(endereco.cidade);
  if (endereco.uf !== "GO" || !cidade) {
    return {
      ok: false,
      motivo: "fora_da_regiao",
      erro: `Esse CEP é de ${endereco.cidade}${endereco.uf ? ` (${endereco.uf})` : ""}. Por enquanto o Publike funciona em Goiânia e região.`,
    };
  }
  const n =
    texto(num)
      ?.replace(/[^\dA-Za-z -]/g, "")
      .slice(0, 10) || null;
  const { lugar, cidade: meio } = await pontoDoEndereco({ ...endereco, cidade }, n, achado.ponto);
  const arredondar = (p: Ponto) => ({ lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5 });
  return {
    ok: true,
    endereco: { ...endereco, cidade },
    ponto: lugar ? arredondar(lugar.ponto) : null,
    precisao: lugar?.precisao ?? null,
    // sem ponto: onde abrir o mapa para a pessoa marcar
    centro: !lugar && meio ? arredondar(meio) : null,
  };
}

/** Ponto do meio de um bairro (para medir a distância de quem não deu o CEP). */
export async function centroDoBairro(bairro: string, cidade: string): Promise<Ponto | null> {
  const b = texto(bairro);
  if (!b || !cidadeDaLista(cidade)) return null;
  const r = await procurarNoMapa({ q: `${b}, ${cidade}, Goiás, Brasil` });
  return r ? { lat: Math.round(r.ponto.lat * 1e4) / 1e4, lng: Math.round(r.ponto.lng * 1e4) / 1e4 } : null;
}

// ------------------------------------------------------------------ do ponto ao endereço

type RespostaReversa = {
  error?: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    suburb?: string;
    neighbourhood?: string;
    quarter?: string;
    city_district?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    postcode?: string;
  };
};

const ENDERECOS = new Map<string, { quando: number; r: ConsultaPonto }>();

/**
 * O endereço de um ponto ("Usar minha localização" ao publicar), pelo OpenStreetMap.
 * Grátis, na mesma fila de uma consulta por segundo. Pontos a menos de ~10 m um do
 * outro dão a mesma resposta guardada. O número da casa quase nunca está no mapa:
 * a rua vem sem ele, e a pessoa completa.
 */
export async function enderecoDoPonto(lat: number, lng: number): Promise<ConsultaPonto> {
  const ponto = { lat, lng };
  if (!naRegiao(ponto)) return { ok: false, erro: "Esse lugar fica fora de Goiânia e região." };
  const chave = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const guardado = ENDERECOS.get(chave);
  if (guardado && Date.now() - guardado.quando < UM_DIA) return guardado.r;

  const q = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    zoom: "18",
    lat: lat.toFixed(6),
    lon: lng.toFixed(6),
    "accept-language": "pt-BR",
  });
  const resposta = await naFila(() =>
    buscarJson<RespostaReversa>(`${NOMINATIM}/reverse?${q}`, {
      "user-agent": APLICATIVO,
      referer: "https://publike.org",
    }),
  );
  if (!resposta.corpo) return { ok: false, erro: "Não conseguimos o endereço agora. Preencha pelo CEP." };
  const a = resposta.corpo.address ?? {};
  const cidade = cidadeDaLista(texto(a.city ?? a.town ?? a.municipality ?? a.village) ?? "");
  let r: ConsultaPonto;
  if (resposta.corpo.error || !cidade) {
    r = { ok: false, erro: "Não achamos o endereço desse ponto. Preencha pelo CEP." };
  } else {
    const cep = limparCep(a.postcode ?? "");
    r = {
      ok: true,
      endereco: {
        rua: texto(a.road ?? a.pedestrian),
        numero: texto(a.house_number),
        bairro: texto(a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district),
        cidade,
        cep: cepValido(cep) ? cep : null,
      },
    };
  }
  if (ENDERECOS.size > 5000) ENDERECOS.clear();
  ENDERECOS.set(chave, { quando: Date.now(), r });
  return r;
}
