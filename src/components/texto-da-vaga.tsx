"use client";

import { ClipboardPaste, LoaderCircle } from "lucide-react";
import { useId, useState } from "react";
import { lerTextoDaVaga } from "@/lib/acoes/texto-vaga";
import type { RascunhoConvite } from "@/lib/convites";
import { detalheDoErro, relatarFalha } from "@/lib/falhas";
import { classesEntrada, MensagemErro } from "./ui/campo";

/**
 * "Colar o texto da vaga": o anúncio colado (do WhatsApp, de um e-mail, de outro site) vira a vaga preenchida.
 * Quem chama põe o que foi lido no formulário; a pessoa confere e publica.
 */
export function TextoDaVaga({ aoLer }: { aoLer: (vaga: RascunhoConvite, total: number) => void }) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function ler() {
    setErro(null);
    setLendo(true);
    try {
      const r = await lerTextoDaVaga(texto);
      if (!r.ok) return setErro(r.erro);
      aoLer(r.vaga, r.total);
    } catch (falha) {
      const mensagem = "Não deu para ler o texto agora. Tente de novo.";
      setErro(mensagem);
      relatarFalha({ onde: "vaga", etapa: "conexao", mensagem, detalhe: `texto da vaga · ${detalheDoErro(falha)}` });
    } finally {
      setLendo(false);
    }
  }

  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <div>
        <h2 id={`${id}-titulo`} className="text-h3">
          Cole o texto da vaga
        </h2>
        <p className="text-body-sm text-ink-muted">
          Pode ser a mensagem do WhatsApp, um e-mail ou o anúncio de outro site. O Publike lê e preenche a vaga; você só
          confere antes de publicar.
        </p>
      </div>
      <label htmlFor={`${id}-texto`} className="sr-only">
        Texto da vaga
      </label>
      <textarea
        id={`${id}-texto`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={5}
        maxLength={6000}
        placeholder="Ex.: Contrata-se atendente de loja, CLT, R$ 1.800 + VT, seg a sáb, Setor Bueno…"
        className={`${classesEntrada} min-h-32 py-2.5`}
      />
      {erro && <MensagemErro>{erro}</MensagemErro>}
      <button
        type="button"
        onClick={ler}
        disabled={lendo || texto.trim().length < 20}
        className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-md border border-line-strong bg-surface-200 px-4 text-label hover:bg-surface-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {lendo ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
        ) : (
          <ClipboardPaste aria-hidden className="size-4" />
        )}
        {lendo ? "Lendo o texto…" : "Preencher a vaga"}
      </button>
    </section>
  );
}
