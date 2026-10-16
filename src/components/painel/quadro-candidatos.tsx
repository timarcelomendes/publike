"use client";

import {
  CalendarClock,
  Check,
  CircleHelp,
  ExternalLink,
  GripVertical,
  MessageCircle,
  MessagesSquare,
  Send,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type ReactNode,
} from "react";
import type { Aderencia } from "@/lib/aderencia";
import { moverCandidatos } from "@/lib/acoes/recrutamento";
import { ETAPAS_CANDIDATO, type EtapaCandidato } from "@/lib/constantes";
import { formatarLugar, linkWhatsApp, tempoRelativo } from "@/lib/formato";
import { COLUNAS_QUADRO, dataDaEntrevista, SITUACOES_ENTREVISTA, type ModeloMensagem } from "@/lib/recrutamento";
import { Avatar, Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";
import { CompositorMensagem, EntrevistaMarcada, FormEntrevista } from "./recrutamento";

// Quadro de candidatos de uma vaga (como um Kanban): uma coluna por etapa, os mais
// aderentes em cima. Arraste o cartão para outra coluna (ou use "Mover para"), marque
// vários para mover ou mandar mensagem de uma vez, e abra o cartão para ver a nota,
// as respostas, marcar entrevista e conversar.

export type CartaoQuadro = {
  perfil_id: string;
  nome: string;
  foto: string | null;
  cidade: string;
  bairro: string | null;
  status: string;
  curtido_em: string;
  mensagem: string | null;
  whatsapp: string | null;
  email: string | null;
  coluna: EtapaCandidato;
  anotacao: string | null;
  aderencia: Aderencia;
  respostas: { pergunta: string; resposta: string }[];
  entrevista: {
    id: string;
    quando: string;
    formato: string;
    local: string | null;
    obs: string | null;
    situacao: string;
  } | null;
  temCurriculo: boolean;
};

function Nota({ a }: { a: Aderencia }) {
  if (a.eliminado) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-danger px-2 py-0.5 text-caption text-danger uppercase">
        Eliminado
      </span>
    );
  }
  if (a.nota === null) return null;
  const cor =
    a.nota >= 80 ? "bg-cerrado text-on-cerrado" : a.nota >= 50 ? "bg-ipe text-on-ipe" : "bg-surface-300 text-ink";
  return (
    <span
      title="Nota de aderência: o quanto bate com o que a vaga pede"
      className={`inline-flex shrink-0 items-center rounded-pill px-2 py-0.5 text-caption font-semibold tabular-nums ${cor}`}
    >
      {a.nota}%
    </span>
  );
}

export function QuadroCandidatos({
  anuncioId,
  vaga,
  empresa,
  endereco,
  cartoes,
  modelos,
  agora,
}: {
  anuncioId: string;
  vaga: string;
  empresa: string;
  endereco: string;
  cartoes: CartaoQuadro[];
  modelos: ModeloMensagem[];
  agora: number;
}) {
  const [lista, mover] = useOptimistic(cartoes, (atual, m: { ids: string[]; coluna: EtapaCandidato }) =>
    atual.map((c) => (m.ids.includes(c.perfil_id) ? { ...c, coluna: m.coluna } : c)),
  );
  const [pendente, iniciar] = useTransition();
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [mensagemEmMassa, setMensagemEmMassa] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [esconderEliminados, setEsconderEliminados] = useState(false);
  const [sobre, setSobre] = useState<EtapaCandidato | null>(null);

  const visiveis = esconderEliminados ? lista.filter((c) => !c.aderencia.eliminado) : lista;
  const eliminados = lista.filter((c) => c.aderencia.eliminado).length;
  const atual = lista.find((c) => c.perfil_id === aberto) ?? null;

  function moverPara(ids: string[], coluna: EtapaCandidato) {
    const mudam = ids.filter((id) => lista.find((c) => c.perfil_id === id)?.coluna !== coluna);
    if (!mudam.length) return;
    setAviso(null);
    iniciar(async () => {
      mover({ ids: mudam, coluna });
      const r = await moverCandidatos(anuncioId, mudam, coluna);
      if (!r.ok) setAviso({ ok: false, texto: r.erro });
      else {
        const falhas = r.falhas.map((f) => `${f.perfil}: ${f.erro}`).join(" ");
        setAviso({ ok: !r.falhas.length, texto: [r.mensagem, falhas].filter(Boolean).join(" ") });
        setSelecionados((s) => s.filter((id) => !mudam.includes(id)));
      }
    });
  }

  function soltar(e: DragEvent, coluna: EtapaCandidato) {
    e.preventDefault();
    setSobre(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    // arrastou um dos marcados: leva todos os marcados
    moverPara(selecionados.includes(id) ? selecionados : [id], coluna);
  }

  const alternar = (id: string) => setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const perfisSelecionados = lista
    .filter((c) => selecionados.includes(c.perfil_id))
    .map((c) => ({ id: c.perfil_id, nome: c.nome, match: c.status === "match" }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-body-sm text-ink-muted">
          Arraste o cartão para outra coluna ou use “Mover para”. Ir para Entrevista ou Contratado dá o match (o contato
          aparece para os dois); “Não seguiu” dispensa quem ainda esperava resposta.
        </p>
        {eliminados > 0 && (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-label">
            <input
              type="checkbox"
              checked={esconderEliminados}
              onChange={(e) => setEsconderEliminados(e.target.checked)}
              className="size-5 accent-[var(--pk-ink)]"
            />
            Esconder eliminados ({eliminados})
          </label>
        )}
      </div>
      {aviso && (
        <p role="status" className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
          {aviso.texto}
        </p>
      )}

      {/* no celular as colunas rolam de lado, uma de cada vez */}
      <div
        aria-busy={pendente}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0"
      >
        {COLUNAS_QUADRO.map((col) => {
          const daColuna = visiveis.filter((c) => c.coluna === col.etapa);
          return (
            <section
              key={col.etapa}
              aria-label={`${col.nome}: ${daColuna.length}`}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(col.etapa);
              }}
              onDragLeave={() => setSobre((s) => (s === col.etapa ? null : s))}
              onDrop={(e) => soltar(e, col.etapa)}
              className={`flex w-[82vw] max-w-80 shrink-0 snap-start flex-col gap-2 rounded-lg border p-2.5 transition-colors sm:w-64 xl:w-auto xl:min-w-[12rem] xl:flex-1 ${
                sobre === col.etapa ? "border-ink bg-surface-300" : "border-line bg-surface-100"
              }`}
            >
              <header className="flex items-baseline justify-between gap-2 px-1 pt-1">
                <h3 className="text-label">{col.nome}</h3>
                <span className="text-body-sm text-ink-muted tabular-nums">{daColuna.length}</span>
              </header>
              <p className="px-1 text-caption text-ink-muted">{col.ajuda}</p>
              <ul className="flex min-h-24 flex-col gap-2">
                {daColuna.map((c) => (
                  <li key={c.perfil_id}>
                    <Cartao
                      c={c}
                      agora={agora}
                      marcado={selecionados.includes(c.perfil_id)}
                      alternar={() => alternar(c.perfil_id)}
                      abrir={() => setAberto(c.perfil_id)}
                      moverPara={(coluna) => moverPara([c.perfil_id], coluna)}
                    />
                  </li>
                ))}
                {daColuna.length === 0 && (
                  <li className="rounded-md border border-dashed border-line px-3 py-6 text-center text-body-sm text-ink-muted">
                    Ninguém aqui
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      {selecionados.length > 0 && (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex flex-wrap items-center gap-2 rounded-lg border border-line-strong bg-surface-200 p-3 shadow-raised md:bottom-4">
          <span className="text-label">
            {selecionados.length} {selecionados.length === 1 ? "selecionado" : "selecionados"}
          </span>
          <Seletor
            aria-label="Mover os selecionados para"
            value=""
            onChange={(e) => e.target.value && moverPara(selecionados, e.target.value as EtapaCandidato)}
            className={`${classesEntrada} min-h-10 py-1 text-body-sm`}
            envoltorio="w-48"
          >
            <option value="">Mover para…</option>
            {COLUNAS_QUADRO.map((col) => (
              <option key={col.etapa} value={col.etapa}>
                {col.nome}
              </option>
            ))}
          </Seletor>
          <Botao tamanho="sm" onClick={() => setMensagemEmMassa(true)}>
            <Send aria-hidden />
            Mandar mensagem
          </Botao>
          <Botao tamanho="sm" variante="fantasma" onClick={() => setSelecionados([])}>
            Limpar
          </Botao>
        </div>
      )}

      <Gaveta aberta={mensagemEmMassa} fechar={() => setMensagemEmMassa(false)} titulo="Mensagem para os selecionados">
        <CompositorMensagem
          anuncioId={anuncioId}
          perfis={perfisSelecionados}
          vaga={vaga}
          empresa={empresa}
          modelos={modelos}
          aoTerminar={() => {
            setMensagemEmMassa(false);
            setSelecionados([]);
            setAviso({ ok: true, texto: "Mensagem enviada." });
          }}
        />
      </Gaveta>

      <Gaveta aberta={atual !== null} fechar={() => setAberto(null)} titulo={atual?.nome ?? ""}>
        {atual && (
          <DetalheCandidato
            key={atual.perfil_id}
            c={atual}
            anuncioId={anuncioId}
            vaga={vaga}
            empresa={empresa}
            endereco={endereco}
            modelos={modelos}
            agora={agora}
            moverPara={(coluna) => moverPara([atual.perfil_id], coluna)}
          />
        )}
      </Gaveta>
    </div>
  );
}

function Cartao({
  c,
  agora,
  marcado,
  alternar,
  abrir,
  moverPara,
}: {
  c: CartaoQuadro;
  agora: number;
  marcado: boolean;
  alternar: () => void;
  abrir: () => void;
  moverPara: (coluna: EtapaCandidato) => void;
}) {
  const e = c.entrevista;
  const entrevistaAberta = e && ["marcada", "confirmada", "remarcar"].includes(e.situacao);
  return (
    <article
      draggable
      onDragStart={(ev) => {
        ev.dataTransfer.setData("text/plain", c.perfil_id);
        ev.dataTransfer.effectAllowed = "move";
      }}
      className={`group flex flex-col gap-2 rounded-md border bg-surface-200 p-2.5 shadow-card ${
        marcado ? "border-ink ring-1 ring-ink" : "border-line"
      } ${c.aderencia.eliminado ? "opacity-75" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <input
          type="checkbox"
          checked={marcado}
          onChange={alternar}
          aria-label={`Selecionar ${c.nome}`}
          className="size-5 shrink-0 accent-[var(--pk-ink)]"
        />
        <span className="flex items-center gap-1">
          <Nota a={c.aderencia} />
          <GripVertical aria-hidden className="hidden size-4 shrink-0 cursor-grab text-ink-muted sm:block" />
        </span>
      </div>
      <div className="flex items-start gap-2">
        <Avatar nome={c.nome} foto={c.foto} tamanho={32} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={abrir}
            className="line-clamp-2 block w-full text-left text-label break-words underline-offset-2 hover:underline"
          >
            {c.nome}
          </button>
          <p className="text-caption text-ink-muted">
            {formatarLugar(c.bairro, c.cidade)} · {tempoRelativo(c.curtido_em, agora)}
          </p>
        </div>
      </div>
      {(c.status === "pendente" || entrevistaAberta || c.status === "desfeito") && (
        <div className="flex flex-wrap gap-1.5">
          {c.status === "pendente" && <Selo variante="aviso">Para responder</Selo>}
          {c.status === "desfeito" && <Selo variante="contorno">Match desfeito</Selo>}
          {entrevistaAberta && e && (
            <Selo variante={SITUACOES_ENTREVISTA[e.situacao]?.tom ?? "aviso"}>
              <CalendarClock aria-hidden />
              {dataDaEntrevista(e.quando)}
            </Selo>
          )}
        </div>
      )}
      <Seletor
        aria-label={`Mover ${c.nome} para`}
        value=""
        onChange={(ev) => ev.target.value && moverPara(ev.target.value as EtapaCandidato)}
        className={`${classesEntrada} min-h-9 py-1 text-body-sm`}
      >
        <option value="">Mover para…</option>
        {COLUNAS_QUADRO.filter((col) => col.etapa !== c.coluna).map((col) => (
          <option key={col.etapa} value={col.etapa}>
            {col.nome}
          </option>
        ))}
      </Seletor>
    </article>
  );
}

function DetalheCandidato({
  c,
  anuncioId,
  vaga,
  empresa,
  endereco,
  modelos,
  agora,
  moverPara,
}: {
  c: CartaoQuadro;
  anuncioId: string;
  vaga: string;
  empresa: string;
  endereco: string;
  modelos: ModeloMensagem[];
  agora: number;
  moverPara: (coluna: EtapaCandidato) => void;
}) {
  const [marcando, setMarcando] = useState(false);
  const [marcou, setMarcou] = useState(false);
  const match = c.status === "match";
  const primeiro = c.nome.split(" ")[0];
  const e = c.entrevista;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Avatar nome={c.nome} foto={c.foto} tamanho={56} />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm text-ink-muted">
            {formatarLugar(c.bairro, c.cidade)} · curtiu {tempoRelativo(c.curtido_em, agora)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <Nota a={c.aderencia} />
            <Selo variante="contorno">{ETAPAS_CANDIDATO[c.coluna].nome}</Selo>
            {c.status === "pendente" && <Selo variante="aviso">Para responder</Selo>}
            {match && <Selo variante="match">Deu match</Selo>}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/perfil/${c.perfil_id}`}
          target="_blank"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong px-3 text-label hover:bg-surface-300"
        >
          <ExternalLink aria-hidden className="size-4" />
          Perfil
        </Link>
        <Link
          href={`/painel/candidatos?vaga=${anuncioId}&q=${encodeURIComponent(primeiro)}`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong px-3 text-label hover:bg-surface-300"
        >
          {c.temCurriculo ? "Currículo e anotações" : "Anotações"}
        </Link>
        {match && (
          <Link
            href={`/painel/conversas/${anuncioId}/${c.perfil_id}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong px-3 text-label hover:bg-surface-300"
          >
            <MessagesSquare aria-hidden className="size-4" />
            Conversa
          </Link>
        )}
        {match && c.whatsapp && (
          <a
            href={linkWhatsApp(
              c.whatsapp,
              `Olá, ${primeiro}! Aqui é da ${empresa}, sobre a vaga de ${vaga} no Publike.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-cerrado px-3 text-label text-on-cerrado hover:brightness-110"
          >
            <MessageCircle aria-hidden className="size-4" />
            WhatsApp
          </a>
        )}
      </div>

      <Secao titulo="Mover para">
        <div className="flex flex-wrap gap-2">
          {COLUNAS_QUADRO.filter((col) => col.etapa !== c.coluna).map((col) => (
            <Botao key={col.etapa} tamanho="sm" onClick={() => moverPara(col.etapa)}>
              {col.nome}
            </Botao>
          ))}
        </div>
      </Secao>

      <Secao titulo="Aderência à vaga">
        {c.aderencia.criterios.length ? (
          <ul className="flex flex-col gap-1.5">
            {c.aderencia.criterios.map((k) => (
              <li key={k.nome} className="flex items-start gap-2 text-body-sm">
                {k.ok === true ? (
                  <Check aria-label="Atende" className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
                ) : k.ok === false ? (
                  k.eliminatorio ? (
                    <TriangleAlert
                      aria-label="Não atende (eliminatória)"
                      className="mt-0.5 size-4 shrink-0 text-danger"
                    />
                  ) : (
                    <X aria-label="Não atende" className="mt-0.5 size-4 shrink-0 text-danger" />
                  )
                ) : (
                  <CircleHelp aria-label="Sem informação" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                )}
                <span>
                  <span className="font-semibold">{k.nome}</span>
                  <span className="text-ink-muted"> · {k.detalhe}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-ink-muted">
            A vaga não pede escolaridade, experiência nem CNH, e as perguntas não têm resposta procurada. Defina no
            editar da vaga para ter a nota.
          </p>
        )}
      </Secao>

      {(c.respostas.length > 0 || c.mensagem) && (
        <Secao titulo="O que respondeu">
          {c.mensagem && (
            <blockquote className="mb-2 rounded-md bg-surface-300 p-3 text-body-sm">“{c.mensagem}”</blockquote>
          )}
          <dl className="flex flex-col gap-1.5 text-body-sm">
            {c.respostas.map((r) => (
              <div key={r.pergunta}>
                <dt className="text-ink-muted">{r.pergunta}</dt>
                <dd className={r.resposta ? "font-semibold" : "text-ink-muted italic"}>
                  {r.resposta || "Não respondeu"}
                </dd>
              </div>
            ))}
          </dl>
        </Secao>
      )}

      <Secao titulo="Entrevista">
        {e && !marcando ? (
          <>
            {marcou && (
              <p role="status" className="text-body-sm text-cerrado-text">
                Entrevista marcada. O candidato recebeu o aviso e a mensagem na conversa.
              </p>
            )}
            <EntrevistaMarcada entrevista={e} aoRemarcar={() => (setMarcou(false), setMarcando(true))} />
          </>
        ) : (
          <FormEntrevista
            anuncioId={anuncioId}
            perfilId={c.perfil_id}
            nome={c.nome}
            atual={e && ["marcada", "confirmada", "remarcar"].includes(e.situacao) ? e : null}
            endereco={endereco}
            aoTerminar={() => {
              setMarcando(false);
              setMarcou(true);
            }}
          />
        )}
      </Secao>

      <Secao titulo="Mensagem">
        <CompositorMensagem
          anuncioId={anuncioId}
          perfis={[{ id: c.perfil_id, nome: c.nome, match }]}
          vaga={vaga}
          empresa={empresa}
          modelos={modelos}
        />
      </Secao>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 className="text-label">{titulo}</h3>
      {children}
    </section>
  );
}

/** Painel que abre do lado (computador) ou de baixo (celular). */
function Gaveta({
  aberta,
  fechar,
  titulo,
  children,
}: {
  aberta: boolean;
  fechar: () => void;
  titulo: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta && !d.open) d.showModal();
    if (!aberta && d.open) d.close();
  }, [aberta]);
  const id = useMemo(() => `gaveta-${titulo.replace(/\W+/g, "-").toLowerCase()}`, [titulo]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={fechar}
      onClick={(e) => e.target === e.currentTarget && fechar()}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-lg border border-line-strong bg-surface-200 p-0 text-ink shadow-raised backdrop:bg-ink/50 sm:mt-0 sm:mr-0 sm:ml-auto sm:h-dvh sm:max-h-dvh sm:w-[34rem] sm:rounded-none sm:rounded-l-lg"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface-200 px-5 py-3">
        <h2 id={id} className="truncate text-h3">
          {titulo}
        </h2>
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{aberta && children}</div>
    </dialog>
  );
}
