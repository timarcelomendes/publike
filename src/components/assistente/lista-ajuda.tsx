"use client";

import { MessageCircleQuestion, Search } from "lucide-react";
import { useState } from "react";
import type { TemaAjuda } from "@/lib/ajuda";
import { ID_CONVERSA_AJUDA } from "@/lib/assistente";
import { Botao } from "../ui/botao";
import { perguntarNaConversa, useTemConversaNaTela } from "./conversa-estado";

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** As perguntas da ajuda, por tema, com uma busca que filtra enquanto digita. */
export function ListaAjuda({ temas }: { temas: TemaAjuda[] }) {
  const [busca, setBusca] = useState("");
  // o assistente só aparece na página quando está ligado
  const temAssistente = useTemConversaNaTela();
  const termos = normalizar(busca)
    .split(/\s+/)
    .filter((t) => t.length > 1);
  const filtrados = temas
    .map((t) => ({
      ...t,
      perguntas: t.perguntas.filter((q) => {
        const alvo = normalizar(`${q.p} ${q.r}`);
        return termos.every((termo) => alvo.includes(termo));
      }),
    }))
    .filter((t) => t.perguntas.length);

  // a busca não achou (ou não era bem isso): o assistente responde o que a pessoa digitou
  function perguntarAoAssistente() {
    perguntarNaConversa(busca.trim());
    const caixa = document.getElementById(ID_CONVERSA_AJUDA);
    if (!caixa) return;
    const { top, bottom } = caixa.getBoundingClientRect();
    if (top < 0 || bottom > window.innerHeight) {
      caixa.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface-200 px-3 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-focus">
        <Search aria-hidden className="size-5 shrink-0 text-ink-muted" />
        <label htmlFor="busca-ajuda" className="sr-only">
          Procure sua dúvida
        </label>
        <input
          id="busca-ajuda"
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Procure sua dúvida: match, CEP, currículo…"
          className="min-h-12 flex-1 bg-transparent text-body outline-none placeholder:text-ink-muted/80"
        />
      </div>
      {filtrados.length === 0 && (
        <p className="text-body text-ink-muted" role="status">
          {temAssistente
            ? "Nada encontrado nas perguntas da ajuda."
            : "Nada encontrado. Tente outras palavras ou fale com a equipe."}
        </p>
      )}
      {filtrados.map((t) => (
        <section key={t.id} id={t.id} aria-labelledby={`tema-${t.id}`} className="scroll-mt-24">
          <h2 id={`tema-${t.id}`} className="text-h3">
            {t.titulo}
          </h2>
          <div className="mt-3 flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {t.perguntas.map((q) => (
              <details key={q.p} open={termos.length > 0} className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-label marker:hidden">
                  {q.p}
                  <span aria-hidden className="text-h3 text-ink-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="px-4 pb-4 text-body text-ink-muted">{q.r}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
      {termos.length > 0 && temAssistente && (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-line-strong p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body">
            {filtrados.length
              ? "Não é bem isso? O assistente responde sua dúvida na hora."
              : "O assistente responde sua dúvida e encontra a resposta na hora."}
          </p>
          <Botao onClick={perguntarAoAssistente} className="shrink-0">
            <MessageCircleQuestion aria-hidden />
            Perguntar ao assistente
          </Botao>
        </div>
      )}
    </div>
  );
}
