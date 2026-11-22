"use client";

import { useState, useTransition } from "react";
import { mudarMeuResumo } from "@/lib/acoes/leitura-curriculo";

/**
 * "Seu resumo para as empresas" em Meu currículo (migração 20270901120000; claude/plano-curriculo-otimizado.md): a linha
 * que a empresa lê primeiro em Talentos e nos candidatos. Sai da leitura do currículo, só com o que está nele; a pessoa
 * pode escrever o dela e voltar ao automático.
 */
export function ResumoParaAsEmpresas({ automatico, meu }: { automatico: string; meu: string | null }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(meu ?? automatico);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const atual = meu || automatico;
  if (!atual && !editando) return null;

  const salvar = (valor: string | null) =>
    iniciar(async () => {
      setErro(null);
      const r = await mudarMeuResumo(valor);
      if (!r.ok) return setErro(r.erro ?? "Não deu.");
      setEditando(false);
    });

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-label">Seu resumo para as empresas</h3>
      <p className="text-body-sm text-ink-muted">
        É a primeira coisa que a empresa lê sobre você em Talentos e quando você se candidata.
        {meu ? " Você escreveu este." : " Feito só com o que está no seu currículo."}
      </p>
      {editando ? (
        <div className="flex flex-col gap-2">
          <label className="sr-only" htmlFor="resumo-para-empresas">
            Seu resumo para as empresas
          </label>
          <textarea
            id="resumo-para-empresas"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={200}
            rows={3}
            className="w-full rounded-md border border-line-strong bg-surface-100 px-3 py-2 text-body"
          />
          <p className="text-caption text-ink-muted">
            {texto.trim().length} de 200 letras. Conte a função, o tempo e o que você fazia. Sem telefone nem e-mail.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pendente}
              onClick={() => salvar(texto)}
              className="inline-flex min-h-11 items-center rounded-md bg-ink px-4 text-label text-surface-100 disabled:opacity-60"
            >
              {pendente ? "Salvando…" : "Salvar o resumo"}
            </button>
            <button type="button" onClick={() => setEditando(false)} className="text-label underline underline-offset-2">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="rounded-md bg-surface-300 px-4 py-3 text-body">{atual}</p>
          <div className="flex flex-wrap gap-4 text-body-sm">
            <button type="button" onClick={() => setEditando(true)} className="text-label underline underline-offset-2">
              Mudar o resumo
            </button>
            {meu && automatico && (
              <button
                type="button"
                disabled={pendente}
                onClick={() => salvar(null)}
                className="underline underline-offset-2"
              >
                {pendente ? "Voltando…" : "Voltar ao automático"}
              </button>
            )}
          </div>
        </>
      )}
      {erro && (
        <p role="alert" className="text-body-sm text-terra-text">
          {erro}
        </p>
      )}
    </div>
  );
}
