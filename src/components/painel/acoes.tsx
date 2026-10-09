"use client";

import { CircleCheckBig, Heart, Pause, Pencil, Play, RefreshCw, Trash, Undo2, X } from "lucide-react";
import { useState } from "react";
import { excluirAnuncio, mudarStatusAnuncio, renovarAnuncio } from "@/lib/acoes/anuncios";
import { responderCurtida } from "@/lib/acoes/curtidas";
import { Botao, BotaoLink } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** Botões de cada anúncio em "Meus anúncios". */
export function AcoesAnuncio({
  id,
  tipo,
  status,
  podeRenovar,
}: {
  id: string;
  tipo: string;
  status: string;
  podeRenovar: boolean;
}) {
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
            Renovar por {tipo === "servico" ? 90 : 30} dias
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
          <BotaoLink
            tamanho="sm"
            variante="fantasma"
            href={tipo === "servico" ? "/painel/servicos" : `/painel/anuncio/${id}/editar`}
          >
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

/** Curtir de volta (dar match), dispensar ou desfazer. No serviço: aceitar ou recusar o pedido. */
export function AcoesInteressado({
  anuncioId,
  perfilId,
  status,
  servico = false,
}: {
  anuncioId: string;
  perfilId: string;
  status: string;
  servico?: boolean;
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
              {servico ? "Aceitar" : "Curtir de volta"}
            </button>
            <Botao
              variante="fantasma"
              tamanho="sm"
              disabled={pendente}
              onClick={() => rodar(() => responderCurtida(anuncioId, perfilId, "dispensada"))}
            >
              <X aria-hidden />
              {servico ? "Recusar" : "Dispensar"}
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
