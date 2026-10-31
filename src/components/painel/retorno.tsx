"use client";

import { RotateCcw } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarRetorno } from "@/lib/acoes/retorno";
import { montarRetorno, problemaDoRetorno, RETORNO_MAX, type RetornoDaConta } from "@/lib/retorno";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

/**
 * O retorno a quem não seguiu (migração 20261230120000), na gaveta do quadro: ligar ou desligar, o texto com
 * {nome}, {vaga} e {empresa}, e a prévia. Vale para todas as vagas da conta.
 */
export function FormRetorno({
  retorno,
  exemplo,
  aoSalvar,
}: {
  retorno: RetornoDaConta;
  /** para a prévia: o primeiro candidato, a vaga e a empresa */
  exemplo: { nome: string; vaga: string; empresa: string };
  aoSalvar?: () => void;
}) {
  const base = useId();
  const [ligado, setLigado] = useState(retorno.ligado);
  const [texto, setTexto] = useState(retorno.texto ?? retorno.padrao);
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const limpo = texto.replace(/\s+/g, " ").trim();
  const problema = ligado ? problemaDoRetorno(limpo) : null;
  const ehPadrao = limpo === retorno.padrao;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-ink-muted">
        Quem você dispensa recebe este texto 15 minutos depois (dá para desfazer antes), das 8h às 20h, no aviso do
        Publike, no celular e no e-mail, com as vagas parecidas. Vale para todas as suas vagas. Quem já deu match e vai
        para “Não seguiu” recebe o mesmo texto.
      </p>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-label">
        <input
          type="checkbox"
          checked={ligado}
          onChange={(e) => setLigado(e.target.checked)}
          className="size-5 accent-[var(--pk-ink)]"
        />
        Avisar quem não seguir
      </label>
      {ligado && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${base}-texto`} className="text-label">
              O texto
            </label>
            <textarea
              id={`${base}-texto`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={5}
              maxLength={RETORNO_MAX + 50}
              aria-describedby={`${base}-ajuda`}
              className={`${classesEntrada} min-h-28 py-2`}
            />
            <p id={`${base}-ajuda`} className="text-body-sm text-ink-muted">
              Use {"{nome}"}, {"{vaga}"} e {"{empresa}"}: cada pessoa recebe com os dados dela. Sem telefone, e-mail ou
              link. {limpo.length} de {RETORNO_MAX} letras.
            </p>
            {!ehPadrao && (
              <button
                type="button"
                onClick={() => setTexto(retorno.padrao)}
                className="inline-flex min-h-10 items-center gap-1.5 self-start text-label text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                <RotateCcw aria-hidden className="size-4" />
                Voltar ao texto do Publike
              </button>
            )}
          </div>
          <div className="rounded-md bg-surface-300 p-3">
            <p className="text-caption text-ink-muted">Como {exemplo.nome.split(" ")[0]} recebe</p>
            <p className="mt-1 text-body-sm">{montarRetorno(limpo, exemplo)}</p>
          </div>
        </>
      )}
      {problema && <p className="text-body-sm text-danger">{problema}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Botao
          variante="primario"
          tamanho="sm"
          disabled={pendente || Boolean(problema)}
          onClick={() =>
            iniciar(async () => {
              setAviso(null);
              const r = await chamarAcao(() => salvarRetorno(ligado, ehPadrao ? null : limpo));
              setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Salvo." } : { ok: false, texto: r.erro });
              if (r.ok) aoSalvar?.();
            })
          }
        >
          {pendente ? "Salvando…" : "Salvar"}
        </Botao>
        {aviso && (
          <p role="status" className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
            {aviso.texto}
          </p>
        )}
      </div>
    </div>
  );
}
