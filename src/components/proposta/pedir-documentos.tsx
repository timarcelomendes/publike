"use client";

import { FileCheck2, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { pedirDocumentos } from "@/lib/acoes/processo";
import type { Regra } from "@/lib/processo";
import { DOCUMENTOS_MARCADOS, DOCUMENTOS_SUGERIDOS } from "@/lib/proposta";
import { PularRegra } from "../processo/pular-regra";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

/**
 * "Contratar sem proposta" e pedir os documentos da admissão (migração 20270315120000): o dia em que a pessoa começa
 * e a lista. Por trás, uma proposta curta, já aceita; a pessoa recebe o aviso e manda as fotos pelo Publike.
 */
export function PedirDocumentos({
  anuncioId,
  perfilId,
  nome,
  documentos,
}: {
  anuncioId: string;
  perfilId: string;
  nome: string;
  /** a lista padrão da conta (Configurações › Contratação) */
  documentos: string[] | null;
}) {
  // sem data pronta: o dia vem da pessoa (a página não lê o relógio ao montar)
  const [inicio, setInicio] = useState("");
  const [docs, setDocs] = useState<string[]>(documentos ?? DOCUMENTOS_MARCADOS);
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [regra, setRegra] = useState<Regra | null>(null);
  const lista = [...DOCUMENTOS_SUGERIDOS, ...docs.filter((d) => !DOCUMENTOS_SUGERIDOS.includes(d))];
  const pedir = () =>
    iniciar(async () => {
      setAviso(null);
      setRegra(null);
      const r = await chamarAcao(() => pedirDocumentos(anuncioId, perfilId, inicio, docs));
      if (!r.ok && "regra" in r && r.regra) setRegra(r.regra);
      setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Pedido." } : { ok: false, texto: r.erro });
    });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-ink-muted">
        {nome.split(" ")[0]} recebe o aviso e manda a foto de cada documento pelo celular, ou leva no primeiro dia.
      </p>
      <div className="flex flex-col gap-1.5 sm:max-w-56">
        <label htmlFor={`docs-inicio-${perfilId}`} className="text-label">
          Começa em
        </label>
        <input
          id={`docs-inicio-${perfilId}`}
          type="date"
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
          className={classesEntrada}
        />
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-label">Documentos</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {lista.map((d) => (
            <label key={d} className="flex min-h-9 cursor-pointer items-center gap-2 text-body-sm">
              <input
                type="checkbox"
                checked={docs.includes(d)}
                onChange={(e) => setDocs(e.target.checked ? [...docs, d] : docs.filter((x) => x !== d))}
                className="size-5 shrink-0 accent-[var(--pk-ink)]"
              />
              {d}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <Botao tamanho="sm" variante="primario" disabled={pendente || !docs.length || !inicio} onClick={pedir}>
          {pendente ? <LoaderCircle aria-hidden className="animate-spin" /> : <FileCheck2 aria-hidden />}
          Pedir os documentos
        </Botao>
      </div>
      {aviso && (
        <p role={aviso.ok ? "status" : "alert"} className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
          {aviso.texto}
        </p>
      )}
      {regra && (
        <PularRegra
          anuncioId={anuncioId}
          perfilId={perfilId}
          regra={regra}
          aoPular={() => {
            setRegra(null);
            pedir();
          }}
        />
      )}
    </div>
  );
}
