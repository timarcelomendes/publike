import Link from "next/link";
import type { AnuncioAdmin } from "@/lib/admin/dados";
import { formatarLugar, rotuloModalidade, tempoRelativo } from "@/lib/formato";
import { Selo } from "../ui/basicos";
import { SeloStatus } from "./ui";

/** Um anúncio nas listas do admin e da moderação. O título leva para a ficha do anúncio. */
export function LinhaAnuncio({
  a,
  agora,
  mostrarAutor = true,
  linkAutor = false,
}: {
  a: AnuncioAdmin;
  agora: number;
  mostrarAutor?: boolean;
  /** Só o admin abre a ficha da conta. */
  linkAutor?: boolean;
}) {
  return (
    <li className="relative flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4 transition-colors hover:bg-surface-300">
      <div className="flex flex-wrap items-center gap-2">
        <SeloStatus status={a.status} />
        <Selo>{rotuloModalidade(a.tipo, a.regime)}</Selo>
        {a.denuncias_abertas > 0 && (
          <Selo variante="perigo">
            {a.denuncias_abertas} {a.denuncias_abertas === 1 ? "denúncia" : "denúncias"}
          </Selo>
        )}
        {a.ia_decisao === "retido" && a.status === "em_analise" && <Selo variante="aviso">Retido pela IA</Selo>}
        {a.autor_suspenso && <Selo variante="aviso">Conta suspensa</Selo>}
      </div>
      <h3 className="text-h3">
        <Link href={`/admin/anuncios/${a.id}`} className="after:absolute after:inset-0 after:rounded-lg hover:underline">
          {a.titulo}
        </Link>
      </h3>
      <p className="text-body-sm text-ink-muted">
        {formatarLugar(a.bairro, a.cidade)} · publicado {tempoRelativo(a.criado_em, agora)} · {a.curtidas}{" "}
        {a.curtidas === 1 ? "curtida" : "curtidas"}
        {a.matches > 0 && ` · ${a.matches} ${a.matches === 1 ? "match" : "matches"}`}
      </p>
      {mostrarAutor && (
        <p className="text-body-sm text-ink-muted">
          Por{" "}
          {linkAutor ? (
            <Link href={`/admin/usuarios/${a.autor_id}`} className="relative z-10 text-ink underline">
              {a.autor_nome}
            </Link>
          ) : (
            <span className="text-ink">{a.autor_nome}</span>
          )}
        </p>
      )}
    </li>
  );
}
