"use client";

import { Video } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { entrarNaEntrevista } from "@/lib/acoes/entrevista-ao-vivo";
import { Botao } from "../ui/botao";

/** "Entrar na entrevista": pede a chave na hora e abre a chamada da Daily aqui dentro. */
export function SalaDaEntrevista({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  if (url) {
    return (
      <iframe
        title="Chamada de vídeo da entrevista"
        src={url}
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        className="h-[75dvh] w-full rounded-lg border border-line bg-ink"
      />
    );
  }
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface-200 p-5">
      <p className="text-body">
        A chamada abre aqui mesmo, sem instalar nada. O navegador vai pedir a câmera e o microfone: toque em Permitir.
      </p>
      <Botao
        variante="primario"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await chamarAcao(() => entrarNaEntrevista(id));
            if (!r.ok) return setErro(r.erro);
            setUrl(r.url);
          })
        }
      >
        <Video aria-hidden />
        {pendente ? "Abrindo a sala…" : "Entrar na entrevista"}
      </Botao>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
      <p className="text-caption text-ink-muted">A chamada não é gravada.</p>
    </div>
  );
}
