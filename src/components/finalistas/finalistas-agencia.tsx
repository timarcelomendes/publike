"use client";

import { Check, Copy, ExternalLink, Link2, MessageCircle, RefreshCw, Sparkles, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { adicionarFinalistas, mexerNoLink, salvarParecer, tirarFinalista } from "@/lib/acoes/finalistas";
import { resumirCandidatoComIA } from "@/lib/acoes/talentos";
import { LIMITES_FINALISTAS } from "@/lib/finalistas";
import { Avatar } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

// A agência cuidando dos finalistas de uma vaga: o link para o cliente, o parecer de cada
// pessoa e quem mais pode ir para a lista.

function Aviso({ r }: { r: { ok: boolean; texto: string } | null }) {
  if (!r) return null;
  return (
    <p role={r.ok ? "status" : "alert"} className={`text-body-sm ${r.ok ? "text-cerrado-text" : "text-danger"}`}>
      {r.texto}
    </p>
  );
}

/** "18/11" a partir da data guardada (horário de Brasília). */
function diaMes(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(
    new Date(iso),
  );
}

/** O link que vai para o cliente: copiar, mandar pelo WhatsApp, abrir, renovar e trocar. */
export function LinkDoCliente({
  anuncioId,
  site,
  vaga,
  agencia,
  link,
  vencido,
  aberto,
}: {
  anuncioId: string;
  /** o endereço do site, para montar o link inteiro */
  site: string;
  vaga: string;
  agencia: string;
  link: { token: string; expira_em: string } | null;
  vencido: boolean;
  /** "aberto 3 vezes, a última há 2 h" (null: o cliente ainda não abriu) */
  aberto: string | null;
}) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const url = link ? `${site}/finalistas/${link.token}` : null;

  function mexer(acao: "pegar" | "renovar" | "trocar") {
    setAviso(null);
    iniciar(async () => {
      const r = await mexerNoLink(anuncioId, acao);
      if (!r.ok) setAviso({ ok: false, texto: r.erro });
      else
        setAviso({
          ok: true,
          texto:
            acao === "trocar"
              ? `Link novo, até ${diaMes(r.expira_em)}. O antigo não abre mais.`
              : acao === "renovar"
                ? `Pronto: o link vale até ${diaMes(r.expira_em)}.`
                : `Link criado. Vale até ${diaMes(r.expira_em)}.`,
        });
      setTrocando(false);
    });
  }

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      setAviso({ ok: false, texto: "Não deu para copiar. Toque no link e copie à mão." });
    }
  }

  if (!url || !link) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Botao variante="primario" disabled={pendente} onClick={() => mexer("pegar")}>
          <Link2 aria-hidden />
          {pendente ? "Criando…" : "Criar o link para o cliente"}
        </Botao>
        <Aviso r={aviso} />
      </div>
    );
  }

  const textoWhats = `Olá! Seguem os finalistas para a vaga de ${vaga}, selecionados pela ${agencia}. Veja cada um e responda por aqui: ${url}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          readOnly
          value={url}
          aria-label="Endereço do link (para copiar)"
          onFocus={(e) => e.currentTarget.select()}
          className={`${classesEntrada} font-mono text-body-sm sm:flex-1`}
        />
        <div className="flex flex-wrap gap-2">
          <Botao tamanho="sm" onClick={copiar}>
            {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copiado ? "Copiado" : "Copiar"}
          </Botao>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(textoWhats)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-cerrado px-3.5 text-label text-on-cerrado hover:brightness-110"
          >
            <MessageCircle aria-hidden className="size-[18px]" />
            WhatsApp
          </a>
          <Link
            href={`/finalistas/${link.token}`}
            target="_blank"
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line-strong bg-surface-200 px-3.5 text-label hover:bg-surface-300"
          >
            <ExternalLink aria-hidden className="size-[18px]" />
            Ver como o cliente
          </Link>
        </div>
      </div>
      <p className={`text-body-sm ${vencido ? "font-semibold text-danger" : "text-ink-muted"}`}>
        {vencido
          ? `O link venceu em ${diaMes(link.expira_em)}: o cliente não consegue abrir.`
          : `Vale até ${diaMes(link.expira_em)}`}
        {aberto && !vencido && <span className="font-normal text-ink-muted"> · {aberto}</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Botao
          tamanho="sm"
          variante={vencido ? "secundario" : "fantasma"}
          disabled={pendente}
          onClick={() => mexer("renovar")}
        >
          <RefreshCw aria-hidden />
          Renovar por mais 30 dias
        </Botao>
        {trocando ? (
          <span className="flex flex-wrap items-center gap-2 text-body-sm">
            O link de agora para de abrir.
            <Botao tamanho="sm" variante="perigo" disabled={pendente} onClick={() => mexer("trocar")}>
              Trocar o link
            </Botao>
            <Botao tamanho="sm" variante="fantasma" onClick={() => setTrocando(false)}>
              Cancelar
            </Botao>
          </span>
        ) : (
          <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={() => setTrocando(true)}>
            Trocar o link
          </Botao>
        )}
      </div>
      <Aviso r={aviso} />
    </div>
  );
}

/** O parecer da agência sobre um finalista, que o cliente lê. */
export function ParecerDoFinalista({
  anuncioId,
  perfilId,
  nome,
  inicial,
  comIA,
}: {
  anuncioId: string;
  perfilId: string;
  nome: string;
  inicial: string | null;
  comIA: boolean;
}) {
  const [texto, setTexto] = useState(inicial ?? "");
  const [salvo, setSalvo] = useState(inicial ?? "");
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const id = `parecer-${perfilId}`;
  const mudou = texto.trim() !== salvo.trim();

  function salvar() {
    setAviso(null);
    iniciar(async () => {
      const r = await salvarParecer(anuncioId, perfilId, texto);
      if (r.ok) {
        setSalvo(texto.trim());
        setTexto(texto.trim());
      }
      setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Parecer salvo." } : { ok: false, texto: r.erro });
    });
  }

  function comecarComIA() {
    setAviso(null);
    iniciar(async () => {
      const r = await resumirCandidatoComIA(anuncioId, perfilId);
      if (!r.ok) {
        setAviso({ ok: false, texto: r.erro });
        return;
      }
      // só o resumo e os pontos fortes: o "para conferir" e as perguntas são da agência
      const fortes = r.resumo.fortes.length
        ? `\n\nPontos fortes:\n${r.resumo.fortes.map((f) => `- ${f}`).join("\n")}`
        : "";
      setTexto(`${r.resumo.resumo}${fortes}`.slice(0, LIMITES_FINALISTAS.parecer));
      setAviso({ ok: true, texto: "Feito pela IA: confira, ajuste e salve." });
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-label">
        Seu parecer para o cliente
      </label>
      <textarea
        id={id}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={4}
        maxLength={LIMITES_FINALISTAS.parecer}
        placeholder={`Por que ${nome.split(" ")[0]} é um bom nome para a vaga: experiência, como foi a conversa, disponibilidade…`}
        className={`${classesEntrada} resize-y`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Botao tamanho="sm" disabled={pendente || !mudou} onClick={salvar}>
          {pendente ? "Salvando…" : "Salvar parecer"}
        </Botao>
        {comIA && (
          <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={comecarComIA}>
            <Sparkles aria-hidden />
            {texto.trim() ? "Refazer com a IA" : "Começar com a IA"}
          </Botao>
        )}
        <span className="ml-auto text-caption text-ink-muted">
          {texto.length}/{LIMITES_FINALISTAS.parecer}
        </span>
      </div>
      {mudou && !pendente && (
        <p className="text-caption text-ink-muted">Ainda não salvo: o cliente vê o último parecer salvo.</p>
      )}
      <Aviso r={aviso} />
    </div>
  );
}

export function TirarFinalista({ anuncioId, perfilId, nome }: { anuncioId: string; perfilId: string; nome: string }) {
  const [pendente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!confirmando) {
    return (
      <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmando(true)}>
        <Trash2 aria-hidden />
        Tirar da lista
      </Botao>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-body-sm">
      {nome.split(" ")[0]} some da página do cliente, com a resposta dele.
      <Botao
        tamanho="sm"
        variante="perigo"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await tirarFinalista(anuncioId, perfilId);
            if (!r.ok) setErro(r.erro);
          })
        }
      >
        Tirar
      </Botao>
      <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmando(false)}>
        Cancelar
      </Botao>
      {erro && (
        <span role="alert" className="text-danger">
          {erro}
        </span>
      )}
    </span>
  );
}

/** Quem deu match e ainda não está na lista: marcar e pôr. */
export function AdicionarFinalistas({
  anuncioId,
  candidatos,
}: {
  anuncioId: string;
  candidatos: { perfil_id: string; nome: string; foto: string | null; detalhe: string }[];
}) {
  const [marcados, setMarcados] = useState<string[]>([]);
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const alternar = (id: string) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
        {candidatos.map((c) => (
          <li key={c.perfil_id}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={marcados.includes(c.perfil_id)}
                onChange={() => alternar(c.perfil_id)}
                className="size-5 shrink-0 accent-[var(--pk-ink)]"
              />
              <Avatar nome={c.nome} foto={c.foto} tamanho={32} />
              <span className="min-w-0 flex-1">
                <span className="block text-label break-words">{c.nome}</span>
                <span className="block text-caption text-ink-muted">{c.detalhe}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Botao
          disabled={pendente || marcados.length === 0}
          onClick={() =>
            iniciar(async () => {
              setAviso(null);
              const r = await adicionarFinalistas(anuncioId, marcados);
              setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Pronto." } : { ok: false, texto: r.erro });
              if (r.ok) setMarcados([]);
            })
          }
        >
          <UserPlus aria-hidden />
          {pendente ? "Pondo na lista…" : marcados.length > 1 ? `Pôr ${marcados.length} na lista` : "Pôr na lista"}
        </Botao>
        <span className="text-body-sm text-ink-muted">Cada um recebe um aviso: o currículo foi para a empresa.</span>
      </div>
      <Aviso r={aviso} />
    </div>
  );
}
