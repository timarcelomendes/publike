"use client";

import { Check, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatarMoeda } from "@/lib/formato";
import {
  ANO_DA_TABELA,
  calcular,
  FAIXAS,
  janela,
  prazoParaPedir,
  type Pedido,
  type Respostas,
  SALARIO_MINIMO,
  type Saida,
} from "@/lib/seguro-desemprego";
import { Botao, BotaoLink } from "./ui/botao";
import { classesEntrada } from "./ui/campo";

// "Tenho direito ao seguro-desemprego?" (claude/plano-seguro-desemprego.md): uma pergunta por vez, com botões
// grandes; a resposta com as parcelas, o valor e o prazo. Nada vai para o servidor.

type Estado = Partial<Respostas> & { demissao?: string; semData?: boolean };
type Opcao<T> = { valor: T; nome: string; ajuda?: string };
type Pergunta = {
  chave: keyof Estado;
  titulo: string;
  opcoes?: Opcao<Estado[keyof Estado]>[];
  resposta: (e: Estado) => string;
};

const SAIDAS: Opcao<Saida>[] = [
  { valor: "sem_justa_causa", nome: "A empresa me demitiu sem justa causa" },
  { valor: "rescisao_indireta", nome: "Rescisão indireta", ajuda: "quando é a empresa que descumpre o contrato" },
  { valor: "pediu", nome: "Pedi demissão" },
  { valor: "acordo", nome: "Fiz acordo com a empresa", ajuda: "a saída combinada, com parte do FGTS" },
  { valor: "fim_contrato", nome: "Acabou o contrato de experiência ou temporário" },
  { valor: "justa_causa", nome: "Fui demitido por justa causa" },
];
const SIM_NAO: Opcao<boolean>[] = [
  { valor: true, nome: "Sim" },
  { valor: false, nome: "Não" },
];
const PEDIDOS: Opcao<Pedido>[] = [
  { valor: 1, nome: "Nunca pedi" },
  { valor: 2, nome: "Já pedi uma vez" },
  { valor: 3, nome: "Já pedi duas vezes ou mais" },
];

const nomeDe = <T,>(opcoes: Opcao<T>[], v: T) => opcoes.find((o) => o.valor === v)?.nome ?? "";

/** As perguntas que faltam, na ordem; para na primeira sem resposta. */
function perguntas(e: Estado): Pergunta[] {
  const lista: Pergunta[] = [
    {
      chave: "saida",
      titulo: "Como você saiu do emprego?",
      opcoes: SAIDAS,
      resposta: (x) => nomeDe(SAIDAS, x.saida),
    },
  ];
  if (e.saida && e.saida !== "sem_justa_causa" && e.saida !== "rescisao_indireta") return lista;
  lista.push({
    chave: "domestico",
    titulo: "Você era empregada ou empregado doméstico?",
    opcoes: [
      { valor: true, nome: "Sim, trabalhava em casa de família" },
      { valor: false, nome: "Não, em empresa ou comércio" },
    ],
    resposta: (x) => (x.domestico ? "Doméstico" : "Em empresa ou comércio"),
  });
  lista.push({
    chave: "pedido",
    titulo: "Você já pediu o seguro-desemprego antes?",
    opcoes: PEDIDOS,
    resposta: (x) => nomeDe(PEDIDOS, x.pedido),
  });
  if (e.pedido && e.pedido > 1) {
    lista.push({
      chave: "recebeuRecente",
      titulo: "A demissão do último seguro foi há menos de 16 meses?",
      opcoes: SIM_NAO,
      resposta: (x) => (x.recebeuRecente ? "Há menos de 16 meses" : "Há 16 meses ou mais"),
    });
    if (e.recebeuRecente) return lista;
  }
  if (e.pedido && e.domestico !== undefined) {
    lista.push({
      chave: "cumpriuJanela",
      titulo: janela(e.pedido, e.domestico).texto,
      opcoes: SIM_NAO,
      resposta: (x) => (x.cumpriuJanela ? "Sim" : "Não"),
    });
    if (e.cumpriuJanela === false) return lista;
  }
  if (!e.domestico && e.pedido) {
    const menor = e.pedido === 1 ? 12 : e.pedido === 2 ? 9 : 6;
    const opcoes: Opcao<number>[] = [
      ...(menor < 12 ? [{ valor: menor, nome: `De ${menor} a 11 meses` }] : []),
      { valor: 12, nome: "De 12 a 23 meses" },
      { valor: 24, nome: "24 meses ou mais" },
    ];
    lista.push({
      chave: "meses36",
      titulo: "Somando todos os empregos, quantos meses de carteira nos últimos 3 anos?",
      opcoes: opcoes as Opcao<Estado[keyof Estado]>[],
      resposta: (x) => nomeDe(opcoes, x.meses36 as number),
    });
    lista.push({
      chave: "media",
      titulo: "Qual era o seu salário? A média dos 3 últimos meses, antes dos descontos.",
      resposta: (x) => (x.media ? formatarMoeda(x.media) : "Prefiro não dizer"),
    });
  }
  lista.push({
    chave: "demissao",
    titulo: "Qual foi o dia da demissão?",
    resposta: (x) => (x.demissao ? dataLonga(x.demissao) : "Sem data"),
  });
  return lista;
}

function dataLonga(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
const dataDe = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

const respondida = (e: Estado, p: Pergunta) =>
  p.chave === "demissao" ? e.demissao !== undefined || e.semData === true : e[p.chave] !== undefined;

export function SeguroDesemprego() {
  const [e, setE] = useState<Estado>({});
  const [salario, setSalario] = useState("");
  const [data, setData] = useState("");

  const lista = perguntas(e);
  const atual = lista.find((p) => !respondida(e, p));
  const feitas = lista.filter((p) => respondida(e, p));

  // responder uma pergunta apaga as que vêm depois dela (o caminho pode mudar)
  function responder(chave: keyof Estado, valor: unknown) {
    const i = lista.findIndex((p) => p.chave === chave);
    const depois = lista.slice(i + 1).map((p) => p.chave);
    setE((x) => {
      const novo: Estado = { ...x, [chave]: valor };
      for (const k of depois) delete novo[k];
      if (depois.includes("demissao")) delete novo.semData;
      return novo;
    });
  }
  function mudar(chave: keyof Estado) {
    const i = lista.findIndex((p) => p.chave === chave);
    setE((x) => {
      const novo: Estado = { ...x };
      for (const p of lista.slice(i)) delete novo[p.chave];
      if (lista.slice(i).some((p) => p.chave === "demissao")) delete novo.semData;
      return novo;
    });
  }

  const resultado =
    !atual && e.saida
      ? calcular({
          saida: e.saida,
          domestico: e.domestico ?? false,
          pedido: e.pedido ?? 1,
          recebeuRecente: e.recebeuRecente ?? false,
          cumpriuJanela: e.cumpriuJanela ?? true,
          meses36: e.meses36 ?? 0,
          media: e.media ?? 0,
        })
      : null;
  const prazo = resultado?.direito && e.demissao ? prazoParaPedir(e.demissao, resultado.prazoDias) : null;

  const botaoOpcao =
    "flex min-h-12 w-full flex-col items-start justify-center rounded-md border border-line-strong bg-surface-100 px-4 py-2.5 text-left text-body transition-colors hover:border-cerrado hover:bg-surface-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cerrado";

  return (
    <div className="mt-8 max-w-2xl">
      {feitas.length > 0 && (
        <ol className="mb-6 flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-100">
          {feitas.map((p) => (
            <li key={p.chave} className="flex items-start justify-between gap-3 px-4 py-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-body-sm text-ink-muted">{p.titulo}</span>
                <span className="text-label">{p.resposta(e)}</span>
              </span>
              <button
                type="button"
                onClick={() => mudar(p.chave)}
                className="shrink-0 text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink"
                aria-label={`Mudar a resposta: ${p.titulo}`}
              >
                Mudar
              </button>
            </li>
          ))}
        </ol>
      )}

      {atual && (
        <fieldset key={atual.chave} className="flex flex-col gap-3">
          <legend className="mb-3 text-h3">{atual.titulo}</legend>
          {atual.opcoes?.map((o) => (
            <button
              key={String(o.valor)}
              type="button"
              className={botaoOpcao}
              onClick={() => responder(atual.chave, o.valor)}
            >
              <span>{o.nome}</span>
              {o.ajuda && <span className="text-body-sm text-ink-muted">{o.ajuda}</span>}
            </button>
          ))}
          {atual.chave === "media" && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(ev) => {
                ev.preventDefault();
                const v = Number(salario.replace(/\./g, "").replace(",", "."));
                if (v > 0) responder("media", Math.round(v * 100) / 100);
              }}
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-label">Salário em reais</span>
                <input
                  className={classesEntrada}
                  inputMode="decimal"
                  placeholder="2.000,00"
                  value={salario}
                  onChange={(ev) => setSalario(ev.target.value.replace(/[^\d.,]/g, ""))}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <Botao type="submit" variante="primario">
                  Continuar
                </Botao>
                <Botao variante="fantasma" onClick={() => responder("media", 0)}>
                  Prefiro não dizer
                </Botao>
              </div>
            </form>
          )}
          {atual.chave === "demissao" && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(ev) => {
                ev.preventDefault();
                if (data) responder("demissao", data);
              }}
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-label">Data da demissão</span>
                <input
                  className={classesEntrada}
                  type="date"
                  value={data}
                  onChange={(ev) => setData(ev.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <Botao type="submit" variante="primario">
                  Ver o resultado
                </Botao>
                <Botao variante="fantasma" onClick={() => setE((x) => ({ ...x, semData: true }))}>
                  Pular
                </Botao>
              </div>
            </form>
          )}
        </fieldset>
      )}

      {resultado && (
        <section
          aria-live="polite"
          aria-labelledby="resultado-seguro"
          className={`rounded-lg border p-5 sm:p-6 ${resultado.direito ? "border-cerrado bg-surface-100" : "border-line-strong bg-surface-100"}`}
        >
          {resultado.direito ? (
            <>
              <h2 id="resultado-seguro" className="flex items-start gap-2 text-h3">
                <Check aria-hidden className="mt-1 size-5 shrink-0 text-cerrado" />
                Pelas regras de {ANO_DA_TABELA}, você deve ter direito
              </h2>
              <p className="mt-3 text-body-lg">
                <strong>{resultado.parcelas} parcelas</strong>
                {resultado.valor !== null && (
                  <>
                    {" "}
                    de cerca de <strong>{formatarMoeda(resultado.valor)}</strong>
                  </>
                )}
                .
              </p>
              {resultado.valor === null && (
                <p className="mt-1 text-body-sm text-ink-muted">
                  O valor depende do salário: fica entre {formatarMoeda(SALARIO_MINIMO)} e {formatarMoeda(FAIXAS.teto)}{" "}
                  por parcela.
                </p>
              )}
              <p className="mt-3 text-body">
                {prazo ? (
                  <>
                    Peça entre <strong>{dataDe(prazo.de)}</strong> e <strong>{dataDe(prazo.ate)}</strong>.
                  </>
                ) : (
                  <>Peça entre o 7º e o {resultado.prazoDias}º dia depois da demissão.</>
                )}{" "}
                Pelo{" "}
                <a
                  href="https://www.gov.br/pt-br/temas/perguntas-frequentes-seguro-desemprego"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline underline-offset-2"
                >
                  gov.br
                </a>
                , pelo app Carteira de Trabalho Digital ou no Sine da sua cidade.
              </p>
            </>
          ) : (
            <>
              <h2 id="resultado-seguro" className="flex items-start gap-2 text-h3">
                <X aria-hidden className="mt-1 size-5 shrink-0 text-ink-muted" />
                Pelas regras de {ANO_DA_TABELA}, você não deve ter direito agora
              </h2>
              <p className="mt-3 text-body">{resultado.motivo}</p>
            </>
          )}
          <p className="mt-4 text-body-sm text-ink-muted">
            É uma estimativa. Quem decide é o Ministério do Trabalho, com os dados da sua carteira: confira no gov.br.
          </p>

          <div className="mt-5 border-t border-line pt-5">
            <p className="text-label">Use esse tempo para achar a próxima vaga</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <BotaoLink href="/vagas/goiania" variante="primario">
                Ver vagas em Goiânia
              </BotaoLink>
              <BotaoLink href="/curriculo-simples" variante="secundario">
                Fazer um currículo grátis
              </BotaoLink>
              <BotaoLink href="/calculadora-rescisao/demissao-sem-justa-causa" variante="secundario">
                Calcular a rescisão
              </BotaoLink>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setE({});
              setSalario("");
              setData("");
            }}
            className="mt-5 inline-flex items-center gap-1.5 text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            <RotateCcw aria-hidden className="size-4" />
            Começar de novo
          </button>
        </section>
      )}
      <p className="mt-6 text-body-sm text-ink-muted">
        As respostas ficam só na sua tela: o Publike não recebe nada. Mais detalhes no guia{" "}
        <Link href="/conteudos/seguro-desemprego-passo-a-passo" className="underline underline-offset-2">
          Seguro-desemprego: quem tem direito e como pedir
        </Link>
        .
      </p>
    </div>
  );
}
