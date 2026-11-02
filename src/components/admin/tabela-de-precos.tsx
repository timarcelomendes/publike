"use client";

import { AlertTriangle, Check, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarPlano } from "@/lib/acoes/admin-pagamentos";
import { NOME_PRODUTO, recursosDo, type Ciclo, type Produto } from "@/lib/pagamentos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

// Admin › Pagamentos › Preços (02/11/2026): os planos numa tabela só, um produto por linha, com o mensal e o de
// 3 meses lado a lado. Mostra na hora o desconto do trimestral e, nos pacotes, quanto sairiam os recursos separados,
// com um aviso quando a conta não fecha (pacote mais caro que as partes, trimestral sem desconto). "Usar a sugestão"
// preenche os preços do plano (claude/plano-lancamento-pagos.md) sem salvar; "Salvar os preços" grava só o que mudou.

export type PlanoDoAdmin = { id: string; recurso: Produto; ciclo: Ciclo; valor: number | null; ligado: boolean };

const ORDEM: Produto[] = ["copiloto", "testes", "video", "automacoes", "combo", "completo"];

/** A sugestão do plano de lançamento: o mensal e os 3 meses com uns 15% de desconto. */
const SUGESTAO: Record<Produto, { MONTHLY: number; QUARTERLY: number }> = {
  copiloto: { MONTHLY: 79, QUARTERLY: 199 },
  testes: { MONTHLY: 29, QUARTERLY: 74 },
  video: { MONTHLY: 49, QUARTERLY: 125 },
  automacoes: { MONTHLY: 39, QUARTERLY: 99 },
  combo: { MONTHLY: 89, QUARTERLY: 227 },
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

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

  function usarSugestao() {
    setLinhas((atual) => {
      const novo = new Map(atual);
      for (const p of planos) novo.set(p.id, { valor: paraTexto(SUGESTAO[p.recurso][p.ciclo]), ligado: true });
      return novo;
    });
    setRetorno(null);
  }

  async function salvar() {
    setSalvando(true);
    setRetorno(null);
    const falhas: string[] = [];
    for (const p of mudados) {
      const l = linhas.get(p.id)!;
      const r = await chamarAcao(() => salvarPlano(p.id, l.valor, l.ligado));
      if (!r.ok) falhas.push(`${NOME_PRODUTO[p.recurso]} (${p.ciclo === "MONTHLY" ? "mensal" : "3 meses"}): ${r.erro}`);
    }
    setSalvando(false);
    setRetorno(
      falhas.length
        ? { ok: false, texto: falhas.join(" · ") }
        : { ok: true, texto: `${mudados.length === 1 ? "1 preço salvo" : `${mudados.length} preços salvos`}.` },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-body-sm">
          <thead>
            <tr className="text-left text-ink-muted">
              <th className="py-2 pr-3 font-semibold">Produto</th>
              <th className="py-2 pr-3 font-semibold">Mensal</th>
              <th className="py-2 pr-3 font-semibold">A cada 3 meses</th>
              <th className="py-2 font-semibold">A conta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ORDEM.filter((r) => plano(r, "MONTHLY") || plano(r, "QUARTERLY")).map((r) => {
              const mensal = valorDe(r, "MONTHLY");
              const tri = valorDe(r, "QUARTERLY");
              const desconto = mensal && tri ? Math.round((1 - tri / (mensal * 3)) * 100) : null;
              const partes = recursosDo(r).length > 1 ? recursosDo(r).map((x) => valorDe(x, "MONTHLY")) : null;
              const separados =
                partes && partes.every((x) => x != null) ? partes.reduce<number>((t, x) => t + x!, 0) : null;
              const economia = separados && mensal ? Math.round((1 - mensal / separados) * 100) : null;
              const avisos = [
                desconto !== null && desconto <= 0 ? "os 3 meses saem mais caros que 3 mensais" : null,
                economia !== null && economia <= 0 ? "o pacote sai mais caro que os recursos separados" : null,
                r === "completo" &&
                mensal &&
                valorDe("combo", "MONTHLY") &&
                valorDe("video", "MONTHLY") &&
                valorDe("automacoes", "MONTHLY") &&
                mensal >=
                  valorDe("combo", "MONTHLY")! + valorDe("video", "MONTHLY")! + valorDe("automacoes", "MONTHLY")!
                  ? "combo + vídeo + automações sai mais em conta"
                  : null,
              ].filter(Boolean);
              return (
                <tr key={r} className="align-top">
                  <th scope="row" className="py-3 pr-3 text-left text-label">
                    {NOME_PRODUTO[r]}
                    {recursosDo(r).length > 1 && (
                      <span className="block font-normal text-ink-muted">
                        {r === "completo" ? "os quatro recursos" : "Triagem + Teste Prático"}
                      </span>
                    )}
                  </th>
                  {(["MONTHLY", "QUARTERLY"] as const).map((c) => {
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
                            aria-label={`Preço de ${NOME_PRODUTO[r]}, ${c === "MONTHLY" ? "mensal" : "a cada 3 meses"}`}
                            className={`${classesEntrada} w-28 tabular-nums`}
                          />
                        </span>
                        <label className="mt-1.5 flex min-h-9 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={l.ligado}
                            onChange={(e) => mudar(p.id, { ligado: e.target.checked })}
                            className="size-4"
                            aria-label={`${NOME_PRODUTO[r]}, ${c === "MONTHLY" ? "mensal" : "a cada 3 meses"}, à venda`}
                          />
                          À venda
                        </label>
                      </td>
                    );
                  })}
                  <td className="py-3">
                    <ul className="flex flex-col gap-1">
                      {desconto !== null && <li>3 meses: {desconto}% de desconto</li>}
                      {separados !== null && mensal && (
                        <li>
                          Separados: {reais(separados)} por mês · economia de {economia}%
                        </li>
                      )}
                      {avisos.map((a) => (
                        <li key={a} className="flex items-start gap-1.5 font-semibold text-danger">
                          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
