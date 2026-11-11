"use client";

import { Pencil, Plus, Trash2, Workflow } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { apagarRegra, ligarRegra } from "@/lib/acoes/regras";
import { fraseDaRegra, MODELOS, type Regra } from "@/lib/regras";
import { BotaoLink } from "../ui/botao";
import { JanelaPedirPlano } from "../ui/pedir-plano";
import { useAcao } from "../ui/usar-acao";

// "Suas regras" (Automações personalizadas): cada regra numa frase, com o liga-desliga, quantas vezes agiu, mudar e
// apagar; embaixo, os modelos para começar. Na aba Automações da vaga e na página das automações.

const ONDE: Record<Regra["vale_em"], string> = {
  vaga: "Nesta vaga",
  todas: "Em todas as vagas",
  cliente: "Nas vagas do cliente",
};

function CartaoDaRegra({
  regra,
  agiu,
  liberado,
  editar,
  nomes,
  vagaDaRegra,
}: {
  regra: Regra;
  agiu: number;
  liberado: boolean;
  editar: string;
  nomes: { testes: Map<string, string>; equipe: Map<string, string> };
  vagaDaRegra?: string | null;
}) {
  const id = useId();
  const { rodar, pendente, mensagem } = useAcao();
  const [apagando, setApagando] = useState(false);
  const [ligada, setLigada] = useState(regra.ligada);
  const pausada = ligada && !liberado;
  // sem as Automações personalizadas, ligar pede para assinar (11/11/2026)
  const [pedirPlano, setPedirPlano] = useState(false);
  return (
    <li className="flex flex-col gap-2 px-4 py-4 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <h4 id={`${id}-nome`} className="min-w-0 pt-2 text-label">
          {regra.nome}
        </h4>
        <button
          type="button"
          role="switch"
          aria-checked={ligada}
          aria-labelledby={`${id}-nome`}
          disabled={pendente}
          onClick={() => {
            if (!liberado && !ligada) {
              setPedirPlano(true);
              return;
            }
            const v = !ligada;
            setLigada(v);
            rodar(
              () => ligarRegra(regra.id, v),
              (r) => !r.ok && setLigada(!v),
            );
          }}
          className="group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-pill px-1 text-caption text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span className={`hidden w-16 text-right sm:inline ${ligada && !pausada ? "text-terra-text" : ""}`}>
            {pausada ? "Pausada" : ligada ? "Ligada" : "Desligada"}
          </span>
          <span
            aria-hidden
            className={`relative inline-flex h-7 w-12 items-center rounded-pill transition-colors motion-reduce:transition-none ${
              ligada && !pausada ? "bg-terra" : "bg-surface-300 ring-1 ring-line-strong ring-inset"
            }`}
          >
            <span
              className={`inline-block size-5 rounded-pill bg-surface-100 shadow-card transition-transform motion-reduce:transition-none ${
                ligada ? "translate-x-6" : "translate-x-1 ring-1 ring-line-strong"
              }`}
            />
          </span>
        </button>
      </div>
      <p className="text-body-sm">{fraseDaRegra(regra, nomes)}</p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-muted">
        <span>{regra.vale_em === "vaga" && vagaDaRegra ? `Em “${vagaDaRegra}”` : ONDE[regra.vale_em]}</span>
        <span>{agiu ? `Agiu ${agiu === 1 ? "1 vez" : `${agiu} vezes`}` : "Ainda não agiu"}</span>
        {pausada && <span>Pausada: as Automações personalizadas acabaram (a regra fica guardada)</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={editar}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong px-3 text-label hover:bg-surface-300"
        >
          <Pencil aria-hidden className="size-4" />
          Mudar
        </Link>
        {apagando ? (
          <span className="flex flex-wrap items-center gap-2 text-body-sm">
            Apagar a regra? O que ela já fez continua.
            <button
              type="button"
              disabled={pendente}
              onClick={() => rodar(() => apagarRegra(regra.id))}
              className="inline-flex min-h-10 items-center rounded-md border border-danger px-3 text-label text-danger hover:bg-surface-300"
            >
              Apagar
            </button>
            <button
              type="button"
              onClick={() => setApagando(false)}
              className="inline-flex min-h-10 items-center px-2 text-label text-ink-muted hover:text-ink"
            >
              Voltar
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setApagando(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-label text-ink-muted hover:bg-surface-300 hover:text-ink"
          >
            <Trash2 aria-hidden className="size-4" />
            Apagar
          </button>
        )}
      </div>
      {mensagem}
      <JanelaPedirPlano
        aberta={pedirPlano}
        fechar={() => setPedirPlano(false)}
        titulo="Para ligar, assine as Automações personalizadas"
        texto="Com elas, as suas regras agem sozinhas em cada candidato. As 5 automações prontas continuam grátis."
        href="/painel/assinar?recurso=automacoes"
        acao="Assinar as automações"
      />
    </li>
  );
}

export function SuasRegras({
  regras,
  liberado,
  vaga,
  vagas,
  testes,
  equipe,
}: {
  regras: (Regra & { agiu: number })[];
  liberado: boolean;
  /** na aba da vaga: a vaga (para criar já nela e voltar para ela) */
  vaga?: string | null;
  /** o nome de cada vaga, para a regra de uma vaga só */
  vagas?: Record<string, string>;
  testes?: Record<string, string>;
  equipe?: Record<string, string>;
}) {
  const id = useId();
  const sufixo = vaga ? `vaga=${vaga}` : "";
  const nomes = {
    testes: new Map(Object.entries(testes ?? {})),
    equipe: new Map(Object.entries(equipe ?? {})),
  };
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 id={id} className="flex items-center gap-2 text-h3">
            <Workflow aria-hidden className="size-5 text-ink-muted" />
            Suas regras
          </h3>
          <p className="text-body-sm text-ink-muted">
            Quando algo acontece, se a pessoa atende o que você escolher, o Publike faz o que você mandar.
          </p>
        </div>
        <BotaoLink href={`/painel/automacoes/regra${sufixo ? `?${sufixo}` : ""}`} tamanho="sm">
          <Plus aria-hidden />
          Criar regra
        </BotaoLink>
      </div>
      {regras.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
          {regras.map((r) => (
            <CartaoDaRegra
              key={r.id}
              regra={r}
              agiu={r.agiu}
              liberado={liberado}
              nomes={nomes}
              vagaDaRegra={r.anuncio_id ? (vagas?.[r.anuncio_id] ?? null) : null}
              editar={`/painel/automacoes/regra?id=${r.id}${sufixo ? `&${sufixo}` : ""}`}
            />
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-label text-ink-muted">{regras.length ? "Mais ideias" : "Comece por um modelo"}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {MODELOS.map((m) => (
            <li key={m.slug}>
              <Link
                href={`/painel/automacoes/regra?modelo=${m.slug}${sufixo ? `&${sufixo}` : ""}`}
                className="flex h-full flex-col gap-0.5 rounded-md border border-line bg-surface-100 px-3 py-2.5 hover:border-line-strong hover:bg-surface-200"
              >
                <span className="text-label">{m.nome}</span>
                <span className="text-body-sm text-ink-muted">{m.descricao}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
