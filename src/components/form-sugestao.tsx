"use client";

import { Bug, Heart, Lightbulb, Send, Sparkles, type LucideIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { enviarSugestao } from "@/lib/acoes/sugestoes";
import { TIPOS_SUGESTAO, type TipoSugestao } from "@/lib/sugestoes";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { Campo, classesEntrada, ligarCampo, MensagemErro } from "./ui/campo";

const ICONES: Record<TipoSugestao, LucideIcon> = { erro: Bug, sugestao: Lightbulb, melhoria: Sparkles, elogio: Heart };
const INICIAL: EstadoForm = { ok: false };

/** Erro, sugestão, elogio ou melhoria. Sem conta, pede um e-mail (opcional) para a resposta. */
export function FormSugestao({
  tipoInicial,
  pagina,
  logado,
}: {
  tipoInicial: TipoSugestao | null;
  /** página de onde a pessoa veio (vai junto, para a equipe achar o problema) */
  pagina: string | null;
  logado: boolean;
}) {
  const [estado, acao, enviando] = useActionState(enviarSugestao, INICIAL);
  const [tipo, setTipo] = useState<TipoSugestao | null>(tipoInicial);
  const [texto, setTexto] = useState("");
  const erros = estado.erros ?? {};
  const escolhido = TIPOS_SUGESTAO.find((t) => t.valor === tipo);

  if (estado.ok) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Aviso tipo="sucesso" titulo={estado.mensagem ?? "Recebemos!"}>
          A equipe do Publike lê tudo o que chega. {logado ? "Se precisar, respondemos no e-mail da sua conta." : ""}
        </Aviso>
        <Botao
          onClick={() => {
            // começa de novo (o estado da ação volta ao começo ao recarregar)
            window.location.reload();
          }}
        >
          Mandar outra mensagem
        </Botao>
      </div>
    );
  }

  return (
    <form action={acao} className="flex flex-col gap-5">
      {pagina && <input type="hidden" name="pagina" value={pagina} />}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label">O que você quer mandar?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIPOS_SUGESTAO.map((t) => {
            const Icone = ICONES[t.valor];
            return (
              <label
                key={t.valor}
                className="flex cursor-pointer flex-col gap-1 rounded-md border border-line-strong bg-surface-200 p-3 has-[:checked]:border-ink has-[:checked]:bg-surface-300 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
              >
                <input
                  type="radio"
                  name="tipo"
                  value={t.valor}
                  checked={tipo === t.valor}
                  onChange={() => setTipo(t.valor)}
                  className="sr-only"
                />
                <Icone aria-hidden className="size-5 text-terra-text" />
                <span className="text-label">{t.nome}</span>
                <span className="text-body-sm text-ink-muted">{t.ajuda}</span>
              </label>
            );
          })}
        </div>
        {erros.tipo && <MensagemErro>{erros.tipo}</MensagemErro>}
      </fieldset>

      <Campo
        rotulo="Conte para a gente"
        nome="texto"
        erro={erros.texto}
        ajuda={`${escolhido?.exemplo ?? "Escreva com suas palavras."} Não coloque senha, documento ou dados de cartão.`}
      >
        <textarea
          {...ligarCampo("texto", erros.texto)}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={6}
          maxLength={2000}
          required
          className={`${classesEntrada} resize-y`}
        />
      </Campo>
      <p className="-mt-3 self-end text-body-sm text-ink-muted" aria-live="polite">
        {texto.length}/2000
      </p>

      {!logado && (
        <Campo
          rotulo="Seu e-mail"
          nome="email"
          opcional
          erro={erros.email}
          ajuda="Só se quiser resposta. Você não precisa ter conta para mandar."
        >
          <input
            {...ligarCampo("email", erros.email, true)}
            type="email"
            autoComplete="email"
            maxLength={200}
            className={classesEntrada}
          />
        </Campo>
      )}

      {estado.erro && !Object.keys(erros).length && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <div>
        <Botao type="submit" variante="primario" disabled={enviando}>
          <Send aria-hidden />
          {enviando ? "Enviando…" : "Enviar"}
        </Botao>
      </div>
    </form>
  );
}
