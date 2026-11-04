#!/usr/bin/env node
// Salário do mercado (claude/plano-salario-e-curriculo.md, parte 1): conta as faixas de salário por função (CBO) e
// região nos microdados do Novo Caged. Sem dependências: Node 22. Usado pelo robô (.github/workflows/salarios.yml)
// e, no plano B, no computador do admin (o resultado vai por upload em Admin › Salários).
//
// Os arquivos do Caged ficam no FTP do Ministério do Trabalho (PDET), um mês por pasta:
//   ftp://ftp.mtps.gov.br/pdet/microdados/NOVO CAGED/<ano>/<AAAAMM>/CAGEDMOV<AAAAMM>.7z (no prazo)
//   ftp://ftp.mtps.gov.br/pdet/microdados/NOVO CAGED/<ano>/<AAAAMM>/CAGEDFOR<AAAAMM>.7z (fora do prazo)
// Cada .7z tem um .txt (abra com o 7z). As canceladas (CAGEDEXC) ficam de fora: são menos de 1% e não mudam a faixa.
//
// 1. Um mês: só Goiás, só contratações em jornada integral (36 horas ou mais por semana, para contar a escala 12x36),
//    sem aprendiz e sem intermitente, com salário entre meio e 15 salários mínimos:
//      node scripts/salarios/caged.mjs filtrar go-202609.tsv CAGEDMOV202609.txt CAGEDFOR202609.txt
// 2. Os 12 meses: as faixas por função e região (a praça do Publike e Goiás inteiro), só com 30 contratações ou mais:
//      node scripts/salarios/caged.mjs calcular salarios.json --pracas pracas.json --municipios ibge.json go-*.tsv
//    pracas.json: o "pracas" do GET /api/salarios. ibge.json: a lista de municípios de Goiás da API do IBGE
//    (servicodados.ibge.gov.br/api/v1/localidades/estados/52/municipios) ou um CSV com codigo_ibge,nome,codigo_uf.
// 3. O salarios.json vai para o site: POST /api/salarios (o robô) ou o upload em Admin › Salários.

import { createReadStream, readFileSync, writeFileSync, openSync, readSync, closeSync } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

/** O salário mínimo de cada ano (para o filtro de meio a 15 mínimos); ano sem valor usa o mais novo. */
const MINIMO = { 2020: 1045, 2021: 1100, 2022: 1212, 2023: 1320, 2024: 1412, 2025: 1518, 2026: 1621 };
const HORAS_INTEGRAL = 36;
const MINIMO_DE_CONTRATACOES = 30;
const GOIAS = "52";

function minimoDoAno(ano) {
  if (MINIMO[ano]) return MINIMO[ano];
  const anos = Object.keys(MINIMO)
    .map(Number)
    .sort((a, b) => a - b);
  return MINIMO[ano < anos[0] ? anos[0] : anos[anos.length - 1]];
}

/** "Município" → "municipio"; "cbo2002ocupação" → "cbo2002ocupacao" (sem acento, espaço e pontuação). */
export function normalizarColuna(nome) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function normalizarNome(nome) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "1.621,50", "1621.5", "1621,5" → 1621.5. */
export function numero(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return NaN;
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
  return Number(t);
}

/** O arquivo é UTF-8? (o Caged já saiu em Latin-1 em alguns anos: lê os primeiros 64 kB para saber) */
function codificacao(arquivo) {
  const fd = openSync(arquivo, "r");
  const amostra = Buffer.alloc(65536);
  const lidos = readSync(fd, amostra, 0, amostra.length, 0);
  closeSync(fd);
  const texto = amostra.subarray(0, lidos).toString("utf8");
  return texto.includes("�") ? "latin1" : "utf8";
}

const SIM = new Set(["1", "s", "sim"]);

/** Lê um .txt do Caged e devolve as contratações de Goiás que contam, com o motivo de cada uma que ficou de fora. */
async function lerArquivo(arquivo, guardar, contas) {
  const linhas = createInterface({
    input: createReadStream(arquivo, { encoding: codificacao(arquivo) }),
    crlfDelay: Infinity,
  });
  let colunas = null;
  let separador = ";";
  for await (const linha of linhas) {
    if (!colunas) {
      separador = [";", "\t", ","].sort((a, b) => linha.split(b).length - linha.split(a).length)[0];
      const nomes = linha.split(separador).map(normalizarColuna);
      const achar = (...opcoes) => nomes.findIndex((n) => opcoes.includes(n));
      colunas = {
        uf: achar("uf"),
        municipio: achar("municipio"),
        cbo: achar("cbo2002ocupacao", "cbo2002"),
        saldo: achar("saldomovimentacao"),
        salario: achar("salario"),
        horas: achar("horascontratuais"),
        aprendiz: achar("indicadoraprendiz"),
        intermitente: achar("indtrabintermitente"),
        competencia: achar("competenciamov", "competencia"),
      };
      const faltam = ["municipio", "cbo", "saldo", "salario", "horas"].filter((c) => colunas[c] < 0);
      if (faltam.length)
        throw new Error(
          `${basename(arquivo)}: faltam as colunas ${faltam.join(", ")} (cabeçalho: ${linha.slice(0, 300)})`,
        );
      contas.colunas ??= Object.fromEntries(Object.entries(colunas).map(([k, v]) => [k, v >= 0]));
      continue;
    }
    if (!linha.trim()) continue;
    contas.lidas++;
    const v = linha.split(separador);
    const municipio = (v[colunas.municipio] ?? "").trim();
    const uf = colunas.uf >= 0 ? (v[colunas.uf] ?? "").trim() : municipio.slice(0, 2);
    if (uf !== GOIAS && !municipio.startsWith(GOIAS)) continue;
    contas.goias++;
    if ((v[colunas.saldo] ?? "").trim() !== "1") continue;
    contas.contratacoes++;
    const fora = (motivo) => (contas.fora[motivo] = (contas.fora[motivo] ?? 0) + 1);
    const aprendiz = colunas.aprendiz >= 0 ? (v[colunas.aprendiz] ?? "").trim().toLowerCase() : "";
    const intermitente = colunas.intermitente >= 0 ? (v[colunas.intermitente] ?? "").trim().toLowerCase() : "";
    // os valores dessas marcas aparecem no resumo, para conferir no primeiro arquivo de verdade
    contas.valores.aprendiz[aprendiz] = (contas.valores.aprendiz[aprendiz] ?? 0) + 1;
    contas.valores.intermitente[intermitente] = (contas.valores.intermitente[intermitente] ?? 0) + 1;
    if (SIM.has(aprendiz)) {
      fora("aprendiz");
      continue;
    }
    if (SIM.has(intermitente)) {
      fora("intermitente");
      continue;
    }
    const horas = numero(v[colunas.horas]);
    if (!(horas >= HORAS_INTEGRAL)) {
      fora("meio período");
      continue;
    }
    const cbo = (v[colunas.cbo] ?? "").trim().padStart(6, "0");
    if (!/^[0-9]{6}$/.test(cbo) || cbo === "000000") {
      fora("sem ocupação");
      continue;
    }
    const competencia = colunas.competencia >= 0 ? (v[colunas.competencia] ?? "").trim() : "";
    const ano = Number(competencia.slice(0, 4)) || new Date().getFullYear();
    const minimo = minimoDoAno(ano);
    const salario = numero(v[colunas.salario]);
    if (!(salario >= minimo / 2 && salario <= minimo * 15)) {
      fora("salário fora de meio a 15 mínimos");
      continue;
    }
    contas.mantidas++;
    guardar(`${municipio}\t${cbo}\t${salario.toFixed(2)}\n`);
  }
}

async function filtrar(saida, arquivos) {
  if (!saida || !arquivos.length) throw new Error("Use: filtrar <saida.tsv> <CAGEDMOV.txt> [CAGEDFOR.txt]");
  const partes = [];
  const contas = {
    lidas: 0,
    goias: 0,
    contratacoes: 0,
    mantidas: 0,
    fora: {},
    valores: { aprendiz: {}, intermitente: {} },
  };
  for (const arquivo of arquivos) await lerArquivo(arquivo, (l) => partes.push(l), contas);
  writeFileSync(saida, partes.join(""));
  console.log(JSON.stringify({ saida, arquivos: arquivos.map((a) => basename(a)), ...contas }));
}

/** O percentil com interpolação entre os vizinhos (o mesmo do Excel e do R, tipo 7). */
export function percentil(ordenados, p) {
  if (!ordenados.length) return NaN;
  const pos = (ordenados.length - 1) * p;
  const baixo = Math.floor(pos);
  const alto = Math.ceil(pos);
  return ordenados[baixo] + (ordenados[alto] - ordenados[baixo]) * (pos - baixo);
}

/** Os municípios de Goiás pela API do IBGE ([{id, nome}]) ou por um CSV (codigo_ibge,nome,codigo_uf). */
function lerMunicipios(arquivo) {
  const texto = readFileSync(arquivo, "utf8");
  const lista = [];
  if (texto.trimStart().startsWith("[")) {
    for (const m of JSON.parse(texto)) lista.push({ codigo: String(m.id), nome: m.nome });
  } else {
    const [cabeca, ...linhas] = texto.split(/\r?\n/);
    const c = cabeca.split(",");
    const iCodigo = c.indexOf("codigo_ibge");
    const iNome = c.indexOf("nome");
    const iUf = c.indexOf("codigo_uf");
    for (const l of linhas) {
      const v = l.split(",");
      if (v.length > Math.max(iCodigo, iNome) && (iUf < 0 || v[iUf] === GOIAS))
        lista.push({ codigo: v[iCodigo], nome: v[iNome] });
    }
  }
  // o Caged usa o código do IBGE sem o último dígito (Goiânia: 5208707 → 520870)
  return new Map(
    lista.filter((m) => m.codigo.startsWith(GOIAS)).map((m) => [normalizarNome(m.nome), m.codigo.slice(0, 6)]),
  );
}

async function calcular(saida, opcoes, arquivos) {
  if (!saida || !opcoes.pracas || !opcoes.municipios || !arquivos.length) {
    throw new Error("Use: calcular <saida.json> --pracas pracas.json --municipios ibge.json go-AAAAMM.tsv...");
  }
  const pracas = JSON.parse(readFileSync(opcoes.pracas, "utf8"));
  const codigos = lerMunicipios(opcoes.municipios);
  const regiaoDoMunicipio = new Map();
  const semCodigo = [];
  for (const [regiao, praca] of Object.entries(pracas)) {
    for (const cidade of praca.cidades) {
      const codigo = codigos.get(normalizarNome(cidade));
      if (codigo) regiaoDoMunicipio.set(codigo, regiao);
      else semCodigo.push(cidade);
    }
  }
  if (semCodigo.length) console.error(`Aviso: cidades sem código do IBGE (ficam só em Goiás): ${semCodigo.join(", ")}`);
  const meses = arquivos
    .map((a) => basename(a).match(/(\d{6})/)?.[1])
    .filter(Boolean)
    .sort();
  if (meses.length !== arquivos.length)
    throw new Error("Cada arquivo filtrado precisa do mês no nome (go-AAAAMM.tsv).");
  const grupos = new Map();
  const somar = (chave, valor) => {
    const g = grupos.get(chave);
    if (g) g.push(valor);
    else grupos.set(chave, [valor]);
  };
  for (const arquivo of arquivos) {
    for (const linha of readFileSync(arquivo, "utf8").split("\n")) {
      if (!linha) continue;
      const [municipio, cbo, salario] = linha.split("\t");
      const valor = Number(salario);
      if (!Number.isFinite(valor)) continue;
      somar(`go\t${cbo}`, valor);
      const regiao = regiaoDoMunicipio.get(municipio);
      if (regiao) somar(`${regiao}\t${cbo}`, valor);
    }
  }
  const minimo = Number(opcoes.minimo ?? MINIMO_DE_CONTRATACOES);
  const linhas = [];
  for (const [chave, valores] of grupos) {
    if (valores.length < minimo) continue;
    const [regiao, cbo] = chave.split("\t");
    valores.sort((a, b) => a - b);
    const p = (q) => Math.round(percentil(valores, q) * 100) / 100;
    linhas.push({ regiao, cbo, n: valores.length, p25: p(0.25), p50: p(0.5), p75: p(0.75) });
  }
  linhas.sort((a, b) => a.regiao.localeCompare(b.regiao) || b.n - a.n);
  const mes = (m) => `${m.slice(0, 4)}-${m.slice(4, 6)}-01`;
  const resultado = { de: mes(meses[0]), ate: mes(meses[meses.length - 1]), meses: meses.length, linhas };
  writeFileSync(saida, JSON.stringify(resultado));
  const porRegiao = Object.fromEntries(
    ["goiania", "anapolis", "go"].map((r) => [r, linhas.filter((l) => l.regiao === r).length]),
  );
  console.log(
    JSON.stringify({
      saida,
      de: resultado.de,
      ate: resultado.ate,
      meses: meses.length,
      faixas: linhas.length,
      porRegiao,
    }),
  );
}

async function principal() {
  const [comando, ...resto] = process.argv.slice(2);
  const opcoes = {};
  const posicionais = [];
  for (let i = 0; i < resto.length; i++) {
    if (resto[i].startsWith("--")) opcoes[resto[i].slice(2)] = resto[++i];
    else posicionais.push(resto[i]);
  }
  if (comando === "filtrar") return filtrar(posicionais[0], posicionais.slice(1));
  if (comando === "calcular") return calcular(posicionais[0], opcoes, posicionais.slice(1));
  throw new Error("Comandos: filtrar, calcular (veja o começo de scripts/salarios/caged.mjs).");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
