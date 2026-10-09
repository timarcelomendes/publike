"use client";

import { Star } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { avaliarServico } from "@/lib/acoes/avaliacoes";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { classesEntrada, MensagemErro } from "./ui/campo";

const ROTULOS = ["", "Ruim", "Fraco", "Bom", "Muito bom", "Excelente"];

/** Estrelas de 1 a 5 (rádios) e comentário opcional. */
export function FormAvaliacao({
  anuncioId,
  perfilProfissional,
  inicial,
}: {
  anuncioId: string;
  /** link do perfil, para ver a avaliação publicada */
  perfilProfissional: string;
  inicial: { nota: number; comentario: string | null } | null;
}) {
  const [estado, acao, enviando] = useActionState(avaliarServico, { ok: false } as EstadoForm);
  const [nota, setNota] = useState(inicial?.nota ?? 0);
  const [passando, setPassando] = useState(0);
  const [comentario, setComentario] = useState(inicial?.comentario ?? "");
  const erros = estado.erros ?? {};
  const mostrada = passando || nota;

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    startTransition(() => acao(dados));
  }

  if (estado.ok) {
    return (
      <Aviso tipo="sucesso" titulo="Avaliação enviada">
        <p>{estado.mensagem}</p>
        <p className="mt-2">
          <Link href={perfilProfissional} className="underline">
            Ver o perfil do profissional
          </Link>
        </p>
      </Aviso>
    );
  }

  return (
    <form
      onSubmit={enviar}
      noValidate
      className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:p-6"
    >
      <input type="hidden" name="anuncio_id" value={anuncioId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label">Sua nota</legend>
        <div className="flex flex-wrap items-center gap-1" onMouseLeave={() => setPassando(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              onMouseEnter={() => setPassando(n)}
              className="flex size-12 cursor-pointer items-center justify-center rounded-pill has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
            >
              <input
                type="radio"
                name="nota"
                value={n}
                checked={nota === n}
                onChange={() => setNota(n)}
                className="sr-only"
              />
              <Star
                aria-hidden
                className={`size-9 transition-colors ${n <= mostrada ? "text-ipe" : "text-line-strong"}`}
                fill="currentColor"
                strokeWidth={0}
              />
              <span className="sr-only">
                {n} {n === 1 ? "estrela" : "estrelas"}: {ROTULOS[n]}
              </span>
            </label>
          ))}
          <span className="w-full text-label text-ink-muted sm:ml-2 sm:w-auto sm:min-w-24" aria-hidden>
            {ROTULOS[mostrada]}
          </span>
        </div>
        {erros.nota && <MensagemErro>{erros.nota}</MensagemErro>}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="comentario" className="text-label">
          Como foi? <span className="font-normal text-ink-muted">(opcional)</span>
        </label>
        <textarea
          id="comentario"
          name="comentario"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={4}
          maxLength={600}
          aria-invalid={erros.comentario ? true : undefined}
          placeholder="Ex.: Chegou no horário, explicou o que ia fazer e deixou tudo limpo."
          className={`${classesEntrada} resize-y`}
        />
        {erros.comentario ? (
          <MensagemErro>{erros.comentario}</MensagemErro>
        ) : (
          <p className="flex justify-between gap-3 text-body-sm text-ink-muted">
            <span>Pode criticar, com respeito. Ofensa, ameaça ou dados pessoais não são publicados.</span>
            <span>{comentario.length}/600</span>
          </p>
        )}
      </div>

      {estado.erro && !estado.erros && <Aviso tipo="erro">{estado.erro}</Aviso>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Botao type="submit" variante="primario" disabled={enviando || nota === 0} className="sm:min-w-48">
          {enviando ? "Enviando…" : inicial ? "Salvar avaliação" : "Enviar avaliação"}
        </Botao>
        <p className="text-body-sm text-ink-muted">
          Aparece no perfil com o seu primeiro nome. Ao enviar, você concorda com as{" "}
          <Link href="/privacidade#regras" className="underline">
            regras do Publike
          </Link>
          .
        </p>
      </div>
    </form>
  );
}
