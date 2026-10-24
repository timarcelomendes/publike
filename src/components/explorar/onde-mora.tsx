"use client";

import { ChevronDown, House, LocateFixed, X } from "lucide-react";
import { useId, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { buscarCep } from "@/lib/acoes/cep";
import { esquecerLocal, salvarLocal } from "@/lib/acoes/local";
import { formatarCep, limparCep } from "@/lib/cep";
import { BAIRROS } from "@/lib/bairros";
import { CIDADES, type Cidade } from "@/lib/constantes";
import type { Local } from "@/lib/regioes";
import { classesBotao } from "../ui/botao";
import { classesEntrada, MensagemErro, Seletor } from "../ui/campo";
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
 * Painel "Onde você mora?". O jeito mais preciso é o CEP de casa: as distâncias
 * e o tempo de ônibus saem da rua da pessoa. Sem CEP, cidade e bairro já põem
 * primeiro o que é do bairro, depois da região (nas cidades com regiões) e da cidade.
 * O CEP fica na conta (ou neste navegador) e ninguém mais vê.
 */
export function PainelOndeMora({
  id,
  local,
  cidadePadrao,
  fechar,
  aoSalvar,
}: {
  id: string;
  local: Local | null;
  /** sem lugar escolhido: a cidade de quem vê (pelo endereço de internet, ou a principal) */
  cidadePadrao?: string;
  fechar: () => void;
  /** depois de salvar (a busca passa a contar de casa) */
  aoSalvar?: () => void;
}) {
  const [cep, setCep] = useState(formatarCep(local?.cep));
  const [cepConferido, setCepConferido] = useState<string | null>(local?.cep ?? null);
  const [cidade, setCidade] = useState<string>(local?.cidade ?? cidadePadrao ?? PRACA_PADRAO.cidade);
  const [bairro, setBairro] = useState(local?.bairro ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const campo = useId();

  function conferirCep(valor: string) {
    const c = limparCep(valor);
    if (c.length !== 8 || c === cepConferido) return;
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() => buscarCep(c));
      if (!r.ok) {
        setErro(r.erro);
        setCepConferido(null);
        return;
      }
      setCepConferido(c);
      if ((CIDADES as readonly string[]).includes(r.endereco.cidade)) setCidade(r.endereco.cidade);
      if (r.endereco.bairro) setBairro(r.endereco.bairro);
    });
  }

  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() => salvarLocal(cidade, bairro, limparCep(cep) || null));
      if (!r.ok) return setErro(r.erro);
      fechar();
      aoSalvar?.();
    });
  }

  function esquecer() {
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() => esquecerLocal());
      if (!r.ok) return setErro(r.erro);
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
          Com o CEP de casa, mostramos a distância e o tempo de ônibus até cada vaga. Ninguém vê o seu CEP.
          {local?.fonte === "perfil" && " Agora estamos usando o bairro do seu perfil."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,9rem)_minmax(0,2fr)_minmax(0,3fr)_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${campo}-cep`} className="text-label">
            CEP de casa <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <input
            id={`${campo}-cep`}
            value={cep}
            onChange={(e) => {
              const novo = formatarCep(e.target.value);
              setCep(novo);
              // confere assim que completa os 8 números
              conferirCep(novo);
            }}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="74000-000"
            maxLength={9}
            className={classesEntrada}
          />
        </div>
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

      {(local?.fonte === "busca" || local?.fonte === "casa") && (
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

const ADIADO = "publike_onde_mora_depois";
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
