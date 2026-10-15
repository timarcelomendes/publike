"use client";

import { CalendarClock, ExternalLink, RefreshCw, Send, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import {
  buscarNoticiasAgora,
  ligarBuscaNoticias,
  mudarSituacaoNoticia,
  salvarNoticia,
  type CamposNoticia,
} from "@/lib/acoes/admin-noticias";
import { LISTA_TEMAS_NOTICIA, TEMAS_NOTICIA, type Noticia, type TemaNoticia } from "@/lib/noticias";
import { Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";
import type { Resultado } from "@/lib/tipos";
import { useAcao } from "../ui/usar-acao";

type Aba = "revisar" | "agendadas" | "site" | "descartadas";

const ABAS: { id: Aba; nome: string }[] = [
  { id: "revisar", nome: "Para revisar" },
  { id: "agendadas", nome: "Agendadas" },
  { id: "site", nome: "No site" },
  { id: "descartadas", nome: "Descartadas" },
];

function abaDa(n: Noticia, agora: number): Aba {
  if (n.status === "descartada") return "descartadas";
  if (n.status === "rascunho") return "revisar";
  return n.publicar_em && Date.parse(n.publicar_em) > agora ? "agendadas" : "site";
}

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

const chip = (ativo: boolean) =>
  `inline-flex min-h-10 shrink-0 items-center gap-2 rounded-pill border px-3.5 text-label transition-colors ${
    ativo ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-300 text-ink hover:border-line-strong"
  }`;

// ------------------------------------------------------------------ Busca

export function BuscaDeNoticias({
  ligada,
  ultimaBusca,
  aviso,
  falta,
}: {
  ligada: boolean;
  ultimaBusca: string | null;
  aviso: string | null;
  /** O que falta configurar para a busca rodar (chaves). */
  falta: string | null;
}) {
  const buscar = useAcao();
  const ligar = useAcao();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Botao
          variante="primario"
          disabled={buscar.pendente || Boolean(falta)}
          onClick={() => buscar.rodar(buscarNoticiasAgora)}
        >
          <RefreshCw aria-hidden className={buscar.pendente ? "animate-spin" : ""} />
          {buscar.pendente ? "Procurando… (leva até 2 minutos)" : "Buscar notícias agora"}
        </Botao>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2">
          <input
            type="checkbox"
            defaultChecked={ligada}
            disabled={ligar.pendente}
            onChange={(e) => {
              const v = e.target.checked;
              ligar.rodar(() => ligarBuscaNoticias(v));
            }}
            className="size-5 accent-[var(--pk-ink)]"
          />
          <span className="text-label">Buscar sozinha uma vez por dia (7h)</span>
        </label>
      </div>
      {buscar.mensagem}
      {ligar.mensagem}
      <p className="text-body-sm text-ink-muted">
        {ultimaBusca ? `Última busca: ${quando(ultimaBusca)}.` : "Nenhuma busca ainda."}
        {aviso ? ` ${aviso}` : ""} A IA só traz matéria que ela abriu na busca, com o endereço confirmado. Mesmo assim,
        abra a fonte antes de publicar.
      </p>
      {falta && <p className="text-body-sm text-danger">{falta}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ Fila

export function FilaDeNoticias({ noticias, agora }: { noticias: Noticia[]; agora: number }) {
  const [aba, setAba] = useState<Aba>("revisar");
  // o cartão sai da aba quando muda de situação: o aviso fica aqui em cima
  const [aviso, setAviso] = useState<string | null>(null);
  const conta = (a: Aba) => noticias.filter((n) => abaDa(n, agora) === a).length;
  const visiveis = noticias
    .filter((n) => abaDa(n, agora) === aba)
    .sort((x, y) =>
      aba === "agendadas"
        ? Date.parse(x.publicar_em!) - Date.parse(y.publicar_em!)
        : aba === "site"
          ? Date.parse(y.publicar_em!) - Date.parse(x.publicar_em!)
          : Date.parse(y.criado_em) - Date.parse(x.criado_em),
    );

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Situação" className="sem-barra flex gap-2 overflow-x-auto pb-1">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={aba === a.id}
            onClick={() => setAba(a.id)}
            className={chip(aba === a.id)}
          >
            {a.nome} <span className="tabular-nums opacity-70">{conta(a.id)}</span>
          </button>
        ))}
      </div>
      {aviso && (
        <p role="status" className="text-body-sm text-cerrado-text">
          {aviso}
        </p>
      )}
      {visiveis.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-strong p-6 text-center text-body-sm text-ink-muted">
          {aba === "revisar"
            ? "Nada para revisar. Toque em Buscar notícias agora ou espere a busca do dia."
            : "Nenhuma notícia aqui."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {visiveis.map((n) => (
            <CartaoNoticia key={`${n.id}-${n.status}-${n.publicar_em}`} n={n} aba={aba} aoTerminar={setAviso} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CartaoNoticia({ n, aba, aoTerminar }: { n: Noticia; aba: Aba; aoTerminar: (aviso: string) => void }) {
  const acao = useAcao();
  // quando muda de situação, avisa na lista (este cartão some da aba)
  const rodar = (f: () => Promise<Resultado>) =>
    acao.rodar(f, (r) => {
      if (r.ok && r.mensagem) aoTerminar(r.mensagem);
    });
  const [campos, setCampos] = useState<CamposNoticia>({
    titulo: n.titulo,
    resumo: n.resumo,
    corpo: n.corpo,
    pratico: n.pratico ?? "",
    tema: n.tema,
    cidade: n.cidade ?? "",
  });
  const mudar = (k: keyof CamposNoticia) => (e: { target: { value: string } }) =>
    setCampos((c) => ({ ...c, [k]: e.target.value }));
  const id = (k: string) => `noticia-${n.id}-${k}`;

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-surface-100 p-4">
      <div className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
        <Selo variante="neutro">{TEMAS_NOTICIA[n.tema]?.curto ?? n.tema}</Selo>
        {aba === "agendadas" && n.publicar_em && <Selo variante="aviso">Entra {quando(n.publicar_em)}</Selo>}
        {aba === "site" && <Selo variante="match">No site</Selo>}
        <span>
          {n.fonte_nome}
          {n.fonte_data ? ` · ${new Date(`${n.fonte_data}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}
        </span>
        <a
          href={n.fonte_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center gap-1 text-label text-terra-text underline underline-offset-2"
        >
          Abrir a matéria
          <ExternalLink aria-hidden className="size-4" />
        </a>
      </div>

      <label htmlFor={id("titulo")} className="sr-only">
        Título
      </label>
      <input
        id={id("titulo")}
        value={campos.titulo}
        onChange={mudar("titulo")}
        maxLength={140}
        className={`${classesEntrada} font-semibold`}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor={id("resumo")} className="text-label">
          Resumo
        </label>
        <textarea
          id={id("resumo")}
          value={campos.resumo}
          onChange={mudar("resumo")}
          maxLength={300}
          rows={2}
          className={`${classesEntrada} min-h-0 py-2`}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={id("corpo")} className="text-label">
          Texto
        </label>
        <textarea
          id={id("corpo")}
          value={campos.corpo}
          onChange={mudar("corpo")}
          maxLength={3000}
          rows={6}
          className={`${classesEntrada} min-h-0 py-2`}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_12rem]">
        <div className="flex flex-col gap-1">
          <label htmlFor={id("pratico")} className="text-label">
            O que isso muda para você
          </label>
          <input
            id={id("pratico")}
            value={campos.pratico}
            onChange={mudar("pratico")}
            maxLength={400}
            className={classesEntrada}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={id("tema")} className="text-label">
            Tema
          </label>
          <Seletor
            id={id("tema")}
            value={campos.tema}
            onChange={(e) => setCampos((c) => ({ ...c, tema: e.target.value as TemaNoticia }))}
            className={classesEntrada}
          >
            {LISTA_TEMAS_NOTICIA.map((t) => (
              <option key={t} value={t}>
                {TEMAS_NOTICIA[t].nome}
              </option>
            ))}
          </Seletor>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={id("cidade")} className="text-label">
            Cidade
          </label>
          <input
            id={id("cidade")}
            value={campos.cidade}
            onChange={mudar("cidade")}
            maxLength={60}
            placeholder="Goiás todo"
            className={classesEntrada}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {aba === "revisar" && (
          <>
            <Botao
              variante="sucesso"
              tamanho="sm"
              disabled={acao.pendente}
              onClick={() => rodar(() => salvarNoticia(n.id, campos, "agora"))}
            >
              <Send aria-hidden />
              Publicar agora
            </Botao>
            <Botao
              tamanho="sm"
              disabled={acao.pendente}
              onClick={() => rodar(() => salvarNoticia(n.id, campos, "agendar"))}
            >
              <CalendarClock aria-hidden />
              Agendar (8h, 12h ou 18h)
            </Botao>
          </>
        )}
        {aba !== "descartadas" && (
          <Botao
            variante="fantasma"
            tamanho="sm"
            disabled={acao.pendente}
            onClick={() => acao.rodar(() => salvarNoticia(n.id, campos, "nao"))}
          >
            Salvar o texto
          </Botao>
        )}
        {aba === "revisar" && (
          <Botao
            variante="fantasma"
            tamanho="sm"
            disabled={acao.pendente}
            onClick={() => rodar(() => mudarSituacaoNoticia(n.id, "descartada"))}
            className="text-ink-muted"
          >
            <Trash2 aria-hidden />
            Descartar
          </Botao>
        )}
        {(aba === "agendadas" || aba === "site") && (
          <Botao
            variante="fantasma"
            tamanho="sm"
            disabled={acao.pendente}
            onClick={() => rodar(() => mudarSituacaoNoticia(n.id, "rascunho"))}
          >
            <Undo2 aria-hidden />
            {aba === "site" ? "Tirar do site" : "Cancelar o agendamento"}
          </Botao>
        )}
        {aba === "descartadas" && (
          <Botao
            variante="fantasma"
            tamanho="sm"
            disabled={acao.pendente}
            onClick={() => rodar(() => mudarSituacaoNoticia(n.id, "rascunho"))}
          >
            <Undo2 aria-hidden />
            Voltar para revisar
          </Botao>
        )}
        {acao.mensagem}
      </div>
    </li>
  );
}
