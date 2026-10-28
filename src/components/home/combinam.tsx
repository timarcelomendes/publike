import { Sparkles, UserSearch } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { COOKIE_COMBINAM_FECHADO } from "@/lib/combinam-fechado";
import { obterMeuPerfil } from "@/lib/dados";
import { formatarLugar } from "@/lib/formato";
import { talentosQueCombinamComigo, vagasQueCombinamComigo } from "@/lib/servidor/combinam-home";
import { Avatar, Selo } from "../ui/basicos";
import { BlocoFechavel } from "./fechar-combinam";

/**
 * "Combinam com você", no alto da linha do tempo de quem entrou: quem procura trabalho vê as vagas no ar
 * que combinam com o currículo; quem contrata, os talentos da aba Talentos que combinam com as vagas
 * dele. Até 4, com o % de match (a mesma conta do site). Sem nada bom, o bloco não aparece. O X esconde o
 * bloco por 30 dias neste aparelho (cookie); as vagas continuam em Descobrir, e os talentos na aba Talentos.
 */
export async function CombinamComVoce() {
  if ((await cookies()).get(COOKIE_COMBINAM_FECHADO)?.value) return null;
  const perfil = await obterMeuPerfil().catch(() => null);
  if (!perfil) return null;
  if (perfil.tipo === "pessoa") {
    const vagas = await vagasQueCombinamComigo({ id: perfil.id, cidade: perfil.cidade, bairro: perfil.bairro });
    if (!vagas.length) return null;
    return (
      <BlocoFechavel
        titulo="Vagas que combinam com você"
        icone={<Sparkles aria-hidden className="size-4 shrink-0 text-cerrado-text" />}
        verTodos="/?tipo=vaga&ordem=combina"
        rotulo="Ver todas"
        ondeAchar={{ href: "/descobrir", nome: "Descobrir" }}
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
      </BlocoFechavel>
    );
  }
  const talentos = await talentosQueCombinamComigo(perfil.id);
  if (!talentos.length) return null;
  return (
    <BlocoFechavel
      titulo="Talentos que combinam com as suas vagas"
      icone={<UserSearch aria-hidden className="size-4 shrink-0 text-cerrado-text" />}
      verTodos="/talentos"
      rotulo="Ver a aba Talentos"
      ondeAchar={{ href: "/talentos", nome: "Talentos" }}
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
    </BlocoFechavel>
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
