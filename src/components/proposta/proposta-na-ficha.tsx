"use client";

import { FileSignature, Pencil, Plus, X } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { cancelarProposta, fazerProposta, type DadosDaProposta } from "@/lib/acoes/proposta";
import { documentoProibido } from "@/lib/documentos-admissao";
import {
  dataEHora,
  DOCUMENTOS_MARCADOS,
  DOCUMENTOS_SUGERIDOS,
  SITUACOES_PROPOSTA,
  textoDoDia,
  type Proposta,
} from "@/lib/proposta";
import { DocumentosNaFicha } from "./documentos-na-ficha";
import { Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

function hojeMais(dias: number) {
  return new Date(Date.now() + dias * 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** A proposta na ficha do candidato (quadro): fazer, acompanhar, mudar ou cancelar. */
export function PropostaNaFicha({
  anuncioId,
  perfilId,
  nome,
  endereco,
  proposta,
}: {
  anuncioId: string;
  perfilId: string;
  nome: string;
  endereco: string;
  proposta: Proposta | null;
}) {
  const ativa = proposta && proposta.situacao !== "cancelada" ? proposta : null;
  const [editando, setEditando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const primeiro = nome.split(" ")[0];

  const mensagem = aviso && (
    <p
      role={aviso.ok ? "status" : "alert"}
      className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}
    >
      {aviso.texto}
    </p>
  );

  if (!ativa || editando) {
    if (!editando && !ativa) {
      return (
        <div className="flex flex-col items-start gap-2">
          <Botao tamanho="sm" onClick={() => (setAviso(null), setEditando(true))}>
            <FileSignature aria-hidden />
            Fazer proposta
            <Selo variante="novo">Novo</Selo>
          </Botao>
          <p className="text-body-sm text-ink-muted">
            {primeiro} recebe o salário, o início e o primeiro dia, e aceita ou recusa pelo Publike.
          </p>
          {mensagem}
        </div>
      );
    }
    return (
      <FormProposta
        inicial={ativa}
        endereco={endereco}
        pendente={pendente}
        cancelar={() => setEditando(false)}
        enviar={(d) =>
          iniciar(async () => {
            setAviso(null);
            const r = await chamarAcao(() => fazerProposta(anuncioId, perfilId, d));
            if (r.ok) setEditando(false);
            setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Enviada." } : { ok: false, texto: r.erro });
          })
        }
        aviso={mensagem}
      />
    );
  }

  const s = SITUACOES_PROPOSTA[ativa.situacao];
  return (
    <div className="flex flex-col gap-3 text-body-sm">
      <p className="flex flex-wrap items-center gap-2">
        <Selo variante={s.tom}>{s.nome}</Selo>
        <span className="text-ink-muted">
          {ativa.respondida_em ? `em ${dataEHora(ativa.respondida_em)}` : `enviada em ${dataEHora(ativa.enviada_em)}`}
        </span>
      </p>
      {ativa.situacao === "recusada" && ativa.motivo_recusa && (
        <blockquote className="rounded-md bg-surface-300 p-3">“{ativa.motivo_recusa}”</blockquote>
      )}
      <ResumoDaProposta p={ativa} />
      {ativa.situacao === "aceita" && ativa.docs && (
        <DocumentosNaFicha anuncioId={anuncioId} perfilId={perfilId} nome={primeiro} docs={ativa.docs} />
      )}
      {ativa.situacao !== "aceita" && (
        <div className="flex flex-wrap gap-2">
          <Botao tamanho="sm" variante="secundario" onClick={() => (setAviso(null), setEditando(true))}>
            <Pencil aria-hidden />
            {ativa.situacao === "recusada" ? "Fazer outra proposta" : "Mudar a proposta"}
          </Botao>
          {ativa.situacao === "enviada" && (
            <Botao
              tamanho="sm"
              variante="fantasma"
              disabled={pendente}
              onClick={() =>
                iniciar(async () => {
                  setAviso(null);
                  const r = await chamarAcao(() => cancelarProposta(anuncioId, perfilId));
                  setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Cancelada." } : { ok: false, texto: r.erro });
                })
              }
            >
              <X aria-hidden />
              Cancelar a proposta
            </Botao>
          )}
        </div>
      )}
      {mensagem}
    </div>
  );
}

/** "08:00" → "8h"; "13:30" → "13h30" */
function textoDaHora(h: string) {
  const [hh, mm] = h.split(":");
  return `${Number(hh)}h${mm && mm !== "00" ? mm : ""}`;
}

export function ResumoDaProposta({ p }: { p: Proposta }) {
  const linhas: [string, string | null][] = [
    ["Salário", p.salario],
    ["Início", textoDoDia(p.inicio)],
    ["Horário", p.horario],
    ["Benefícios", p.beneficios],
  ];
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        {linhas
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-muted">{k}</dt>
              <dd className="first-letter:uppercase">{v}</dd>
            </div>
          ))}
      </dl>
      {p.recado && <p className="whitespace-pre-line">{p.recado}</p>}
      {(p.apresentar_onde || p.apresentar_hora || p.documentos.length > 0) && (
        <div className="flex flex-col gap-1.5 rounded-md bg-surface-300 p-3">
          <p className="text-label">O primeiro dia</p>
          {(p.apresentar_onde || p.apresentar_hora) && (
            <p>
              {p.apresentar_hora ? `Às ${textoDaHora(p.apresentar_hora)}` : "Apresentar-se"}
              {p.apresentar_onde ? `, em ${p.apresentar_onde}` : ""}.
            </p>
          )}
          {p.documentos.length > 0 && (
            <>
              <p className="text-ink-muted">O que levar:</p>
              <ul className="ml-4 list-disc">
                {p.documentos.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FormProposta({
  inicial,
  endereco,
  pendente,
  cancelar,
  enviar,
  aviso,
}: {
  inicial: Proposta | null;
  endereco: string;
  pendente: boolean;
  cancelar: () => void;
  enviar: (d: DadosDaProposta) => void;
  aviso: React.ReactNode;
}) {
  const base = useId();
  const [d, setD] = useState<DadosDaProposta>(() => ({
    salario: inicial?.salario ?? "",
    inicio: inicial?.inicio ?? hojeMais(7),
    horario: inicial?.horario ?? "",
    beneficios: inicial?.beneficios ?? "",
    recado: inicial?.recado ?? "",
    apresentar_onde: inicial?.apresentar_onde ?? endereco,
    apresentar_hora: inicial?.apresentar_hora ?? "08:00",
    documentos: inicial?.documentos ?? DOCUMENTOS_MARCADOS,
  }));
  const mudar = (m: Partial<DadosDaProposta>) => setD((x) => ({ ...x, ...m }));
  // a lista: as sugestões e os itens que a empresa escreveu (o filtro do que não se pede, igual ao do banco)
  const [outro, setOutro] = useState("");
  const [erroOutro, setErroOutro] = useState<string | null>(null);
  const lista = [...DOCUMENTOS_SUGERIDOS, ...d.documentos.filter((x) => !DOCUMENTOS_SUGERIDOS.includes(x))];
  const adicionar = () => {
    const item = outro.replace(/\s+/g, " ").trim().slice(0, 60);
    if (item.length < 2) return;
    const proibido = documentoProibido(item);
    if (proibido) return setErroOutro(proibido);
    if (d.documentos.length >= 12) return setErroOutro("A lista vai até 12 itens.");
    setErroOutro(null);
    setOutro("");
    if (!d.documentos.includes(item)) mudar({ documentos: [...d.documentos, item] });
  };
  const campo = (
    id: keyof DadosDaProposta,
    rotulo: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${base}-${id}`} className="text-label">
        {rotulo}
      </label>
      <input
        id={`${base}-${id}`}
        value={String(d[id])}
        onChange={(e) => mudar({ [id]: e.target.value })}
        className={classesEntrada}
        {...extra}
      />
    </div>
  );
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        enviar(d);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {campo("salario", "Salário", { placeholder: "Ex.: R$ 1.900 + comissão", required: true, maxLength: 80 })}
        {campo("inicio", "Começa em", { type: "date", required: true, min: hojeMais(0) })}
        {campo("horario", "Horário", { placeholder: "Ex.: segunda a sábado, das 8h às 17h", maxLength: 120 })}
        {campo("beneficios", "Benefícios", { placeholder: "Ex.: vale-transporte e refeição", maxLength: 300 })}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${base}-recado`} className="text-label">
          Recado <span className="font-normal text-ink-muted">(opcional)</span>
        </label>
        <textarea
          id={`${base}-recado`}
          value={d.recado}
          maxLength={600}
          rows={3}
          onChange={(e) => mudar({ recado: e.target.value })}
          className={classesEntrada}
        />
      </div>
      <fieldset className="flex flex-col gap-3 rounded-md border border-line p-3">
        <legend className="px-1 text-label">O primeiro dia</legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          {campo("apresentar_onde", "Onde se apresentar", { maxLength: 300 })}
          {campo("apresentar_hora", "A que horas", { type: "time" })}
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-label">O que levar</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {lista.map((doc) => (
              <label key={doc} className="flex min-h-9 cursor-pointer items-center gap-2 text-body-sm">
                <input
                  type="checkbox"
                  checked={d.documentos.includes(doc)}
                  onChange={(e) =>
                    mudar({
                      documentos: e.target.checked ? [...d.documentos, doc] : d.documentos.filter((x) => x !== doc),
                    })
                  }
                  className="size-5 shrink-0 accent-[var(--pk-ink)]"
                />
                {doc}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <label htmlFor={`${base}-outro`} className="sr-only">
              Outro item
            </label>
            <input
              id={`${base}-outro`}
              value={outro}
              maxLength={60}
              placeholder="Outro item"
              onChange={(e) => setOutro(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  adicionar();
                }
              }}
              aria-invalid={erroOutro ? true : undefined}
              aria-describedby={erroOutro ? `${base}-outro-erro` : undefined}
              className={`${classesEntrada} min-w-0 flex-1 basis-48`}
            />
            <Botao tamanho="sm" variante="secundario" onClick={adicionar} disabled={outro.trim().length < 2}>
              <Plus aria-hidden />
              Pôr na lista
            </Botao>
          </div>
          {erroOutro && (
            <p id={`${base}-outro-erro`} role="alert" className="text-body-sm text-danger">
              {erroOutro}
            </p>
          )}
          <p className="text-caption text-ink-muted">
            Confira a lista com o seu contador. Depois de aceitar, a pessoa pode mandar a foto de cada item pelo
            Publike ou levar no primeiro dia. Os arquivos somem em até 30 dias.
          </p>
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Botao type="submit" variante="primario" tamanho="sm" disabled={pendente}>
          <FileSignature aria-hidden />
          {pendente ? "Enviando…" : inicial ? "Mandar a proposta de novo" : "Mandar a proposta"}
        </Botao>
        <Botao type="button" variante="fantasma" tamanho="sm" onClick={cancelar}>
          Voltar
        </Botao>
      </div>
      {aviso}
    </form>
  );
}
