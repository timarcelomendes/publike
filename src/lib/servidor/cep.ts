import "server-only";
import { bairroDaReceita } from "@/lib/cnpj";
import { cepValido, limparCep, type ConsultaCep, type EnderecoDoCep, type Precisao } from "@/lib/cep";
import { REGIAO } from "@/lib/config";
import { CIDADES } from "@/lib/constantes";

// Do CEP (e do número) para um ponto no mapa, de graça e sem chave:
//   1. o endereço vem da BrasilAPI (CEP v2, que às vezes já traz o ponto) ou,
//      se ela falhar, do ViaCEP;
//   2. o ponto vem do OpenStreetMap (Nominatim): primeiro a rua com o número,
//      depois o ponto do CEP, depois só a rua, depois o bairro. Quem publica
//      confere e ajusta o pino no mapa.
// Cuidados que a vida real pediu:
//   * Para muitos CEPs a BrasilAPI devolve o meio da cidade (o mesmo ponto
//     para CEPs de bairros diferentes). Ponto do CEP colado no centro da
//     cidade não vale.
//   * "Rua JCA7" no CEP é "Rua JCA 7" no mapa: tentamos as duas.
//   * Há "Rua 1" em vários bairros: a rua achada só vale perto do bairro do CEP.
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

/** "Rua JCA7" → ["Rua JCA7", "Rua JCA 7"]: o OpenStreetMap separa letras e números. */
function variantesDaRua(rua: string) {
  const separada = rua
    .replace(/([A-Za-zÀ-ÿ])(?=\d)|(\d)(?=[A-Za-zÀ-ÿ])/g, "$1$2 ")
    .replace(/\s+/g, " ")
    .trim();
  return [...new Set([rua, separada])];
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

/** Uma consulta por vez, com pelo menos 1,1 s entre elas (regra do Nominatim). */
function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
  const vez = fila.then(async () => {
    const espera = ultima + 1100 - Date.now();
    if (espera > 0) await new Promise((ok) => setTimeout(ok, espera));
    try {
      return await tarefa();
    } finally {
      ultima = Date.now();
    }
  });
  fila = vez.catch(() => undefined);
  return vez;
}

async function procurarNoMapa(params: Record<string, string>): Promise<Achado | null> {
  const q = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    limit: "1",
    countrycodes: "br",
    // só dentro de Goiânia e região
    viewbox: `${REGIAO.lngMin},${REGIAO.latMax},${REGIAO.lngMax},${REGIAO.latMin}`,
    bounded: "1",
    ...params,
  });
  const chave = q.toString();
  const guardado = PONTOS.get(chave);
  if (guardado && Date.now() - guardado.quando < UM_DIA) return guardado.r;

  const resposta = await naFila(() =>
    buscarJson<RespostaNominatim>(`${NOMINATIM}/search?${chave}`, {
      "user-agent": APLICATIVO,
      referer: "https://publike.org",
    }),
  );
  if (!resposta.corpo) return null; // fora do ar: não guarda
  const primeiro = resposta.corpo[0];
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
      bairro = e.bairro ? await procurarNoMapa({ q: `${e.bairro}, ${e.cidade}, Goiás, Brasil` }) : null;
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

  let rua: Achado | null = null;
  const ruas = e.rua ? variantesDaRua(e.rua) : [];
  if (num) {
    for (const nome of ruas) {
      const r = await procurarNoMapa({ ...base, street: `${num} ${nome}` });
      if (!r || !(await daRegiaoCerta(r))) continue;
      if (r.comNumero) return { lugar: { ponto: r.ponto, precisao: "numero" }, cidade };
      // sem o número no mapa, o resultado é a rua
      rua = r;
      break;
    }
  }
  if (cepBom) return { lugar: { ponto: cepBom, precisao: "cep" }, cidade };
  if (!rua && !num) {
    for (const nome of ruas) {
      const r = await procurarNoMapa({ ...base, street: nome });
      if (r && (await daRegiaoCerta(r))) {
        rua = r;
        break;
      }
    }
  }
  if (rua) return { lugar: { ponto: rua.ponto, precisao: "rua" }, cidade };
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
