"use client";

import { PartyPopper } from "lucide-react";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/basicos";
import { chamarAcao } from "@/lib/acao-segura";
import { confirmarConquista } from "@/lib/acoes/conquistas";
import type { ConquistaParaConfirmar } from "@/lib/conquistas";

/**
 * No painel da vaga: quem disse que começou a trabalhar ("Comecei!"). Confirmar leva a pessoa para Contratado e põe o
 * nome da empresa na conquista dela; "Não é verdade" tira a conquista do Publike.
 */
export function ConfirmarConquistas({ itens }: { itens: ConquistaParaConfirmar[] }) {
  if (!itens.length) return null;
  return (
    <section
      id="conquistas"
      aria-labelledby="conquistas-titulo"
      className="flex scroll-mt-24 flex-col gap-3 rounded-lg border border-cerrado/40 bg-cerrado/10 px-4 py-3.5"
    >
      <h2 id="conquistas-titulo" className="flex items-center gap-2 text-label">
        <PartyPopper aria-hidden className="size-[18px] shrink-0 text-cerrado-text" />
        {itens.length === 1 ? "Uma pessoa disse que começou a trabalhar com vocês" : `${itens.length} pessoas disseram que começaram a trabalhar com vocês`}
      </h2>
      <ul className="flex flex-col gap-3">
        {itens.map((c) => (
          <Linha key={`${c.anuncio_id}:${c.perfil_id}`} c={c} />
        ))}
      </ul>
      <p className="text-body-sm text-ink-muted">
        Confirmando, a pessoa vai para Contratado no quadro, e a conquista dela ganha o selo “Confirmado pela
        empresa”. Isso mostra para quem procura trabalho que vocês contratam pelo Publike.
      </p>
    </section>
  );
}

function Linha({ c }: { c: ConquistaParaConfirmar }) {
  const [feito, setFeito] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function responder(sim: boolean) {
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() => confirmarConquista(c.anuncio_id, c.perfil_id, sim));
      if (!r.ok) return setErro("erro" in r && r.erro ? r.erro : "Não foi possível agora. Tente de novo.");
      setFeito("mensagem" in r && r.mensagem ? r.mensagem : "Pronto.");
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3">
      <Avatar nome={c.nome} foto={c.foto} tamanho={36} />
      <p className="min-w-0 flex-1 basis-[12rem] text-body-sm">
        <span className="font-semibold">{c.nome}</span> disse que começou, pela vaga “{c.titulo}”.
      </p>
      {feito ? (
        <span role="status" className="basis-full pl-12 text-body-sm text-cerrado-text sm:basis-auto sm:pl-0">
          {feito}
        </span>
      ) : (
        <span className="flex basis-full gap-2 pl-12 sm:basis-auto sm:pl-0">
          <button
            type="button"
            disabled={enviando}
            onClick={() => responder(true)}
            className="inline-flex min-h-10 items-center rounded-pill bg-cerrado px-4 text-label text-on-cerrado hover:opacity-90 disabled:opacity-60"
          >
            Confirmar
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => responder(false)}
            className="inline-flex min-h-10 items-center rounded-pill border border-line-strong bg-surface-100 px-4 text-label text-ink hover:bg-surface-300 disabled:opacity-60"
          >
            Não é verdade
          </button>
        </span>
      )}
      {erro && (
        <p role="alert" className="basis-full text-body-sm text-danger">
          {erro}
        </p>
      )}
    </li>
  );
}
