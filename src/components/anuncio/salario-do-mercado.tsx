"use client";

import { ChartNoAxesColumn } from "lucide-react";
import { useEffect, useState } from "react";
import { mercadoDaFuncao, type MercadoDaFuncao } from "@/lib/acoes/salarios";
import { formatarNumero } from "@/lib/formato";
import type { FuncaoParaForm } from "@/lib/funcao-cbo";
import { fonteDaFaixa, nomeDaRegiao, reaisDaFaixa } from "@/lib/salarios";

/**
 * Quanto o mercado paga (claude/plano-salario-e-curriculo.md, parte 3): no passo do salário, a faixa da função na
 * região (Novo Caged), a média das vagas parecidas no Publike e o "Usar" que preenche o valor. Com o salário por mês
 * abaixo da faixa, avisa sem bloquear. Sem a função (passo 1) ou sem dados da função, não aparece.
 */
export function SalarioDoMercado({
  funcao,
  cidade,
  valor,
  unidade,
  aoUsar,
}: {
  funcao: FuncaoParaForm | null;
  cidade: string;
  /** o valor digitado (null: vazio ou a combinar) */
  valor: number | null;
  unidade: string;
  aoUsar: (valor: number) => void;
}) {
  const chave = funcao ? `${funcao.cbo}|${cidade}` : null;
  const [resposta, setResposta] = useState<{ chave: string; mercado: MercadoDaFuncao | null } | null>(null);

  useEffect(() => {
    if (!funcao || !chave) return;
    let vale = true;
    mercadoDaFuncao(funcao.cbo, cidade)
      .catch(() => null)
      .then((mercado) => {
        if (vale) setResposta({ chave, mercado });
      });
    return () => {
      vale = false;
    };
  }, [chave, funcao, cidade]);

  const mercado = resposta && resposta.chave === chave ? resposta.mercado : null;
  if (!funcao || !mercado) return null;
  const { faixa, publike } = mercado;
  const meio = Math.round(faixa.p50 / 10) * 10;
  const porMes = unidade === "mes";
  const abaixo = porMes && valor != null && valor > 0 && valor < faixa.p25;
  const acima = porMes && valor != null && valor > faixa.p75;
  const dentro = porMes && valor != null && valor >= faixa.p25 && valor <= faixa.p75;

  return (
    <section
      aria-label="Quanto o mercado paga"
      className="flex flex-col gap-2 rounded-md border border-line bg-surface-100 p-3 text-body-sm sm:p-4"
    >
      <p className="flex items-start gap-2">
        <ChartNoAxesColumn aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
        <span>
          <strong className="font-semibold">Quanto se paga para {funcao.nome}</strong> em {nomeDaRegiao(faixa.regiao)}:
          a maioria entre {reaisDaFaixa(faixa.p25)} e {reaisDaFaixa(faixa.p75)} por mês; no meio,{" "}
          {reaisDaFaixa(faixa.p50)}.
        </span>
      </p>
      {publike && (
        <p className="pl-6 text-ink-muted">
          No Publike, {publike.n} vagas parecidas no ar oferecem {reaisDaFaixa(publike.media)} em média.
        </p>
      )}
      {abaixo && (
        <p role="status" className="pl-6 font-semibold text-terra-text">
          R$ {formatarNumero(valor)} está abaixo do que 3 em cada 4 contratações pagam. Pode receber menos candidatos.
        </p>
      )}
      {dentro && (
        <p role="status" className="pl-6 text-cerrado-text">
          Dentro do que a maioria paga.
        </p>
      )}
      {acima && (
        <p role="status" className="pl-6 text-cerrado-text">
          Acima do que 3 em cada 4 contratações pagam: chama a atenção na busca.
        </p>
      )}
      {!porMes && <p className="pl-6 text-ink-muted">A faixa é por mês, em jornada integral.</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-6">
        {porMes && valor !== meio && (
          <button
            type="button"
            onClick={() => aoUsar(meio)}
            className="min-h-9 text-label text-terra-text underline underline-offset-2"
          >
            Usar {reaisDaFaixa(faixa.p50)}
          </button>
        )}
        <span className="text-caption text-ink-muted">{fonteDaFaixa(faixa)}.</span>
      </div>
    </section>
  );
}
