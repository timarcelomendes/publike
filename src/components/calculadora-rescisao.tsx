"use client";

import { Check, ChevronDown, FileDown, Info, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  calcularRescisao,
  dataBr,
  SAIDAS,
  type Entrada,
  type Linha,
  type TipoAviso,
  type TipoSaida,
} from "@/lib/rescisao";
import { Botao, BotaoLink } from "./ui/botao";
import { classesEntrada, Seletor } from "./ui/campo";

// A calculadora de rescisão completa (claude/plano-calculadora-rescisao.md). O formulário em partes (o obrigatório
// primeiro, o resto em "Mais detalhes") e o resultado ao lado, que muda enquanto a pessoa preenche. As respostas ficam
// só neste aparelho (para não perder ao recarregar); "Apagar meus dados" limpa. O "Baixar em PDF" é a impressão só
// com o resultado.

const CHAVE = "publike_rescisao";

type Form = {
  saida: TipoSaida | "";
  domestico: boolean;
  admissao: string;
  ultimoDia: string;
  aviso: TipoAviso;
  fimPrevisto: string;
  clausula481: boolean;
  porHora: boolean;
  salario: string;
  valorHora: string;
  horasMes: string;
  adicional: "nenhum" | "10" | "20" | "40" | "peric";
  fixos: string;
  variaveis: string;
  faltasMes: string;
  bancoHoras: string;
  bancoAdicional: string;
  jornada: string;
  outrosReceber: string;
  feriasVencidas: string;
  faltasPeriodo: string;
  voltaAfastamento: string;
  primeiraParcela13: string;
  mesesAfastado13: string;
  fgtsSaldo: string;
  saqueAniversario: boolean;
  domestico32: string;
  dependentes: string;
  pensao: string;
  adiantamentos: string;
  consignado: string;
  filhos14: string;
  mesDataBase: string;
  cobrar480: boolean;
};

const VAZIO: Form = {
  saida: "",
  domestico: false,
  admissao: "",
  ultimoDia: "",
  aviso: "indenizado",
  fimPrevisto: "",
  clausula481: false,
  porHora: false,
  salario: "",
  valorHora: "",
  horasMes: "220",
  adicional: "nenhum",
  fixos: "",
  variaveis: "",
  faltasMes: "",
  bancoHoras: "",
  bancoAdicional: "50",
  jornada: "220",
  outrosReceber: "",
  feriasVencidas: "0",
  faltasPeriodo: "",
  voltaAfastamento: "",
  primeiraParcela13: "",
  mesesAfastado13: "",
  fgtsSaldo: "",
  saqueAniversario: false,
  domestico32: "",
  dependentes: "0",
  pensao: "",
  adiantamentos: "",
  consignado: "",
  filhos14: "0",
  mesDataBase: "",
  cobrar480: false,
};

/** "2.500,00" → 2500 */
function numero(s: string) {
  const t = s.replace(/[^\d,.-]/g, "");
  if (!t) return 0;
  const v = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(v) ? v : 0;
}
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

// as quatro saídas mais comuns ficam à vista; as outras, em "Outros casos"
const SAIDAS_COMUNS: TipoSaida[] = ["sem_justa_causa", "pedido", "acordo", "justa_causa"];

const COM_AVISO_DO_PATRAO: TipoSaida[] = ["sem_justa_causa", "indireta", "acordo", "culpa_reciproca"];
const DE_PRAZO: TipoSaida[] = ["prazo_fim", "prazo_antes_empresa", "prazo_antes_empregado"];

/** Os períodos de férias completos até o último dia (para a pergunta das vencidas). */
function periodosCompletos(admissao: string, ultimo: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(admissao) || !/^\d{4}-\d{2}-\d{2}$/.test(ultimo)) return 0;
  const [a1, m1, d1] = admissao.split("-").map(Number);
  const [a2, m2, d2] = ultimo.split("-").map(Number);
  let anos = a2 - a1;
  if (m2 < m1 || (m2 === m1 && d2 + 1 < d1)) anos--;
  return Math.max(0, anos);
}

/** Como a calculadora abre numa página de caso (/calculadora-rescisao/<caso>): a saída e a doméstica da página passam
 * por cima do que estava guardado; o resto das respostas guardadas continua valendo. */
export type InicialRescisao = { saida?: TipoSaida; domestico?: boolean; outros?: boolean };

export function CalculadoraRescisao({ inicial }: { inicial?: InicialRescisao } = {}) {
  const daPagina: Partial<Form> = {
    ...(inicial?.saida ? { saida: inicial.saida } : {}),
    ...(inicial?.domestico ? { domestico: true } : {}),
  };
  const [f, setF] = useState<Form>(() => ({ ...VAZIO, ...daPagina }));
  const [lido, setLido] = useState(false);
  const [verOutros, setVerOutros] = useState(!!inicial?.outros);
  const [resultadoVisivel, setResultadoVisivel] = useState(false);

  // no celular o resultado fica embaixo do formulário: enquanto ele não aparece na tela, uma barra mostra o líquido
  useEffect(() => {
    const el = document.getElementById("resultado-rescisao-folha");
    if (!el || typeof IntersectionObserver === "undefined") return;
    const o = new IntersectionObserver(([e]) => setResultadoVisivel(e.isIntersecting), { rootMargin: "0px 0px -30% 0px" });
    o.observe(el);
    return () => o.disconnect();
  }, []);

  useEffect(() => {
    try {
      const g = localStorage.getItem(CHAVE);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lido do navegador depois de montar
      if (g) setF({ ...VAZIO, ...(JSON.parse(g) as Partial<Form>), ...daPagina });
    } catch {}
    setLido(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao montar
  }, []);
  useEffect(() => {
    if (!lido) return;
    try {
      localStorage.setItem(CHAVE, JSON.stringify(f));
    } catch {}
  }, [f, lido]);

  const mostrarOutros = verOutros || (!!f.saida && !SAIDAS_COMUNS.includes(f.saida));
  const muda = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  // o aviso que faz sentido para a saída
  const avisos: { valor: TipoAviso; nome: string }[] =
    f.saida === "pedido"
      ? [
          { valor: "trabalhado", nome: "Trabalhei os 30 dias" },
          { valor: "nao_cumprido", nome: "Não cumpri o aviso" },
          { valor: "dispensado", nome: "A empresa me liberou" },
        ]
      : COM_AVISO_DO_PATRAO.includes(f.saida as TipoSaida) || (f.clausula481 && f.saida === "prazo_antes_empresa")
        ? [
            { valor: "indenizado", nome: "Indenizado (a empresa pagou sem eu trabalhar)" },
            { valor: "trabalhado", nome: "Trabalhado" },
          ]
        : [];
  const avisoAtual = avisos.some((a) => a.valor === f.aviso) ? f.aviso : (avisos[0]?.valor ?? "indenizado");

  const salario = f.porHora ? numero(f.valorHora) * (numero(f.horasMes) || 220) : numero(f.salario);
  const periodos = periodosCompletos(f.admissao, f.ultimoDia);

  const r = useMemo(() => {
    if (!f.saida || !f.admissao || !f.ultimoDia || salario <= 0) return null;
    const e: Entrada = {
      saida: f.saida,
      domestico: f.domestico,
      admissao: f.admissao,
      ultimoDia: f.ultimoDia,
      aviso: avisoAtual,
      fimPrevisto: f.fimPrevisto || undefined,
      clausula481: f.clausula481,
      salario,
      insalubridade:
        f.adicional === "10" || f.adicional === "20" || f.adicional === "40"
          ? (Number(f.adicional) as 10 | 20 | 40)
          : 0,
      periculosidade: f.adicional === "peric",
      fixos: numero(f.fixos),
      variaveis: numero(f.variaveis),
      faltasMes: numero(f.faltasMes),
      bancoHoras: {
        horas: numero(f.bancoHoras),
        adicional: numero(f.bancoAdicional) || 50,
        divisor: numero(f.jornada) || 220,
      },
      outrosReceber: numero(f.outrosReceber),
      feriasVencidas: numero(f.feriasVencidas),
      faltasPeriodo: numero(f.faltasPeriodo),
      voltaAfastamento: f.voltaAfastamento || undefined,
      primeiraParcela13: numero(f.primeiraParcela13),
      mesesAfastado13: numero(f.mesesAfastado13),
      fgtsSaldo: f.fgtsSaldo.trim() ? numero(f.fgtsSaldo) : null,
      saqueAniversario: f.saqueAniversario,
      domestico32: f.domestico32.trim() ? numero(f.domestico32) : null,
      dependentes: numero(f.dependentes),
      pensao: numero(f.pensao),
      adiantamentos: numero(f.adiantamentos),
      consignado: numero(f.consignado),
      filhos14: numero(f.filhos14),
      mesDataBase: f.mesDataBase ? Number(f.mesDataBase) : null,
      cobrar480: f.cobrar480,
    };
    return calcularRescisao(e);
  }, [f, salario, avisoAtual]);

  const apagar = () => {
    try {
      localStorage.removeItem(CHAVE);
    } catch {}
    setF({ ...VAZIO, ...daPagina });
  };

  const rotulo = "text-label";
  const ajuda = "text-body-sm text-ink-muted";
  const opcao =
    "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-line-strong bg-surface-100 px-3.5 py-2.5 text-body has-[:checked]:border-cerrado has-[:checked]:bg-surface-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cerrado";

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <form className="flex flex-col gap-8 print:hidden" onSubmit={(e) => e.preventDefault()}>
        <Passo numero={1} titulo="Como você saiu" pronto={!!f.saida}>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Como você saiu">
            {SAIDAS.filter((s) => SAIDAS_COMUNS.includes(s.valor) || mostrarOutros).map((s) => (
              <label key={s.valor} className={opcao}>
                <input
                  type="radio"
                  name="saida"
                  className="mt-1 accent-cerrado"
                  checked={f.saida === s.valor}
                  onChange={() => muda("saida", s.valor)}
                />
                <span className="flex flex-col">
                  <span>{s.nome}</span>
                  {s.ajuda && <span className={ajuda}>{s.ajuda}</span>}
                </span>
              </label>
            ))}
          </div>
          {!mostrarOutros && (
            <button
              type="button"
              onClick={() => setVerOutros(true)}
              className="inline-flex items-start gap-1 self-start text-left text-body-sm font-semibold text-cerrado underline underline-offset-2"
            >
              Outros casos: experiência, rescisão indireta, culpa recíproca, falecimento
              <ChevronDown aria-hidden className="size-4" />
            </button>
          )}
          <label className="flex items-start gap-3 text-body">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-cerrado"
              checked={f.domestico}
              onChange={(e) => muda("domestico", e.target.checked)}
            />
            <span>
              Era empregada ou empregado doméstico <span className={ajuda}>(em casa de família)</span>
            </span>
          </label>
        </Passo>

        <Passo numero={2} titulo="As datas" pronto={!!f.admissao && !!f.ultimoDia}>
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoData rotulo="Dia em que foi contratado" valor={f.admissao} mudar={(v) => muda("admissao", v)} />
            <CampoData
              rotulo={
                avisoAtual === "indenizado" && avisos.length ? "Dia em que recebeu o aviso" : "Último dia de trabalho"
              }
              valor={f.ultimoDia}
              mudar={(v) => muda("ultimoDia", v)}
            />
          </div>
          {avisos.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className={rotulo}>O aviso prévio</span>
              {avisos.map((a) => (
                <label key={a.valor} className={opcao}>
                  <input
                    type="radio"
                    name="aviso"
                    className="mt-1 accent-cerrado"
                    checked={avisoAtual === a.valor}
                    onChange={() => muda("aviso", a.valor)}
                  />
                  <span>{a.nome}</span>
                </label>
              ))}
              {avisoAtual === "trabalhado" && f.saida !== "pedido" && (
                <p className={ajuda}>No último dia, coloque o fim dos 30 dias trabalhados.</p>
              )}
            </div>
          )}
          {DE_PRAZO.includes(f.saida as TipoSaida) && (
            <div className="flex flex-col gap-3">
              <CampoData
                rotulo="Data prevista para o fim do contrato"
                valor={f.fimPrevisto}
                mudar={(v) => muda("fimPrevisto", v)}
              />
              {f.saida !== "prazo_fim" && (
                <label className="flex items-start gap-3 text-body">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-cerrado"
                    checked={f.clausula481}
                    onChange={(e) => muda("clausula481", e.target.checked)}
                  />
                  <span>
                    O contrato tem a cláusula de rescisão antecipada{" "}
                    <span className={ajuda}>
                      (art. 481: aí valem as regras do contrato sem prazo, com aviso prévio)
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}
        </Passo>

        <Passo numero={3} titulo="O salário" pronto={salario > 0}>
          {!f.porHora ? (
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Salário por mês, antes dos descontos</span>
              <ComReais>
                <input
                  className={`${classesEntrada} pl-10`}
                  inputMode="decimal"
                  placeholder="2.500,00"
                  value={f.salario}
                  onChange={(e) => muda("salario", e.target.value)}
                />
              </ComReais>
            </label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className={rotulo}>Valor da hora</span>
                <input
                  className={classesEntrada}
                  inputMode="decimal"
                  value={f.valorHora}
                  onChange={(e) => muda("valorHora", e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={rotulo}>Horas por mês</span>
                <input
                  className={classesEntrada}
                  inputMode="numeric"
                  value={f.horasMes}
                  onChange={(e) => muda("horasMes", e.target.value)}
                />
              </label>
            </div>
          )}
          <label className="flex items-center gap-3 text-body-sm">
            <input
              type="checkbox"
              className="size-4 accent-cerrado"
              checked={f.porHora}
              onChange={(e) => muda("porHora", e.target.checked)}
            />
            Ganho por hora
          </label>
        </Passo>

        <div className="flex flex-col gap-2">
          <h2 className="text-h3">
            Mais detalhes <span className="text-body font-normal text-ink-muted">(opcional)</span>
          </h2>
          <p className={ajuda}>
            O resultado já sai sem isto. Abra só o que vale para você: cada parte deixa o cálculo mais perto do seu
            acerto.
          </p>
          <Parte titulo="Adicionais e médias">
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Adicional</span>
              <Seletor
                className={classesEntrada}
                value={f.adicional}
                onChange={(e) => muda("adicional", e.target.value as Form["adicional"])}
              >
                <option value="nenhum">Nenhum</option>
                <option value="10">Insalubridade, grau mínimo (10% do salário mínimo)</option>
                <option value="20">Insalubridade, grau médio (20%)</option>
                <option value="40">Insalubridade, grau máximo (40%)</option>
                <option value="peric">Periculosidade (30% do salário)</option>
              </Seletor>
            </label>
            <Dinheiro
              rotulo="Outros valores fixos por mês"
              ajuda="Gratificação, adicional por tempo de serviço"
              valor={f.fixos}
              mudar={(v) => muda("fixos", v)}
            />
            <Dinheiro
              rotulo="Média mensal de horas extras, comissões e adicional noturno"
              ajuda="Dos últimos 12 meses, já com o descanso semanal (DSR). Entra no aviso, nas férias e no 13º."
              valor={f.variaveis}
              mudar={(v) => muda("variaveis", v)}
            />
          </Parte>
          <Parte titulo="O último mês">
            <Numero
              rotulo="Faltas sem justificativa no último mês"
              valor={f.faltasMes}
              mudar={(v) => muda("faltasMes", v)}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Numero rotulo="Horas no banco de horas" valor={f.bancoHoras} mudar={(v) => muda("bancoHoras", v)} />
              <Numero rotulo="Adicional (%)" valor={f.bancoAdicional} mudar={(v) => muda("bancoAdicional", v)} />
              <label className="flex flex-col gap-1.5">
                <span className={rotulo}>Jornada</span>
                <Seletor className={classesEntrada} value={f.jornada} onChange={(e) => muda("jornada", e.target.value)}>
                  <option value="220">44 h por semana</option>
                  <option value="200">40 h por semana</option>
                  <option value="180">36 h por semana</option>
                  <option value="150">30 h por semana</option>
                </Seletor>
              </label>
            </div>
            <Dinheiro
              rotulo="Outros valores a receber"
              ajuda="Horas extras, comissões ou gratificações do último mês ainda não pagas"
              valor={f.outrosReceber}
              mudar={(v) => muda("outrosReceber", v)}
            />
          </Parte>
          <Parte titulo="Férias">
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Períodos de férias completos que você não tirou</span>
              <Seletor
                className={classesEntrada}
                value={f.feriasVencidas}
                onChange={(e) => muda("feriasVencidas", e.target.value)}
              >
                {Array.from({ length: Math.max(1, Math.min(periodos, 5)) + 1 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? "Nenhum" : i === 1 ? "1 período" : `${i} períodos`}
                  </option>
                ))}
              </Seletor>
              <span className={ajuda}>
                {periodos > 0
                  ? `Você completou ${periodos === 1 ? "1 período" : `${periodos} períodos`} de férias nesta empresa. O que passou do prazo para tirar entra em dobro.`
                  : "Cada 12 meses de trabalho é um período."}
              </span>
            </label>
            <Numero
              rotulo="Faltas sem justificativa no período de férias atual"
              ajuda="Mais de 5 faltas diminuem os dias de férias."
              valor={f.faltasPeriodo}
              mudar={(v) => muda("faltasPeriodo", v)}
            />
            <CampoData
              rotulo="Ficou mais de 6 meses afastado pelo INSS? Dia em que voltou"
              valor={f.voltaAfastamento}
              mudar={(v) => muda("voltaAfastamento", v)}
            />
          </Parte>
          <Parte titulo="13º salário">
            <Dinheiro
              rotulo="1ª parcela do 13º que já recebeu este ano"
              ajuda="Costuma ser metade do salário, paga até 30 de novembro"
              valor={f.primeiraParcela13}
              mudar={(v) => muda("primeiraParcela13", v)}
            />
            <Numero
              rotulo="Meses afastado pelo INSS este ano"
              valor={f.mesesAfastado13}
              mudar={(v) => muda("mesesAfastado13", v)}
            />
          </Parte>
          <Parte titulo="FGTS">
            <Dinheiro
              rotulo="Saldo do FGTS deste emprego"
              ajuda="No app FGTS. Some o que você já sacou (aniversário, casa própria): a multa conta tudo o que foi depositado. Em branco, a gente estima."
              valor={f.fgtsSaldo}
              mudar={(v) => muda("fgtsSaldo", v)}
            />
            <label className="flex items-start gap-3 text-body">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-cerrado"
                checked={f.saqueAniversario}
                onChange={(e) => muda("saqueAniversario", e.target.checked)}
              />
              <span>Aderi ao saque-aniversário</span>
            </label>
            {f.domestico && (
              <Dinheiro
                rotulo="Saldo dos 3,2% (indenização compensatória)"
                ajuda="Aparece separado no app FGTS. Em branco, a gente estima."
                valor={f.domestico32}
                mudar={(v) => muda("domestico32", v)}
              />
            )}
          </Parte>
          <Parte titulo="Descontos e imposto de renda">
            <Numero
              rotulo="Dependentes no imposto de renda"
              valor={f.dependentes}
              mudar={(v) => muda("dependentes", v)}
            />
            <Dinheiro rotulo="Pensão alimentícia descontada" valor={f.pensao} mudar={(v) => muda("pensao", v)} />
            <Dinheiro rotulo="Adiantamentos e vales" valor={f.adiantamentos} mudar={(v) => muda("adiantamentos", v)} />
            <Dinheiro
              rotulo="Empréstimo consignado a descontar"
              valor={f.consignado}
              mudar={(v) => muda("consignado", v)}
            />
          </Parte>
          <Parte titulo="Outros">
            <Numero
              rotulo="Filhos de até 14 anos"
              ajuda="Para o salário-família, de quem ganha até R$ 1.980,38."
              valor={f.filhos14}
              mudar={(v) => muda("filhos14", v)}
            />
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Mês da data-base da sua categoria</span>
              <Seletor
                className={classesEntrada}
                value={f.mesDataBase}
                onChange={(e) => muda("mesDataBase", e.target.value)}
              >
                <option value="">Não sei</option>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Seletor>
              <span className={ajuda}>
                Está na convenção coletiva. Demissão nos 30 dias antes dela dá direito a mais um salário.
              </span>
            </label>
            {f.saida === "prazo_antes_empregado" && (
              <label className="flex items-start gap-3 text-body">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-cerrado"
                  checked={f.cobrar480}
                  onChange={(e) => muda("cobrar480", e.target.checked)}
                />
                <span>A empresa vai cobrar a indenização por eu sair antes (art. 480)</span>
              </label>
            )}
          </Parte>
        </div>
        <button
          type="button"
          onClick={apagar}
          className="inline-flex items-center gap-1.5 self-start text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          <Trash2 aria-hidden className="size-4" />
          Apagar meus dados
        </button>
        <p className={ajuda}>O que você digita fica só neste aparelho: o Publike não recebe nada.</p>
      </form>

      <section aria-labelledby="resultado-rescisao" className="lg:sticky lg:top-24" id="resultado-rescisao-folha">
        <h2 id="resultado-rescisao" className="text-h3">
          Seu acerto
        </h2>
        <p className="mt-2 flex items-start gap-2 rounded-md border-l-4 border-ipe bg-surface-200 px-3 py-2 text-body-sm">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>É uma estimativa, use como sugestão.</strong> Detalhes do contrato, da convenção coletiva ou uma
            informação que faltou mudam os valores.
          </span>
        </p>
        {!r ? (
          <div className="mt-4 rounded-lg border border-dashed border-line-strong p-5">
            <p className="text-body">Para ver o cálculo, falta:</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-body">
              {[
                { feito: !!f.saida, texto: "1. Como você saiu" },
                { feito: !!f.admissao && !!f.ultimoDia, texto: "2. As datas" },
                { feito: salario > 0, texto: "3. O salário" },
              ].map((p) => (
                <li key={p.texto} className={`flex items-center gap-2 ${p.feito ? "text-ink-muted line-through" : ""}`}>
                  <span
                    aria-hidden
                    className={`grid size-5 place-items-center rounded-full border ${p.feito ? "border-cerrado bg-cerrado text-on-cerrado" : "border-line-strong"}`}
                  >
                    {p.feito && <Check className="size-3.5" />}
                  </span>
                  {p.texto}
                  {p.feito && <span className="sr-only">(preenchido)</span>}
                </li>
              ))}
            </ul>
          </div>
        ) : !r.ok ? (
          <p role="alert" className="mt-4 rounded-lg border border-danger p-4 text-body text-danger">
            {r.erro}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            <Tabela titulo="Você recebe" linhas={r.proventos} total={r.totalProventos} />
            {r.descontos.length > 0 && (
              <Tabela titulo="Descontos" linhas={r.descontos} total={r.totalDescontos} negativo />
            )}
            <div className="rounded-lg border border-cerrado bg-surface-100 p-4">
              <p className="text-label text-ink-muted">Líquido a receber</p>
              <p className="font-display text-[34px] leading-tight font-bold tabular-nums">{reais(r.liquido)}</p>
              <p className="text-body-sm text-ink-muted">
                A empresa tem até {dataBr(r.prazoPagamento)} para pagar (10 dias depois do fim do contrato). Se atrasar,
                paga mais um salário de multa (art. 477).
              </p>
              {r.saidaProjetada !== f.ultimoDia && (
                <p className="mt-1 text-body-sm text-ink-muted">
                  Data de saída na carteira: {dataBr(r.saidaProjetada)}.
                </p>
              )}
            </div>
            <div className="rounded-lg border border-line bg-surface-200 p-4">
              <h3 className="text-label">FGTS</h3>
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-body-sm tabular-nums">
                <dt className="text-ink-muted">Depósito da rescisão (8%)</dt>
                <dd>{reais(r.fgts.deposito)}</dd>
                <dt className="text-ink-muted">Saldo para a multa{r.fgts.saldoEstimado ? " (estimado)" : ""}</dt>
                <dd>{reais(r.fgts.saldoBase)}</dd>
                {r.fgts.multaPct > 0 && (
                  <>
                    <dt className="text-ink-muted">Multa de {r.fgts.multaPct}%</dt>
                    <dd>{reais(r.fgts.multa)}</dd>
                  </>
                )}
                {r.fgts.domestico32 && (
                  <>
                    <dt className="text-ink-muted">
                      3,2% da doméstica{r.fgts.domestico32.estimado ? " (estimado)" : ""}
                    </dt>
                    <dd>{reais(r.fgts.domestico32.recebe)}</dd>
                  </>
                )}
                <dt className="font-semibold">Você saca</dt>
                <dd className="font-semibold">{reais(r.fgts.saque + (r.fgts.domestico32?.recebe ?? 0))}</dd>
              </dl>
              <p className="mt-2 text-body-sm text-ink-muted">{r.fgts.saqueComo}</p>
            </div>
            {r.seguroDesemprego && (
              <p className="text-body print:hidden">
                Nesta saída, você pode ter direito ao seguro-desemprego.{" "}
                <Link href="/seguro-desemprego" className="font-semibold underline underline-offset-2">
                  Veja quantas parcelas
                </Link>
                .
              </p>
            )}
            {r.notas.length > 0 && (
              <ul className="flex list-disc flex-col gap-1 pl-5 text-body-sm text-ink-muted">
                {r.notas.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            <p className="text-caption text-ink-muted">
              Estimativa do Publike (publike.org/calculadora-rescisao), calculada em{" "}
              {new Date().toLocaleDateString("pt-BR")}, com as tabelas de INSS e IR de 2026. Os resultados podem não ser
              precisos: qualquer detalhe do contrato de trabalho, da convenção coletiva ou uma informação que faltou
              muda os valores. Use como sugestão, não como a verdade.
            </p>
            <div className="flex flex-wrap gap-3 print:hidden">
              <Botao variante="secundario" onClick={() => window.print()}>
                <FileDown aria-hidden />
                Baixar em PDF
              </Botao>
              <BotaoLink href="/vagas/goiania" variante="primario">
                Ver vagas em Goiânia
              </BotaoLink>
            </div>
          </div>
        )}
      </section>

      {r?.ok && !resultadoVisivel && (
        <a
          href="#resultado-rescisao-folha"
          className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 rounded-lg bg-cerrado px-4 py-3 text-on-cerrado shadow-lg md:bottom-4 lg:hidden print:hidden"
        >
          <span className="flex flex-col">
            <span className="text-body-sm opacity-90">Líquido a receber</span>
            <span className="text-h3 font-bold tabular-nums">{reais(r.liquido)}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-body-sm font-semibold">
            Ver o cálculo
            <ChevronDown aria-hidden className="size-4" />
          </span>
        </a>
      )}

      {/* na impressão, só o resultado */}
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          html, body { background: #fff !important; }
          body * { visibility: hidden; }
          #resultado-rescisao-folha, #resultado-rescisao-folha * { visibility: visible; }
          #resultado-rescisao-folha { position: absolute; inset: 0 auto auto 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}

function Passo({
  numero,
  titulo,
  pronto,
  children,
}: {
  numero: number;
  titulo: string;
  pronto: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-line bg-surface-100 p-4 sm:p-5">
      <legend className="sr-only">
        {numero}. {titulo}
      </legend>
      <div aria-hidden className="flex items-center gap-3">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full text-label ${pronto ? "bg-cerrado text-on-cerrado" : "border border-line-strong text-ink"}`}
        >
          {pronto ? <Check className="size-4" /> : numero}
        </span>
        <span className="text-h3">{titulo}</span>
      </div>
      {children}
    </fieldset>
  );
}

function ComReais({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-ink-muted">
        R$
      </span>
      {children}
    </div>
  );
}

/** "06112026" → "06/11/2026", enquanto a pessoa digita */
function mascaraData(t: string) {
  const d = t.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
/** "06/11/2026" → "2026-11-06"; "" se não for uma data de verdade */
function dataIso(t: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (!m) return "";
  const [, d, mes, a] = m.map(Number);
  if (a < 1950 || a > 2100) return "";
  const x = new Date(Date.UTC(a, mes - 1, d));
  if (x.getUTCFullYear() !== a || x.getUTCMonth() !== mes - 1 || x.getUTCDate() !== d) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}
const isoParaBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "");

/** Data digitada (dd/mm/aaaa), sem calendário: mais rápido, principalmente para datas de anos atrás. */
function CampoData({ rotulo, valor, mudar }: { rotulo: string; valor: string; mudar: (iso: string) => void }) {
  const id = useId();
  const [texto, setTexto] = useState(() => isoParaBr(valor));
  // quando o valor muda por fora (dados guardados, "Apagar meus dados"), o campo acompanha
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com o valor de fora
    if (dataIso(texto) !== valor) setTexto(isoParaBr(valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o valor de fora muda
  }, [valor]);
  const completo = texto.length === 10;
  const iso = dataIso(texto);
  const erro = completo && !iso;
  const porExtenso = iso
    ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })
    : "";
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label">
        {rotulo}
      </label>
      <input
        id={id}
        className={classesEntrada}
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        value={texto}
        aria-invalid={erro || undefined}
        aria-describedby={`${id}-ajuda`}
        onChange={(e) => {
          const t = mascaraData(e.target.value);
          setTexto(t);
          mudar(dataIso(t));
        }}
      />
      <span id={`${id}-ajuda`} className={`text-body-sm ${erro ? "text-danger" : "text-ink-muted"}`}>
        {erro ? "Essa data não existe. Confira o dia, o mês e o ano." : porExtenso || "Só os números: 06112026"}
      </span>
    </div>
  );
}

function Parte({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-line bg-surface-100">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-label [&::-webkit-details-marker]:hidden">
        {titulo}
        <ChevronDown aria-hidden className="size-4 text-ink-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}

function Dinheiro({
  rotulo,
  ajuda,
  valor,
  mudar,
}: {
  rotulo: string;
  ajuda?: string;
  valor: string;
  mudar: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-label">{rotulo}</span>
      <input
        className={classesEntrada}
        inputMode="decimal"
        placeholder="0,00"
        value={valor}
        onChange={(e) => mudar(e.target.value)}
      />
      {ajuda && <span className="text-body-sm text-ink-muted">{ajuda}</span>}
    </label>
  );
}

function Numero({
  rotulo,
  ajuda,
  valor,
  mudar,
}: {
  rotulo: string;
  ajuda?: string;
  valor: string;
  mudar: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-label">{rotulo}</span>
      <input
        className={classesEntrada}
        inputMode="numeric"
        placeholder="0"
        value={valor}
        onChange={(e) => mudar(e.target.value.replace(/[^\d]/g, ""))}
      />
      {ajuda && <span className="text-body-sm text-ink-muted">{ajuda}</span>}
    </label>
  );
}

function Tabela({
  titulo,
  linhas,
  total,
  negativo,
}: {
  titulo: string;
  linhas: Linha[];
  total: number;
  negativo?: boolean;
}) {
  return (
    <div>
      <h3 className="text-label">{titulo}</h3>
      <ul className="mt-2 flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
        {linhas.map((l) => (
          <li key={l.nome} className="px-3 py-2">
            <details>
              <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span className="text-body-sm">
                  {l.nome}
                  {l.ref && <span className="text-ink-muted"> · {l.ref}</span>}
                </span>
                <span className="shrink-0 text-body-sm tabular-nums">
                  {negativo ? "− " : ""}
                  {reais(l.valor)}
                </span>
              </summary>
              <p className="mt-1 text-body-sm text-ink-muted print:hidden">{l.como}</p>
            </details>
            <p className="mt-0.5 hidden text-caption text-ink-muted print:block">{l.como}</p>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-3 px-3 py-2 font-semibold">
          <span className="text-body-sm">Total</span>
          <span className="text-body-sm tabular-nums">
            {negativo ? "− " : ""}
            {reais(total)}
          </span>
        </li>
      </ul>
      <p className="mt-1 text-caption text-ink-muted print:hidden">Toque numa linha para ver como foi calculado.</p>
    </div>
  );
}
