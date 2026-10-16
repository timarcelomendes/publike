"use client";

import { Mail, MailCheck } from "lucide-react";
import { startTransition, useActionState, type FormEvent } from "react";
import { reenviarTrocaDeEmail, trocarEmailDeLogin } from "@/lib/acoes/email-login";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { Campo, classesEntrada, ligarCampo } from "./ui/campo";
import { useAcao } from "./ui/usar-acao";

/**
 * O e-mail com que a pessoa entra no Publike, e como trocar. A troca só vale
 * depois do link no e-mail novo (e no atual, com a troca segura do Supabase).
 */
export function TrocarEmail({
  atual,
  pendente,
  confirmado,
}: {
  atual: string | null;
  /** e-mail novo esperando a confirmação */
  pendente: string | null;
  /** voltou do link de confirmação */
  confirmado: boolean;
}) {
  const [estado, acao, enviando] = useActionState(trocarEmailDeLogin, { ok: false } as EstadoForm);
  const reenviar = useAcao();
  const erros = estado.erros ?? {};

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    startTransition(() => acao(dados));
  }

  return (
    <section
      id="email-login"
      aria-labelledby="email-login-titulo"
      className="mt-8 flex scroll-mt-24 flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card"
    >
      <div className="flex items-start gap-3">
        <Mail aria-hidden className="mt-0.5 size-6 shrink-0 text-terra-text" />
        <div className="min-w-0">
          <h2 id="email-login-titulo" className="text-h3">
            E-mail de login
          </h2>
          <p className="mt-1 text-body-sm text-ink-muted">
            {atual ? (
              <>
                Você entra com <strong className="break-all text-ink">{atual}</strong>. É para ele que vão o link de
                entrar e os avisos do Publike.
              </>
            ) : (
              "Hoje você entra pelo celular. Com um e-mail, dá para entrar por ele também e receber os avisos."
            )}
          </p>
        </div>
      </div>

      {confirmado && !pendente && (
        <Aviso tipo="sucesso" titulo="E-mail confirmado.">
          A partir de agora, você entra com {atual}. Se quiser, troque também o e-mail de contato, lá em cima.
        </Aviso>
      )}

      {pendente && (
        <Aviso tipo="alerta" titulo="Falta confirmar a troca">
          <p>
            Abra o link que mandamos para <strong className="break-all">{pendente}</strong>
            {atual ? <> e o que mandamos para {atual}</> : null}. Até lá, você continua entrando com{" "}
            {atual ?? "o celular"}.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Botao
              tamanho="sm"
              disabled={reenviar.pendente}
              onClick={() => reenviar.rodar(() => reenviarTrocaDeEmail(pendente))}
            >
              <MailCheck aria-hidden />
              {reenviar.pendente ? "Mandando…" : "Mandar o link de novo"}
            </Botao>
            {reenviar.mensagem}
          </div>
        </Aviso>
      )}

      <form onSubmit={enviar} noValidate className="flex flex-col gap-3">
        <Campo
          rotulo={atual ? "Novo e-mail de login" : "E-mail para entrar"}
          nome="novo_email"
          erro={erros.novo_email}
          ajuda="Mandamos um link para confirmar. O e-mail só muda depois que você abrir."
        >
          <input
            {...ligarCampo("novo_email", erros.novo_email, true)}
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={200}
            required
            placeholder="seu@email.com"
            className={classesEntrada}
          />
        </Campo>
        {estado.ok && estado.mensagem && <Aviso tipo="sucesso">{estado.mensagem}</Aviso>}
        {estado.erro && !erros.novo_email && <Aviso tipo="erro">{estado.erro}</Aviso>}
        <Botao type="submit" disabled={enviando} className="self-start">
          {enviando ? "Mandando o link…" : atual ? "Trocar e-mail" : "Usar este e-mail"}
        </Botao>
      </form>
    </section>
  );
}
