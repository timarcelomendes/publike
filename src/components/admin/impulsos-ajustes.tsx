import Link from "next/link";
import type { Mudanca } from "@/lib/impulso-ajuste";

// Admin › Impulsos › Agora: o ajuste diário (beta), manhã por manhã, de cada campanha (a de uma vaga ou a do cliente).

export type AjusteDoAdmin = {
  id: string;
  dia: string;
  feito_em: string;
  tipo: "impulso" | "cliente";
  titulo: string;
  conta: string;
  anuncio_id: string | null;
  mudancas: Mudanca[];
  erro: string | null;
  /** na campanha do cliente, o título de cada vaga (as buscas são de um grupo) */
  vagas: Record<string, string> | null;
};

const diaCurto = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

export function ListaDeAjustes({ linhas }: { linhas: AjusteDoAdmin[] }) {
  if (!linhas.length) {
    return (
      <p className="text-body-sm text-ink-muted">
        Nenhum ajuste ainda. O primeiro sai depois das 6h, quando o impulso completa um dia no ar.
      </p>
    );
  }
  return (
    <ol className="flex flex-col divide-y divide-line">
      {linhas.map((l) => (
        <li
          key={l.id}
          className="grid gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[3.5rem_minmax(0,16rem)_minmax(0,1fr)]"
        >
          <span className="text-body-sm text-ink-muted tabular-nums">{diaCurto(l.dia)}</span>
          <span className="min-w-0">
            {l.anuncio_id ? (
              <Link href={`/anuncio/${l.anuncio_id}`} className="text-label break-words hover:underline">
                {l.titulo}
              </Link>
            ) : (
              <span className="text-label break-words">{l.titulo}</span>
            )}
            {l.tipo === "impulso" && l.conta && <span className="block text-caption text-ink-muted">{l.conta}</span>}
          </span>
          <ul className="flex min-w-0 flex-col gap-1">
            {l.erro && <li className="text-body-sm break-words text-danger">Não ajustou: {l.erro}</li>}
            {l.mudancas.map((m, n) => (
              <li key={n} className="min-w-0 text-body-sm break-words">
                <span className={m.tipo === "nada" ? "text-ink-muted" : undefined}>
                  {m.impulso_id && l.vagas?.[m.impulso_id] ? `${l.vagas[m.impulso_id]}: ` : ""}
                  {m.texto}
                </span>
                {m.porque && <span className="block text-ink-muted">{m.porque}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
