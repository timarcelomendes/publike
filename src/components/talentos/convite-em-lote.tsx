"use client";

import { Check, MessageSquareText, Send, X } from "lucide-react";
import { createContext, useContext, useId, useState, useTransition, type ReactNode } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { convidarVarios } from "@/lib/acoes/talentos";
import { MAX_CONVITES_DE_UMA_VEZ, MAX_RECADO, textoDosConvites } from "@/lib/convites-em-lote";
import { Botao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";

// Convidar vários de uma vez (migração 20270305120000): a caixa de marcar em cada pessoa e, com alguém marcado,
// a barra embaixo com a vaga, o recado e o Convidar. Em Talentos ("Para a sua vaga" e "Todos os talentos") e
// no Chamar de novo.

type Lote = {
  marcados: Set<string>;
  enviados: Set<string>;
  alternar: (id: string, marcar?: boolean) => void;
};

const Contexto = createContext<Lote | null>(null);

export function ConviteEmLote({
  vagas,
  children,
}: {
  /** as vagas no ar da conta; com uma só, a barra não pergunta */
  vagas: { id: string; titulo: string }[];
  children: ReactNode;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set());
  const [enviados, setEnviados] = useState<Set<string>>(() => new Set());
  const [vaga, setVaga] = useState(vagas[0]?.id ?? "");
  const [recado, setRecado] = useState("");
  const [comRecado, setComRecado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const idVaga = useId();
  const idRecado = useId();

  function alternar(id: string, marcar?: boolean) {
    setAviso(null);
    setMarcados((atual) => {
      const novo = new Set(atual);
      const vai = marcar ?? !novo.has(id);
      if (vai && novo.size < MAX_CONVITES_DE_UMA_VEZ) novo.add(id);
      else if (!vai) novo.delete(id);
      return novo;
    });
  }

  function convidar() {
    const ids = [...marcados];
    iniciar(async () => {
      setAviso(null);
      const r = await chamarAcao(() => convidarVarios(vaga, ids, comRecado ? recado : null));
      if (!r.ok) {
        setAviso({ ok: false, texto: r.erro });
        return;
      }
      const fora = new Set(r.fora.map((f) => f.perfil_id));
      // a outra vaga pode receber o convite de quem já foi convidado para esta: só a vaga única marca "Convidado"
      if (vagas.length === 1) setEnviados((atual) => new Set([...atual, ...ids.filter((i) => !fora.has(i))]));
      setMarcados(new Set());
      setAviso({ ok: r.enviados > 0, texto: textoDosConvites(r) });
    });
  }

  if (!vagas.length) return <>{children}</>;
  const n = marcados.size;
  return (
    <Contexto.Provider value={{ marcados, enviados, alternar }}>
      {children}
      {(n > 0 || aviso) && (
        <div
          role="region"
          aria-label="Convidar as pessoas marcadas"
          className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex max-h-[70dvh] flex-col gap-3 overflow-y-auto rounded-lg border-2 border-terra bg-surface-200 p-3 shadow-raised sm:p-4 md:bottom-4"
        >
          {n > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="text-label">
                  {n === 1 ? "1 pessoa marcada" : `${n} pessoas marcadas`}
                  {n >= MAX_CONVITES_DE_UMA_VEZ && (
                    <span className="text-body-sm text-ink-muted"> (o máximo de uma vez)</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setMarcados(new Set())}
                  className="inline-flex min-h-9 items-center gap-1 text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink"
                >
                  <X aria-hidden className="size-4" />
                  Desmarcar todos
                </button>
              </div>
              {vagas.length > 1 && (
                <div className="flex flex-col gap-1 sm:max-w-md">
                  <label htmlFor={idVaga} className="text-body-sm text-ink-muted">
                    Para a vaga
                  </label>
                  <Seletor id={idVaga} value={vaga} onChange={(e) => setVaga(e.target.value)} className={classesEntrada}>
                    {vagas.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.titulo}
                      </option>
                    ))}
                  </Seletor>
                </div>
              )}
              {comRecado ? (
                <div className="flex flex-col gap-1">
                  <label htmlFor={idRecado} className="text-body-sm text-ink-muted">
                    Recado (vai junto com o convite; sem telefone, e-mail ou link)
                  </label>
                  <textarea
                    id={idRecado}
                    value={recado}
                    maxLength={MAX_RECADO}
                    rows={2}
                    onChange={(e) => setRecado(e.target.value)}
                    placeholder="Ex.: Gostamos do seu currículo. A vaga é perto da sua casa."
                    className={`${classesEntrada} min-h-16 py-2`}
                  />
                  <p className="text-right text-body-sm text-ink-muted tabular-nums">
                    {recado.length}/{MAX_RECADO}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setComRecado(true)}
                  className="inline-flex min-h-9 items-center gap-1.5 self-start text-body-sm underline underline-offset-2"
                >
                  <MessageSquareText aria-hidden className="size-4" />
                  Escrever um recado
                </button>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Botao variante="primario" disabled={pendente || !vaga} onClick={convidar}>
                  <Send aria-hidden />
                  {pendente ? "Convidando…" : n === 1 ? "Convidar 1 pessoa" : `Convidar ${n} pessoas`}
                </Botao>
                <p className="min-w-0 grow basis-56 text-body-sm text-ink-muted">
                  Cada pessoa recebe o convite no Publike e por e-mail. O contato aparece só se ela curtir e você
                  aceitar.
                </p>
              </div>
            </>
          )}
          {aviso && (
            <p role="status" className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
              {aviso.texto}
            </p>
          )}
        </div>
      )}
    </Contexto.Provider>
  );
}

/** A caixa de marcar de uma pessoa. Já convidada para a vaga: "Convidado". Fora do ConviteEmLote, nada. */
export function MarcarConvite({ perfilId, nome, convidado = false }: { perfilId: string; nome: string; convidado?: boolean }) {
  const lote = useContext(Contexto);
  if (!lote) return null;
  if (convidado || lote.enviados.has(perfilId)) {
    return (
      <span className="inline-flex min-h-10 items-center gap-1.5 text-body-sm text-cerrado-text">
        <Check aria-hidden className="size-4" />
        Convidado
      </span>
    );
  }
  const marcado = lote.marcados.has(perfilId);
  return (
    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface-200 px-3 text-label hover:bg-surface-300 has-[:checked]:border-terra has-[:checked]:bg-terra-soft">
      <input
        type="checkbox"
        checked={marcado}
        onChange={() => lote.alternar(perfilId)}
        className="size-4 accent-[var(--color-terra)]"
        aria-label={`Marcar ${nome} para convidar`}
      />
      <span aria-hidden>{marcado ? "Marcado" : "Marcar para convidar"}</span>
    </label>
  );
}

/** "Marcar todos desta página": quem ainda não foi convidado. */
export function MarcarTodos({ perfis }: { perfis: string[] }) {
  const lote = useContext(Contexto);
  if (!lote) return null;
  const livres = perfis.filter((p) => !lote.enviados.has(p));
  if (livres.length < 2) return null;
  const todos = livres.every((p) => lote.marcados.has(p));
  return (
    <button
      type="button"
      onClick={() => livres.forEach((p) => lote.alternar(p, !todos))}
      className="inline-flex min-h-10 items-center gap-2 self-start rounded-md border border-line-strong bg-surface-200 px-3 text-label hover:bg-surface-300"
    >
      <Check aria-hidden className="size-4" />
      {todos ? "Desmarcar os desta página" : `Marcar todos desta página (${livres.length})`}
    </button>
  );
}
