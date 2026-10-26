import { ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";
import { conteudoDoSlug } from "@/lib/conteudos";
import type { Conteudo } from "@/lib/conteudos/tipos";
import { obterUsuario } from "@/lib/dados";
import { meusSeguidos } from "@/lib/dados-social";
import { formatarLugar, plural } from "@/lib/formato";
import type { Local } from "@/lib/regioes";
import { SeloVerificado } from "../selo-verificado";
import { BotaoSeguir } from "../social/botoes";
import { Avatar } from "../ui/basicos";
import { empresasContratando } from "./empresas-contratando";
import { cidadeDaVisita } from "@/lib/servidor/cidade";

// A coluna da direita do feed (computador grande; no celular, no meio da lista): quem
// está contratando perto, com o Seguir (aviso de vaga nova), e os conteúdos do blog.

/** A lista toda: as empresas perto que contratam agora (Conexões › Empresas). */
const TODAS_CONTRATANDO = "/painel/conexoes?aba=empresas&f=contratando";

const caixa = "flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card";

export async function ContratandoPerto({
  local,
  jeito = "coluna",
}: {
  local: Local | null;
  jeito?: "coluna" | "faixa";
}) {
  const visita = await cidadeDaVisita();
  const [todas, seguidos, usuario] = await Promise.all([
    empresasContratando(local, 6, visita),
    meusSeguidos().catch(() => []),
    obterUsuario().catch(() => null),
  ]);
  // a própria empresa não aparece na lista dela; na coluna (presa ao rolar), só 3 para caber na tela
  const empresas = todas.filter((e) => e.id !== usuario?.id).slice(0, jeito === "coluna" ? 3 : 6);
  if (!empresas.length) return null;
  const titulo = local ? "Contratando perto de você" : `Contratando em ${visita.cidade} e região`;
  // a ação daqui é Seguir: o aviso de vaga nova (o Conectar fica no perfil da empresa)
  const seguir = (e: (typeof empresas)[number]) => (
    <BotaoSeguir
      alvo={{ perfil: e.id }}
      seguidoId={seguidos.find((s) => s.alvo_perfil === e.id)?.id ?? null}
      logado={usuario !== null}
      voltar="/"
      rotulo={`Seguir ${e.nome}: aviso de vaga nova`}
      rotuloSeguindo={`Seguindo ${e.nome}`}
      soIcone
    />
  );

  if (jeito === "faixa") {
    // no meio da linha (celular e tablet): uma faixa que rola de lado, como a das contas novas
    return (
      <section aria-labelledby="contratando-perto-faixa" className="flex flex-col">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="contratando-perto-faixa" className="text-h3">
            {titulo}
          </h2>
          {usuario && (
            <Link href={TODAS_CONTRATANDO} className="shrink-0 text-label text-terra-text hover:text-ink">
              Ver todas
            </Link>
          )}
        </div>
        {/* relative: o texto do leitor de tela (sr-only, absoluto) fica dentro da rolagem e não alarga a página */}
        <ul className="sem-barra relative -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {empresas.map((e) => (
            <li
              key={e.id}
              className="flex w-40 shrink-0 flex-col items-center gap-2 rounded-lg border border-line bg-surface-200 p-3.5 text-center shadow-card"
            >
              <Link
                href={`/perfil/${e.id}/vagas`}
                className="flex min-w-0 flex-col items-center gap-1.5 self-stretch hover:underline"
              >
                <Avatar nome={e.nome} foto={e.foto} tamanho={56} forma="quadrada" colorida />
                <span className="flex max-w-full items-center justify-center gap-1 text-body-sm font-semibold">
                  <span className="truncate">{e.nome}</span>
                  {e.verificado && <SeloVerificado agencia={e.tipo === "agencia"} />}
                </span>
                <span className="-mt-1 block max-w-full truncate text-[13px] leading-[18px] text-ink-muted">
                  {plural(e.vagas, "vaga", "vagas")} · {e.lugar}
                </span>
              </Link>
              <div className="mt-auto">{seguir(e)}</div>
            </li>
          ))}
          {/* o último quadrinho leva à lista toda (quem entrou: as empresas perto, contratando agora) */}
          {usuario && (
            <li className="flex w-40 shrink-0">
              <Link
                href={TODAS_CONTRATANDO}
                className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong p-3.5 text-center text-label text-terra-text hover:bg-surface-200"
              >
                <ArrowRight aria-hidden className="size-6" />
                Ver mais
              </Link>
            </li>
          )}
        </ul>
      </section>
    );
  }

  return (
    <section aria-labelledby="contratando-perto" className={caixa}>
      <h2 id="contratando-perto" className="text-h3">
        {titulo}
      </h2>
      {/* o lugar de quem vê: o bairro (CEP de casa, busca ou perfil); sem bairro, a cidade */}
      {local && (
        <p className="-mt-2 flex items-center gap-1 text-body-sm text-ink-muted">
          <MapPin aria-hidden className="size-4 shrink-0" />
          <span className="truncate">
            {local.bairro ? `${formatarLugar(local.bairro, local.cidade)} e região` : `${local.cidade} e região`}
          </span>
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {empresas.map((e) => (
          // uma linha por empresa: a foto, o nome com as vagas e o sino à direita
          <li key={e.id} className="flex items-center gap-2">
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
            {seguir(e)}
          </li>
        ))}
      </ul>
      {usuario && (
        <Link
          href={TODAS_CONTRATANDO}
          className="inline-flex items-center gap-1.5 text-label text-terra-text hover:text-ink"
        >
          Ver todas
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      )}
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
