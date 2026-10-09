"use client";

import { BadgeCheck, Ban, KeyRound, RotateCcw, ShieldOff, Trash2, UserMinus } from "lucide-react";
import { useState } from "react";
import {
  acertarLogin,
  excluirContaPeloAdmin,
  mudarVerificado,
  reativarConta,
  removerModerador,
  suspenderConta,
} from "@/lib/acoes/admin";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

type Prazo = "7" | "30" | "sempre";

const PRAZOS: { valor: Prazo; nome: string; ajuda: string }[] = [
  { valor: "7", nome: "7 dias", ajuda: "Primeiro aviso" },
  { valor: "30", nome: "30 dias", ajuda: "Reincidência" },
  { valor: "sempre", nome: "Para sempre", ajuda: "Golpe ou abuso grave" },
];

/** Suspender ou banir (quando a conta está ativa). */
export function SuspenderConta({ usuarioId, moderador }: { usuarioId: string; moderador: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [prazo, setPrazo] = useState<Prazo>("7");
  const [motivo, setMotivo] = useState("");

  if (moderador) {
    return <TirarDaModeracao usuarioId={usuarioId} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label">Por quanto tempo</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {PRAZOS.map((p) => (
            <label
              key={p.valor}
              className="flex cursor-pointer flex-col rounded-md border border-line-strong bg-surface-200 px-3 py-2.5 transition-colors has-[:checked]:border-ink has-[:checked]:bg-surface-300 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
            >
              <input
                type="radio"
                name="prazo"
                value={p.valor}
                checked={prazo === p.valor}
                onChange={() => setPrazo(p.valor)}
                className="sr-only"
              />
              <span className="text-label">{p.nome}</span>
              <span className="text-body-sm text-ink-muted">{p.ajuda}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="motivo-suspensao" className="text-label">
          Motivo <span className="font-normal text-ink-muted">(a pessoa recebe por e-mail)</span>
        </label>
        <textarea
          id="motivo-suspensao"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Ex.: o anúncio cobrava taxa de cadastro de quem procura trabalho."
          className={`${classesEntrada} resize-y`}
        />
      </div>
      <div className="flex flex-col items-start gap-2">
        <Botao
          variante="perigo"
          disabled={pendente || motivo.trim().length < 3}
          onClick={() => rodar(() => suspenderConta(usuarioId, prazo, motivo))}
        >
          <Ban aria-hidden />
          {pendente ? "Aplicando…" : prazo === "sempre" ? "Banir de vez" : `Suspender por ${prazo} dias`}
        </Botao>
        {mensagem}
      </div>
    </div>
  );
}

export function ReativarConta({ usuarioId }: { usuarioId: string }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-2">
      <Botao disabled={pendente} onClick={() => rodar(() => reativarConta(usuarioId))}>
        <RotateCcw aria-hidden />
        {pendente ? "Reativando…" : "Reativar conta agora"}
      </Botao>
      {mensagem}
    </div>
  );
}

/** Quando o login (Supabase Auth) ficou diferente da suspensão. */
export function AcertarLogin({ usuarioId, bloquear }: { usuarioId: string; bloquear: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="mt-2 flex flex-col items-start gap-2">
      <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(() => acertarLogin(usuarioId))}>
        <KeyRound aria-hidden />
        {pendente ? "Acertando…" : bloquear ? "Bloquear o login agora" : "Liberar o login agora"}
      </Botao>
      {mensagem}
    </div>
  );
}

export function TirarDaModeracao({ usuarioId, curto = false }: { usuarioId: string; curto?: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-2">
      {!curto && (
        <p className="text-body-sm text-ink-muted">
          Essa pessoa é moderadora. Para suspender a conta, tire ela da moderação antes.
        </p>
      )}
      <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(() => removerModerador(usuarioId))}>
        <UserMinus aria-hidden />
        Tirar da moderação
      </Botao>
      {mensagem}
    </div>
  );
}

export function SeloVerificado({ usuarioId, verificado }: { usuarioId: string; verificado: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-2">
      <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(() => mudarVerificado(usuarioId, !verificado))}>
        {verificado ? <ShieldOff aria-hidden /> : <BadgeCheck aria-hidden />}
        {verificado ? "Tirar o selo de verificado" : "Dar o selo de verificado"}
      </Botao>
      {mensagem}
    </div>
  );
}

export function ExcluirContaAdmin({ usuarioId, nome }: { usuarioId: string; nome: string }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [motivo, setMotivo] = useState("");
  const [certeza, setCerteza] = useState(false);
  return (
    <details className="group rounded-md border border-line px-4 py-3">
      <summary className="cursor-pointer text-label text-ink-muted marker:text-ink-muted">Apagar a conta</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-body-sm text-ink-muted">
          Apaga a conta de {nome} com perfil, anúncios, curtidas e matches. Use para pedidos de exclusão (LGPD). Para
          golpe, prefira banir: assim o histórico fica.
        </p>
        <label htmlFor="motivo-exclusao" className="text-label">
          Motivo <span className="font-normal text-ink-muted">(fica no registro da equipe)</span>
        </label>
        <input
          id="motivo-exclusao"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={300}
          placeholder="Ex.: pedido de exclusão por e-mail em 08/10"
          className={classesEntrada}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-body-sm">
          <input
            type="checkbox"
            checked={certeza}
            onChange={(e) => setCerteza(e.target.checked)}
            className="size-5 accent-[var(--pk-danger)]"
          />
          Entendo que isso não tem volta.
        </label>
        <div className="flex flex-col items-start gap-2">
          <Botao
            variante="perigo"
            tamanho="sm"
            disabled={pendente || !certeza || motivo.trim().length < 3}
            onClick={() => rodar(() => excluirContaPeloAdmin(usuarioId, motivo))}
          >
            <Trash2 aria-hidden />
            {pendente ? "Apagando…" : "Apagar a conta de vez"}
          </Botao>
          {mensagem}
        </div>
      </div>
    </details>
  );
}
