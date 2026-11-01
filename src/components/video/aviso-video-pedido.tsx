import { Video } from "lucide-react";
import { textoDoTempo, type MinhaEntrevistaVideo } from "@/lib/entrevista-video";
import { Selo } from "../ui/basicos";
import { BotaoLink } from "../ui/botao";

/** Na página da vaga, para quem se candidatou: a empresa pediu a entrevista em vídeo (migração 20270105120000). */
export function AvisoVideoPedido({ anuncioId, e }: { anuncioId: string; e: MinhaEntrevistaVideo }) {
  if (e.situacao !== "pedida" && e.situacao !== "respondendo" && e.situacao !== "enviada") return null;
  const feitas = e.perguntas.filter((p) => p.respondida).length;
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-200 p-4">
      <p className="flex flex-wrap items-center gap-2 text-label">
        <Video aria-hidden className="size-5 text-terra-text" />
        Entrevista em vídeo
        <Selo variante={e.situacao === "enviada" ? "match" : "aviso"}>
          {e.situacao === "enviada" ? "Enviada" : feitas ? `${feitas} de ${e.perguntas.length}` : "Responda"}
        </Selo>
      </p>
      {e.situacao === "enviada" ? (
        <p className="text-body-sm text-ink-muted">{e.empresa} recebeu as suas respostas.</p>
      ) : (
        <>
          <p className="text-body-sm">
            {e.empresa} pediu: {e.perguntas.length} perguntas, até {textoDoTempo(e.segundos)} cada, gravadas pelo
            celular.
          </p>
          <BotaoLink href={`/entrevista-video/${anuncioId}`} variante="primario" tamanho="sm" className="self-start">
            <Video aria-hidden />
            {feitas ? "Continuar a entrevista" : "Responder a entrevista"}
          </BotaoLink>
        </>
      )}
    </section>
  );
}
