// A calculadora de rescisão completa (claude/plano-calculadora-rescisao.md). Só regras, sem tela: recebe as respostas
// e devolve cada verba com a conta, os descontos (INSS e IR de 2026, verba por verba), o FGTS e os avisos. É uma
// estimativa: a convenção coletiva e detalhes do contrato mudam os valores, e a página diz isso.

import { calcularInss, calcularIr, centavos, SALARIO_FAMILIA, SALARIO_MINIMO_NACIONAL } from "./tabelas-trabalhistas";

export type TipoSaida =
  | "sem_justa_causa"
  | "pedido"
  | "acordo"
  | "justa_causa"
  | "indireta"
  | "culpa_reciproca"
  | "prazo_fim"
  | "prazo_antes_empresa"
  | "prazo_antes_empregado"
  | "falecimento";

/** trabalhado; indenizado (a empresa pagou sem trabalhar); no pedido de demissão: nao_cumprido ou dispensado. */
export type TipoAviso = "trabalhado" | "indenizado" | "nao_cumprido" | "dispensado";

export const SAIDAS: { valor: TipoSaida; nome: string; ajuda?: string }[] = [
  { valor: "sem_justa_causa", nome: "A empresa me demitiu sem justa causa" },
  { valor: "pedido", nome: "Pedi demissão" },
  { valor: "acordo", nome: "Fiz acordo com a empresa", ajuda: "a saída combinada do art. 484-A da CLT" },
  { valor: "justa_causa", nome: "Fui demitido por justa causa" },
  { valor: "indireta", nome: "Rescisão indireta", ajuda: "quando é a empresa que descumpre o contrato" },
  { valor: "culpa_reciproca", nome: "Culpa recíproca", ajuda: "a Justiça decidiu que os dois erraram" },
  { valor: "prazo_fim", nome: "Acabou o contrato de experiência ou temporário, no prazo" },
  { valor: "prazo_antes_empresa", nome: "A empresa encerrou a experiência antes do prazo" },
  { valor: "prazo_antes_empregado", nome: "Eu saí da experiência antes do prazo" },
  { valor: "falecimento", nome: "Falecimento do trabalhador", ajuda: "o acerto vai para a família" },
];

export type Entrada = {
  saida: TipoSaida;
  domestico: boolean;
  /** "AAAA-MM-DD" */
  admissao: string;
  /** o último dia de trabalho (com aviso indenizado, o dia em que recebeu o aviso) */
  ultimoDia: string;
  aviso: TipoAviso;
  /** contrato a prazo: o fim previsto e a cláusula de rescisão antecipada (art. 481) */
  fimPrevisto?: string;
  clausula481?: boolean;
  /** salário base por mês */
  salario: number;
  insalubridade?: 0 | 10 | 20 | 40;
  periculosidade?: boolean;
  /** gratificação, adicional por tempo de serviço e outros fixos por mês */
  fixos?: number;
  /** média mensal dos últimos 12 meses de horas extras, comissões e adicional noturno (com o DSR) */
  variaveis?: number;
  faltasMes?: number;
  bancoHoras?: { horas: number; adicional: number; divisor: number };
  outrosReceber?: number;
  /** períodos completos de férias que a pessoa não tirou */
  feriasVencidas?: number;
  faltasPeriodo?: number;
  /** voltou de afastamento do INSS de mais de 6 meses: o período de férias recomeça aqui (art. 133) */
  voltaAfastamento?: string;
  primeiraParcela13?: number;
  mesesAfastado13?: number;
  /** saldo do FGTS deste emprego (com os saques feitos); null: estimar */
  fgtsSaldo?: number | null;
  saqueAniversario?: boolean;
  /** doméstica: o saldo dos 3,2% (indenização compensatória); null: estimar */
  domestico32?: number | null;
  dependentes?: number;
  pensao?: number;
  /** adiantamentos e vales (entram no limite de uma remuneração) */
  adiantamentos?: number;
  consignado?: number;
  filhos14?: number;
  /** o mês da data-base da categoria (1 a 12) */
  mesDataBase?: number | null;
  /** contrato a prazo encerrado pela pessoa: a empresa cobra a indenização do art. 480 */
  cobrar480?: boolean;
};

export type Linha = { nome: string; ref?: string; valor: number; como: string };

export type Resultado = {
  ok: true;
  /** a saída de fato (com a cláusula do art. 481, o contrato a prazo vira sem prazo) */
  saida: TipoSaida;
  remuneracao: number;
  avisoDias: number;
  /** a data de saída com a projeção do aviso (vai na carteira) */
  saidaProjetada: string;
  proventos: Linha[];
  descontos: Linha[];
  totalProventos: number;
  totalDescontos: number;
  liquido: number;
  prazoPagamento: string;
  fgts: {
    deposito: number;
    saldoBase: number;
    saldoEstimado: boolean;
    multa: number;
    multaPct: number;
    saque: number;
    saqueComo: string;
    domestico32?: { valor: number; recebe: number; estimado: boolean };
  };
  seguroDesemprego: boolean;
  notas: string[];
};

export type Erro = { ok: false; erro: string };

// ---- datas (sempre em UTC, sem fuso) ------------------------------------------------------------------------------

const DIA = 86400000;
function data(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const somarDias = (d: Date, n: number) => new Date(d.getTime() + n * DIA);
const dias = (de: Date, ate: Date) => Math.round((ate.getTime() - de.getTime()) / DIA) + 1; // inclusivo
function somarMeses(d: Date, n: number) {
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const ultimo = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(d.getUTCDate(), ultimo));
  return r;
}
const somarAnos = (d: Date, n: number) => somarMeses(d, 12 * n);
/** anos completos entre a admissão e a data */
function anosCompletos(admissao: Date, ate: Date) {
  let n = 0;
  while (somarAnos(admissao, n + 1) <= somarDias(ate, 1)) n++;
  return n;
}
export const dataBr = (s: string) => s.split("-").reverse().join("/");

/** Avos do 13º no ano de `fim`: meses com 15 dias ou mais de trabalho entre `inicio` e `fim`. */
function avos13(inicio: Date, fim: Date) {
  const ano = fim.getUTCFullYear();
  const ini = inicio > new Date(Date.UTC(ano, 0, 1)) ? inicio : new Date(Date.UTC(ano, 0, 1));
  let n = 0;
  for (let m = 0; m < 12; m++) {
    const a = new Date(Date.UTC(ano, m, 1));
    const b = new Date(Date.UTC(ano, m + 1, 0));
    const de = ini > a ? ini : a;
    const ate = fim < b ? fim : b;
    if (ate >= de && dias(de, ate) >= 15) n++;
  }
  return n;
}

/** Avos de férias: meses completos desde o início do período e a fração de 15 dias ou mais (art. 146). */
function avosFerias(inicio: Date, fim: Date) {
  if (fim < inicio) return 0;
  let n = 0;
  while (n < 12 && somarDias(somarMeses(inicio, n + 1), -1) <= fim) n++;
  if (n < 12 && dias(somarMeses(inicio, n), fim) >= 15) n++;
  return Math.min(n, 12);
}

/** Dias de férias pelas faltas sem justificativa no período (art. 130). */
export function diasDeFerias(faltas: number) {
  if (faltas <= 5) return 30;
  if (faltas <= 14) return 24;
  if (faltas <= 23) return 18;
  if (faltas <= 32) return 12;
  return 0;
}

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n0 = (v: number | undefined | null) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);

// ---- o cálculo ----------------------------------------------------------------------------------------------------

export function calcularRescisao(e: Entrada): Resultado | Erro {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.admissao) || !/^\d{4}-\d{2}-\d{2}$/.test(e.ultimoDia)) {
    return { ok: false, erro: "Preencha a data de admissão e o último dia." };
  }
  const admissao = data(e.admissao);
  const ultimo = data(e.ultimoDia);
  if (ultimo < admissao) return { ok: false, erro: "O último dia é antes da admissão." };
  const salario = n0(e.salario);
  if (salario <= 0) return { ok: false, erro: "Preencha o salário." };

  const notas: string[] = [];
  // com a cláusula do art. 481, o contrato a prazo encerrado antes segue as regras do contrato sem prazo
  let saida = e.saida;
  if (e.clausula481 && saida === "prazo_antes_empresa") saida = "sem_justa_causa";
  if (e.clausula481 && saida === "prazo_antes_empregado") saida = "pedido";

  // a remuneração: fixo (salário e adicionais) e variáveis (a média, para aviso, férias e 13º)
  const insal = e.periculosidade ? 0 : centavos((SALARIO_MINIMO_NACIONAL * (e.insalubridade ?? 0)) / 100);
  const peric = e.periculosidade ? centavos(salario * 0.3) : 0;
  const fixa = centavos(salario + insal + peric + n0(e.fixos));
  const remuneracao = centavos(fixa + n0(e.variaveis));
  const diaria = remuneracao / 30;
  const diariaFixa = fixa / 30;

  const proventos: Linha[] = [];
  const descontos: Linha[] = [];
  // o que tem INSS e IR no mês e o que tem FGTS
  let tributavelMes = 0;
  let baseFgts = 0;

  // saldo de salário: os dias do último mês (mês de 30 dias), menos as faltas
  const inicioMes = new Date(Date.UTC(ultimo.getUTCFullYear(), ultimo.getUTCMonth(), 1));
  const fimMes = new Date(Date.UTC(ultimo.getUTCFullYear(), ultimo.getUTCMonth() + 1, 0));
  const deMes = admissao > inicioMes ? admissao : inicioMes;
  let diasSaldo =
    deMes.getTime() === inicioMes.getTime() && ultimo.getTime() === fimMes.getTime() ? 30 : dias(deMes, ultimo);
  diasSaldo = Math.max(0, Math.min(30, diasSaldo) - n0(e.faltasMes));
  const saldo = centavos(diariaFixa * diasSaldo);
  if (saldo > 0) {
    proventos.push({
      nome: "Saldo de salário",
      ref: `${diasSaldo} dias`,
      valor: saldo,
      como: `${reais(fixa)} (salário${insal || peric || n0(e.fixos) ? " com os adicionais" : ""}) ÷ 30 × ${diasSaldo} dias trabalhados no último mês${n0(e.faltasMes) ? `, já sem ${n0(e.faltasMes)} falta(s)` : ""}.`,
    });
    tributavelMes += saldo;
    baseFgts += saldo;
  }

  // aviso prévio
  const comAvisoDoPatrao =
    saida === "sem_justa_causa" || saida === "indireta" || saida === "culpa_reciproca" || saida === "acordo";
  // os anos contam até o dia do aviso (no trabalhado, uns 30 dias antes do último dia)
  const diaDoAviso = e.aviso === "trabalhado" ? somarDias(ultimo, -30) : ultimo;
  const anos = anosCompletos(admissao, diaDoAviso);
  let avisoDias = 0;
  let projecao = 0;
  if (comAvisoDoPatrao) {
    avisoDias = 30 + 3 * Math.min(20, anos);
    const metade = saida === "acordo" || saida === "culpa_reciproca";
    if (e.aviso === "trabalhado") {
      // os 30 dias trabalhados estão no salário; os dias a mais da proporcionalidade são indenizados
      const extra = avisoDias - 30;
      if (extra > 0) {
        const v = centavos(diaria * extra * (metade ? 0.5 : 1));
        proventos.push({
          nome: "Aviso prévio indenizado (dias proporcionais)",
          ref: `${extra} dias`,
          valor: v,
          como: `Aviso de ${avisoDias} dias (30 + 3 por ano completo: ${anos} ${anos === 1 ? "ano" : "anos"}, Lei 12.506/2011). Os 30 trabalhados já estão no salário; os ${extra} a mais são pagos: ${reais(remuneracao)} ÷ 30 × ${extra}.`,
        });
        baseFgts += v;
        projecao = extra;
      }
    } else {
      const pagos = metade ? avisoDias / 2 : avisoDias;
      const v = centavos(diaria * pagos);
      proventos.push({
        nome: "Aviso prévio indenizado",
        ref: `${pagos.toLocaleString("pt-BR")} dias`,
        valor: v,
        como: `30 dias mais 3 por ano completo (${anos} ${anos === 1 ? "ano" : "anos"}, Lei 12.506/2011) = ${avisoDias} dias${metade ? `; ${saida === "acordo" ? "no acordo" : "na culpa recíproca"} cai pela metade (${pagos.toLocaleString("pt-BR")} dias)` : ""}. ${reais(remuneracao)} ÷ 30 × ${pagos.toLocaleString("pt-BR")}. Não tem INSS nem IR; tem FGTS.`,
      });
      baseFgts += v;
      projecao = Math.floor(pagos);
    }
  } else if (saida === "pedido") {
    avisoDias = 30;
    if (e.aviso === "nao_cumprido") {
      descontos.push({
        nome: "Aviso prévio não cumprido",
        ref: "30 dias",
        valor: centavos(remuneracao),
        como: `Quem pede demissão e não trabalha os 30 dias do aviso pode ter descontado um mês de remuneração (art. 487, § 2º, da CLT). Se a empresa liberou você do aviso, não desconta.`,
      });
    }
  }
  const saidaProjetada = somarDias(ultimo, projecao);
  if (projecao > 0) {
    notas.push(
      `O aviso indenizado conta como tempo de serviço: a data de saída na carteira é ${dataBr(iso(saidaProjetada))}, e os dias contam no 13º e nas férias.`,
    );
  }

  // contrato a prazo encerrado antes (arts. 479 e 480)
  let indenizacao479 = 0;
  if (
    (saida === "prazo_antes_empresa" || saida === "prazo_antes_empregado") &&
    e.fimPrevisto &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.fimPrevisto)
  ) {
    const restantes = Math.max(0, dias(ultimo, data(e.fimPrevisto)) - 1);
    const metade = centavos((diaria * restantes) / 2);
    if (saida === "prazo_antes_empresa" && metade > 0) {
      indenizacao479 = metade;
      proventos.push({
        nome: "Indenização do contrato a prazo (art. 479)",
        ref: `${restantes} dias`,
        valor: metade,
        como: `A empresa encerrou antes do fim previsto: paga a metade do que você receberia até ${dataBr(e.fimPrevisto)}. ${reais(remuneracao)} ÷ 30 × ${restantes} dias ÷ 2. Sem INSS e sem IR.`,
      });
    }
    if (saida === "prazo_antes_empregado" && e.cobrar480 && metade > 0) {
      descontos.push({
        nome: "Indenização à empresa (art. 480)",
        ref: `${restantes} dias`,
        valor: metade,
        como: `Quem sai antes do fim do contrato a prazo pode ter de indenizar a empresa pelos prejuízos, até a metade do que receberia até ${dataBr(e.fimPrevisto)}. A empresa precisa mostrar o prejuízo.`,
      });
    }
  } else if (saida === "prazo_antes_empresa" || saida === "prazo_antes_empregado") {
    notas.push("Sem a data prevista do fim do contrato, a indenização dos arts. 479 e 480 ficou de fora.");
  }

  // 13º salário
  const tem13 = saida !== "justa_causa";
  const meio13 = saida === "culpa_reciproca" ? 0.5 : 1;
  let total13 = 0;
  if (tem13) {
    const afast = n0(e.mesesAfastado13);
    const avosAte = Math.max(0, avos13(admissao, ultimo) - afast);
    // o aviso pode passar para o ano seguinte: completa este ano e conta os meses do próximo
    const fimDoAno = new Date(Date.UTC(ultimo.getUTCFullYear(), 11, 31));
    const doAviso =
      saidaProjetada > fimDoAno
        ? Math.max(0, avos13(admissao, fimDoAno) - afast - avosAte) +
          avos13(new Date(Date.UTC(fimDoAno.getUTCFullYear() + 1, 0, 1)), saidaProjetada)
        : Math.max(0, avos13(admissao, saidaProjetada) - afast - avosAte);
    const v1 = centavos(((remuneracao * avosAte) / 12) * meio13);
    const v2 = centavos(((remuneracao * doAviso) / 12) * meio13);
    const meioTxt = meio13 < 1 ? " Na culpa recíproca, cai pela metade." : "";
    const afastTxt = afast ? ` Já sem ${afast} ${afast === 1 ? "mês" : "meses"} pagos pelo INSS.` : "";
    if (v1 > 0)
      proventos.push({
        nome: "13º salário proporcional",
        ref: `${avosAte}/12`,
        valor: v1,
        como: `${reais(remuneracao)} ÷ 12 × ${avosAte} meses do ano com 15 dias ou mais de trabalho.${afastTxt}${meioTxt}`,
      });
    if (v2 > 0)
      proventos.push({
        nome: "13º salário do aviso prévio",
        ref: `${doAviso}/12`,
        valor: v2,
        como: `Os dias do aviso indenizado completam mais ${doAviso} ${doAviso === 1 ? "mês" : "meses"} no ano: ${reais(remuneracao)} ÷ 12 × ${doAviso}.${meioTxt}`,
      });
    total13 = centavos(v1 + v2);
  }

  // férias
  const periodos = anosCompletos(admissao, ultimo);
  const naoTiradas = Math.min(n0(e.feriasVencidas), periodos);
  let feriasValor = 0;
  if (naoTiradas > 0) {
    // os não tirados são os mais recentes; passou do prazo de 12 meses para tirar: em dobro (art. 137)
    let dobro = 0;
    for (let i = periodos - naoTiradas + 1; i <= periodos; i++) {
      const fimConcessivo = somarDias(somarAnos(admissao, i + 1), -1);
      if (fimConcessivo < ultimo) dobro++;
    }
    const simples = naoTiradas - dobro;
    if (simples > 0) {
      const v = centavos(remuneracao * simples);
      proventos.push({
        nome: "Férias vencidas",
        ref: `${simples} ${simples === 1 ? "período" : "períodos"}`,
        valor: v,
        como: `Período completo que você não tirou: ${reais(remuneracao)} (a remuneração de hoje, art. 142) × ${simples}. Sem INSS e sem IR.`,
      });
      feriasValor += v;
    }
    if (dobro > 0) {
      const v = centavos(remuneracao * 2 * dobro);
      proventos.push({
        nome: "Férias vencidas em dobro",
        ref: `${dobro} ${dobro === 1 ? "período" : "períodos"}`,
        valor: v,
        como: `Passou o prazo de 12 meses para a empresa dar essas férias: pagam em dobro (art. 137). ${reais(remuneracao)} × 2 × ${dobro}.`,
      });
      feriasValor += v;
    }
  }
  const temFeriasProp = saida !== "justa_causa";
  const meioFerias = saida === "culpa_reciproca" ? 0.5 : 1;
  if (temFeriasProp) {
    let inicio = somarAnos(admissao, periodos);
    if (e.voltaAfastamento && /^\d{4}-\d{2}-\d{2}$/.test(e.voltaAfastamento)) {
      const volta = data(e.voltaAfastamento);
      if (volta > inicio && volta <= ultimo) {
        inicio = volta;
        notas.push(
          `Com o afastamento de mais de 6 meses, o período de férias recomeçou na volta, em ${dataBr(e.voltaAfastamento)} (art. 133).`,
        );
      }
    }
    const diasF = diasDeFerias(n0(e.faltasPeriodo));
    const avosAte = avosFerias(inicio, ultimo);
    // o aviso pode completar o período: fecha os 12/12 e conta os meses do período novo
    const fimPeriodo = somarAnos(inicio, 1);
    const doAviso =
      saidaProjetada >= fimPeriodo
        ? 12 - avosAte + avosFerias(fimPeriodo, saidaProjetada)
        : Math.max(0, avosFerias(inicio, saidaProjetada) - avosAte);
    const base = (remuneracao * diasF) / 30;
    const v1 = centavos(((base * avosAte) / 12) * meioFerias);
    const v2 = centavos(((base * doAviso) / 12) * meioFerias);
    const faltasTxt =
      diasF < 30 ? ` Com ${n0(e.faltasPeriodo)} faltas, o período dá ${diasF} dias de férias (art. 130).` : "";
    if (diasF === 0)
      notas.push("Com mais de 32 faltas sem justificativa no período, não há férias proporcionais (art. 130).");
    if (v1 > 0)
      proventos.push({
        nome: "Férias proporcionais",
        ref: `${avosAte}/12`,
        valor: v1,
        como: `${reais(remuneracao)} ÷ 12 × ${avosAte} meses do período atual (desde ${dataBr(iso(inicio))}; fração de 15 dias conta).${faltasTxt}${meioFerias < 1 ? " Na culpa recíproca, cai pela metade." : ""} Sem INSS e sem IR.`,
      });
    if (v2 > 0)
      proventos.push({
        nome: "Férias do aviso prévio",
        ref: `${doAviso}/12`,
        valor: v2,
        como: `Os dias do aviso indenizado completam mais ${doAviso} ${doAviso === 1 ? "mês" : "meses"} de férias: ${reais(remuneracao)} ÷ 12 × ${doAviso}.`,
      });
    feriasValor += v1 + v2;
  }
  feriasValor = centavos(feriasValor);
  if (feriasValor > 0) {
    proventos.push({
      nome: "1/3 de férias",
      valor: centavos(feriasValor / 3),
      como: `Um terço sobre todas as férias acima (${reais(feriasValor)} ÷ 3), garantido pela Constituição. Sem INSS e sem IR.`,
    });
  }

  // banco de horas, outros valores, salário-família e indenização adicional
  if (e.bancoHoras && n0(e.bancoHoras.horas) > 0) {
    const divisor = n0(e.bancoHoras.divisor) || 220;
    const adic = n0(e.bancoHoras.adicional) || 50;
    const v = centavos(n0(e.bancoHoras.horas) * (remuneracao / divisor) * (1 + adic / 100));
    proventos.push({
      nome: "Horas do banco de horas",
      ref: `${n0(e.bancoHoras.horas)} h`,
      valor: v,
      como: `As horas não compensadas são pagas como hora extra (art. 59, § 3º): ${reais(remuneracao)} ÷ ${divisor} × ${n0(e.bancoHoras.horas)} h × ${(1 + adic / 100).toLocaleString("pt-BR")}.`,
    });
    tributavelMes += v;
    baseFgts += v;
  }
  if (n0(e.outrosReceber) > 0) {
    const v = centavos(n0(e.outrosReceber));
    proventos.push({
      nome: "Outros valores a receber",
      valor: v,
      como: "O que você informou (horas extras, comissões ou gratificações do último mês ainda não pagas).",
    });
    tributavelMes += v;
    baseFgts += v;
  }
  if (n0(e.filhos14) > 0 && fixa <= SALARIO_FAMILIA.ate && saida !== "falecimento") {
    const v = centavos(((SALARIO_FAMILIA.cota * n0(e.filhos14)) / 30) * Math.min(30, diasSaldo));
    if (v > 0)
      proventos.push({
        nome: "Salário-família",
        ref: `${n0(e.filhos14)} ${n0(e.filhos14) === 1 ? "filho" : "filhos"}`,
        valor: v,
        como: `${reais(SALARIO_FAMILIA.cota)} por filho de até 14 anos, para quem ganha até ${reais(SALARIO_FAMILIA.ate)}, proporcional aos ${diasSaldo} dias do mês. Sem INSS e sem IR.`,
      });
  }
  if (
    (saida === "sem_justa_causa" || saida === "indireta") &&
    e.mesDataBase &&
    e.mesDataBase >= 1 &&
    e.mesDataBase <= 12
  ) {
    let dataBase = new Date(Date.UTC(saidaProjetada.getUTCFullYear(), e.mesDataBase - 1, 1));
    if (dataBase <= saidaProjetada)
      dataBase = new Date(Date.UTC(saidaProjetada.getUTCFullYear() + 1, e.mesDataBase - 1, 1));
    const antes = dias(saidaProjetada, dataBase) - 1;
    if (antes >= 1 && antes <= 30) {
      proventos.push({
        nome: "Indenização adicional (data-base)",
        ref: "1 salário",
        valor: centavos(fixa),
        como: `A saída, com o aviso, caiu nos 30 dias antes da data-base da categoria (${dataBr(iso(dataBase))}): mais um salário (Lei 7.238/1984 e Súmulas 182 e 314 do TST). Sem INSS e sem IR.`,
      });
    }
  }
  if (indenizacao479)
    notas.push(
      "No contrato a prazo encerrado antes pela empresa, não há aviso prévio: no lugar dele, a indenização do art. 479.",
    );

  // INSS e IR
  const inssMes = calcularInss(tributavelMes);
  const inss13 = calcularInss(total13);
  const dependentes = n0(e.dependentes);
  const pensao = n0(e.pensao);
  const irMes = calcularIr(tributavelMes, { inss: inssMes, dependentes, pensao });
  const ir13 = calcularIr(total13, { inss: inss13, dependentes, pensao: 0, exclusivo: true });
  if (inssMes > 0)
    descontos.push({
      nome: "INSS",
      valor: inssMes,
      como: `Sobre ${reais(tributavelMes)} (saldo de salário e outros salários do mês), pela tabela de 2026, faixa a faixa. Aviso indenizado e férias indenizadas não têm INSS.`,
    });
  if (inss13 > 0)
    descontos.push({
      nome: "INSS do 13º",
      valor: inss13,
      como: `O 13º tem o seu próprio cálculo: sobre ${reais(total13)}, pela mesma tabela.`,
    });
  if (irMes.devido > 0)
    descontos.push({
      nome: "Imposto de renda",
      valor: irMes.devido,
      como: `Base de ${reais(irMes.base)} (${irMes.simplificado ? "com o desconto simplificado de R$ 607,20" : "menos o INSS, os dependentes e a pensão"}): imposto de ${reais(irMes.imposto)}${irMes.redutor ? ` menos o redutor de 2026 de ${reais(irMes.redutor)}` : ""}.`,
    });
  if (ir13.devido > 0)
    descontos.push({
      nome: "Imposto de renda do 13º",
      valor: ir13.devido,
      como: `O 13º é tributado à parte: base de ${reais(ir13.base)}, imposto de ${reais(ir13.imposto)}${ir13.redutor ? ` menos o redutor de ${reais(ir13.redutor)}` : ""}.`,
    });
  const primeira = Math.min(n0(e.primeiraParcela13), total13);
  if (primeira > 0)
    descontos.push({
      nome: "1ª parcela do 13º já recebida",
      valor: centavos(primeira),
      como: "O adiantamento do 13º que você já recebeu este ano sai do valor final.",
    });
  if (n0(e.adiantamentos) > 0)
    descontos.push({
      nome: "Adiantamentos e vales",
      valor: centavos(n0(e.adiantamentos)),
      como: "O que você informou.",
    });
  if (pensao > 0)
    descontos.push({
      nome: "Pensão alimentícia",
      valor: centavos(pensao),
      como: "O que você informou (também sai da base do IR).",
    });
  if (n0(e.consignado) > 0)
    descontos.push({
      nome: "Empréstimo consignado",
      valor: centavos(n0(e.consignado)),
      como: "O que você informou. Na rescisão, o desconto do consignado tem limite (35% das verbas rescisórias); confira no contrato do empréstimo.",
    });

  // as dívidas com a empresa (aviso não cumprido, art. 480, adiantamentos) têm limite de uma remuneração (art. 477, § 5º)
  const dividas = descontos.filter((d) =>
    ["Aviso prévio não cumprido", "Indenização à empresa (art. 480)", "Adiantamentos e vales"].includes(d.nome),
  );
  const somaDividas = dividas.reduce((s, d) => s + d.valor, 0);
  if (somaDividas > remuneracao) {
    let sobra = remuneracao;
    for (const d of dividas) {
      d.valor = centavos(Math.min(d.valor, sobra));
      sobra -= d.valor;
    }
    notas.push(
      `Os descontos de dívidas com a empresa ficaram limitados a uma remuneração, ${reais(remuneracao)} (art. 477, § 5º, da CLT).`,
    );
  }

  const totalProventos = centavos(proventos.reduce((s, l) => s + l.valor, 0));
  const totalDescontos = centavos(descontos.reduce((s, l) => s + l.valor, 0));
  const liquido = centavos(totalProventos - totalDescontos);
  if (liquido < 0)
    notas.push("Os descontos passaram do que você tem a receber: a diferença pode ser cobrada pela empresa.");

  // FGTS
  baseFgts += Math.max(0, total13 - primeira);
  const deposito = centavos(baseFgts * 0.08);
  const meses = Math.max(1, Math.round((ultimo.getTime() - admissao.getTime()) / (DIA * 30.44)));
  const saldoEstimado = e.fgtsSaldo === null || e.fgtsSaldo === undefined;
  const saldoInformado = saldoEstimado ? centavos(fixa * 0.08 * meses * (1 + 1 / 12 + 1 / 36)) : n0(e.fgtsSaldo);
  const saldoBase = centavos(saldoInformado + deposito);
  const pct40 = saida === "sem_justa_causa" || saida === "indireta" || saida === "prazo_antes_empresa";
  const pct20 = saida === "acordo" || saida === "culpa_reciproca";
  const multaPct = e.domestico ? 0 : pct40 ? 40 : pct20 ? 20 : 0;
  const multa = centavos((saldoBase * multaPct) / 100);
  const sacaTudo = [
    "sem_justa_causa",
    "indireta",
    "prazo_antes_empresa",
    "prazo_fim",
    "culpa_reciproca",
    "falecimento",
  ].includes(saida);
  let saque = 0;
  let saqueComo = "";
  if (e.saqueAniversario && saida !== "falecimento" && (sacaTudo || saida === "acordo")) {
    saque = multa;
    saqueComo =
      "Você aderiu ao saque-aniversário: na demissão, saca só a multa; o saldo fica na conta. Voltar ao saque-rescisão vale a partir do 25º mês depois do pedido.";
  } else if (sacaTudo) {
    saque = centavos(saldoBase + multa);
    saqueComo =
      saida === "falecimento"
        ? "A família (os dependentes no INSS) saca o saldo."
        : `O saldo e o depósito da rescisão${multa ? ", mais a multa" : ""}.`;
  } else if (saida === "acordo") {
    saque = centavos(saldoBase * 0.8 + multa);
    saqueComo = "No acordo, saca 80% do saldo, mais a multa de 20%.";
  } else {
    saqueComo =
      "Nesta saída, o FGTS fica na conta: dá para sacar depois em casos como compra da casa própria, aposentadoria ou 3 anos sem carteira.";
  }

  // doméstica: os 3,2% no lugar da multa de 40%
  let domestico32: Resultado["fgts"]["domestico32"];
  if (e.domestico) {
    const inicio32 = admissao > new Date(Date.UTC(2015, 9, 1)) ? admissao : new Date(Date.UTC(2015, 9, 1));
    const meses32 = Math.max(1, Math.round((ultimo.getTime() - inicio32.getTime()) / (DIA * 30.44)));
    const estimado = e.domestico32 === null || e.domestico32 === undefined;
    const valor = centavos((estimado ? fixa * 0.032 * meses32 * (1 + 1 / 12) : n0(e.domestico32)) + baseFgts * 0.032);
    const parte =
      saida === "sem_justa_causa" || saida === "indireta"
        ? 1
        : saida === "culpa_reciproca" || saida === "acordo"
          ? 0.5
          : 0;
    domestico32 = { valor, recebe: centavos(valor * parte), estimado };
    if (parte === 0)
      notas.push(
        "Doméstica: nesta saída, os 3,2% da indenização compensatória voltam para o patrão (LC 150/2015, art. 22).",
      );
    if (saida === "acordo")
      notas.push(
        "Doméstica no acordo: a lei da doméstica não trata do acordo; usamos a metade dos 3,2%, como na culpa recíproca.",
      );
  }

  if (saldoEstimado)
    notas.push(
      "O saldo do FGTS foi estimado pelos meses de contrato, sem correção e sem juros: o valor real costuma ser maior. Veja o seu no app FGTS.",
    );
  if (saida === "falecimento")
    notas.push("No falecimento, o acerto é pago aos dependentes habilitados no INSS (ou aos herdeiros, com alvará).");

  const seguroDesemprego = saida === "sem_justa_causa" || saida === "indireta" || saida === "prazo_antes_empresa";

  return {
    ok: true,
    saida,
    remuneracao,
    avisoDias,
    saidaProjetada: iso(saidaProjetada),
    proventos,
    descontos,
    totalProventos,
    totalDescontos,
    liquido,
    prazoPagamento: iso(somarDias(ultimo, 10)),
    fgts: { deposito, saldoBase, saldoEstimado, multa, multaPct, saque, saqueComo, domestico32 },
    seguroDesemprego,
    notas: notas.filter(Boolean),
  };
}
