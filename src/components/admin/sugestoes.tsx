"use client";

import {
  Bug,
  ExternalLink,
  GripVertical,
  Heart,
  Lightbulb,
  Mail,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type DragEvent } from "react";
import { anotarSugestao, apagarSugestao, moverSugestao } from "@/lib/acoes/admin";
import { tempoRelativo } from "@/lib/formato";
import { COLUNAS_SUGESTAO, TIPOS_SUGESTAO, nomeDoTipo, type StatusSugestao, type TipoSugestao } from "@/lib/sugestoes";
import { Selo, type VarianteSelo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { Seletor, classesEntrada } from "../ui/campo";

export type ItemSugestao = {
  id: number;
  tipo: string;
  texto: string;
  pagina: string | null;
  email: string | null;
  autor_id: string | null;
  autor_nome: string | null;
  autor_email: string | null;
  status: string;
  posicao: number;
  nota: string | null;
  criado_em: string;
};

const ICONES: Record<TipoSugestao, LucideIcon> = { erro: Bug, sugestao: Lightbulb, melhoria: Sparkles, elogio: Heart };
const SELO_DO_TIPO: Record<TipoSugestao, VarianteSelo> = {
  erro: "perigo",
  sugestao: "novo",
  melhoria: "aviso",
  elogio: "match",
};

/** Posição para entrar entre `antes` e `depois` (menor em cima). */
function posicaoEntre(antes: number | undefined, depois: number | undefined) {
  if (antes === undefined && depois === undefined) return 0;
  if (antes === undefined) return depois! - 1;
  if (depois === undefined) return antes + 1;
  return (antes + depois) / 2;
}

const ordenar = (a: ItemSugestao, b: ItemSugestao) => a.posicao - b.posicao || a.id - b.id;

/**
 * Quadro das sugestões: arraste os cartões entre as colunas (ou use "Mover para",
 * no celular e no teclado). A ordem dentro da coluna também fica guardada.
 */
export function QuadroSugestoes({ itens: iniciais, agora }: { itens: ItemSugestao[]; agora: number }) {
  const [itens, setItens] = useState(iniciais);
  const [filtro, setFiltro] = useState<TipoSugestao | null>(null);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<{ coluna: StatusSugestao; indice: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const visiveis = itens.filter((i) => !filtro || i.tipo === filtro);

  function mover(id: number, coluna: StatusSugestao, indice: number) {
    const item = itens.find((i) => i.id === id);
    if (!item) return;
    const destino = itens.filter((i) => i.status === coluna && i.id !== id).sort(ordenar);
    const posicao = posicaoEntre(destino[indice - 1]?.posicao, destino[indice]?.posicao);
    if (item.status === coluna && item.posicao === posicao) return;
    const antes = itens;
    setErro(null);
    setItens((lista) => lista.map((i) => (i.id === id ? { ...i, status: coluna, posicao } : i)));
    iniciar(async () => {
      const r = await moverSugestao(id, coluna, posicao);
      if (!r.ok) {
        setItens(antes);
        setErro(r.erro);
      }
    });
  }

  function indiceNaColuna(e: DragEvent<HTMLElement>, coluna: StatusSugestao) {
    const cartoes = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-cartao]")].filter(
      (c) => Number(c.dataset.cartao) !== arrastando,
    );
    const i = cartoes.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    // com filtro, a posição conta entre os cartões que aparecem
    const naColuna = itens.filter((x) => x.status === coluna && x.id !== arrastando).sort(ordenar);
    if (i < 0) return naColuna.length;
    const id = Number(cartoes[i].dataset.cartao);
    return naColuna.findIndex((x) => x.id === id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
        {[{ valor: null, nome: "Todos" }, ...TIPOS_SUGESTAO].map((t) => {
          const ativo = filtro === t.valor;
          const total = itens.filter((i) => !t.valor || i.tipo === t.valor).length;
          return (
            <button
              key={t.nome}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFiltro(t.valor as TipoSugestao | null)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
                ativo
                  ? "border-ink bg-ink text-surface-100"
                  : "border-line bg-surface-300 text-ink hover:border-line-strong"
              }`}
            >
              {t.nome} <span className={ativo ? "opacity-80" : "text-ink-muted"}>{total}</span>
            </button>
          );
        })}
      </div>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}

      <div className="-mx-5 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[64rem] grid-cols-5 gap-3 xl:min-w-0">
          {COLUNAS_SUGESTAO.map((coluna) => {
            const cartoes = visiveis.filter((i) => i.status === coluna.valor).sort(ordenar);
            const destacada = alvo?.coluna === coluna.valor;
            return (
              <section
                key={coluna.valor}
                aria-label={coluna.nome}
                onDragOver={(e) => {
                  if (arrastando === null) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const indice = indiceNaColuna(e, coluna.valor);
                  if (alvo?.coluna !== coluna.valor || alvo.indice !== indice)
                    setAlvo({ coluna: coluna.valor, indice });
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAlvo(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (arrastando !== null) mover(arrastando, coluna.valor, indiceNaColuna(e, coluna.valor));
                  setArrastando(null);
                  setAlvo(null);
                }}
                className={`flex min-h-64 flex-col gap-2 rounded-lg border p-2 transition-colors ${
                  destacada ? "border-ink bg-surface-300" : "border-line bg-surface-100"
                }`}
              >
                <h3 className="flex items-center justify-between px-1 pt-1 text-label">
                  {coluna.nome}
                  <span className="rounded-pill bg-surface-300 px-2 text-body-sm text-ink-muted">{cartoes.length}</span>
                </h3>
                {cartoes.length === 0 && (
                  <p className="rounded-md border border-dashed border-line px-3 py-6 text-center text-body-sm text-ink-muted">
                    Arraste para cá
                  </p>
                )}
                {cartoes.map((item) => (
                  <Cartao
                    key={item.id}
                    item={item}
                    agora={agora}
                    arrastando={arrastando === item.id}
                    aoArrastar={(id) => setArrastando(id)}
                    aoSoltar={() => {
                      setArrastando(null);
                      setAlvo(null);
                    }}
                    aoMover={(status) => mover(item.id, status, 0)}
                    aoApagar={() => setItens((lista) => lista.filter((i) => i.id !== item.id))}
                  />
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Cartao({
  item,
  agora,
  arrastando,
  aoArrastar,
  aoSoltar,
  aoMover,
  aoApagar,
}: {
  item: ItemSugestao;
  agora: number;
  arrastando: boolean;
  aoArrastar: (id: number) => void;
  aoSoltar: () => void;
  aoMover: (status: StatusSugestao) => void;
  aoApagar: () => void;
}) {
  const tipo = (TIPOS_SUGESTAO.some((t) => t.valor === item.tipo) ? item.tipo : "sugestao") as TipoSugestao;
  const Icone = ICONES[tipo];
  const [nota, setNota] = useState(item.nota ?? "");
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const [salvando, iniciar] = useTransition();
  const contato = item.autor_email ?? item.email;
  const longo = item.texto.length > 220;

  return (
    <article
      data-cartao={item.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(item.id));
        aoArrastar(item.id);
      }}
      onDragEnd={aoSoltar}
      className={`flex cursor-grab flex-col gap-2 rounded-md border border-line bg-surface-200 p-3 shadow-card active:cursor-grabbing ${
        arrastando ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <Selo variante={SELO_DO_TIPO[tipo]}>
          <Icone aria-hidden />
          {nomeDoTipo(tipo)}
        </Selo>
        <GripVertical aria-hidden className="size-4 shrink-0 text-ink-muted" />
      </div>
      {longo ? (
        <details className="group text-body-sm">
          <summary className="cursor-pointer list-none marker:hidden">
            <span className="whitespace-pre-line group-open:hidden">{item.texto.slice(0, 200)}…</span>
            <span className="text-ink-muted underline group-open:hidden"> ver tudo</span>
          </summary>
          <p className="whitespace-pre-line">{item.texto}</p>
        </details>
      ) : (
        <p className="text-body-sm whitespace-pre-line">{item.texto}</p>
      )}
      <ul className="flex flex-col gap-0.5 text-body-sm text-ink-muted">
        <li>{tempoRelativo(item.criado_em, agora)}</li>
        {item.pagina && (
          <li className="truncate">
            <a
              href={item.pagina}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              <ExternalLink aria-hidden className="size-3.5 shrink-0" />
              {item.pagina}
            </a>
          </li>
        )}
        <li className="truncate">
          {item.autor_id ? (
            <Link href={`/admin/usuarios/${item.autor_id}`} className="hover:underline">
              {item.autor_nome ?? "Conta sem perfil"}
            </Link>
          ) : (
            "Sem conta"
          )}
        </li>
        {contato && (
          <li className="min-w-0">
            <a href={`mailto:${contato}`} className="inline-flex max-w-full items-center gap-1 hover:underline">
              <Mail aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{contato}</span>
            </a>
          </li>
        )}
      </ul>

      <Seletor
        aria-label="Mover para"
        value=""
        onChange={(e) => {
          if (e.target.value) aoMover(e.target.value as StatusSugestao);
        }}
        className="min-h-9 w-full rounded-sm border border-line bg-surface-200 pl-2.5 text-body-sm"
      >
        <option value="">Mover para…</option>
        {COLUNAS_SUGESTAO.filter((c) => c.valor !== item.status).map((c) => (
          <option key={c.valor} value={c.valor}>
            {c.nome}
          </option>
        ))}
      </Seletor>

      <details className="text-body-sm" open={Boolean(item.nota)}>
        <summary className="cursor-pointer text-ink-muted">Anotação da equipe</summary>
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            aria-label="Anotação da equipe"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            maxLength={2000}
            className={`${classesEntrada} min-h-0 resize-y text-body-sm`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Botao
              tamanho="sm"
              disabled={salvando || nota === (item.nota ?? "")}
              onClick={() =>
                iniciar(async () => {
                  const r = await anotarSugestao(item.id, nota);
                  setAviso(r.ok ? "Salva." : r.erro);
                })
              }
            >
              Salvar anotação
            </Botao>
            {confirmarApagar ? (
              <Botao
                tamanho="sm"
                variante="perigo"
                disabled={salvando}
                onClick={() =>
                  iniciar(async () => {
                    const r = await apagarSugestao(item.id);
                    if (r.ok) aoApagar();
                    else setAviso(r.erro);
                  })
                }
              >
                Confirmar: apagar
              </Botao>
            ) : (
              <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmarApagar(true)}>
                <Trash2 aria-hidden />
                Apagar
              </Botao>
            )}
          </div>
          {aviso && (
            <p role="status" className="text-ink-muted">
              {aviso}
            </p>
          )}
        </div>
      </details>
    </article>
  );
}
