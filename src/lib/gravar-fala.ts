// Currículo falado, no navegador: grava a pessoa contando a experiência (até 3 minutos) e manda o áudio
// para /api/curriculo/fala, que devolve os campos do currículo. Só no navegador.

import type { LeituraDoArquivo } from "./servidor/ler-curriculo";

/** A gravação para sozinha em 3 minutos (a leitura aceita até 4 MB). */
export const MAX_SEGUNDOS_FALA = 180;
/** Menos que isso não dá para entender nada. */
export const MIN_SEGUNDOS_FALA = 4;

/** Erro com a mensagem pronta para a tela. */
export class ErroDaFala extends Error {}

/** O navegador grava áudio (o Chrome, o Safari do iPhone desde o 14.5, o Firefox). */
export function podeGravarFala() {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

/** O formato que o navegador grava: WebM no Chrome e no Firefox, MP4 no Safari. */
function formato(): string | undefined {
  for (const tipo of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(tipo)) return tipo;
  }
  return undefined;
}

export type Gravacao = {
  /** para e devolve o áudio */
  terminar: () => Promise<Blob>;
  /** para e joga fora */
  cancelar: () => void;
};

/** Pede o microfone e começa a gravar. Sem permissão, ErroDaFala com o que fazer. */
export async function comecarGravacao(): Promise<Gravacao> {
  let fluxo: MediaStream;
  try {
    fluxo = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    if (nome === "NotAllowedError" || nome === "SecurityError") {
      throw new ErroDaFala(
        "O navegador não deixou usar o microfone. Toque no cadeado ao lado do endereço, libere o microfone e tente de novo.",
      );
    }
    if (nome === "NotFoundError" || nome === "OverconstrainedError") {
      throw new ErroDaFala("Não achamos um microfone neste aparelho. Preencha aqui embaixo ou envie o PDF.");
    }
    throw new ErroDaFala("Não deu para ligar o microfone. Feche outros apps que usam o microfone e tente de novo.");
  }
  const tipo = formato();
  // 32 kbit/s: voz clara e 3 minutos em menos de 1 MB
  const gravador = new MediaRecorder(fluxo, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: 32_000 });
  const partes: Blob[] = [];
  gravador.ondataavailable = (e) => {
    if (e.data.size > 0) partes.push(e.data);
  };
  const desligar = () => fluxo.getTracks().forEach((t) => t.stop());
  gravador.start(1000);
  return {
    terminar: () =>
      new Promise<Blob>((resolver) => {
        const pronto = () => {
          desligar();
          resolver(new Blob(partes, { type: gravador.mimeType || tipo || "audio/webm" }));
        };
        if (gravador.state === "inactive") return pronto();
        gravador.onstop = pronto;
        gravador.stop();
      }),
    cancelar: () => {
      gravador.onstop = null;
      if (gravador.state !== "inactive") gravador.stop();
      desligar();
    },
  };
}

/** Manda a gravação e devolve a leitura (os campos do currículo ou o erro para a tela). */
export async function lerGravacao(audio: Blob): Promise<LeituraDoArquivo> {
  const dados = new FormData();
  dados.set("audio", audio, audio.type.includes("mp4") ? "fala.mp4" : "fala.webm");
  let resposta: Response;
  try {
    resposta = await fetch("/api/curriculo/fala", { method: "POST", body: dados });
  } catch {
    throw new ErroDaFala("A internet caiu no meio do envio. Tente de novo.");
  }
  if (resposta.status === 413) throw new ErroDaFala("A gravação ficou grande demais. Conte em até 3 minutos.");
  try {
    return (await resposta.json()) as LeituraDoArquivo;
  } catch {
    throw new ErroDaFala("Não deu para ouvir a gravação agora. Tente de novo.");
  }
}

/** 0:42 */
export function relogio(segundos: number) {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
