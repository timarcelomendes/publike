"use client";

import { Heart, HeartCrack } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { curtirDeNovo, desfazerMatch } from "@/lib/acoes/curtidas";
import { MOTIVOS_DESFAZER } from "@/lib/constantes";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { classesEntrada, MensagemErro } from "./ui/campo";

const ESTADO_INICIAL: EstadoForm = { ok: false };

/**
 * "Desfazer match": abre ali mesmo um formulário com o motivo e a
 * justificativa (as duas obrigatórias). `perfilId` é sempre quem curtiu.
 */
export function DesfazerMatch({
  anuncioId,
  perfilId,
  outroNome,
  autorDaVaga = false,
  claro = false,
}: {
  anuncioId: string;
  perfilId: string;
  outroNome: string;
  /** quem desfaz é quem publicou uma vaga (libera o motivo "vaga preenchida") */
  autorDaVaga?: boolean;
  /** sobre fundo colorido (quadro do match): botão claro */
  claro?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao, enviando] = useActionState(desfazerMatch, ESTADO_INICIAL);
  const [motivo, setMotivo] = useState("");
  const [texto, setTexto] = useState("");
  const [futuro, setFuturo] = useState("");
  const id = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const erros = estado.erros ?? {};
  const primeiroNome = outroNome.split(" ")[0];
  const motivos = MOTIVOS_DESFAZER.filter((m) => !("soAutorVaga" in m) || autorDaVaga);

  useEffect(() => {
    if (aberto) caixa.current?.querySelector<HTMLInputElement>("input[type=radio]")?.focus();
  }, [aberto]);

  if (estado.ok) {
    return <Aviso tipo="sucesso">{estado.mensagem}</Aviso>;
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={`inline-flex min-h-11 items-center gap-2 self-start rounded-md px-3 text-label underline-offset-2 hover:underline ${
          claro ? "text-on-cerrado" : "text-ink-muted hover:text-ink"
        }`}
      >
        <HeartCrack aria-hidden className="size-4" />
        Desfazer match
      </button>
    );
  }

  return (
    <div ref={caixa} className="flex flex-col gap-4 rounded-md border border-line-strong bg-surface-200 p-4 text-ink">
      <div>
        <p className="text-label">Desfazer o match com {primeiroNome}?</p>
        <p className="mt-1 text-body-sm text-ink-muted">
          O WhatsApp de vocês some para os dois na hora. {primeiroNome} recebe um aviso com o motivo.
        </p>
      </div>
      <form action={acao} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="anuncio" value={anuncioId} />
        <input type="hidden" name="perfil" value={perfilId} />
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-2 text-label">Motivo</legend>
          {motivos.map((m) => (
            <label key={m.valor} className="flex min-h-10 cursor-pointer items-center gap-3 text-body-sm">
              <input
                type="radio"
                name="motivo"
                value={m.valor}
                checked={motivo === m.valor}
                onChange={() => setMotivo(m.valor)}
                className="size-5 shrink-0 accent-[var(--pk-ink)]"
              />
              {m.nome}
            </label>
          ))}
          {erros.motivo && <MensagemErro>{erros.motivo}</MensagemErro>}
        </fieldset>
        {motivo === "comportamento" && (
          <Aviso tipo="alerta">
            A equipe do Publike vai olhar a conta de {primeiroNome}. Se teve ameaça, golpe ou pedido de dinheiro, conte
            na justificativa. Em caso de perigo, ligue 190.
          </Aviso>
        )}
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-2 text-label">Toparia fazer negócio com {primeiroNome} em outro momento?</legend>
          {[
            { valor: "sim", nome: "Sim", ajuda: "Vocês podem dar match de novo neste anúncio mais para frente." },
            {
              valor: "nao",
              nome: "Não",
              ajuda: "Vocês não conseguem mais curtir os anúncios um do outro.",
            },
          ].map((o) => (
            <label key={o.valor} className="flex min-h-10 cursor-pointer items-start gap-3 py-1 text-body-sm">
              <input
                type="radio"
                name="futuro"
                value={o.valor}
                checked={futuro === o.valor}
                onChange={() => setFuturo(o.valor)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
              />
              <span>
                <span className="block text-label">{o.nome}</span>
                <span className="block text-ink-muted">{o.ajuda}</span>
              </span>
            </label>
          ))}
          {erros.futuro && <MensagemErro>{erros.futuro}</MensagemErro>}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-just`} className="text-label">
            Justificativa
          </label>
          <textarea
            id={`${id}-just`}
            name="justificativa"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            maxLength={500}
            aria-invalid={erros.justificativa ? true : undefined}
            aria-describedby={`${id}-ajuda`}
            placeholder="Conte em poucas palavras o que aconteceu."
            className={`${classesEntrada} resize-y`}
          />
          <p id={`${id}-ajuda`} className="flex justify-between gap-3 text-body-sm text-ink-muted">
            <span>Só a equipe do Publike lê. {primeiroNome} vê apenas o motivo.</span>
            <span className="shrink-0">{texto.length}/500</span>
          </p>
          {erros.justificativa && <MensagemErro>{erros.justificativa}</MensagemErro>}
        </div>
        {estado.erro && !erros.motivo && !erros.justificativa && !erros.futuro && (
          <Aviso tipo="erro">{estado.erro}</Aviso>
        )}
        <div className="flex flex-wrap gap-2">
          <Botao type="submit" variante="perigo" disabled={enviando}>
            {enviando ? "Desfazendo…" : "Desfazer match"}
          </Botao>
          <Botao variante="fantasma" onClick={() => setAberto(false)} disabled={enviando}>
            Cancelar
          </Botao>
        </div>
      </form>
    </div>
  );
}

/** Match desfeito com "topo negociar depois": quem curtiu pode curtir de novo. */
export function CurtirDeNovo({ anuncioId }: { anuncioId: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  if (ok) return <Aviso tipo="sucesso">{ok}</Aviso>;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await curtirDeNovo(anuncioId);
            if (r.ok) setOk(r.mensagem ?? "Pronto!");
            else setErro(r.erro);
          })
        }
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-pill border border-line-strong bg-surface-200 px-4 text-label text-ink transition-colors hover:bg-like-soft hover:text-like-text disabled:opacity-60"
      >
        <Heart aria-hidden className="size-[18px] text-like" />
        {pendente ? "Enviando…" : "Curtir de novo"}
      </button>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </div>
  );
}
