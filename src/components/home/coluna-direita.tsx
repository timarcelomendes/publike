import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { conteudoDoSlug } from "@/lib/conteudos";
import type { Conteudo } from "@/lib/conteudos/tipos";
import { meusSeguidos } from "@/lib/dados-social";
import { plural } from "@/lib/formato";
import type { Local } from "@/lib/regioes";
import { SeloVerificado } from "../selo-verificado";
import { BotaoSeguir } from "../social/botoes";
import { Avatar } from "../ui/basicos";
import { empresasContratando } from "./empresas-contratando";

// A coluna da direita do feed (computador grande; no celular, depois da lista): quem
// está contratando perto, com o Seguir (aviso de vaga nova), e os conteúdos do blog.

const caixa = "flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card";

export async function ContratandoPerto({ local }: { local: Local | null }) {
  const [empresas, seguidos] = await Promise.all([empresasContratando(local, 4), meusSeguidos().catch(() => [])]);
  if (!empresas.length) return null;
  return (
    <section aria-labelledby="contratando-perto" className={caixa}>
      <h2 id="contratando-perto" className="text-h3">
        {local?.ponto ? "Contratando perto de você" : "Contratando em Goiânia e região"}
      </h2>
      <ul className="flex flex-col gap-3">
        {empresas.map((e) => (
          <li key={e.id} className="flex items-center gap-3">
            <Link href={`/perfil/${e.id}/vagas`} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
              <Avatar nome={e.nome} foto={e.foto} tamanho={40} forma="quadrada" colorida />
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-label">
                  <span className="truncate">{e.nome}</span>
                  {e.verificado && <SeloVerificado agencia={e.tipo === "agencia"} />}
                </span>
                <span className="block truncate text-body-sm text-ink-muted">
                  {plural(e.vagas, "vaga", "vagas")} · {e.lugar}
                </span>
              </span>
            </Link>
            <span className="shrink-0">
              <BotaoSeguir
                alvo={{ perfil: e.id }}
                seguidoId={seguidos.find((s) => s.alvo_perfil === e.id)?.id ?? null}
                logado
                voltar="/"
                rotulo="Seguir"
                semIcone
              />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const DO_BLOG = ["emprego-perto-de-casa-goiania", "emprego-em-goias-2026", "publicar-vaga-gratis-goiania"];

export function DoBlog() {
  const lista = DO_BLOG.map(conteudoDoSlug).filter((c): c is Conteudo => !!c);
  if (!lista.length) return null;
  return (
    <section aria-labelledby="do-blog" className={caixa}>
      <h2 id="do-blog" className="text-h3">
        Para ler
      </h2>
      <ul className="flex flex-col gap-3">
        {lista.map((c) => (
          <li key={c.slug}>
            <Link href={`/conteudos/${c.slug}`} className="text-label hover:text-terra-text hover:underline">
              {c.titulo}
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/conteudos" className="inline-flex items-center gap-1.5 text-label text-terra-text hover:text-ink">
        Ver todos os conteúdos
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}
