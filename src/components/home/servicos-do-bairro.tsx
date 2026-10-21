import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";
import { formatarLugar, plural } from "@/lib/formato";
import { Avatar, Container } from "../ui/basicos";

/** Na home do visitante: 4 serviços (os com foto de trabalho primeiro) e o caminho para todos. */
export async function ServicosDoBairro() {
  const servicos = await anunciosNoAr("servico");
  const escolhidos = [...servicos.filter((s) => s.foto), ...servicos.filter((s) => !s.foto)].slice(0, 4);
  if (escolhidos.length < 2) return null;
  return (
    <Container className="mt-12 sm:mt-16">
      <section aria-labelledby="servicos-do-bairro">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="servicos-do-bairro" className="text-h2 sm:text-[28px] sm:leading-[34px]">
            Serviços do bairro
          </h2>
          <Link
            href="/?tipo=servico"
            className="inline-flex min-h-11 items-center gap-1.5 text-label text-terra-text hover:text-ink"
          >
            Ver todos os serviços
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {escolhidos.map((s) => (
            <li key={s.id}>
              <Link
                href={`/anuncio/${s.id}`}
                className="flex h-full items-center gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card transition-shadow hover:shadow-raised"
              >
                <Avatar nome={s.autor_nome} foto={s.autor_foto} tamanho={52} />
                <span className="min-w-0">
                  <span className="block truncate text-label">
                    {s.autor_nome.split(" ")[0]} · {s.titulo}
                  </span>
                  <span className="block truncate text-body-sm text-ink-muted">
                    {formatarLugar(s.bairro, s.cidade)}
                    {s.autor_nota != null && (s.autor_avaliacoes ?? 0) >= 3
                      ? ` · ${s.autor_nota.toFixed(1).replace(".", ",")} ★`
                      : (s.autor_avaliacoes ?? 0) > 0
                        ? ` · ${plural(s.autor_avaliacoes ?? 0, "avaliação", "avaliações")}`
                        : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}
