"use client";

import { ChevronDown, NotebookPen } from "lucide-react";
import { useId, useState } from "react";
import { salvarEtapaCandidato } from "@/lib/acoes/curtidas";
import { ETAPAS_CANDIDATO, etapasDoTipo, type EtapaCandidato } from "@/lib/constantes";
import { Botao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

/**
 * Etapa e anotação de um interessado. A pessoa que curtiu vê a etapa (e recebe um
 * aviso quando ela muda); a anotação é só de quem publicou. O aviso disso fica no
 * topo da lista (Candidatos e a página da vaga), não em cada cartão.
 */
export function EtapaDoCandidato({
  tipo = "vaga",
  anuncioId,
  perfilId,
  etapa: etapaInicial,
  nota: notaInicial,
  compacto = false,
}: {
  /** vaga ou serviço: cada um tem as suas etapas */
  tipo?: string;
  anuncioId: string;
  perfilId: string;
  etapa: EtapaCandidato;
  nota: string | null;
  /**
   * Na mesma linha das ações do cartão (Candidatos): sem caixa própria. A etapa vai
   * para a direita e a anotação, quando aberta, ocupa a linha inteira embaixo.
   */
  compacto?: boolean;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [etapa, setEtapa] = useState<EtapaCandidato>(etapaInicial);
  const [nota, setNota] = useState(notaInicial ?? "");
  const [anotar, setAnotar] = useState(Boolean(notaInicial));
  const id = useId();
  const mudouNota = nota.trim() !== (notaInicial ?? "").trim();

  function trocarEtapa(nova: EtapaCandidato) {
    setEtapa(nova);
    // a etapa salva na hora; a anotação vai junto como está salva
    rodar(() => salvarEtapaCandidato(anuncioId, perfilId, nova, notaInicial));
  }

  return (
    <div className={compacto ? "contents" : "flex flex-col gap-2 rounded-md bg-surface-100 p-3"}>
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${compacto ? "sm:ml-auto" : ""}`}>
        <label htmlFor={`${id}-etapa`} className="text-label">
          Etapa
        </label>
        <Seletor
          id={`${id}-etapa`}
          value={etapa}
          disabled={pendente}
          onChange={(e) => trocarEtapa(e.target.value as EtapaCandidato)}
          className={`${classesEntrada} min-h-10 py-1.5`}
          envoltorio="w-44"
        >
          {etapasDoTipo(tipo).map((valor) => (
            <option key={valor} value={valor}>
              {ETAPAS_CANDIDATO[valor].nome}
            </option>
          ))}
        </Seletor>
        <button
          type="button"
          onClick={() => setAnotar((a) => !a)}
          aria-expanded={anotar}
          aria-controls={`${id}-nota`}
          className="inline-flex min-h-10 items-center gap-1.5 text-body-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
        >
          <NotebookPen aria-hidden className="size-4" />
          {notaInicial ? "Anotação" : "Anotar"}
          <ChevronDown aria-hidden className={`size-4 transition-transform ${anotar ? "rotate-180" : ""}`} />
        </button>
      </div>
      {anotar && (
        <div id={`${id}-nota`} className={`flex flex-col gap-2 ${compacto ? "basis-full" : ""}`}>
          <label htmlFor={`${id}-texto`} className="sr-only">
            Anotação sobre esta pessoa
          </label>
          <textarea
            id={`${id}-texto`}
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, 1000))}
            rows={3}
            placeholder="Ex.: entrevista na terça às 14h; mora perto; tem experiência com caixa."
            className={`${classesEntrada} py-2`}
          />
          <div className="flex items-center gap-3">
            <Botao
              tamanho="sm"
              disabled={pendente || !mudouNota}
              onClick={() => rodar(() => salvarEtapaCandidato(anuncioId, perfilId, etapa, nota))}
            >
              Salvar anotação
            </Botao>
            <span className="text-caption text-ink-muted normal-case">{nota.length}/1000</span>
          </div>
        </div>
      )}
      {compacto ? <div className="basis-full empty:hidden">{mensagem}</div> : mensagem}
    </div>
  );
}
