"use client";

import { Mail, Send, X } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { DicaDeNovidade, usarDica } from "@/components/ui/dica-de-novidade";
import { Botao, classesBotao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import { useAcao } from "@/components/ui/usar-acao";
import { indicarPorEmail } from "@/lib/acoes/indicacao-email";
import { pedirEntrar } from "../folha-de-entrar";

// "Mandar por e-mail" no quadro "Conhece quem faria essa vaga?" (claude/plano-comentarios-e-indicar-por-email.md,
// parte 1): o e-mail do amigo e o nome (opcional). Sem recado livre. Quem não entrou vai entrar e volta para cá.

/** O formulário do "Mandar por e-mail" (na vaga, no quadro e na janela; no cartão do feed, na janela). */
export function FormIndicarEmail({ anuncioId }: { anuncioId: string }) {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [enviado, setEnviado] = useState<string | null>(null);
  const { rodar, pendente, mensagem } = useAcao();

  function mandar(e: FormEvent) {
    e.preventDefault();
    rodar(
      () => indicarPorEmail(anuncioId, email, nome),
      (r) => {
        if (!r.ok) return;
        setEnviado(r.mensagem ?? "Pronto, mandamos a vaga.");
        setEmail("");
        setNome("");
        usarDica("indicar-email");
      },
    );
  }

  if (enviado) {
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="text-body-sm text-cerrado-text">
          {enviado}
        </p>
        <p className="text-body-sm text-ink-muted">Se a pessoa ainda não tiver conta, ela cria em um toque pelo link do e-mail.</p>
        <Botao variante="secundario" tamanho="sm" className="self-start" onClick={() => setEnviado(null)}>
          Indicar outra pessoa
        </Botao>
      </div>
    );
  }
  return (
    <form onSubmit={mandar} className="flex flex-col gap-3" noValidate>
      <label className="flex flex-col gap-1">
        <span className="text-label">E-mail do seu amigo</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="off"
          required
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={classesEntrada}
          placeholder="nome@gmail.com"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label">
          Nome dele <span className="font-normal text-ink-muted">(opcional)</span>
        </span>
        <input
          type="text"
          autoComplete="off"
          maxLength={60}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className={classesEntrada}
          placeholder="Para o e-mail começar com “Oi, Ana”"
        />
      </label>
      <p className="text-body-sm text-ink-muted">
        Mandamos a vaga em seu nome, sem recado. A pessoa pode parar de receber indicações com um toque.
      </p>
      <Botao type="submit" tamanho="sm" className="self-start" disabled={pendente}>
        {pendente ? "Mandando…" : "Mandar indicação"}
      </Botao>
      {mensagem}
    </form>
  );
}

/**
 * "Indicar" com a janela do formulário: no cartão das listas (só o ícone, ao lado de Salvar e Curtir), embaixo da
 * vaga na linha do tempo (ao lado dos comentários) e no alto da página da vaga (o botão com o texto). Quem não
 * entrou vê a folha de entrar e volta para a vaga.
 */
export function IndicarNaJanela({
  anuncioId,
  titulo,
  logado,
  jeito = "icone",
}: {
  anuncioId: string;
  titulo: string;
  logado: boolean;
  /** "barra": o botão baixo com o texto, na barra dos comentários embaixo da vaga no feed */
  jeito?: "icone" | "pequeno" | "botao" | "barra";
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const comTexto = jeito === "botao" || jeito === "barra";
  const classes =
    jeito === "barra"
      ? "relative z-10 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-pill border border-line-strong bg-surface-200 px-3 text-label text-ink transition-colors hover:bg-surface-300"
      : jeito === "botao"
      ? "inline-flex min-h-10 items-center gap-1.5 rounded-pill border border-line-strong bg-surface-200 px-3.5 text-label text-ink transition-colors hover:bg-surface-300"
      : `relative z-10 inline-flex shrink-0 items-center justify-center rounded-pill border border-line-strong bg-surface-200 text-ink transition-colors hover:bg-surface-300 ${
          jeito === "pequeno" ? "size-9" : "size-11"
        }`;
  const conteudo = (
    <>
      <Send aria-hidden className="size-[18px] shrink-0" />
      {jeito === "botao" && "Indicar a um amigo"}
      {jeito === "barra" && "Indicar"}
    </>
  );
  if (!logado) {
    const proximo = `/anuncio/${anuncioId}#indicar`;
    return (
      <Link
        href={`/entrar?next=${encodeURIComponent(proximo)}`}
        // a folha de entrar sobe por cima da página (sem a folha, segue para o /entrar)
        onClick={(e) => {
          if (pedirEntrar({ proximo })) e.preventDefault();
        }}
        className={classes}
        aria-label={!comTexto || jeito === "barra" ? "Indicar a vaga a um amigo por e-mail" : undefined}
        title={!comTexto ? "Indicar a um amigo" : undefined}
      >
        {conteudo}
      </Link>
    );
  }
  return (
    <>
      <button
        type="button"
        className={classes}
        aria-label={!comTexto || jeito === "barra" ? "Indicar a vaga a um amigo por e-mail" : undefined}
        title={!comTexto ? "Indicar a um amigo" : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          janela.current?.showModal();
        }}
      >
        {conteudo}
      </button>
      <dialog
        ref={janela}
        aria-label="Indicar a vaga por e-mail"
        className="m-auto w-[min(100%-2rem,28rem)] rounded-lg border border-line bg-surface-100 p-0 text-ink shadow-raised backdrop:bg-ink/40"
        onClick={(e) => {
          // tocar fora fecha
          if (e.target === janela.current) janela.current?.close();
        }}
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-h3">Indicar a um amigo</h2>
              <p className="mt-1 text-body-sm break-words text-ink-muted">{titulo}</p>
            </div>
            <button
              type="button"
              onClick={() => janela.current?.close()}
              aria-label="Fechar"
              className="inline-grid size-10 shrink-0 place-items-center rounded-pill hover:bg-surface-300"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <FormIndicarEmail anuncioId={anuncioId} />
        </div>
      </dialog>
    </>
  );
}

export function IndicarPorEmail({ anuncioId, logado }: { anuncioId: string; logado: boolean }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();

  const botao = logado ? (
    <Botao
      variante="secundario"
      tamanho="sm"
      onClick={() => setAberto((a) => !a)}
      aria-expanded={aberto}
      aria-controls={`${id}-form`}
    >
      <Mail aria-hidden />
      Mandar por e-mail
    </Botao>
  ) : (
    <Link href={`/entrar?next=${encodeURIComponent(`/anuncio/${anuncioId}#indicar`)}`} className={classesBotao("secundario", "sm")}>
      <Mail aria-hidden />
      Mandar por e-mail
    </Link>
  );

  return (
    <div className="flex w-full flex-col gap-2">
      <DicaDeNovidade chave="indicar-email" logado={logado}>
        <div>{botao}</div>
      </DicaDeNovidade>
      {aberto && (
        <div id={`${id}-form`} className="rounded-md border border-line bg-surface-100 p-3">
          <FormIndicarEmail anuncioId={anuncioId} />
        </div>
      )}
    </div>
  );
}
