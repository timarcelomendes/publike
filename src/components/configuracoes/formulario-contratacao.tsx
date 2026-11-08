"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarPadroesDaContratacao } from "@/lib/acoes/processo";
import { documentoProibido } from "@/lib/documentos-admissao";
import type { PadroesDaConta } from "@/lib/processo";
import { DOCUMENTOS_MARCADOS, DOCUMENTOS_SUGERIDOS } from "@/lib/proposta";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { AvisoSalvar } from "./comum";

// Configurações › Contratação (migração 20270315120000): como a proposta começa, a lista de documentos e, na
// agência, a taxa e a garantia das colocações.

export function FormularioContratacao({ inicial, agencia }: { inicial: PadroesDaConta; agencia: boolean }) {
  const [d, setD] = useState({
    horario: inicial.proposta.horario,
    beneficios: inicial.proposta.beneficios,
    apresentar_onde: inicial.proposta.apresentar_onde,
    apresentar_hora: inicial.proposta.apresentar_hora,
    taxa: inicial.taxa == null ? "" : String(inicial.taxa).replace(".", ","),
    garantia_dias: inicial.garantia_dias == null ? "" : String(inicial.garantia_dias),
  });
  const [docs, setDocs] = useState<string[]>(inicial.documentos ?? DOCUMENTOS_MARCADOS);
  const [outro, setOutro] = useState("");
  const [erroOutro, setErroOutro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const travado = !inicial.administra;
  const lista = [...DOCUMENTOS_SUGERIDOS, ...docs.filter((x) => !DOCUMENTOS_SUGERIDOS.includes(x))];
  const mudar = (m: Partial<typeof d>) => setD((x) => ({ ...x, ...m }));
  const campo = (id: keyof typeof d, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`contratacao-${id}`} className="text-label">
        {rotulo}
      </label>
      <input
        id={`contratacao-${id}`}
        value={d[id]}
        onChange={(e) => mudar({ [id]: e.target.value })}
        className={classesEntrada}
        {...extra}
      />
    </div>
  );
  const adicionar = () => {
    const item = outro.replace(/\s+/g, " ").trim().slice(0, 60);
    if (item.length < 2) return;
    const proibido = documentoProibido(item);
    if (proibido) return setErroOutro(proibido);
    if (docs.length >= 12) return setErroOutro("A lista vai até 12 itens.");
    setErroOutro(null);
    setOutro("");
    if (!docs.includes(item)) setDocs([...docs, item]);
  };

  return (
    <div className="flex flex-col gap-5">
      <fieldset disabled={travado} className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <p className="text-label">A proposta começa com</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {campo("horario", "Horário", { placeholder: "Ex.: segunda a sábado, das 8h às 17h", maxLength: 120 })}
            {campo("beneficios", "Benefícios", { placeholder: "Ex.: vale-transporte e refeição", maxLength: 300 })}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            {campo("apresentar_onde", "Onde se apresentar no primeiro dia", { maxLength: 300 })}
            {campo("apresentar_hora", "A que horas", { type: "time" })}
          </div>
          <p className="text-body-sm text-ink-muted">O salário e o início você escreve em cada proposta.</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-label">Os documentos que você pede</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {lista.map((doc) => (
              <label key={doc} className="flex min-h-9 cursor-pointer items-center gap-2 text-body-sm">
                <input
                  type="checkbox"
                  checked={docs.includes(doc)}
                  onChange={(e) => setDocs(e.target.checked ? [...docs, doc] : docs.filter((x) => x !== doc))}
                  className="size-5 shrink-0 accent-[var(--pk-ink)]"
                />
                {doc}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="contratacao-outro" className="sr-only">
              Outro documento
            </label>
            <input
              id="contratacao-outro"
              value={outro}
              maxLength={60}
              placeholder="Outro documento"
              onChange={(e) => setOutro(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  adicionar();
                }
              }}
              className={`${classesEntrada} min-w-0 flex-1 basis-48`}
            />
            <Botao tamanho="sm" variante="secundario" onClick={adicionar} disabled={outro.trim().length < 2}>
              <Plus aria-hidden />
              Pôr na lista
            </Botao>
          </div>
          {erroOutro && (
            <p role="alert" className="text-body-sm text-danger">
              {erroOutro}
            </p>
          )}
          <p className="text-caption text-ink-muted">Confira a lista com o seu contador.</p>
        </div>

        {agencia && (
          <div className="flex flex-col gap-3">
            <p className="text-label">A colocação começa com</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {campo("taxa", "Taxa (R$)", { inputMode: "decimal", placeholder: "Ex.: 800" })}
              {campo("garantia_dias", "Garantia (dias)", { inputMode: "numeric", placeholder: "Ex.: 90" })}
            </div>
          </div>
        )}
      </fieldset>

      {!travado ? (
        <div className="flex flex-wrap items-center gap-3">
          <Botao
            variante="primario"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await chamarAcao(() => salvarPadroesDaContratacao({ ...d, documentos: docs }));
                setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Salvo." } : { ok: false, texto: r.erro });
              })
            }
          >
            {pendente && <LoaderCircle aria-hidden className="animate-spin" />}
            Salvar
          </Botao>
          <AvisoSalvar aviso={aviso} />
        </div>
      ) : (
        <p className="text-body-sm">Só quem administra a conta muda o padrão.</p>
      )}
    </div>
  );
}
