"use client";

import { Search, StarOff } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { salvarProcuro, salvarVaga } from "@/lib/acoes/descobrir";
import type { Local } from "@/lib/regioes";
import { BotaoOndeMora, PainelOndeMora } from "../explorar/onde-mora";
import { Botao } from "../ui/botao";
import { classesEntrada, MensagemErro } from "../ui/campo";

const IDEIAS = ["Cozinha, de manhã", "Vendas perto de casa", "Primeiro emprego", "Freelance no fim de semana"];

/** "O que você procura?": a ordem do "Para você" leva isso em conta. */
export function EditorProcuro({ inicial }: { inicial: string | null }) {
  const [texto, setTexto] = useState(inicial ?? "");
  const [aberto, setAberto] = useState(!inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  const id = useId();

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex w-full items-center gap-3 rounded-md border border-line bg-surface-200 px-4 py-3 text-left hover:bg-surface-300"
      >
        <Search aria-hidden className="size-5 shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1">
          <span className="block text-body-sm text-ink-muted">Você procura</span>
          <span className="block truncate text-label text-ink">{texto}</span>
        </span>
        <span className="text-label text-terra-text">Mudar</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await salvarProcuro(texto);
          if (r.ok) {
            setErro(null);
            setAberto(!texto.trim());
          } else setErro(r.erro);
        });
      }}
      className="flex flex-col gap-2 rounded-md border border-line bg-surface-200 p-4"
    >
      <label htmlFor={id} className="text-label">
        O que você procura?
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={300}
          placeholder="Ex.: cozinha, de manhã, perto do Setor Sul"
          className={classesEntrada}
        />
        <Botao type="submit" disabled={salvando}>
          {salvando ? "…" : "Pronto"}
        </Botao>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {IDEIAS.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setTexto(i)}
            className="min-h-9 rounded-pill border border-line bg-surface-300 px-3 text-body-sm text-ink hover:border-line-strong"
          >
            {i}
          </button>
        ))}
      </div>
      <p className="text-body-sm text-ink-muted">Só você vê. Serve para pôr primeiro as vagas que combinam.</p>
      {erro && <MensagemErro>{erro}</MensagemErro>}
    </form>
  );
}

/** "Onde você mora?" dentro do Descobrir. */
export function EscolherBairro({ local }: { local: Local | null }) {
  const [aberto, setAberto] = useState(false);
  const painel = useId();
  return (
    <div className="flex flex-col gap-3">
      <div>
        <BotaoOndeMora local={local} aberto={aberto} onClick={() => setAberto((a) => !a)} controla={painel} />
      </div>
      {aberto && <PainelOndeMora id={painel} local={local} fechar={() => setAberto(false)} />}
    </div>
  );
}

/** Tirar uma vaga das salvas. */
export function TirarSalva({ anuncioId }: { anuncioId: string }) {
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() => iniciar(async () => void (await salvarVaga(anuncioId, false)))}
      className="inline-flex min-h-10 items-center gap-1.5 self-start text-label text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-60"
    >
      <StarOff aria-hidden className="size-4" />
      {pendente ? "Tirando…" : "Tirar das salvas"}
    </button>
  );
}
