"use client";

import { CircleCheckBig, Pencil, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { excluirAnuncioDeVez } from "@/lib/acoes/admin";
import { moderarAnuncio } from "@/lib/acoes/moderacao";
import { Botao, BotaoLink } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

const MOTIVOS_PRONTOS = [
  "Cobra dinheiro de quem procura trabalho.",
  "Tem sinais de golpe.",
  "Tem exigência discriminatória.",
  "Não é vaga nem serviço (propaganda ou spam).",
  "Informação falsa ou enganosa.",
];

/** Remover (com motivo para quem publicou) ou liberar. Usado na ficha e na fila de denúncias. */
export function AcoesModeracaoAnuncio({
  anuncioId,
  status,
  denunciasAbertas = 0,
  iaFalhou = false,
  mostrarEditar = true,
}: {
  anuncioId: string;
  status: string;
  denunciasAbertas?: number;
  /** A IA não conseguiu revisar: uma pessoa confere e marca como revisado. */
  iaFalhou?: boolean;
  mostrarEditar?: boolean;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [removendo, setRemovendo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const comModeracao = status === "em_analise" || status === "removido";

  return (
    <div className="flex flex-col gap-3">
      {removendo ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`motivo-${anuncioId}`} className="text-label">
            Por que remover? <span className="font-normal text-ink-muted">(quem publicou recebe este motivo)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_PRONTOS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotivo(m)}
                className="min-h-9 rounded-pill border border-line bg-surface-300 px-3 text-body-sm hover:border-line-strong"
              >
                {m}
              </button>
            ))}
          </div>
          <textarea
            id={`motivo-${anuncioId}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Escreva o motivo ou escolha um acima."
            className={`${classesEntrada} resize-y`}
          />
          <div className="flex flex-wrap gap-2">
            <Botao
              variante="perigo"
              tamanho="sm"
              disabled={pendente}
              onClick={() => rodar(() => moderarAnuncio(anuncioId, "remover", motivo), (r) => r.ok && setRemovendo(false))}
            >
              <XCircle aria-hidden />
              {pendente ? "Removendo…" : "Remover anúncio"}
            </Botao>
            <Botao tamanho="sm" variante="fantasma" onClick={() => setRemovendo(false)}>
              Cancelar
            </Botao>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {status !== "removido" && (
            <Botao variante="perigo" tamanho="sm" disabled={pendente} onClick={() => setRemovendo(true)}>
              <XCircle aria-hidden />
              Remover
            </Botao>
          )}
          {comModeracao && (
            <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(() => moderarAnuncio(anuncioId, "liberar"))}>
              <CircleCheckBig aria-hidden />
              {status === "removido" ? "Pôr de volta no ar" : "Está tudo certo, liberar"}
            </Botao>
          )}
          {!comModeracao && (denunciasAbertas > 0 || iaFalhou) && (
            <Botao
              tamanho="sm"
              variante="fantasma"
              disabled={pendente}
              onClick={() => rodar(() => moderarAnuncio(anuncioId, "liberar"))}
              title={
                iaFalhou
                  ? "Marca o anúncio como revisado e fecha as denúncias abertas"
                  : "Fecha as denúncias abertas sem mexer no anúncio"
              }
            >
              <CircleCheckBig aria-hidden />
              {iaFalhou ? "Está tudo certo" : "Dispensar denúncias"}
            </Botao>
          )}
          {mostrarEditar && (
            <BotaoLink tamanho="sm" variante="fantasma" href={`/admin/anuncios/${anuncioId}/editar`}>
              <Pencil aria-hidden />
              Corrigir texto
            </BotaoLink>
          )}
        </div>
      )}
      {mensagem}
    </div>
  );
}

/** Só o admin: apagar de vez (spam, teste). */
export function ApagarAnuncioDeVez({ anuncioId }: { anuncioId: string }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [motivo, setMotivo] = useState("");
  return (
    <details className="rounded-md border border-line px-4 py-3">
      <summary className="cursor-pointer text-label text-ink-muted">Apagar de vez</summary>
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-body-sm text-ink-muted">
          Some com curtidas, matches e denúncias, sem aviso para quem publicou. Para quem quebrou as regras, prefira
          remover: assim a pessoa fica sabendo do motivo.
        </p>
        <input
          aria-label="Motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={300}
          placeholder="Motivo (fica no registro da equipe)"
          className={classesEntrada}
        />
        <div className="flex flex-col items-start gap-2">
          <Botao variante="perigo" tamanho="sm" disabled={pendente} onClick={() => rodar(() => excluirAnuncioDeVez(anuncioId, motivo))}>
            <Trash2 aria-hidden />
            {pendente ? "Apagando…" : "Apagar o anúncio de vez"}
          </Botao>
          {mensagem}
        </div>
      </div>
    </details>
  );
}
