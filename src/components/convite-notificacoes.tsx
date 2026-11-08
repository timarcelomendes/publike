"use client";

import { BellRing, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNotificacoesCelular } from "./notificacoes-celular";
import { Botao } from "./ui/botao";

// Convite para ativar as notificações no celular, no momento em que elas fazem falta: logo depois de
// curtir uma vaga ("saiba na hora se aceitarem") e no topo do painel. Só aparece para quem ainda não
// ligou neste aparelho e não bloqueou. "Agora não" guarda no navegador: volta em 7 dias, até 3 vezes.

const CHAVE = "publike_convite_push";
const DIAS = 7;
const VEZES = 3;

function lerDispensa(): { vezes: number; em: number } {
  try {
    const [v, t] = (localStorage.getItem(CHAVE) ?? "").split("~").map(Number);
    return { vezes: v || 0, em: t || 0 };
  } catch {
    return { vezes: 0, em: 0 };
  }
}

function dispensado() {
  const { vezes, em } = lerDispensa();
  return vezes >= VEZES || Date.now() - em < DIAS * 86_400_000;
}

function dispensar() {
  try {
    localStorage.setItem(CHAVE, `${lerDispensa().vezes + 1}~${Date.now()}`);
  } catch {
    // sem o navegador guardar, o convite só volta na próxima visita
  }
}

/** A chave pública das notificações: vem da página ou do próprio site (/api/notificacoes). */
function useChave(vapid?: string | null) {
  const [chave, setChave] = useState<string | null>(vapid ?? null);
  useEffect(() => {
    if (vapid !== undefined) return;
    let vivo = true;
    fetch("/api/notificacoes")
      .then((r) => r.json())
      .then((d: { chave?: string | null }) => vivo && setChave(d.chave ?? null))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [vapid]);
  return vapid ?? chave;
}

export function ConviteNotificacoes({
  vapid,
  titulo,
  texto,
  jeito = "cartao",
}: {
  /** a chave pública; sem ela (undefined), o convite pergunta ao site */
  vapid?: string | null;
  titulo: string;
  texto: string;
  /** "balao": dentro do balão de depois de curtir (compacto: o texto vai no botão); "cartao": no painel;
   *  "linha": uma linha no fim do menu do painel, no computador (o painel novo, 08/11/2026) */
  jeito?: "balao" | "cartao" | "linha";
}) {
  const chave = useChave(vapid);
  const { estado, ocupado, aviso, ativar } = useNotificacoesCelular(chave);
  // a dispensa fica no navegador; no servidor (e no primeiro desenho) o estado é "carregando" e nada aparece
  const [fechado, setFechado] = useState(() => typeof window === "undefined" || dispensado());

  // quem acabou de ativar vê o "Pronto" uma vez
  if (aviso?.ok) {
    return (
      <p role="status" className="flex items-center gap-2 text-body-sm text-cerrado-text">
        <BellRing aria-hidden className="size-4 shrink-0" />
        {aviso.texto}
      </p>
    );
  }
  const iphone = estado === "iphone";
  if (fechado || !(estado === "inativo" || (iphone && jeito === "cartao"))) return null;

  function agoraNao() {
    dispensar();
    setFechado(true);
  }

  if (jeito === "linha") {
    return (
      <div className="flex flex-col gap-1 border-t border-line px-3 pt-4">
        <p className="flex items-center gap-2.5 text-body-sm text-ink-muted">
          <BellRing aria-hidden className="size-[18px] shrink-0" />
          <span className="flex-1">{texto}</span>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => ativar()}
            className="min-h-9 font-bold text-terra-text underline-offset-2 hover:underline disabled:opacity-60"
          >
            {ocupado ? "Ativando…" : "Ativar"}
          </button>
        </p>
        {aviso && !aviso.ok && <p className="text-body-sm text-danger">{aviso.texto}</p>}
      </div>
    );
  }

  if (jeito === "balao") {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-2">
        <Botao tamanho="sm" disabled={ocupado} onClick={() => ativar()}>
          <BellRing aria-hidden />
          {ocupado ? "Ativando…" : texto}
        </Botao>
        <button type="button" onClick={agoraNao} className="min-h-9 px-1 text-body-sm text-ink-muted underline">
          Agora não
        </button>
        {aviso && !aviso.ok && <p className="w-full text-body-sm text-danger">{aviso.texto}</p>}
      </div>
    );
  }

  return (
    <section
      aria-label="Notificações no celular"
      className="relative flex gap-3 rounded-lg border border-line bg-surface-200 p-4 pr-12 shadow-card"
    >
      {iphone ? (
        <Smartphone aria-hidden className="mt-0.5 size-5 shrink-0 text-terra-text" />
      ) : (
        <BellRing aria-hidden className="mt-0.5 size-5 shrink-0 text-terra-text" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-label">{titulo}</p>
        <p className="text-body-sm text-ink-muted">
          {iphone
            ? `${texto} No iPhone, os avisos chegam com o Publike na Tela de Início: no Safari, toque em Compartilhar › Adicionar à Tela de Início e abra por lá.`
            : texto}
        </p>
        {!iphone && (
          <span>
            <Botao tamanho="sm" disabled={ocupado} onClick={() => ativar()}>
              <BellRing aria-hidden />
              {ocupado ? "Ativando…" : "Ativar notificações"}
            </Botao>
          </span>
        )}
        {aviso && !aviso.ok && <p className="text-body-sm text-danger">{aviso.texto}</p>}
      </div>
      <button
        type="button"
        onClick={agoraNao}
        className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
      >
        <X aria-hidden className="size-4" />
        <span className="sr-only">Agora não</span>
      </button>
    </section>
  );
}
