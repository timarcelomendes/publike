"use client";

import { PartyPopper } from "lucide-react";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/basicos";
import { chamarAcao } from "@/lib/acao-segura";
import { chamariaDeNovo, confirmarConquista } from "@/lib/acoes/conquistas";
import type { ConquistaParaConfirmar } from "@/lib/conquistas";

/**
 * No painel da vaga: quem disse que começou a trabalhar ("Comecei!") e, 7 dias depois de alguém ir para Contratado,
 * "Começou a trabalhar?" (migração 20270526120000). Confirmar leva a pessoa para Contratado e põe o nome da empresa na
 * conquista dela; "Não é verdade" tira a conquista do Publike. Depois do sim, "Chamaria de novo?": o começo da reputação
 * de quem trabalha.
 */
export function ConfirmarConquistas({ itens }: { itens: ConquistaParaConfirmar[] }) {
  if (!itens.length) return null;
  const soDisseram = itens.every((c) => (c.pergunta ?? "confirmar") === "confirmar");
  return (
    <section
      id="conquistas"
      aria-labelledby="conquistas-titulo"
      className="flex scroll-mt-24 flex-col gap-3 rounded-lg border border-cerrado/40 bg-cerrado/10 px-4 py-3.5"
    >
      <h2 id="conquistas-titulo" className="flex items-center gap-2 text-label">
        <PartyPopper aria-hidden className="size-[18px] shrink-0 text-cerrado-text" />
        {!soDisseram
          ? "Como foi com quem vocês contrataram?"
          : itens.length === 1
            ? "Uma pessoa disse que começou a trabalhar com vocês"
            : `${itens.length} pessoas disseram que começaram a trabalhar com vocês`}
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

const SIM =
  "inline-flex min-h-10 items-center rounded-pill bg-cerrado px-4 text-label text-on-cerrado hover:opacity-90 disabled:opacity-60";
const NAO =
  "inline-flex min-h-10 items-center rounded-pill border border-line-strong bg-surface-100 px-4 text-label text-ink hover:bg-surface-300 disabled:opacity-60";

function Linha({ c }: { c: ConquistaParaConfirmar }) {
  const [etapa, setEtapa] = useState(c.pergunta ?? "confirmar");
  const [feito, setFeito] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function rodar(acao: () => Promise<{ ok: boolean; erro?: string; mensagem?: string }>, depois: (ok: string) => void) {
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(acao);
      if (!r.ok) return setErro("erro" in r && r.erro ? r.erro : "Não foi possível agora. Tente de novo.");
      depois("mensagem" in r && r.mensagem ? r.mensagem : "Pronto.");
    });
  }
  const confirmar = (sim: boolean) =>
    rodar(
      () => confirmarConquista(c.anuncio_id, c.perfil_id, sim),
      (m) => (sim ? setEtapa("chamaria") : setFeito(m)),
    );
  const chamaria = (sim: boolean) => rodar(() => chamariaDeNovo(c.anuncio_id, c.perfil_id, sim), setFeito);

  const texto =
    etapa === "chamaria" ? (
      <>
        Vocês chamariam <span className="font-semibold">{c.nome}</span> de novo?
      </>
    ) : etapa === "comecou" ? (
      <>
        <span className="font-semibold">{c.nome}</span> começou a trabalhar, pela vaga “{c.titulo}”?
      </>
    ) : (
      <>
        <span className="font-semibold">{c.nome}</span> disse que começou, pela vaga “{c.titulo}”.
      </>
    );

  return (
    <li className="flex flex-wrap items-center gap-3">
      <Avatar nome={c.nome} foto={c.foto} tamanho={36} />
      <p className="min-w-0 flex-1 basis-[12rem] text-body-sm">{texto}</p>
      {feito ? (
        <span role="status" className="basis-full pl-12 text-body-sm text-cerrado-text sm:basis-auto sm:pl-0">
          {feito}
        </span>
      ) : (
        <span className="flex basis-full gap-2 pl-12 sm:basis-auto sm:pl-0">
          <button
            type="button"
            disabled={enviando}
            onClick={() => (etapa === "chamaria" ? chamaria(true) : confirmar(true))}
            className={SIM}
          >
            {etapa === "chamaria" ? "Chamaria" : etapa === "comecou" ? "Começou" : "Confirmar"}
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => (etapa === "chamaria" ? chamaria(false) : confirmar(false))}
            className={NAO}
          >
            {etapa === "chamaria" ? "Não chamaria" : etapa === "comecou" ? "Não começou" : "Não é verdade"}
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
