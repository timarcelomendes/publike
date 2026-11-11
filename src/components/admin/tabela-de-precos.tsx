"use client";

import { AlertTriangle, Check, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarPlano } from "@/lib/acoes/admin-pagamentos";
import { ehPlanoPorFaixa as ehPlano, NOME_PRODUTO, recursosDo, type Ciclo, type Produto } from "@/lib/pagamentos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

// Admin › Pagamentos › Preços (02/11/2026; em grupos desde 11/11/2026): os planos por faixa (mensal, 3 meses, anual e
// 30 dias), os recursos sozinhos e o combo (mensal e 3 meses) e, fechado, o que saiu de venda (o Plano Completo: quem
// assina continua). Cada produto mostra a frase que o cliente vê com os preços à venda e, ao lado, a conta: o desconto
// do trimestral e do anual, os 30 dias acima do mensal e, nos pacotes, quanto sairiam os recursos separados, com um
// aviso quando a conta não fecha. "Usar a sugestão" preenche só os valores (claude/plano-lancamento-pagos.md), sem
// mexer no "À venda" e sem salvar; "Salvar os preços" grava só o que mudou.

export type PlanoDoAdmin = { id: string; recurso: Produto; ciclo: Ciclo; valor: number | null; ligado: boolean };

/** Os grupos da tela, com as formas de pagar que cada um tem. */
const GRUPOS: { titulo: string; texto: string; produtos: Produto[]; ciclos: Ciclo[] }[] = [
  {
    titulo: "Planos",
    texto: "Pelo número de vagas no ar, com todos os recursos. O anual e os 30 dias só vendem com “À venda” marcado.",
    produtos: ["empresa_5", "empresa_20", "empresa_50", "agencia_15", "agencia_200"],
    ciclos: ["MONTHLY", "QUARTERLY", "YEARLY", "AVULSO"],
  },
  {
    titulo: "Recursos sozinhos",
    texto: "Para quem quer só um recurso, e o combo de dois.",
    produtos: ["copiloto", "testes", "video", "automacoes", "salarios", "carreiras", "combo"],
    ciclos: ["MONTHLY", "QUARTERLY"],
  },
];
/** Fora de venda: quem assina continua pagando o que assinou (migração 20270407120000). */
const FORA_DE_VENDA: Produto[] = ["completo"];

/**
 * A sugestão do plano de lançamento: o mensal e os 3 meses com uns 15% de desconto; nos planos por faixa, também o
 * anual (9 meses pelo ano) e os 30 dias sem renovar (uns 25% acima do mensal; migração 20270416120000).
 */
const SUGESTAO: Record<Produto, Partial<Record<Ciclo, number>>> = {
  // a Triagem com IA desceu para R$ 59 (10/11/2026), com 15% no trimestre
  copiloto: { MONTHLY: 59, QUARTERLY: 150 },
  testes: { MONTHLY: 29, QUARTERLY: 74 },
  // a Entrevista em vídeo, gravada e ao vivo no mesmo recurso, subiu para R$ 59 (11/11/2026), com 15% no trimestre
  video: { MONTHLY: 59, QUARTERLY: 150 },
  automacoes: { MONTHLY: 39, QUARTERLY: 99 },
  // a Consulta de salários (decisão de 05/11/2026: R$ 29,90 por mês)
  salarios: { MONTHLY: 29.9, QUARTERLY: 76.24 },
  // a Página de carreiras sozinha (decisão de 10/11/2026: R$ 19,90 por mês)
  carreiras: { MONTHLY: 19.9, QUARTERLY: 50.74 },
  // os planos por faixa (lançamento, 10/11/2026; o Plano Empresa subiu para R$ 79 e R$ 199, com 15% no trimestre)
  empresa_5: { MONTHLY: 79, QUARTERLY: 201, YEARLY: 711, AVULSO: 99 },
  empresa_20: { MONTHLY: 199, QUARTERLY: 507, YEARLY: 1791, AVULSO: 249 },
  // acima das 20 vagas grátis (10/11/2026)
  empresa_50: { MONTHLY: 299, QUARTERLY: 762, YEARLY: 2691, AVULSO: 369 },
  agencia_15: { MONTHLY: 99, QUARTERLY: 252, YEARLY: 891, AVULSO: 125 },
  agencia_200: { MONTHLY: 399, QUARTERLY: 1017, YEARLY: 3591, AVULSO: 499 },
  // o combo com uns 15% abaixo da Triagem (R$ 59) + Teste Prático (R$ 29) separados (11/11/2026)
  combo: { MONTHLY: 75, QUARTERLY: 191 },
  completo: { MONTHLY: 129, QUARTERLY: 329 },
};

const paraTexto = (v: number | null) => (v == null ? "" : v.toFixed(2).replace(".", ","));

function lerValor(t: string): number | null {
  const limpo = t
    .replace(/[^\d,.]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  if (!limpo) return null;
  const n = Math.round(Number(limpo) * 100) / 100;
  return Number.isFinite(n) ? n : null;
}

const CICLOS: Ciclo[] = ["MONTHLY", "QUARTERLY", "YEARLY", "AVULSO"];
const CABECALHO: Record<Ciclo, string> = {
  MONTHLY: "Mensal",
  QUARTERLY: "A cada 3 meses",
  YEARLY: "Anual",
  AVULSO: "30 dias, sem renovar",
};
const NOME: Record<Ciclo, string> = {
  MONTHLY: "mensal",
  QUARTERLY: "a cada 3 meses",
  YEARLY: "anual",
  AVULSO: "30 dias, sem renovar",
};

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const COMO_O_CLIENTE_VE: Record<Ciclo, string> = {
  MONTHLY: "por mês",
  QUARTERLY: "a cada 3 meses",
  YEARLY: "por ano",
  AVULSO: "por 30 dias",
};

type Linha = { valor: string; ligado: boolean };

export function TabelaDePrecos({ planos }: { planos: PlanoDoAdmin[] }) {
  const inicial = useMemo(() => {
    const m = new Map<string, Linha>();
    for (const p of planos) m.set(p.id, { valor: paraTexto(p.valor), ligado: p.ligado });
    return m;
  }, [planos]);
  const [linhas, setLinhas] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [retorno, setRetorno] = useState<{ ok: boolean; texto: string } | null>(null);

  const plano = (r: Produto, c: Ciclo) => planos.find((p) => p.recurso === r && p.ciclo === c);
  const valorDe = (r: Produto, c: Ciclo) => {
    const p = plano(r, c);
    return p ? lerValor(linhas.get(p.id)?.valor ?? "") : null;
  };
  const mudar = (id: string, parte: Partial<Linha>) =>
    setLinhas((atual) => new Map(atual).set(id, { ...(atual.get(id) ?? { valor: "", ligado: false }), ...parte }));
  const mudados = planos.filter((p) => {
    const a = inicial.get(p.id);
    const b = linhas.get(p.id);
    return a && b && (lerValor(a.valor) !== lerValor(b.valor) || a.ligado !== b.ligado);
  });

  // só os valores: o "À venda" fica como está (antes ligava tudo, até o Plano Completo, que saiu de venda)
  function usarSugestao() {
    setLinhas((atual) => {
      const novo = new Map(atual);
      for (const p of planos) {
        const v = SUGESTAO[p.recurso][p.ciclo];
        if (v == null || FORA_DE_VENDA.includes(p.recurso)) continue;
        novo.set(p.id, { valor: paraTexto(v), ligado: atual.get(p.id)?.ligado ?? false });
      }
      return novo;
    });
    setRetorno(null);
  }

  /** "R$ 199 por mês, R$ 507 a cada 3 meses…": o que o cliente vê, só com o que está à venda. */
  function fraseDoCliente(r: Produto) {
    const partes = CICLOS.flatMap((c) => {
      const p = plano(r, c);
      const l = p ? linhas.get(p.id) : undefined;
      const v = p ? valorDe(r, c) : null;
      return l?.ligado && v ? [`${reais(v)} ${COMO_O_CLIENTE_VE[c]}`] : [];
    });
    return partes.length ? partes.join(" · ") : "Nada à venda";
  }

  async function salvar() {
    setSalvando(true);
    setRetorno(null);
    const falhas: string[] = [];
    for (const p of mudados) {
      const l = linhas.get(p.id)!;
      const r = await chamarAcao(() => salvarPlano(p.id, l.valor, l.ligado));
      if (!r.ok) falhas.push(`${NOME_PRODUTO[p.recurso]} (${NOME[p.ciclo]}): ${r.erro}`);
    }
    setSalvando(false);
    setRetorno(
      falhas.length
        ? { ok: false, texto: falhas.join(" · ") }
        : { ok: true, texto: `${mudados.length === 1 ? "1 preço salvo" : `${mudados.length} preços salvos`}.` },
    );
  }

  /** A conta de um produto: os descontos e, nos pacotes, os recursos separados, com o aviso quando não fecha. */
  function conta(r: Produto) {
    const mensal = valorDe(r, "MONTHLY");
    const tri = valorDe(r, "QUARTERLY");
    const desconto = mensal && tri ? Math.round((1 - tri / (mensal * 3)) * 100) : null;
    const anual = valorDe(r, "YEARLY");
    const trinta = valorDe(r, "AVULSO");
    const descontoAnual = mensal && anual ? Math.round((1 - anual / (mensal * 12)) * 100) : null;
    const acima = mensal && trinta ? Math.round((trinta / mensal - 1) * 100) : null;
    const partes = recursosDo(r).length > 1 ? recursosDo(r).map((x) => valorDe(x, "MONTHLY")) : null;
    const separados = partes && partes.every((x) => x != null) ? partes.reduce<number>((t, x) => t + x!, 0) : null;
    const economia = separados && mensal ? Math.round((1 - mensal / separados) * 100) : null;
    const avisos = [
      desconto !== null && desconto <= 0 ? "os 3 meses saem mais caros que 3 mensais" : null,
      descontoAnual !== null && descontoAnual <= 0 ? "o anual sai mais caro que 12 mensais" : null,
      acima !== null && acima <= 0 ? "os 30 dias saem mais baratos que o mensal" : null,
      // nos planos por faixa, o preço paga também as vagas no ar e o que só os planos têm: a soma dos recursos não basta
      !ehPlano(r) && economia !== null && economia <= 0 ? "o pacote sai mais caro que os recursos separados" : null,
    ].filter((a): a is string => Boolean(a));
    return (
      <ul className="flex flex-col gap-1">
        {desconto !== null && <li>3 meses: {desconto}% de desconto</li>}
        {descontoAnual !== null && <li>Anual: {descontoAnual}% de desconto</li>}
        {acima !== null && <li>30 dias: {acima}% acima do mensal</li>}
        {separados !== null && mensal && (
          <li>
            {ehPlano(r)
              ? `Os seis recursos separados: ${reais(separados)} por mês (o plano paga também as vagas no ar e o mutirão, o convite automático e o mapa de talentos)`
              : `Separados: ${reais(separados)} por mês · economia de ${economia}%`}
          </li>
        )}
        {avisos.map((a) => (
          <li key={a} className="flex items-start gap-1.5 font-semibold text-danger">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {a}
          </li>
        ))}
      </ul>
    );
  }

  /** O nome do produto, o que ele junta e a frase que o cliente vê. */
  function nomeDo(r: Produto, comFrase = true) {
    return (
      <>
        {NOME_PRODUTO[r]}
        {recursosDo(r).length > 1 && !ehPlano(r) && (
          <span className="block font-normal text-ink-muted">
            {r === "completo" ? "os cinco recursos" : "Triagem + Teste Prático"}
          </span>
        )}
        {comFrase && <span className="mt-1 block font-normal text-ink-muted">{fraseDoCliente(r)}</span>}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {GRUPOS.map((g) => (
        <div key={g.titulo} className="flex flex-col gap-2">
          <h3 className="text-label">{g.titulo}</h3>
          <p className="text-body-sm text-ink-muted">{g.texto}</p>
          <div className="overflow-x-auto">
            <table className={`w-full text-body-sm ${g.ciclos.length > 2 ? "min-w-[960px]" : "min-w-[640px]"}`}>
              <thead>
                <tr className="text-left text-ink-muted">
                  <th className="py-2 pr-3 font-semibold">Produto</th>
                  {g.ciclos.map((c) => (
                    <th key={c} className="py-2 pr-3 font-semibold">
                      {CABECALHO[c]}
                    </th>
                  ))}
                  <th className="py-2 font-semibold">A conta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {g.produtos
                  .filter((r) => g.ciclos.some((c) => plano(r, c)))
                  .map((r) => (
                    <tr key={r} className="align-top">
                      <th scope="row" className="py-3 pr-3 text-left text-label">
                        {nomeDo(r)}
                      </th>
                      {g.ciclos.map((c) => {
                        const p = plano(r, c);
                        if (!p)
                          return (
                            <td key={c} className="py-3 pr-3 text-ink-muted">
                              sem plano
                            </td>
                          );
                        const l = linhas.get(p.id) ?? { valor: "", ligado: false };
                        return (
                          <td key={c} className="py-3 pr-3">
                            <span className="flex items-center gap-1.5">
                              <span className="text-ink-muted">R$</span>
                              <input
                                value={l.valor}
                                onChange={(e) => mudar(p.id, { valor: e.target.value })}
                                inputMode="decimal"
                                placeholder="sem preço"
                                aria-label={`Preço de ${NOME_PRODUTO[r]}, ${NOME[c]}`}
                                className={`${classesEntrada} w-28 tabular-nums`}
                              />
                            </span>
                            <label className="mt-1.5 flex min-h-9 items-center gap-2">
                              <input
                                type="checkbox"
                                checked={l.ligado}
                                onChange={(e) => mudar(p.id, { ligado: e.target.checked })}
                                className="size-4"
                                aria-label={`${NOME_PRODUTO[r]}, ${NOME[c]}, à venda`}
                              />
                              À venda
                            </label>
                          </td>
                        );
                      })}
                      <td className="py-3">{conta(r)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {FORA_DE_VENDA.some((r) => plano(r, "MONTHLY") || plano(r, "QUARTERLY")) && (
        <details className="rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-label">Fora de venda (quem assina continua)</summary>
          <ul className="mt-2 flex flex-col gap-1 text-body-sm">
            {FORA_DE_VENDA.map((r) => (
              <li key={r}>
                <span className="font-semibold">{nomeDo(r, false)}</span>:{" "}
                {(["MONTHLY", "QUARTERLY"] as Ciclo[])
                  .map((c) => {
                    const v = valorDe(r, c);
                    return v ? `${reais(v)} ${COMO_O_CLIENTE_VE[c]}` : null;
                  })
                  .filter(Boolean)
                  .join(" · ") || "sem preço"}
                {/* se ficou à venda por engano (o "Usar a sugestão" de antes ligava), dá para tirar daqui */}
                {CICLOS.map((c) => {
                  const p = plano(r, c);
                  const l = p ? linhas.get(p.id) : undefined;
                  if (!p || !l?.ligado) return null;
                  return (
                    <label key={c} className="mt-1 flex min-h-9 items-center gap-2 font-semibold text-danger">
                      <input
                        type="checkbox"
                        checked={l.ligado}
                        onChange={(e) => mudar(p.id, { ligado: e.target.checked })}
                        className="size-4"
                      />
                      <AlertTriangle aria-hidden className="size-4" />
                      O {NOME[c]} está à venda: desmarque e salve
                    </label>
                  );
                })}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-body-sm text-ink-muted">
            Não aparece para quem vai assinar. Quem já assina continua pagando o valor da assinatura dele.
          </p>
        </details>
      )}
      <p className="text-body-sm text-ink-muted">
        Mudar o preço vale para quem assinar depois; quem já assina continua com o valor da assinatura dele.
      </p>
      {retorno && (
        <Aviso tipo={retorno.ok ? "sucesso" : "erro"}>
          <p>{retorno.texto}</p>
        </Aviso>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Botao variante="primario" onClick={salvar} disabled={salvando || mudados.length === 0}>
          <Check aria-hidden />
          {salvando ? "Salvando…" : mudados.length ? `Salvar os preços (${mudados.length})` : "Salvar os preços"}
        </Botao>
        <Botao variante="secundario" onClick={usarSugestao} disabled={salvando}>
          <Wand2 aria-hidden />
          Usar a sugestão
        </Botao>
        {mudados.length > 0 && !salvando && (
          <Botao
            variante="fantasma"
            onClick={() => {
              setLinhas(inicial);
              setRetorno(null);
            }}
          >
            Desfazer
          </Botao>
        )}
      </div>
    </div>
  );
}
