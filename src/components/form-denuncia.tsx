"use client";

import Link from "next/link";
import { useActionState } from "react";
import { denunciarAnuncio } from "@/lib/acoes/moderacao";
import { MOTIVOS_DENUNCIA } from "@/lib/constantes";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { classesEntrada, MensagemErro } from "./ui/campo";

export function FormDenuncia({ anuncioId }: { anuncioId: string }) {
  const [estado, acao, enviando] = useActionState(denunciarAnuncio, { ok: false } as EstadoForm);

  if (estado.ok) {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tipo="sucesso" titulo={estado.mensagem}>
          Se mais pessoas denunciarem, o anúncio sai do ar até a moderação analisar.
        </Aviso>
        <Link href={`/anuncio/${anuncioId}`} className="text-label text-terra-text underline">
          Voltar para o anúncio
        </Link>
      </div>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-6">
      <input type="hidden" name="anuncio_id" value={anuncioId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label">O que está errado?</legend>
        {MOTIVOS_DENUNCIA.map((m) => (
          <label
            key={m.valor}
            className="flex cursor-pointer gap-3 rounded-md border border-line bg-surface-200 p-4 has-[:checked]:border-danger has-[:checked]:bg-surface-300"
          >
            <input type="radio" name="motivo" value={m.valor} required className="mt-1 size-4 accent-[var(--pk-danger)]" />
            <span>
              <span className="block text-label">{m.nome}</span>
              <span className="block text-body-sm text-ink-muted">{m.ajuda}</span>
            </span>
          </label>
        ))}
        {estado.erros?.motivo && <MensagemErro>{estado.erros.motivo}</MensagemErro>}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="detalhes" className="text-label">
          Detalhes <span className="font-normal text-ink-muted">(opcional)</span>
        </label>
        <textarea
          id="detalhes"
          name="detalhes"
          rows={4}
          maxLength={1000}
          placeholder="Conte o que aconteceu. Ex.: pediram R$ 80 pelo uniforme antes da entrevista."
          className={`${classesEntrada} resize-y`}
        />
      </div>

      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      <div className="flex flex-wrap gap-3">
        <Botao type="submit" variante="perigo" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar denúncia"}
        </Botao>
        <Link href={`/anuncio/${anuncioId}`} className="inline-flex min-h-11 items-center px-2 text-label text-ink-muted">
          Cancelar
        </Link>
      </div>
      <p className="text-body-sm text-ink-muted">
        A denúncia é anônima para quem publicou. Três denúncias de pessoas diferentes tiram o anúncio do ar até a
        moderação olhar.
      </p>
    </form>
  );
}
