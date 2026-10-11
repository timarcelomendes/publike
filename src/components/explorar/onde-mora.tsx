"use client";

import {
  Briefcase,
  ChevronDown,
  HandHelping,
  House,
  LocateFixed,
  UserPlus,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useId, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { buscarCep } from "@/lib/acoes/cep";
import { salvarIntencao } from "@/lib/acoes/intencao";
import { esquecerLocal, salvarLocal } from "@/lib/acoes/local";
import { INTENCOES, type Intencao } from "@/lib/intencao";
import { formatarCep, limparCep } from "@/lib/cep";
import { BAIRROS } from "@/lib/bairros";
import { CIDADES, type Cidade } from "@/lib/constantes";
import type { Local } from "@/lib/regioes";
import { classesBotao } from "../ui/botao";
import { classesEntrada, MensagemErro, Seletor } from "../ui/campo";

/** Botão "Onde você mora?" da busca. Fica no topo, ao lado do "Perto de mim". */
/** Botão de lugar (onde mora, perto de mim): contorno; escolhido, ganha borda escura e fundo leve. */
export const botaoLugar = (ativo: boolean) =>
  `inline-flex min-h-10 min-w-0 shrink items-center gap-1.5 rounded-md border px-3 text-label transition-colors ${
    ativo ? "border-ink bg-surface-300 text-ink" : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
  }`;

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
 * primeiro o que é do bairro, depois da região (em Goiânia) e da cidade.
 * O CEP fica na conta (ou neste navegador) e ninguém mais vê.
 */
export function PainelOndeMora({
  id,
  local,
  fechar,
  aoSalvar,
  intencao = null,
  aoEscolherIntencao,
}: {
  id: string;
  local: Local | null;
  fechar: () => void;
  /** depois de salvar (a busca passa a contar de casa) */
  aoSalvar?: () => void;
  /** o que a pessoa quer fazer no Publike (fica junto de onde mora) */
  intencao?: Intencao | null;
  aoEscolherIntencao?: (i: Intencao) => void;
}) {
  const [cep, setCep] = useState(formatarCep(local?.cep));
  const [cepConferido, setCepConferido] = useState<string | null>(local?.cep ?? null);
  const [cidade, setCidade] = useState<string>(local?.cidade ?? "Goiânia");
  const [bairro, setBairro] = useState(local?.bairro ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const campo = useId();

  function conferirCep(valor: string) {
    const c = limparCep(valor);
    if (c.length !== 8 || c === cepConferido) return;
    setErro(null);
    iniciar(async () => {
      const r = await buscarCep(c);
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
      const r = await salvarLocal(cidade, bairro, limparCep(cep) || null);
      if (!r.ok) return setErro(r.erro);
      fechar();
      aoSalvar?.();
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
        <PerguntaIntencao intencao={intencao} aoEscolher={aoEscolherIntencao} />
      </div>

      <div className="border-t border-line pt-4">
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
 * A pergunta de quem chega sem dizer onde mora: um campo de CEP e um botão. Um passo só,
 * no lugar dos botões "Onde você mora?" e "Perto de mim" e do pedido de localização do
 * navegador. A localização e o bairro (para quem não sabe o CEP) ficam como links.
 */
export function PerguntaOndeMora({
  usarLocalizacao,
  escolherBairro,
  aoSalvar,
  intencao = null,
  aoEscolherIntencao,
}: {
  usarLocalizacao: () => void;
  escolherBairro: () => void;
  aoSalvar?: () => void;
  intencao?: Intencao | null;
  aoEscolherIntencao?: (i: Intencao) => void;
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
      // a cidade e o bairro saem do próprio CEP
      const r = await salvarLocal("Goiânia", "", limparCep(cep));
      if (!r.ok) return setErro(r.erro);
      aoSalvar?.();
    });
  }

  const link = "text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink disabled:opacity-60";

  return (
    <form
      onSubmit={salvar}
      aria-labelledby={`${campo}-titulo`}
      className="flex flex-col gap-3 rounded-lg border border-line-strong bg-surface-200 p-4 shadow-card sm:p-5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6 lg:gap-y-4"
    >
      <div className="lg:basis-full">
        <PerguntaIntencao intencao={intencao} aoEscolher={aoEscolherIntencao} />
      </div>
      <div className="flex items-start gap-3 lg:flex-1">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-terra-soft text-terra-text"
        >
          <House className="size-5" />
        </span>
        <div>
          <h2 id={`${campo}-titulo`} className="text-label">
            Onde você mora?
          </h2>
          <p className="mt-0.5 text-body-sm text-ink-muted">
            Com o CEP de casa, mostramos primeiro o que é perto e quanto tempo leva de ônibus. Ninguém vê o seu CEP.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:w-[26rem]">
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
          <button
            type="button"
            onClick={usarLocalizacao}
            disabled={pendente}
            className={`${link} inline-flex items-center gap-1`}
          >
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

const ICONES_INTENCAO: Record<Intencao, LucideIcon> = {
  trabalho: Briefcase,
  contratar_servico: Wrench,
  oferecer_servico: HandHelping,
  contratar_pessoa: UserPlus,
};

/** O próximo passo para quem oferece serviço ou quer contratar alguém. */
const CONVITE: Partial<Record<Intencao, { texto: string; botao: string; href: string }>> = {
  oferecer_servico: {
    texto: "Monte sua vitrine: o que você faz, fotos e preço. Quem mora perto acha você.",
    botao: "Mostrar meus serviços",
    href: "/painel/servicos",
  },
  contratar_pessoa: {
    texto: "Publique a vaga de graça: quem mora perto vê primeiro e você escolhe quem curtir de volta.",
    botao: "Publicar vaga grátis",
    href: "/publicar",
  },
};

/**
 * "O que você quer fazer no Publike?": quatro respostas que guiam a home.
 * Procuro trabalho abre a busca em Vagas; Quero contratar um serviço, em Serviços;
 * as outras duas mostram o próximo passo. Fica guardado neste navegador.
 */
export function PerguntaIntencao({
  intencao,
  aoEscolher,
}: {
  intencao: Intencao | null;
  /** depois de guardar (para a busca ir para a aba certa) */
  aoEscolher?: (i: Intencao) => void;
}) {
  const [escolhida, setEscolhida] = useState<Intencao | null>(intencao);
  // com uma resposta, mostra só ela e o "Mudar"; as quatro opções voltam ao tocar nele
  const [mudando, setMudando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const titulo = useId();
  const convite = escolhida && !mudando ? CONVITE[escolhida] : undefined;
  const atual = INTENCOES.find((op) => op.valor === escolhida);

  function escolher(i: Intencao) {
    setEscolhida(i);
    setMudando(false);
    iniciar(async () => {
      const r = await salvarIntencao(i);
      if (r.ok) aoEscolher?.(i);
    });
  }

  if (atual && !mudando) {
    const Icone = ICONES_INTENCAO[atual.valor];
    return (
      <div className="flex flex-col gap-2">
        <p id={titulo} className="text-label">
          O que você quer fazer no Publike?
        </p>
        <div
          role="group"
          aria-labelledby={titulo}
          className="flex min-h-14 items-center gap-3 rounded-md border border-ink bg-surface-300 py-2 pl-3 pr-2"
        >
          <Icone aria-hidden className="size-5 shrink-0 text-terra-text" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-label">{atual.nome}</span>
            <span className="text-body-sm text-ink-muted">{atual.ajuda}</span>
          </span>
          <button
            type="button"
            disabled={pendente}
            onClick={() => setMudando(true)}
            aria-label={`Mudar: ${atual.nome}`}
            className={`${classesBotao("secundario", "sm")} shrink-0`}
          >
            Mudar
          </button>
        </div>
        {convite && (
          <div className="flex flex-col gap-2 rounded-md bg-surface-300 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-body-sm">{convite.texto}</p>
            <Link href={convite.href} className={`${classesBotao("secundario", "sm")} shrink-0`}>
              {convite.botao}
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p id={titulo} className="text-label">
        O que você quer fazer no Publike?
      </p>
      <div role="radiogroup" aria-labelledby={titulo} className="grid gap-2 sm:grid-cols-2">
        {INTENCOES.map((op) => {
          const Icone = ICONES_INTENCAO[op.valor];
          const ativa = escolhida === op.valor;
          return (
            <button
              key={op.valor}
              type="button"
              role="radio"
              aria-checked={ativa}
              disabled={pendente}
              onClick={() => escolher(op.valor)}
              className={`flex min-h-14 items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-70 ${
                ativa ? "border-ink bg-surface-300" : "border-line-strong bg-surface-200 hover:bg-surface-300"
              }`}
            >
              <Icone aria-hidden className={`size-5 shrink-0 ${ativa ? "text-terra-text" : "text-ink-muted"}`} />
              <span className="flex flex-col">
                <span className="text-label">{op.nome}</span>
                <span className="text-body-sm text-ink-muted">{op.ajuda}</span>
              </span>
            </button>
          );
        })}
      </div>
      {mudando && atual && (
        <button
          type="button"
          onClick={() => setMudando(false)}
          className="self-start text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Manter “{atual.nome}”
        </button>
      )}
      {convite && (
        <div className="flex flex-col gap-2 rounded-md bg-surface-300 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-sm">{convite.texto}</p>
          <Link href={convite.href} className={`${classesBotao("secundario", "sm")} shrink-0`}>
            {convite.botao}
          </Link>
        </div>
      )}
    </div>
  );
}
