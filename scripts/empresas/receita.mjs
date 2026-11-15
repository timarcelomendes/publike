#!/usr/bin/env node
// A base de empresas da Receita (claude/plano-base-de-empresas-da-receita.md, parte 0). Sem dependências: Node 22 e o
// `unzip` do sistema. Usado pelo robô (.github/workflows/empresas.yml), um zip por vez (para caber no disco do GitHub):
//
// 1. Os estabelecimentos que servem (ativos, de Goiás, das cidades das praças ou agências de RH de Goiás inteiro):
//      node scripts/empresas/receita.mjs estabelecimentos estab.jsonl --pracas pracas.json --municipios Municipios.zip \
//        [--ibge ibge.json] Estabelecimentos0.zip ...            (acrescenta no estab.jsonl)
// 2. Das empresas desses estabelecimentos: razão social, natureza, porte e capital:
//      node scripts/empresas/receita.mjs empresas empresas.jsonl --estab estab.jsonl Empresas0.zip ...
// 3. Quem é MEI:
//      node scripts/empresas/receita.mjs simples meis.txt --estab estab.jsonl Simples.zip
// 4. Juntar, pôr no mapa (CNEFE do IBGE) e cortar em lotes para o site:
//      node scripts/empresas/receita.mjs montar lotes/ --mes 2026-11 --estab estab.jsonl --empresas empresas.jsonl \
//        --meis meis.txt --cnaes Cnaes.zip [--cnefe 52_GO.zip]
//    Sai lotes/empresas-0001.json…, lotes/meis-0001.json…, lotes/cnaes-0001.json… e lotes/fim.json; cada um vai no
//    POST /api/empresas, nessa ordem, e o fim.json por último.
//
// Os arquivos da Receita são CSV com ';', tudo entre aspas, em Latin-1, sem cabeçalho. Sócios e CPF nunca entram.
// O MEI fica de fora da base (o endereço quase sempre é a casa da pessoa): dele só vão as contagens por bairro e ramo.

import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const AGENCIAS = new Set(["7810800", "7820500", "7830200"]);
const EMPRESARIO_INDIVIDUAL = "2135";
const LOTE_EMPRESAS = 1500;
const LOTE_MEIS = 4000;
/** As contagens do MEI: só as aberturas dos últimos 24 meses. */
const MESES_DO_MEI = 24;

export function normalizarNome(nome) {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Uma linha do CSV da Receita: `"a";"b";"c"` (aspas dobradas dentro do campo viram uma). */
export function campos(linha) {
  const saida = [];
  let valor = "";
  let dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (dentro) {
      if (ch === '"') {
        if (linha[i + 1] === '"') {
          valor += '"';
          i++;
        } else dentro = false;
      } else valor += ch;
    } else if (ch === '"') dentro = true;
    else if (ch === ";") {
      saida.push(valor);
      valor = "";
    } else valor += ch;
  }
  saida.push(valor);
  return saida;
}

/** Aspas abertas no fim da linha (um campo com quebra de linha dentro): junta com a próxima. */
function aspasAbertas(linha) {
  let dentro = false;
  for (let i = 0; i < linha.length; i++) {
    if (linha[i] === '"') {
      if (dentro && linha[i + 1] === '"') i++;
      else dentro = !dentro;
    }
  }
  return dentro;
}

/** Cada registro de cada arquivo de dentro do zip (o `unzip -p` lê sem descompactar no disco). */
async function* registros(zip, codificacao = "latin1") {
  const filho = spawn("unzip", ["-p", zip], { stdio: ["ignore", "pipe", "inherit"] });
  filho.stdout.setEncoding(codificacao);
  const linhas = createInterface({ input: filho.stdout, crlfDelay: Infinity });
  let pendente = "";
  for await (const linha of linhas) {
    const l = pendente ? `${pendente}\n${linha}` : linha;
    if (aspasAbertas(l)) {
      pendente = l;
      continue;
    }
    pendente = "";
    if (!l.trim()) continue;
    yield campos(l);
  }
  const codigo = await new Promise((resolve) => (filho.exitCode !== null ? resolve(filho.exitCode) : filho.on("close", resolve)));
  if (codigo !== 0) throw new Error(`unzip ${zip} saiu com ${codigo}`);
}

async function* linhasJson(arquivo) {
  if (!existsSync(arquivo)) return;
  const linhas = createInterface({ input: createReadStream(arquivo, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const l of linhas) if (l) yield JSON.parse(l);
}

const PEQUENAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "para", "com"]);
const SIGLAS = new Set(["ltda", "me", "epp", "eireli", "s/a", "sa", "s.a", "s.a.", "cia", "ss", "slu", "rh", "ti", "go"]);

/** "PADARIA PAO QUENTE LTDA" → "Padaria Pao Quente LTDA". */
export function titulo(texto) {
  const t = String(texto ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!t) return "";
  return t
    .toLowerCase()
    .split(" ")
    .map((p, i) => {
      if (SIGLAS.has(p)) return p.toUpperCase();
      if (i > 0 && PEQUENAS.has(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
}

function data(aaaammdd) {
  const t = String(aaaammdd ?? "").trim();
  if (!/^\d{8}$/.test(t) || t === "00000000") return null;
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
}

function telefone(ddd, numero) {
  const d = String(ddd ?? "").replace(/\D/g, "");
  const n = String(numero ?? "").replace(/\D/g, "");
  if (n.length < 8) return null;
  const meio = n.length - 4;
  return `${d ? `(${d.slice(-2)}) ` : ""}${n.slice(0, meio)}-${n.slice(meio)}`;
}

function numeroDoEndereco(texto) {
  const n = String(texto ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return n || null;
}

function opcoesELivres(argv) {
  const opcoes = {};
  const livres = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) opcoes[argv[i].slice(2)] = argv[++i];
    else livres.push(argv[i]);
  }
  return { opcoes, livres };
}

/** Os municípios da Receita (código próprio dela → nome) e o nome bonito pelo IBGE ("ANAPOLIS" → "Anápolis"). */
async function municipiosDaReceita(zip, ibge) {
  const nomes = new Map();
  for await (const [codigo, nome] of registros(zip)) nomes.set(codigo, nome);
  const bonitos = new Map();
  if (ibge && existsSync(ibge)) {
    for (const m of JSON.parse(readFileSync(ibge, "utf8"))) bonitos.set(normalizarNome(m.nome), m.nome);
  }
  return { nomes, bonitos };
}

// 1. Estabelecimentos ---------------------------------------------------------------------------------------------

async function estabelecimentos(saida, opcoes, zips) {
  if (!saida || !opcoes.pracas || !opcoes.municipios || !zips.length) {
    throw new Error("Use: estabelecimentos <saida.jsonl> --pracas pracas.json --municipios Municipios.zip Estabelecimentos*.zip");
  }
  const pracas = JSON.parse(readFileSync(opcoes.pracas, "utf8"));
  const daPraca = new Map();
  for (const [chave, p] of Object.entries(pracas)) for (const c of p.cidades) daPraca.set(normalizarNome(c), { chave, nome: c });
  const { nomes, bonitos } = await municipiosDaReceita(opcoes.municipios, opcoes.ibge);
  const contas = { lidos: 0, goias: 0, ativos: 0, guardados: 0, agencias_fora: 0, colunas_curtas: 0 };
  let buffer = [];
  const escrever = () => {
    if (buffer.length) appendFileSync(saida, buffer.join(""));
    buffer = [];
  };
  for (const zip of zips) {
    for await (const v of registros(zip)) {
      contas.lidos++;
      if (v.length < 28) {
        contas.colunas_curtas++;
        continue;
      }
      if (v[19] !== "GO") continue;
      contas.goias++;
      if (v[5] !== "02") continue;
      contas.ativos++;
      const nomeReceita = nomes.get(v[20]) ?? "";
      const praca = daPraca.get(normalizarNome(nomeReceita));
      const cnae = v[11];
      const agencia = AGENCIAS.has(cnae);
      if (!praca && !agencia) continue;
      if (!praca) contas.agencias_fora++;
      const cidade = praca?.nome ?? bonitos.get(normalizarNome(nomeReceita)) ?? titulo(nomeReceita);
      const cnpj = `${v[0]}${v[1]}${v[2]}`.toUpperCase();
      buffer.push(
        `${JSON.stringify({
          cnpj,
          b: v[0].toUpperCase(),
          m: v[3] === "1",
          f: v[4],
          a: v[10],
          c: cnae,
          s: v[12],
          tl: v[13],
          l: v[14],
          n: v[15],
          co: v[16],
          ba: v[17],
          cep: v[18].replace(/\D/g, ""),
          ci: cidade,
          p: Boolean(praca),
          t1: telefone(v[21], v[22]),
          t2: telefone(v[23], v[24]),
          e: v[27],
        })}\n`,
      );
      contas.guardados++;
      if (buffer.length >= 5000) escrever();
    }
  }
  escrever();
  console.log(JSON.stringify({ saida, zips: zips.length, ...contas }));
}

async function basicosDe(estab) {
  const basicos = new Set();
  for await (const e of linhasJson(estab)) basicos.add(e.b);
  return basicos;
}

// 2. Empresas -----------------------------------------------------------------------------------------------------

async function empresas(saida, opcoes, zips) {
  if (!saida || !opcoes.estab || !zips.length) throw new Error("Use: empresas <saida.jsonl> --estab estab.jsonl Empresas*.zip");
  const basicos = await basicosDe(opcoes.estab);
  let achadas = 0;
  let buffer = [];
  for (const zip of zips) {
    for await (const v of registros(zip)) {
      const b = (v[0] ?? "").toUpperCase();
      if (!basicos.has(b)) continue;
      achadas++;
      buffer.push(`${JSON.stringify({ b, r: v[1], nj: v[2], cap: v[4], po: v[5] })}\n`);
      if (buffer.length >= 5000) {
        appendFileSync(saida, buffer.join(""));
        buffer = [];
      }
    }
  }
  if (buffer.length) appendFileSync(saida, buffer.join(""));
  console.log(JSON.stringify({ saida, procuradas: basicos.size, achadas }));
}

// 3. Simples (quem é MEI) -----------------------------------------------------------------------------------------

async function simples(saida, opcoes, zips) {
  if (!saida || !opcoes.estab || !zips.length) throw new Error("Use: simples <saida.txt> --estab estab.jsonl Simples.zip");
  const basicos = await basicosDe(opcoes.estab);
  const meis = [];
  for (const zip of zips) {
    for await (const v of registros(zip)) {
      const b = (v[0] ?? "").toUpperCase();
      // MEI hoje: optou e não saiu (data de exclusão vazia ou zerada)
      if (basicos.has(b) && v[4] === "S" && !data(v[6])) meis.push(b);
    }
  }
  writeFileSync(saida, meis.join("\n"));
  console.log(JSON.stringify({ saida, procuradas: basicos.size, meis: meis.length }));
}

// 4. Montar -------------------------------------------------------------------------------------------------------

/** O CNEFE de Goiás: o ponto de cada número de cada CEP que interessa, e o meio de cada CEP. */
async function pontosDoCnefe(zip, ceps) {
  const exatos = new Map();
  const somas = new Map();
  if (!zip || !existsSync(zip)) return { exatos, meios: new Map(), lidos: 0 };
  const filho = spawn("unzip", ["-p", zip], { stdio: ["ignore", "pipe", "inherit"] });
  filho.stdout.setEncoding("utf8");
  const linhas = createInterface({ input: filho.stdout, crlfDelay: Infinity });
  let col = null;
  let sep = ";";
  let lidos = 0;
  for await (const linha of linhas) {
    if (!col) {
      sep = [";", ",", "\t"].sort((a, b) => linha.split(b).length - linha.split(a).length)[0];
      const nomes = linha.split(sep).map((n) => n.replace(/"/g, "").trim().toUpperCase());
      col = {
        cep: nomes.indexOf("CEP"),
        numero: nomes.indexOf("NUM_ENDERECO"),
        lat: nomes.indexOf("LATITUDE"),
        lng: nomes.indexOf("LONGITUDE"),
      };
      if (col.cep < 0 || col.lat < 0 || col.lng < 0) throw new Error(`CNEFE sem CEP/LATITUDE/LONGITUDE: ${linha.slice(0, 300)}`);
      continue;
    }
    lidos++;
    const v = linha.split(sep).map((x) => x.replace(/"/g, ""));
    const cep = (v[col.cep] ?? "").replace(/\D/g, "");
    if (!ceps.has(cep)) continue;
    const lat = Number(String(v[col.lat]).replace(",", "."));
    const lng = Number(String(v[col.lng]).replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) continue;
    const num = col.numero >= 0 ? numeroDoEndereco(v[col.numero]) : null;
    if (num && !exatos.has(`${cep}|${num}`)) exatos.set(`${cep}|${num}`, [lat, lng]);
    const s = somas.get(cep) ?? [0, 0, 0];
    s[0] += lat;
    s[1] += lng;
    s[2]++;
    somas.set(cep, s);
  }
  const meios = new Map();
  for (const [cep, [la, ln, n]] of somas) meios.set(cep, [la / n, ln / n]);
  return { exatos, meios, lidos };
}

function arredondar(x) {
  return Math.round(x * 1e6) / 1e6;
}

async function montar(pasta, opcoes) {
  if (!pasta || !opcoes.mes || !opcoes.estab || !opcoes.empresas || !opcoes.cnaes) {
    throw new Error("Use: montar <pasta> --mes AAAA-MM --estab estab.jsonl --empresas empresas.jsonl --meis meis.txt --cnaes Cnaes.zip [--cnefe 52_GO.zip]");
  }
  if (!/^\d{4}-\d{2}$/.test(opcoes.mes)) throw new Error("--mes AAAA-MM");
  mkdirSync(pasta, { recursive: true });
  const mes = `${opcoes.mes}-01`;
  const meis = new Set(
    opcoes.meis && existsSync(opcoes.meis)
      ? readFileSync(opcoes.meis, "utf8")
          .split("\n")
          .filter(Boolean)
      : [],
  );
  const dados = new Map();
  for await (const e of linhasJson(opcoes.empresas)) dados.set(e.b, e);

  const nomesCnae = new Map();
  for await (const [codigo, nome] of registros(opcoes.cnaes)) if (/^\d{7}$/.test(codigo)) nomesCnae.set(codigo, nome);

  // os CEPs que precisam de ponto (fora o MEI)
  const ceps = new Set();
  for await (const e of linhasJson(opcoes.estab)) if (!meis.has(e.b) && /^\d{8}$/.test(e.cep)) ceps.add(e.cep);
  const cnefe = await pontosDoCnefe(opcoes.cnefe, ceps);

  const desdeMei = new Date();
  desdeMei.setUTCMonth(desdeMei.getUTCMonth() - MESES_DO_MEI);
  const corteMei = desdeMei.toISOString().slice(0, 7);

  const contas = { empresas: 0, meis: 0, sem_dados: 0, ponto_exato: 0, ponto_cep: 0, sem_ponto: 0, agencias: 0, na_praca: 0 };
  const porMei = new Map();
  let lote = [];
  let nLote = 0;
  const soltar = () => {
    if (!lote.length) return;
    nLote++;
    writeFileSync(join(pasta, `empresas-${String(nLote).padStart(4, "0")}.json`), JSON.stringify({ acao: "lote", mes, linhas: lote }));
    lote = [];
  };
  for await (const e of linhasJson(opcoes.estab)) {
    if (meis.has(e.b)) {
      contas.meis++;
      const aberto = (data(e.a) ?? "").slice(0, 7);
      if (e.p && aberto >= corteMei) {
        const chave = `${e.ci}\t${titulo(e.ba)}\t${e.c}\t${aberto}-01`;
        porMei.set(chave, (porMei.get(chave) ?? 0) + 1);
      }
      continue;
    }
    const d = dados.get(e.b);
    if (!d) contas.sem_dados++;
    const natureza = d?.nj ?? null;
    const pessoa = natureza === EMPRESARIO_INDIVIDUAL;
    const razao = d?.r && !pessoa ? titulo(d.r) : null;
    const fantasia = titulo(e.f);
    const nomeDoRamo = nomesCnae.get(e.c);
    const nome = fantasia || razao || (nomeDoRamo ? `${nomeDoRamo}` : "Empresa sem nome");
    const num = numeroDoEndereco(e.n);
    let ponto = null;
    let precisao = null;
    if (num && cnefe.exatos.has(`${e.cep}|${num}`)) {
      ponto = cnefe.exatos.get(`${e.cep}|${num}`);
      precisao = "endereco";
      contas.ponto_exato++;
    } else if (cnefe.meios.has(e.cep)) {
      ponto = cnefe.meios.get(e.cep);
      precisao = "cep";
      contas.ponto_cep++;
    } else contas.sem_ponto++;
    const porte = { "01": "micro", "03": "pequena", "05": "demais" }[d?.po ?? ""] ?? null;
    const capital = d?.cap ? Number(String(d.cap).replace(/\./g, "").replace(",", ".")) : null;
    const agencia = AGENCIAS.has(e.c);
    if (agencia) contas.agencias++;
    if (e.p) contas.na_praca++;
    lote.push({
      cnpj: e.cnpj,
      cnpj_basico: e.b,
      matriz: e.m,
      nome,
      razao_social: razao,
      busca: normalizarNome(`${fantasia} ${razao ?? ""}`) || normalizarNome(nome),
      data_abertura: data(e.a),
      cnae: /^\d{7}$/.test(e.c) ? e.c : null,
      cnaes_secundarios: String(e.s ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter((x) => /^\d{7}$/.test(x)),
      logradouro: [titulo(e.tl), titulo(e.l)].filter(Boolean).join(" ") || null,
      numero: num ?? (e.n ? String(e.n).slice(0, 20) : null),
      complemento: titulo(e.co) || null,
      bairro: titulo(e.ba) || null,
      cep: /^\d{8}$/.test(e.cep) ? e.cep : null,
      cidade: e.ci,
      uf: "GO",
      lat: ponto ? arredondar(ponto[0]) : null,
      lng: ponto ? arredondar(ponto[1]) : null,
      precisao,
      porte,
      natureza,
      capital_social: Number.isFinite(capital) ? capital : null,
      telefone: e.t1 || e.t2 || null,
      email: e.e ? String(e.e).trim().toLowerCase() : null,
      na_praca: e.p,
      agencia,
    });
    contas.empresas++;
    if (lote.length >= LOTE_EMPRESAS) soltar();
  }
  soltar();

  const linhasMei = [...porMei].map(([chave, quantos]) => {
    const [cidade, bairro, cnae, mes_abertura] = chave.split("\t");
    return { cidade, bairro, cnae, mes_abertura, quantos };
  });
  let nMei = 0;
  for (let i = 0; i < linhasMei.length; i += LOTE_MEIS) {
    nMei++;
    writeFileSync(
      join(pasta, `meis-${String(nMei).padStart(4, "0")}.json`),
      JSON.stringify({ acao: "meis", mes, linhas: linhasMei.slice(i, i + LOTE_MEIS) }),
    );
  }
  const linhasCnae = [...nomesCnae].map(([cnae, nome]) => ({ cnae, nome }));
  let nCnae = 0;
  for (let i = 0; i < linhasCnae.length; i += 4000) {
    nCnae++;
    writeFileSync(
      join(pasta, `cnaes-${String(nCnae).padStart(4, "0")}.json`),
      JSON.stringify({ acao: "cnaes", linhas: linhasCnae.slice(i, i + 4000) }),
    );
  }
  const resumo = { ...contas, cnefe_lidos: cnefe.lidos, ceps: ceps.size, meis_grupos: linhasMei.length, lotes: nLote };
  writeFileSync(join(pasta, "fim.json"), JSON.stringify({ acao: "fim", mes, resumo }));
  console.log(JSON.stringify({ pasta, mes, ...resumo, lotes_mei: nMei, lotes_cnae: nCnae }));
}

async function principal() {
  const [comando, ...resto] = process.argv.slice(2);
  const { opcoes, livres } = opcoesELivres(resto);
  if (comando === "estabelecimentos") return estabelecimentos(livres[0], opcoes, livres.slice(1));
  if (comando === "empresas") return empresas(livres[0], opcoes, livres.slice(1));
  if (comando === "simples") return simples(livres[0], opcoes, livres.slice(1));
  if (comando === "montar") return montar(livres[0], opcoes);
  throw new Error("Comandos: estabelecimentos, empresas, simples, montar (veja o começo de scripts/empresas/receita.mjs).");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
