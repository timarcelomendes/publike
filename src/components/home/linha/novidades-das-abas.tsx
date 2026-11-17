import { MessageSquareText, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { NovidadeDaAba } from "@/lib/linha-do-tempo";
import { Avatar } from "../../ui/basicos";

/**
 * O que chegou em Posts e em Serviços, logo embaixo das abas (17/11/2026, Marcelo: "adicione uma indicador de
 * mensagens novas em posts ou servicos, se tiver, algum bannerzinho pequenino ou algo bem legal"): a linha abre sempre
 * em Vagas, e quem não abre as outras abas não sabia do que chegou lá. Um botão pequeno por aba, com os rostos de quem
 * publicou; tocar abre a aba, e o que estava lá deixa de ser novidade. Não aparece na própria aba (nem o de Serviços
 * em Tudo, que já mostra os serviços). Vem do servidor junto com as abas: não empurra a linha depois de abrir.
 */
export function NovidadesDasAbas({
  aba,
  naoVistos,
  hrefs,
}: {
  aba: "tudo" | "vaga" | "servico" | "recado";
  naoVistos: { servicos: NovidadeDaAba; posts: NovidadeDaAba } | null;
  hrefs: { servico: string; recado: string };
}) {
  if (!naoVistos) return null;
  const { posts, servicos } = naoVistos;
  const mostrarPosts = aba !== "recado" && posts.quantos > 0;
  const mostrarServicos = aba !== "servico" && aba !== "tudo" && servicos.quantos > 0;
  if (!mostrarPosts && !mostrarServicos) return null;
  return (
    <nav
      aria-label="Novidades nas outras abas"
      className="sem-barra -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
    >
      {mostrarPosts && (
        <Novidade
          href={hrefs.recado}
          novidade={posts}
          icone={MessageSquareText}
          texto={posts.quantos === 1 && posts.sobre ? `Post novo de ${posts.sobre}` : `${quantos(posts)} posts novos`}
          aba="Posts"
        />
      )}
      {mostrarServicos && (
        <Novidade
          href={hrefs.servico}
          novidade={servicos}
          icone={Wrench}
          texto={
            servicos.quantos === 1 && servicos.sobre
              ? `Serviço novo: ${servicos.sobre}`
              : `${quantos(servicos)} serviços novos`
          }
          aba="Serviços"
        />
      )}
    </nav>
  );
}

const quantos = (n: NovidadeDaAba) => (n.quantos > 99 ? "99+" : String(n.quantos));

function Novidade({
  href,
  novidade,
  icone: Icone,
  texto,
  aba,
}: {
  href: string;
  novidade: NovidadeDaAba;
  icone: LucideIcon;
  texto: string;
  aba: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className="flex min-h-9 max-w-[19rem] shrink-0 items-center gap-2 rounded-pill bg-terra-soft py-1 pr-3.5 pl-1 text-[13px] leading-4 font-semibold text-terra-text transition-colors hover:bg-terra-soft/70 motion-safe:animate-[pk-surge_420ms_ease-out_both] focus-visible:-outline-offset-2"
    >
      {/* os rostos de quem publicou, o mais novo por cima (pessoa redonda; empresa, comércio e agência no quadrado) */}
      {novidade.rostos.length ? (
        <span aria-hidden className="flex shrink-0">
          {novidade.rostos.map((r, i) => (
            <span key={r.id} className={`relative flex ${i > 0 ? "-ml-1.5" : ""}`} style={{ zIndex: 3 - i }}>
              <Avatar
                nome={r.nome}
                foto={r.foto}
                tamanho={26}
                forma={r.empresa ? "quadrada" : "redonda"}
                colorida
                className="ring-2 ring-terra-soft"
              />
            </span>
          ))}
        </span>
      ) : (
        <span aria-hidden className="flex size-[26px] shrink-0 items-center justify-center">
          <Icone className="size-4" />
        </span>
      )}
      <span className="truncate">{texto}</span>
      <span className="sr-only">, na aba {aba}</span>
    </Link>
  );
}
