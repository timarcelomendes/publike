"use client";

import { CircleCheckBig, Heart, Pause, Pencil, Play, RefreshCw, Trash, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { excluirAnuncio, mudarStatusAnuncio, renovarAnuncio } from "@/lib/acoes/anuncios";
import { responderCurtida } from "@/lib/acoes/curtidas";
import { moderarAnuncio } from "@/lib/acoes/moderacao";
import type { Resultado } from "@/lib/tipos";
import { Botao, BotaoLink } from "../ui/botao";

function useAcao() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  function rodar(acao: () => Promise<Resultado>) {
    setAviso(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) {
        if (r.ir) router.push(r.ir);
        else setAviso({ ok: false, texto: r.erro });
      } else if (r.mensagem) {
        setAviso({ ok: true, texto: r.mensagem });
      }
    });
  }

  const mensagem = aviso ? (
    <p role="status" className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
      {aviso.texto}
    </p>
  ) : null;

  return { rodar, pendente, mensagem };
}

/** Botões de cada anúncio em "Meus anúncios". */
export function AcoesAnuncio({ id, status, podeRenovar }: { id: string; status: string; podeRenovar: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [confirmar, setConfirmar] = useState(false);
  const comModeracao = status === "em_analise" || status === "removido";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {status === "ativo" && (
          <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(() => mudarStatusAnuncio(id, "pausado"))}>
            <Pause aria-hidden />
            Pausar
          </Botao>
        )}
        {status === "pausado" && (
          <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(() => mudarStatusAnuncio(id, "ativo"))}>
            <Play aria-hidden />
            Reativar
          </Botao>
        )}
        {podeRenovar && (
          <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(() => renovarAnuncio(id))}>
            <RefreshCw aria-hidden />
            Renovar por 30 dias
          </Botao>
        )}
        {(status === "ativo" || status === "pausado") && (
          <Botao
            tamanho="sm"
            variante="fantasma"
            disabled={pendente}
            onClick={() => rodar(() => mudarStatusAnuncio(id, "encerrado"))}
          >
            <CircleCheckBig aria-hidden />
            Encerrar
          </Botao>
        )}
        {!comModeracao && (
          <BotaoLink tamanho="sm" variante="fantasma" href={`/painel/anuncio/${id}/editar`}>
            <Pencil aria-hidden />
            Editar
          </BotaoLink>
        )}
        {comModeracao ? null : confirmar ? (
          <span className="flex flex-wrap items-center gap-2 text-body-sm">
            Excluir de vez, com as curtidas?
            <Botao tamanho="sm" variante="perigo" disabled={pendente} onClick={() => rodar(() => excluirAnuncio(id))}>
              Sim, excluir
            </Botao>
            <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(false)}>
              Cancelar
            </Botao>
          </span>
        ) : (
          <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(true)}>
            <Trash aria-hidden />
            Excluir
          </Botao>
        )}
      </div>
      {mensagem}
    </div>
  );
}

/** Curtir de volta (dar match), dispensar ou desfazer. */
export function AcoesInteressado({
  anuncioId,
  perfilId,
  status,
}: {
  anuncioId: string;
  perfilId: string;
  status: string;
}) {
  const { rodar, pendente, mensagem } = useAcao();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "pendente" && (
          <>
            <button
              type="button"
              disabled={pendente}
              onClick={() => rodar(() => responderCurtida(anuncioId, perfilId, "match"))}
              className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-line-strong bg-surface-200 px-4 text-label text-ink transition-colors hover:bg-like-soft hover:text-like-text disabled:opacity-60"
            >
              <Heart aria-hidden className="size-[18px] text-like" />
              Curtir de volta
            </button>
            <Botao
              variante="fantasma"
              tamanho="sm"
              disabled={pendente}
              onClick={() => rodar(() => responderCurtida(anuncioId, perfilId, "dispensada"))}
            >
              <X aria-hidden />
              Dispensar
            </Botao>
          </>
        )}
        {status === "dispensada" && (
          <Botao
            variante="fantasma"
            tamanho="sm"
            disabled={pendente}
            onClick={() => rodar(() => responderCurtida(anuncioId, perfilId, "pendente"))}
          >
            <Undo2 aria-hidden />
            Desfazer
          </Botao>
        )}
      </div>
      {mensagem}
    </div>
  );
}

/** Decisão da moderação sobre um anúncio denunciado. */
export function AcoesModeracao({ anuncioId }: { anuncioId: string }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Botao variante="perigo" tamanho="sm" disabled={pendente} onClick={() => rodar(() => moderarAnuncio(anuncioId, "remover"))}>
          Remover anúncio
        </Botao>
        <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(() => moderarAnuncio(anuncioId, "liberar"))}>
          Está tudo certo, liberar
        </Botao>
      </div>
      {mensagem}
    </div>
  );
}
