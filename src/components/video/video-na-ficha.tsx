"use client";

import { IA } from "@/components/apelido-da-ia";
import { Play, RefreshCw, Sparkles, Video, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { abrirEntrevistaVideo, cancelarVideo, pedirVideo, refazerIAVideo } from "@/lib/acoes/entrevista-video";
import { SITUACOES_VIDEO, textoDoTempo, type EntrevistaParaAssistir, type VideoNoQuadro } from "@/lib/entrevista-video";
import { tempoRelativo } from "@/lib/formato";
import { Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";

/** A entrevista em vídeo na ficha do candidato (quadro): pedir, acompanhar e assistir com a transcrição e o resumo. */
export function VideoNaFicha({
  anuncioId,
  perfilId,
  nome,
  video,
  liberado,
  agora,
}: {
  anuncioId: string;
  perfilId: string;
  nome: string;
  video: VideoNoQuadro | null;
  /** a conta tem a Entrevista em vídeo */
  liberado: boolean;
  agora: number;
}) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string; ir?: string } | null>(null);
  const [assistir, setAssistir] = useState<EntrevistaParaAssistir | null>(null);
  // cancelar pede um segundo toque, para não sair sem querer
  const [confirmar, setConfirmar] = useState(false);
  const primeiro = nome.split(" ")[0];

  function pedir() {
    setAviso(null);
    iniciar(async () => {
      const r = await chamarAcao(() => pedirVideo(anuncioId, [perfilId]));
      setAviso(
        r.ok
          ? { ok: true, texto: r.mensagem ?? "Pedido enviado." }
          : { ok: false, texto: r.erro, ir: "ir" in r ? r.ir : undefined },
      );
    });
  }

  function cancelar() {
    if (!video) return;
    if (!confirmar) return setConfirmar(true);
    setAviso(null);
    iniciar(async () => {
      const r = await chamarAcao(() => cancelarVideo(video.id));
      setConfirmar(false);
      setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Pedido cancelado." } : { ok: false, texto: r.erro });
    });
  }

  function abrir() {
    if (!video) return;
    setAviso(null);
    iniciar(async () => {
      const r = await chamarAcao(() => abrirEntrevistaVideo(video.id));
      if (!r.ok) return setAviso({ ok: false, texto: r.erro });
      setAssistir(r.entrevista);
    });
  }

  function refazer() {
    if (!video) return;
    setAviso(null);
    iniciar(async () => {
      const r = await chamarAcao(() => refazerIAVideo(video.id, anuncioId));
      if (!r.ok) return setAviso({ ok: false, texto: r.erro });
      const de_novo = await chamarAcao(() => abrirEntrevistaVideo(video.id));
      if (de_novo.ok) setAssistir(de_novo.entrevista);
      setAviso({ ok: true, texto: r.mensagem ?? "Pronto." });
    });
  }

  const mensagem = aviso && (
    <p
      role={aviso.ok ? "status" : "alert"}
      className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}
    >
      {aviso.texto}{" "}
      {aviso.ir && (
        <Link href={aviso.ir} className="text-label underline">
          Montar as perguntas
        </Link>
      )}
    </p>
  );

  if (!video) {
    if (!liberado) {
      return (
        <p className="text-body-sm text-ink-muted">
          Com a Entrevista em vídeo, {primeiro} grava as respostas pelo celular e <IA /> resume.{" "}
          <Link href="/painel/video" className="text-label underline underline-offset-2">
            Conhecer
          </Link>
        </p>
      );
    }
    return (
      <div className="flex flex-col items-start gap-2">
        <Botao tamanho="sm" disabled={pendente} onClick={pedir}>
          <Video aria-hidden />
          {pendente ? "Pedindo…" : "Pedir entrevista em vídeo"}
          <Selo variante="novo">Novo</Selo>
        </Botao>
        <p className="text-body-sm text-ink-muted">
          {primeiro} recebe as perguntas da vaga e grava as respostas pelo celular, no prazo da vaga.
        </p>
        {mensagem}
      </div>
    );
  }

  const s = SITUACOES_VIDEO[video.situacao];
  return (
    <div className="flex flex-col gap-3 text-body-sm">
      <p className="flex flex-wrap items-center gap-2">
        <Selo variante={s.tom}>{s.nome}</Selo>
        <span className="text-ink-muted">
          {video.enviada_em
            ? `respondeu ${tempoRelativo(video.enviada_em, agora)}`
            : video.situacao === "vencida"
              ? "o prazo acabou"
              : video.situacao === "cancelada"
                ? "você cancelou o pedido"
              : `pedido ${tempoRelativo(video.pedida_em, agora)}`}
        </span>
      </p>
      {(video.situacao === "pedida" || video.situacao === "respondendo") && (
        <div className="flex flex-wrap items-center gap-2">
          <Botao tamanho="sm" variante={confirmar ? "perigo" : "fantasma"} disabled={pendente} onClick={cancelar}>
            <X aria-hidden />
            {pendente ? "Cancelando…" : confirmar ? "Sim, cancelar o pedido" : "Cancelar o pedido"}
          </Botao>
          {confirmar && !pendente && (
            <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(false)}>
              Não cancelar
            </Botao>
          )}
        </div>
      )}
      {(video.situacao === "vencida" || video.situacao === "cancelada") && liberado && (
        <Botao tamanho="sm" variante="secundario" disabled={pendente} onClick={pedir} className="self-start">
          <RefreshCw aria-hidden />
          Pedir de novo
        </Botao>
      )}
      {video.situacao === "enviada" && (
        <>
          {video.resumo && !assistir && <ResumoDaIA resumo={video.resumo} />}
          {!assistir ? (
            <Botao tamanho="sm" variante="primario" disabled={pendente} onClick={abrir} className="self-start">
              <Play aria-hidden />
              {pendente ? "Abrindo…" : video.videos_apagados ? "Ver as respostas" : "Assistir às respostas"}
            </Botao>
          ) : (
            <Assistir entrevista={assistir} />
          )}
          {(!video.resumo || (assistir && !assistir.resumo)) && (
            <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={refazer} className="self-start">
              <Sparkles aria-hidden />
              {pendente ? (
                <>
                  <IA forma="Nome" /> está lendo…
                </>
              ) : (
                "Fazer a transcrição e o resumo"
              )}
            </Botao>
          )}
        </>
      )}
      {mensagem}
    </div>
  );
}

function ResumoDaIA({ resumo }: { resumo: NonNullable<VideoNoQuadro["resumo"]> }) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-300 p-3">
      <p className="flex items-center gap-1.5 text-label">
        <Sparkles aria-hidden className="size-4 text-terra-text" />
        Resumo <IA forma="de" />
      </p>
      <p>{resumo.resumo}</p>
      {resumo.fortes.length > 0 && (
        <div>
          <p className="text-caption text-ink-muted">Pontos fortes</p>
          <ul className="ml-4 list-disc">
            {resumo.fortes.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {resumo.conferir.length > 0 && (
        <div>
          <p className="text-caption text-ink-muted">Para conferir</p>
          <ul className="ml-4 list-disc">
            {resumo.conferir.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-caption text-ink-muted">
        <IA forma="Nome" /> lê só o que a pessoa disse. Quem decide é você.
      </p>
    </div>
  );
}

function Assistir({ entrevista }: { entrevista: EntrevistaParaAssistir }) {
  return (
    <div className="flex flex-col gap-4">
      {entrevista.resumo && <ResumoDaIA resumo={entrevista.resumo} />}
      {!entrevista.videos && (
        <p className="text-ink-muted">
          Os vídeos foram apagados (6 meses depois que a vaga saiu do ar). As transcrições continuam.
        </p>
      )}
      <ol className="flex flex-col gap-4">
        {entrevista.respostas.map((r, i) => (
          <li key={r.pergunta_id} className="flex flex-col gap-2">
            <p className="text-label">
              {i + 1}. {r.pergunta}
            </p>
            {r.tipo === "texto" ? (
              <blockquote className="rounded-md bg-surface-300 p-3 whitespace-pre-line">{r.texto}</blockquote>
            ) : (
              <>
                {r.url && <VideoComVelocidade url={r.url} rotulo={`Resposta ${i + 1}`} duracao={r.duracao} />}
                {r.transcricao ? (
                  <details className="rounded-md bg-surface-300 p-3">
                    <summary className="cursor-pointer text-label">Transcrição</summary>
                    <p className="mt-2 whitespace-pre-line">{r.transcricao}</p>
                  </details>
                ) : (
                  <p className="text-caption text-ink-muted">Sem transcrição ainda.</p>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function VideoComVelocidade({ url, rotulo, duracao }: { url: string; rotulo: string; duracao: number | null }) {
  const [rapido, setRapido] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        aria-label={rotulo}
        ref={(v) => {
          if (v) v.playbackRate = rapido ? 1.5 : 1;
        }}
        className="aspect-[4/3] w-full max-w-md rounded-md bg-ink object-contain"
      />
      <div className="flex items-center gap-3 text-caption text-ink-muted">
        {duracao && <span>{textoDoTempo(duracao)}</span>}
        <button
          type="button"
          onClick={() => setRapido((x) => !x)}
          aria-pressed={rapido}
          className="rounded-pill border border-line px-2.5 py-1 text-label hover:bg-surface-300"
        >
          {rapido ? "Velocidade 1,5x" : "Velocidade 1x"}
        </button>
      </div>
    </div>
  );
}
