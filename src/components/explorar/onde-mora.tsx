"use client";

import { ChevronDown, House, LocateFixed } from "lucide-react";
import dynamic from "next/dynamic";
import { useId, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { CHAVE_PERGUNTA_ADIADA } from "@/lib/aviso-cookies";
import { salvarLocal } from "@/lib/acoes/local";
import { formatarCep, limparCep } from "@/lib/cep";
import type { Local } from "@/lib/regioes";
import { classesBotao } from "../ui/botao";
import { classesEntrada, MensagemErro } from "../ui/campo";
import { PRACA_PADRAO } from "@/lib/pracas";

/** Botão de lugar (onde mora, perto de mim, só os meus): contorno; escolhido, ganha borda escura e fundo leve. */
export const botaoLugar = (ativo: boolean) =>
  `inline-flex min-h-10 min-w-0 shrink items-center gap-1.5 rounded-md border px-3 text-label transition-colors ${
    ativo ? "border-ink bg-surface-300 text-ink" : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
  }`;

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
      className={`${botaoLugar(Boolean(local))} max-w-52 sm:max-w-64`}
    >
      <House aria-hidden className={`size-4 shrink-0 ${local ? "text-terra-text" : ""}`} />
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
      <ChevronDown
        aria-hidden
        className={`-mr-0.5 size-4 shrink-0 text-ink-muted transition-transform ${aberto ? "rotate-180" : ""}`}
      />
    </button>
  );
}

/**
 * O painel "Onde você mora?" sob demanda (painel-onde-mora.tsx): o código e a lista dos bairros só baixam quando ele
 * abre (ou quando o servidor já o desenha aberto, com ?casa=1).
 */
export const PainelOndeMora = dynamic(() => import("./painel-onde-mora").then((m) => m.PainelOndeMora));

// a mesma chave que o script do <head> lê para esconder a pergunta que vem no HTML (lib/aviso-cookies.ts)
const ADIADO = CHAVE_PERGUNTA_ADIADA;
const EVENTO_ADIADO = "publike-onde-mora-depois";

/** A pessoa tocou em "Agora não" nesta visita: a pergunta some até ela fechar o navegador. */
export function usePerguntaAdiada(): [boolean, () => void] {
  const adiada = useSyncExternalStore(
    (avisar) => {
      window.addEventListener(EVENTO_ADIADO, avisar);
      return () => window.removeEventListener(EVENTO_ADIADO, avisar);
    },
    () => {
      try {
        return window.sessionStorage.getItem(ADIADO) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const adiar = () => {
    try {
      window.sessionStorage.setItem(ADIADO, "1");
    } catch {
      // sem armazenamento: some só até recarregar
    }
    window.dispatchEvent(new Event(EVENTO_ADIADO));
  };
  return [adiada, adiar];
}

/**
 * A pergunta de quem chega sem dizer onde mora: um campo de CEP e um botão, num quadro em
 * cima da lista de anúncios (PerguntasNaLista), no lugar do pedido de localização do navegador.
 * A localização e o bairro (para quem não sabe o CEP) ficam como links, com "Agora não".
 */
export function PerguntaOndeMora({
  usarLocalizacao,
  escolherBairro,
  aoSalvar,
}: {
  usarLocalizacao: () => void;
  escolherBairro: () => void;
  aoSalvar?: () => void;
}) {
  const [cep, setCep] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [, adiar] = usePerguntaAdiada();
  const campo = useId();

  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (limparCep(cep).length !== 8) return setErro("Digite os 8 números do CEP da sua casa.");
    setErro(null);
    iniciar(async () => {
      // a cidade e o bairro saem do próprio CEP (a cidade daqui é só para passar na conferência)
      const r = await chamarAcao(() => salvarLocal(PRACA_PADRAO.cidade, "", limparCep(cep)));
      if (!r.ok) return setErro(r.erro);
      aoSalvar?.();
    });
  }

  const link =
    "inline-flex min-h-9 items-center text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink disabled:opacity-60";

  return (
    <form
      onSubmit={salvar}
      aria-labelledby={`${campo}-titulo`}
      // na vitrine, enquanto esta pergunta está na tela, os botões de lugar da busca do topo somem (um "Onde você mora?" só)
      data-pergunta-onde-mora=""
      className="flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-200 p-3 shadow-card sm:p-4 lg:flex-row lg:items-start lg:gap-6"
    >
      <div className="min-w-0 lg:flex-1">
        <h2 id={`${campo}-titulo`} className="flex items-center gap-2 text-label sm:text-h3">
          <House aria-hidden className="size-4 shrink-0 text-terra-text sm:size-5" />
          Onde você mora?
        </h2>
        <p className="text-body-sm text-pretty text-ink-muted sm:mt-0.5">
          Com o CEP de casa, a busca mostra primeiro o que é perto e o tempo de ônibus. Ninguém vê o seu CEP.
        </p>
      </div>

      <div className="flex flex-col gap-1.5 pt-1 lg:w-[26rem] lg:pt-0">
        <div className="flex gap-2">
          <label htmlFor={`${campo}-cep`} className="sr-only">
            CEP da sua casa
          </label>
          <input
            id={`${campo}-cep`}
            value={cep}
            onChange={(e) => {
              setCep(formatarCep(e.target.value));
              if (erro) setErro(null);
            }}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="CEP: 74000-000"
            maxLength={9}
            aria-invalid={Boolean(erro)}
            aria-describedby={erro ? `${campo}-erro` : undefined}
            className={`${classesEntrada} min-w-0 flex-1`}
          />
          <button type="submit" disabled={pendente} className={`${classesBotao("primario", "md")} shrink-0`}>
            {pendente ? "Procurando…" : "Ver o que é perto"}
          </button>
        </div>
        {erro && (
          <div id={`${campo}-erro`}>
            <MensagemErro>{erro}</MensagemErro>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" onClick={usarLocalizacao} disabled={pendente} className={`${link} gap-1`}>
            <LocateFixed aria-hidden className="size-3.5" />
            Usar minha localização
          </button>
          <button type="button" onClick={escolherBairro} disabled={pendente} className={link}>
            Não sei o CEP
          </button>
          <button type="button" onClick={adiar} disabled={pendente} className={link}>
            Agora não
          </button>
        </div>
      </div>
    </form>
  );
}
