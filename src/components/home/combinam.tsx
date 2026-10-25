import { Sparkles, UserSearch } from "lucide-react";
import Link from "next/link";
import { obterMeuPerfil } from "@/lib/dados";
import { formatarLugar } from "@/lib/formato";
import { talentosQueCombinamComigo, vagasQueCombinamComigo } from "@/lib/servidor/combinam-home";
import { Avatar, Selo } from "../ui/basicos";

/**
 * "Combinam com você", no alto da linha do tempo de quem entrou: quem procura trabalho vê as vagas no ar
 * que combinam com o currículo; quem contrata, os talentos da aba Talentos que combinam com as vagas
 * dele. Até 4, com o % de match (a mesma conta do site). Sem nada bom, o bloco não aparece.
 */
export async function CombinamComVoce() {
  const perfil = await obterMeuPerfil().catch(() => null);
  if (!perfil) return null;
  if (perfil.tipo === "pessoa") {
    const vagas = await vagasQueCombinamComigo({ id: perfil.id, cidade: perfil.cidade, bairro: perfil.bairro });
    if (!vagas.length) return null;
    return (
      <Bloco
        titulo="Vagas que combinam com você"
        icone={Sparkles}
        verTodos="/?tipo=vaga&ordem=combina"
        rotulo="Ver todas"
      >
        {vagas.map((v) => (
          <li key={v.id}>
            <Link href={`/anuncio/${v.id}`} className={ITEM}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-label">{v.titulo}</span>
                <span className="block truncate text-body-sm text-ink-muted">
                  {v.quem} · {formatarLugar(v.bairro, v.cidade)}
                </span>
              </span>
              <Nota nota={v.nota} />
            </Link>
          </li>
        ))}
      </Bloco>
    );
  }
  const talentos = await talentosQueCombinamComigo(perfil.id);
  if (!talentos.length) return null;
  return (
    <Bloco
      titulo="Talentos que combinam com as suas vagas"
      icone={UserSearch}
      verTodos="/talentos"
      rotulo="Ver a aba Talentos"
    >
      {talentos.map((t) => (
        <li key={t.id}>
          <Link href={`/talentos/${t.id}`} className={ITEM}>
            <Avatar nome={t.nome} tamanho={36} colorida />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label">
                {t.nome}
                {t.faz && <span className="font-normal text-ink-muted"> · {t.faz}</span>}
              </span>
              <span className="block truncate text-body-sm text-ink-muted">
                Para “{t.vaga}”{t.cidade ? ` · ${formatarLugar(t.bairro, t.cidade)}` : ""}
              </span>
            </span>
            <Nota nota={t.nota} />
          </Link>
        </li>
      ))}
    </Bloco>
  );
}

const ITEM =
  "flex min-h-14 items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-300 focus-visible:outline-2 focus-visible:outline-focus";

/** O % de match: verde cheio de 80% para cima, contorno abaixo (como no resto do site). */
function Nota({ nota }: { nota: number }) {
  return (
    <Selo variante={nota >= 80 ? "match" : "matchContorno"} className="shrink-0">
      {nota}%<span className="sr-only"> de match</span>
    </Selo>
  );
}

function Bloco({
  titulo,
  icone: Icone,
  verTodos,
  rotulo,
  children,
}: {
  titulo: string;
  icone: typeof Sparkles;
  verTodos: string;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby="combinam-titulo"
      className="mb-6 rounded-lg border border-line bg-surface-200 p-2 shadow-card"
    >
      <div className="flex items-center justify-between gap-3 px-3 pt-2 pb-1">
        <h2 id="combinam-titulo" className="flex items-center gap-2 text-label">
          <Icone aria-hidden className="size-4 text-cerrado-text" />
          {titulo}
        </h2>
        <Link
          href={verTodos}
          className="shrink-0 text-body-sm font-semibold text-terra-text underline-offset-2 hover:underline"
        >
          {rotulo}
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-x-2 sm:grid-cols-2">{children}</ul>
    </section>
  );
}
