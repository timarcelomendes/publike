import { MessageSquareText } from "lucide-react";
import Link from "next/link";
import { tempoRelativo } from "@/lib/formato";
import { recadosDoPerfil } from "@/lib/servidor/recados";
import { BalaoDoRecado } from "./balao-do-recado";

/** Os recados no ar de um perfil (a dona também vê os em revisão). Sem recado, só para a dona. */
export async function SecaoRecados({
  perfilId,
  logado,
  meu,
  agora,
}: {
  perfilId: string;
  logado: boolean;
  meu: boolean;
  agora: number;
}) {
  const recados = await recadosDoPerfil(perfilId);
  if (!recados.length && !meu) return null;
  return (
    <section id="recados" className="mt-10 scroll-mt-24">
      <h2 className="flex items-center gap-2 text-h2">
        <MessageSquareText aria-hidden className="size-6" />
        Recados
      </h2>
      {recados.length ? (
        <ul className="mt-4 flex max-w-2xl flex-col gap-3">
          {recados.map((r) => (
            <li key={r.id}>
              <BalaoDoRecado r={r} logado={logado} hora={tempoRelativo(r.quando, agora)} comFoto="sempre" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-body-sm text-ink-muted">
          Você ainda não escreveu recados.{" "}
          <Link href="/?tipo=recado" className="font-semibold text-ink underline underline-offset-2">
            Escrever na linha do tempo
          </Link>
        </p>
      )}
    </section>
  );
}
