import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/ui/basicos";

// A vaga do candidato com a moderação, na ficha e na lista de candidatos (17/11/2026, Marcelo: "onde ve essa
// moderacao?"). Em análise, a moderação ainda decide e dá para responder depois. Removida, ela não volta sozinha:
// o texto não promete a liberação e leva à conversa com a moderação, na página da vaga (`#moderacao`).

/** "removida" quando a moderação tirou a vaga; "moderacao" quando ainda está em análise; null fora dela. */
export function estadoDaModeracao(status: string | null | undefined): "moderacao" | "removida" | null {
  if (status === "removido") return "removida";
  if (status === "em_analise") return "moderacao";
  return null;
}

export function VagaNaModeracao({
  status,
  anuncioId,
  className = "",
}: {
  status: string | null | undefined;
  anuncioId: string;
  className?: string;
}) {
  const estado = estadoDaModeracao(status);
  if (!estado) return null;
  return (
    <p className={`flex items-start gap-2 text-body-sm text-ink-muted ${className}`}>
      <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {estado === "removida" ? (
        <span>
          Esta vaga foi removida pela moderação do Publike: não dá mais para responder por ela.{" "}
          <Link href={`/anuncio/${anuncioId}#moderacao`} className="text-ink underline underline-offset-2">
            Não concorda? Fale com a moderação
          </Link>
        </span>
      ) : (
        <span>Esta vaga está com a moderação: dá para responder depois que ela for liberada.</span>
      )}
    </p>
  );
}

/** O aviso no alto da página da vaga (no painel de quem publicou), com a vaga em análise ou removida. */
export function AvisoDaModeracaoNaVaga({
  status,
  anuncioId,
  servico = false,
}: {
  status: string | null | undefined;
  anuncioId: string;
  servico?: boolean;
}) {
  const estado = estadoDaModeracao(status);
  if (!estado) return null;
  const aceitar = servico ? "aceitar pedidos" : "aceitar candidatos";
  return estado === "removida" ? (
    <Aviso tipo="alerta" titulo="Este anúncio foi removido pela moderação">
      <p>
        Não dá mais para {aceitar} por ele, e os contatos ficam escondidos.{" "}
        <Link href={`/anuncio/${anuncioId}#moderacao`} className="underline underline-offset-2">
          Não concorda? Fale com a moderação
        </Link>
      </p>
    </Aviso>
  ) : (
    <Aviso tipo="alerta" titulo="Este anúncio está com a moderação">
      Enquanto isso, não dá para {aceitar} e os contatos ficam escondidos.
    </Aviso>
  );
}
