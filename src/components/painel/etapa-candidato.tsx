"use client";

import { ChevronDown, NotebookPen } from "lucide-react";
import { useId, useState } from "react";
import { salvarEtapaCandidato } from "@/lib/acoes/curtidas";
import { ETAPAS_CANDIDATO, etapasDoTipo, etapasPermitidas, type EtapaCandidato } from "@/lib/constantes";
import { ContratacaoPublica } from "../social/botoes";
import { Botao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

/**
 * Etapa e anotação de um interessado. A pessoa que curtiu vê a etapa (e recebe um
 * aviso quando ela muda); a anotação é só de quem publicou. O aviso disso fica no
 * topo da lista (Candidatos e a página da vaga), não em cada cartão.
 * As etapas seguem o pé da curtida (`etapasPermitidas`): Entrevista e Contratado só
 * depois do match; antes, elas aparecem apagadas na lista, dizendo quando liberam.
 */
export function EtapaDoCandidato({
  tipo = "vaga",
  status,
  anuncioId,
  perfilId,
  etapa: etapaInicial,
  nota: notaInicial,
  compacto = false,
  publico = null,
}: {
  /** vaga ou serviço: cada um tem as suas etapas */
  tipo?: string;
  /** pé da curtida: pendente, match, dispensada ou desfeito */
  status: string;
  anuncioId: string;
  perfilId: string;
  etapa: EtapaCandidato;
  nota: string | null;
  /**
   * Na mesma linha das ações do cartão (Candidatos): sem caixa própria. A etapa vai
   * para a direita e a anotação, quando aberta, ocupa a linha inteira embaixo.
   */
  compacto?: boolean;
  /** contratado: se cada lado topou mostrar no Publike, e o nome da pessoa */
  publico?: { okEmpresa: boolean; okPessoa: boolean; nome: string } | null;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [etapa, setEtapa] = useState<EtapaCandidato>(etapaInicial);
  const [nota, setNota] = useState(notaInicial ?? "");
  const [anotar, setAnotar] = useState(Boolean(notaInicial));
  const id = useId();
  const mudouNota = nota.trim() !== (notaInicial ?? "").trim();
  const servico = tipo === "servico";
  // dispensado ou match desfeito: a etapa para; a anotação continua
  const permitidas = etapasPermitidas(tipo, status);
  const rotulo = (valor: EtapaCandidato) => {
    const nome = ETAPAS_CANDIDATO[valor].nome;
    if (permitidas.includes(valor)) return nome;
    if (valor === "nao_seguiu") return `${nome} (use ${servico ? "Recusar" : "Dispensar"})`;
    return `${nome} (depois ${servico ? "de aceitar" : "do match"})`;
  };

  function trocarEtapa(nova: EtapaCandidato) {
    const antes = etapa;
    setEtapa(nova);
    // a etapa salva na hora; a anotação vai junto como está salva. Se não salvar, volta.
    rodar(
      () => salvarEtapaCandidato(anuncioId, perfilId, nova, notaInicial),
      (r) => {
        if (!r.ok) setEtapa(antes);
      },
    );
  }

  return (
    <div className={compacto ? "contents" : "flex flex-col gap-2 rounded-md bg-surface-100 p-3"}>
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${compacto ? "sm:ml-auto" : ""}`}>
        {permitidas.length > 0 && (
          <>
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
                <option key={valor} value={valor} disabled={!permitidas.includes(valor)}>
                  {rotulo(valor)}
                </option>
              ))}
            </Seletor>
          </>
        )}
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
      {tipo === "vaga" && status === "match" && etapa === "contratado" && publico && (
        <ContratacaoPublica
          anuncioId={anuncioId}
          perfilId={perfilId}
          lado="empresa"
          okEmpresa={publico.okEmpresa}
          okPessoa={publico.okPessoa}
          outro={publico.nome.split(" ")[0]}
        />
      )}
      {compacto ? <div className="basis-full empty:hidden">{mensagem}</div> : mensagem}
    </div>
  );
}
