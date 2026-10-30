"use client";

import { CalendarPlus, Send, Trash } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import {
  apagarModeloMensagem,
  mandarMensagemEmMassa,
  marcarEntrevista,
  mudarEntrevista,
  salvarModeloMensagem,
} from "@/lib/acoes/recrutamento";
import {
  dataDaEntrevista,
  FORMATOS_ENTREVISTA,
  preencherModelo,
  SITUACOES_ENTREVISTA,
  type FormatoEntrevista,
  type ModeloMensagem,
} from "@/lib/recrutamento";
import { eventoDaEntrevista } from "@/lib/agenda";
import { BotoesAgenda } from "../agenda/botoes-agenda";
import { Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

// Peças do recrutamento usadas no quadro e no cartão do candidato: marcar entrevista,
// o que fazer com uma entrevista marcada e o compositor de mensagem pronta.

type EntrevistaResumo = {
  id: string;
  quando: string;
  formato: string;
  local: string | null;
  obs: string | null;
  situacao: string;
  duracao_min?: number | null;
  atualizado_em?: string | null;
};

/** "2026-10-22T14:00" (Brasília) a partir da data guardada, para o campo de data e hora. */
function paraCampo(iso: string | null) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 24 * 3600e3);
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  const [dia, hora] = p.split(" ");
  return `${dia}T${iso ? hora : "09:00"}`;
}

/** Formulário de marcar (ou remarcar) a entrevista. */
export function FormEntrevista({
  anuncioId,
  perfilId,
  nome,
  atual,
  endereco,
  aoTerminar,
}: {
  anuncioId: string;
  perfilId: string;
  nome: string;
  atual: EntrevistaResumo | null;
  /** o endereço da vaga, para já vir preenchido no presencial */
  endereco: string;
  aoTerminar?: () => void;
}) {
  const base = useId();
  const [formato, setFormato] = useState<FormatoEntrevista>((atual?.formato as FormatoEntrevista) ?? "presencial");
  const [quando, setQuando] = useState(paraCampo(atual?.quando ?? null));
  const [local, setLocal] = useState(atual?.local ?? (formato === "presencial" ? endereco : ""));
  const [obs, setObs] = useState(atual?.obs ?? "");
  const [duracao, setDuracao] = useState("30");
  const { rodar, pendente, mensagem } = useAcao();
  const info = FORMATOS_ENTREVISTA[formato];

  function trocarFormato(f: FormatoEntrevista) {
    setFormato(f);
    setLocal(f === "presencial" ? endereco : f === "video" ? "" : "");
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(
          () => marcarEntrevista({ anuncioId, perfilId, quando, formato, local, obs, duracao: Number(duracao) }),
          (r) => r.ok && aoTerminar?.(),
        );
      }}
    >
      <p className="text-body-sm text-ink-muted">
        {nome.split(" ")[0]} recebe o aviso e uma mensagem na conversa com os detalhes, e confirma a presença pelo
        Publike. {atual ? "Mudar a data remarca a entrevista." : "Se ainda não deu match, o match acontece agora."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${base}-quando`} className="text-label">
            Dia e hora
          </label>
          <input
            id={`${base}-quando`}
            type="datetime-local"
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
            required
            className={classesEntrada}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${base}-duracao`} className="text-label">
            Duração
          </label>
          <Seletor
            id={`${base}-duracao`}
            value={duracao}
            onChange={(e) => setDuracao(e.target.value)}
            className={classesEntrada}
          >
            {[15, 30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} minutos` : m === 60 ? "1 hora" : "1 hora e meia"}
              </option>
            ))}
          </Seletor>
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label">Como vai ser</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(FORMATOS_ENTREVISTA) as FormatoEntrevista[]).map((f) => (
            <label
              key={f}
              className="inline-flex min-h-10 cursor-pointer items-center rounded-pill border border-line bg-surface-300 px-3.5 text-label has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-surface-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
            >
              <input
                type="radio"
                name={`${base}-formato`}
                checked={formato === f}
                onChange={() => trocarFormato(f)}
                className="sr-only"
              />
              {FORMATOS_ENTREVISTA[f].nome}
            </label>
          ))}
        </div>
      </fieldset>
      {info.campo && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${base}-local`} className="text-label">
            {info.campo}
          </label>
          <input
            id={`${base}-local`}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            maxLength={300}
            placeholder={info.exemplo}
            inputMode={formato === "video" ? "url" : undefined}
            className={classesEntrada}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${base}-obs`} className="text-label">
          Recado <span className="font-normal text-ink-muted">(opcional)</span>
        </label>
        <input
          id={`${base}-obs`}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          maxLength={500}
          placeholder="Ex.: Traga RG e carteira de trabalho. Procure a Juliana na recepção."
          className={classesEntrada}
        />
      </div>
      <div>
        <Botao type="submit" variante="primario" tamanho="sm" disabled={pendente}>
          <CalendarPlus aria-hidden />
          {pendente ? "Marcando…" : atual ? "Remarcar entrevista" : "Marcar entrevista"}
        </Botao>
      </div>
      {mensagem}
    </form>
  );
}

/** A entrevista já marcada: quando, onde, a situação e o que dá para fazer. */
export function EntrevistaMarcada({
  entrevista,
  aoRemarcar,
  agenda = null,
}: {
  entrevista: EntrevistaResumo;
  aoRemarcar: () => void;
  /** para pôr na agenda de quem publicou: a vaga, o candidato e o link de volta */
  agenda?: { vaga: string; candidato: string; url: string } | null;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const situacao = SITUACOES_ENTREVISTA[entrevista.situacao] ?? SITUACOES_ENTREVISTA.marcada;
  const aberta = ["marcada", "confirmada", "remarcar"].includes(entrevista.situacao);
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-2 text-label">
        {dataDaEntrevista(entrevista.quando)}
        <Selo variante={situacao.tom}>{situacao.nome}</Selo>
      </p>
      <p className="text-body-sm text-ink-muted">
        {FORMATOS_ENTREVISTA[entrevista.formato as FormatoEntrevista]?.nome ?? ""}
        {entrevista.local ? `: ${entrevista.local}` : ""}
        {entrevista.obs ? ` · ${entrevista.obs}` : ""}
      </p>
      {aberta && agenda && (
        <BotoesAgenda
          evento={eventoDaEntrevista(entrevista, {
            vaga: agenda.vaga,
            candidato: agenda.candidato,
            para: "empresa",
            url: agenda.url,
          })}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {aberta && (
          <>
            <Botao tamanho="sm" onClick={aoRemarcar}>
              Remarcar
            </Botao>
            <Botao
              tamanho="sm"
              variante="fantasma"
              disabled={pendente}
              onClick={() => rodar(() => mudarEntrevista(entrevista.id, "realizada"))}
            >
              Foi realizada
            </Botao>
            <Botao
              tamanho="sm"
              variante="fantasma"
              disabled={pendente}
              onClick={() => rodar(() => mudarEntrevista(entrevista.id, "faltou"))}
            >
              Não compareceu
            </Botao>
            <Botao
              tamanho="sm"
              variante="fantasma"
              disabled={pendente}
              onClick={() => rodar(() => mudarEntrevista(entrevista.id, "cancelada"))}
            >
              Cancelar
            </Botao>
          </>
        )}
        {!aberta && (
          <Botao tamanho="sm" onClick={aoRemarcar}>
            Marcar outra
          </Botao>
        )}
      </div>
      {mensagem}
    </div>
  );
}

/**
 * Mensagem para um ou vários candidatos: escolhe uma pronta ou escreve, vê como fica
 * para o primeiro e manda. Só vai para quem tem match (a conversa abre com o match).
 */
export function CompositorMensagem({
  anuncioId,
  perfis,
  vaga,
  empresa,
  modelos,
  aoTerminar,
}: {
  anuncioId: string;
  perfis: { id: string; nome: string; match: boolean }[];
  vaga: string;
  empresa: string;
  modelos: ModeloMensagem[];
  aoTerminar?: () => void;
}) {
  const base = useId();
  const [modeloId, setModeloId] = useState("");
  const [texto, setTexto] = useState("");
  const [nomeModelo, setNomeModelo] = useState("");
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const comMatch = perfis.filter((p) => p.match);
  const semMatch = perfis.length - comMatch.length;
  const modelo = modelos.find((m) => m.id === modeloId);
  const exemplo = comMatch[0] ? preencherModelo(texto, { nome: comMatch[0].nome, vaga, empresa }) : "";

  function escolher(id: string) {
    setModeloId(id);
    const m = modelos.find((x) => x.id === id);
    if (m) setTexto(m.texto);
  }

  function mandar() {
    setAviso(null);
    iniciar(async () => {
      const r = await chamarAcao(() =>
        mandarMensagemEmMassa(
          anuncioId,
          comMatch.map((p) => p.id),
          texto,
        ),
      );
      if (!r.ok) setAviso({ ok: false, texto: r.erro });
      else {
        const falhas = r.falhas.length ? ` ${r.falhas.map((f) => `${f.perfil}: ${f.erro}`).join(" ")}` : "";
        setAviso({ ok: r.feitos > 0, texto: (r.mensagem || "Nada enviado.") + falhas });
        if (r.feitos && !r.falhas.length) {
          setTexto("");
          setModeloId("");
          aoTerminar?.();
        }
      }
    });
  }

  function salvarComoPronta() {
    setAviso(null);
    iniciar(async () => {
      const r = await chamarAcao(() => salvarModeloMensagem(nomeModelo, texto));
      setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Salva." } : { ok: false, texto: r.erro });
      if (r.ok) setNomeModelo("");
    });
  }

  function apagar(id: string) {
    iniciar(async () => {
      const r = await chamarAcao(() => apagarModeloMensagem(id));
      if (r.ok) {
        setModeloId("");
        setTexto("");
      } else setAviso({ ok: false, texto: r.erro });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {semMatch > 0 && (
        <p className="rounded-md bg-terra-soft px-3 py-2 text-body-sm text-terra-text">
          {semMatch === perfis.length
            ? "Ninguém aqui tem match ainda: a conversa só abre com o match. Mova para Entrevista ou aceite antes."
            : `${semMatch} sem match ${semMatch === 1 ? "fica" : "ficam"} de fora: a conversa só abre com o match.`}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${base}-modelo`} className="text-label">
          Mensagem pronta
        </label>
        <div className="flex gap-2">
          <Seletor
            id={`${base}-modelo`}
            value={modeloId}
            onChange={(e) => escolher(e.target.value)}
            className={classesEntrada}
            envoltorio="min-w-0 flex-1"
          >
            <option value="">Escrever do zero</option>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
                {m.pronto ? "" : " (sua)"}
              </option>
            ))}
          </Seletor>
          {modelo && !modelo.pronto && (
            <button
              type="button"
              onClick={() => apagar(modelo.id)}
              aria-label={`Apagar a mensagem pronta ${modelo.nome}`}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-300 hover:text-danger"
            >
              <Trash aria-hidden className="size-5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${base}-texto`} className="text-label">
          Texto
        </label>
        <textarea
          id={`${base}-texto`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={5}
          maxLength={1800}
          placeholder="Use {nome}, {vaga} e {empresa}: cada candidato recebe com os dados dele."
          className={`${classesEntrada} resize-y`}
        />
      </div>
      {exemplo.trim() && (
        <p className="rounded-md bg-surface-300 px-3 py-2 text-body-sm">
          <span className="text-ink-muted">Como {comMatch[0].nome.split(" ")[0]} recebe: </span>
          {exemplo}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Botao
          variante="primario"
          tamanho="sm"
          onClick={mandar}
          disabled={pendente || !comMatch.length || texto.trim().length < 5}
        >
          <Send aria-hidden />
          {pendente ? "Enviando…" : comMatch.length > 1 ? `Mandar para ${comMatch.length}` : "Mandar"}
        </Botao>
      </div>
      {texto.trim().length >= 5 && !modelo && (
        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor={`${base}-nome`} className="text-body-sm text-ink-muted">
              Guardar como mensagem pronta
            </label>
            <input
              id={`${base}-nome`}
              value={nomeModelo}
              onChange={(e) => setNomeModelo(e.target.value)}
              maxLength={60}
              placeholder="Nome. Ex.: Convite para o teste prático"
              className={classesEntrada}
            />
          </div>
          <Botao
            tamanho="sm"
            onClick={salvarComoPronta}
            disabled={pendente || nomeModelo.trim().length < 2}
            className="min-h-11"
          >
            Guardar
          </Botao>
        </div>
      )}
      {aviso && (
        <p role="status" className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
