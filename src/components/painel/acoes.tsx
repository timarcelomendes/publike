"use client";

import {
  CircleCheckBig,
  CopyPlus,
  FileText,
  Heart,
  Hourglass,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Trash,
  Undo2,
  X,
} from "lucide-react";
import { useState } from "react";
import { excluirAnuncio, mudarStatusAnuncio, renovarAnuncio } from "@/lib/acoes/anuncios";
import { responderCurtida } from "@/lib/acoes/curtidas";
import { CaminhoDoAceite } from "../caminho-curtida";
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
        {!comModeracao && tipo === "vaga" && (
          <BotaoLink tamanho="sm" variante="fantasma" href={`/publicar?copiar=${id}`}>
            <CopyPlus aria-hidden />
            Publicar parecida
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

/**
 * Curtir de volta (dar match), dispensar ou desfazer. No serviço: aceitar ou recusar o pedido.
 * Na vaga que pede currículo, quem ainda não mandou pode ser aceito do mesmo jeito: a
 * pessoa recebe o pedido do currículo e o match sai sozinho quando ele chegar.
 */
export function AcoesInteressado({
  anuncioId,
  perfilId,
  status,
  servico = false,
  semCurriculo = null,
  aceita = false,
}: {
  anuncioId: string;
  perfilId: string;
  status: string;
  servico?: boolean;
  /** vaga pede currículo e a pessoa ainda não mandou: o primeiro nome dela */
  semCurriculo?: string | null;
  /** você já aceitou e a pessoa recebeu o pedido do currículo */
  aceita?: boolean;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const esperando = aceita && semCurriculo !== null && status === "pendente";

  // aceito, esperando o currículo: agora é com a pessoa
  if (esperando) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-100 p-3">
        <p className="flex items-center gap-2 text-label">
          <Hourglass aria-hidden className="size-[18px] shrink-0 text-terra-text" />
          Aceito: esperando o currículo
        </p>
        <CaminhoDoAceite nome={semCurriculo} aceita />
        <p className="text-body-sm text-ink-muted">
          Quando {semCurriculo} mandar, dá match: o contato aparece aqui e você recebe um aviso.
        </p>
        <div>
          <Botao
            variante="fantasma"
            tamanho="sm"
            disabled={pendente}
            onClick={() => rodar(() => responderCurtida(anuncioId, perfilId, "pendente"))}
          >
            <Undo2 aria-hidden />
            Desfazer o aceite
          </Botao>
        </div>
        {mensagem}
      </div>
    );
  }

  const botaoAceitar = (texto: string) => (
    <button
      type="button"
      disabled={pendente}
      onClick={() => rodar(() => responderCurtida(anuncioId, perfilId, "match"))}
      className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-line-strong bg-surface-200 px-4 text-label text-ink transition-colors hover:bg-like-soft hover:text-like-text disabled:opacity-60"
    >
      <Heart aria-hidden className="size-[18px] text-like" />
      {texto}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "pendente" && (
          <>
            {botaoAceitar(servico ? "Aceitar" : "Curtir de volta")}
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
        {status === "desfeito" && botaoAceitar("Dar match de novo")}
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
      {semCurriculo !== null && (status === "pendente" || status === "desfeito") && (
        <p className="flex items-start gap-2 text-body-sm text-ink-muted">
          <FileText aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Esta vaga pede currículo e {semCurriculo} ainda não mandou. Curtindo de volta, {semCurriculo} recebe o
            pedido, e o match sai assim que o currículo chegar.
          </span>
        </p>
      )}
      {mensagem}
    </div>
  );
}
