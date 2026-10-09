"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { melhorarTextoAnuncio, type RascunhoAnuncio } from "@/lib/acoes/ia";
import { Botao } from "../ui/botao";

/** Botão "Melhorar texto": a IA sugere título e descrição; a pessoa escolhe se usa. */
export function MelhorarTexto({
  lerRascunho,
  aplicar,
}: {
  lerRascunho: () => RascunhoAnuncio;
  aplicar: (titulo: string, descricao: string) => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [sugestao, setSugestao] = useState<{ titulo: string; descricao: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function pedir() {
    setErro(null);
    setSugestao(null);
    iniciar(async () => {
      const r = await melhorarTextoAnuncio(lerRascunho());
      if (r.ok) setSugestao({ titulo: r.titulo, descricao: r.descricao });
      else setErro(r.erro);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-line-strong p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Botao tamanho="sm" disabled={pendente} onClick={pedir}>
          <Sparkles aria-hidden />
          {pendente ? "A IA está escrevendo…" : sugestao ? "Pedir outra sugestão" : "Melhorar texto com IA"}
        </Botao>
        <p className="text-body-sm text-ink-muted">A IA reescreve o título e a descrição. Você decide se usa.</p>
      </div>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
      {sugestao && (
        <div role="status" className="flex flex-col gap-3 rounded-md bg-surface-300 p-4">
          <p className="text-caption text-ink-muted uppercase">Sugestão da IA</p>
          <p className="text-label">{sugestao.titulo}</p>
          <p className="text-body whitespace-pre-line">{sugestao.descricao}</p>
          <div className="flex flex-wrap gap-2">
            <Botao
              tamanho="sm"
              onClick={() => {
                aplicar(sugestao.titulo, sugestao.descricao);
                setSugestao(null);
              }}
            >
              Usar esta sugestão
            </Botao>
            <Botao tamanho="sm" variante="fantasma" onClick={() => setSugestao(null)}>
              Manter o meu texto
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
