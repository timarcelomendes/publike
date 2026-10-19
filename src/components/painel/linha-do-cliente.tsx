import { Building2 } from "lucide-react";
import Link from "next/link";
import { clienteDaVagaComNome } from "@/lib/servidor/clientes";

/** Agência: de qual cliente é a vaga (só quem publicou vê), com o link para a ficha dele. */
export async function LinhaDoCliente({ anuncioId, confidencial }: { anuncioId: string; confidencial: boolean }) {
  const cliente = await clienteDaVagaComNome(anuncioId);
  if (!cliente) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-body-sm">
      <Building2 aria-hidden className="size-4 shrink-0 text-ink-muted" />
      <span className="text-ink-muted">Cliente:</span>
      <Link href={`/painel/clientes/${cliente.id}`} className="underline underline-offset-2">
        {cliente.nome}
      </Link>
      {confidencial && <span className="text-ink-muted">(confidencial na vaga)</span>}
    </p>
  );
}
