"use client";

import { House, X } from "lucide-react";
import { useId, useState, useTransition, type FormEvent } from "react";
import { esquecerLocal, salvarLocal } from "@/lib/acoes/local";
import { BAIRROS } from "@/lib/bairros";
import { CIDADES, type Cidade } from "@/lib/constantes";
import type { Local } from "@/lib/regioes";
import { classesBotao } from "../ui/botao";
import { classesEntrada, MensagemErro, Seletor } from "../ui/campo";

/** Botão "Onde você mora?" da busca. Fica no topo, ao lado do "Perto de mim". */
export function BotaoOndeMora({
  local,
  aberto,
  onClick,
  controla,
}: {
  local: Local | null;
  aberto: boolean;
  onClick: () => void;
  controla: string;
}) {
  const nome = local ? local.bairro || local.cidade : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={aberto}
      aria-controls={controla}
      title={local ? `${[local.bairro, local.cidade].filter(Boolean).join(", ")}: mudar onde você mora` : undefined}
      className={`inline-flex min-h-10 max-w-40 min-w-0 shrink items-center gap-1.5 rounded-pill border px-3 text-label transition-colors sm:max-w-60 sm:px-3.5 ${
        local ? "border-ink bg-ink text-surface-100" : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
      }`}
    >
      <House aria-hidden className="size-4 shrink-0" />
      <span className="truncate">
        {nome ? (
          <>
            <span className="sr-only">Você mora em </span>
            {nome}
          </>
        ) : (
          <>
            <span className="sm:hidden">Seu bairro</span>
            <span className="hidden sm:inline">Onde você mora?</span>
          </>
        )}
      </span>
    </button>
  );
}

/**
 * Painel para escolher cidade e bairro. Com isso, a lista mostra primeiro o que é
 * do bairro, depois da região (em Goiânia) e da cidade. Fica guardado neste navegador.
 */
export function PainelOndeMora({ id, local, fechar }: { id: string; local: Local | null; fechar: () => void }) {
  const [cidade, setCidade] = useState<string>(local?.cidade ?? "Goiânia");
  const [bairro, setBairro] = useState(local?.bairro ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const campo = useId();

  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await salvarLocal(cidade, bairro);
      if (r.ok) fechar();
      else setErro(r.erro);
    });
  }

  function esquecer() {
    setErro(null);
    iniciar(async () => {
      await esquecerLocal();
      fechar();
    });
  }

  return (
    <form
      id={id}
      onSubmit={salvar}
      aria-labelledby={`${campo}-titulo`}
      className="relative flex flex-col gap-4 rounded-lg border border-line-strong bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <button
        type="button"
        onClick={fechar}
        className="absolute top-2 right-2 flex size-10 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300"
      >
        <X aria-hidden className="size-4" />
        <span className="sr-only">Fechar</span>
      </button>
      <div className="pr-10">
        <h2 id={`${campo}-titulo`} className="text-label">
          Onde você mora?
        </h2>
        <p className="mt-0.5 text-body-sm text-ink-muted">
          Mostramos primeiro o que é do seu bairro, depois da sua região e da sua cidade.
          {local?.fonte === "perfil" && " Agora estamos usando o bairro do seu perfil."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${campo}-cidade`} className="text-label">
            Cidade
          </label>
          <Seletor
            id={`${campo}-cidade`}
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            className={classesEntrada}
          >
            {CIDADES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Seletor>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${campo}-bairro`} className="text-label">
            Bairro <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <input
            id={`${campo}-bairro`}
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
            list={`${campo}-bairros`}
            maxLength={60}
            autoComplete="off"
            placeholder="Comece a digitar"
            className={classesEntrada}
          />
          <datalist id={`${campo}-bairros`}>
            {(BAIRROS[cidade as Cidade] ?? []).map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
        <button type="submit" disabled={pendente} className={classesBotao("primario", "md")}>
          {pendente ? "Salvando…" : "Salvar"}
        </button>
      </div>

      {erro && <MensagemErro>{erro}</MensagemErro>}

      {local?.fonte === "busca" && (
        <button
          type="button"
          onClick={esquecer}
          disabled={pendente}
          className="self-start text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Esquecer onde moro
        </button>
      )}
    </form>
  );
}
