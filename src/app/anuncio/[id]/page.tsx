import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  Briefcase,
  CalendarClock,
  Clock,
  Flag,
  MapPin,
  ShieldAlert,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { BotaoCompartilhar } from "@/components/anuncio/compartilhar";
import { PainelCurtir } from "@/components/anuncio/painel-curtir";
import { MapaArea } from "@/components/mapa/mapa-area";
import { Aviso, Avatar, Container, Esqueleto, Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { SITE_URL } from "@/lib/config";
import { categoria, REGIMES, STATUS_ANUNCIO } from "@/lib/constantes";
import { contatoDoMatch, obterAnuncio, obterUsuario } from "@/lib/dados";
import {
  formatarData,
  formatarLugar,
  formatarMesAno,
  formatarValor,
  primeiro,
  rotuloConta,
  rotuloModalidade,
  tempoRelativo,
} from "@/lib/formato";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { AnuncioCompleto, Regime, StatusAnuncio } from "@/lib/tipos";

export async function generateMetadata({ params }: PageProps<"/anuncio/[id]">): Promise<Metadata> {
  const { id } = await params;
  const anuncio = await obterAnuncio(id);
  if (!anuncio) return { title: "Anúncio não encontrado", robots: { index: false } };
  const descricao = `${rotuloModalidade(anuncio.tipo, anuncio.regime)} em ${formatarLugar(anuncio.bairro, anuncio.cidade)}. ${formatarValor(anuncio.pagamento_valor, anuncio.pagamento_unidade, anuncio.beneficios)}. ${anuncio.descricao.slice(0, 120)}`;
  return {
    title: anuncio.titulo,
    description: descricao,
    alternates: { canonical: `/anuncio/${id}` },
    openGraph: { title: anuncio.titulo, description: descricao, type: "article" },
    robots: anuncio.status === "ativo" ? undefined : { index: false },
  };
}

export default function PaginaAnuncio({ params, searchParams }: PageProps<"/anuncio/[id]">) {
  return (
    <Suspense fallback={<EsqueletoAnuncio />}>
      <DetalheAnuncio params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function Fato({ icone: Icone, rotulo, children }: { icone: LucideIcon; rotulo: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-300 text-ink">
        <Icone aria-hidden className="size-5" />
      </span>
      <div>
        <dt className="text-body-sm text-ink-muted">{rotulo}</dt>
        <dd className="text-label text-ink">{children}</dd>
      </div>
    </div>
  );
}

/** Dados estruturados para o Google mostrar a vaga na busca de empregos. */
function dadosVaga(a: AnuncioCompleto) {
  const tipos: Record<string, string> = {
    clt: "FULL_TIME",
    temporario: "TEMPORARY",
    diaria: "PER_DIEM",
    freelance: "CONTRACTOR",
    estagio: "INTERN",
    pj: "CONTRACTOR",
    outro: "OTHER",
  };
  const unidades: Record<string, string> = { hora: "HOUR", dia: "DAY", semana: "WEEK", mes: "MONTH" };
  return {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: a.titulo,
    description: a.descricao.replace(/\n/g, "<br>"),
    datePosted: a.criado_em,
    validThrough: a.expira_em,
    employmentType: tipos[a.regime ?? "outro"] ?? "OTHER",
    hiringOrganization: { "@type": "Organization", name: a.autor_nome },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: a.cidade,
        addressRegion: "GO",
        addressCountry: "BR",
      },
    },
    directApply: false,
    url: `${SITE_URL}/anuncio/${a.id}`,
    ...(a.pagamento_valor != null && a.pagamento_unidade && unidades[a.pagamento_unidade]
      ? {
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: "BRL",
            value: { "@type": "QuantitativeValue", value: a.pagamento_valor, unitText: unidades[a.pagamento_unidade] },
          },
        }
      : {}),
  };
}

async function DetalheAnuncio({
  params,
  searchParams,
}: {
  params: PageProps<"/anuncio/[id]">["params"];
  searchParams: PageProps<"/anuncio/[id]">["searchParams"];
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [anuncio, usuario] = await Promise.all([obterAnuncio(id), obterUsuario()]);
  if (!anuncio) notFound();

  const agora = await agoraDaRequisicao();
  const proprio = usuario?.id === anuncio.autor_id;
  const contato = anuncio.minha_curtida === "match" ? await contatoDoMatch(anuncio.id) : null;
  const lugar = formatarLugar(anuncio.bairro, anuncio.cidade);
  const valor = formatarValor(anuncio.pagamento_valor, anuncio.pagamento_unidade, anuncio.beneficios);
  const vaga = anuncio.tipo === "vaga";
  const novo = agora - new Date(anuncio.criado_em).getTime() < 48 * 3600 * 1000;
  const status = anuncio.status as StatusAnuncio;

  const quadroAcao = (sufixo: string) =>
    proprio ? (
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
        <p className="font-display text-h3">Este anúncio é seu</p>
        <p className="text-body-sm text-ink-muted">Veja quem curtiu e curta de volta para dar match.</p>
        <BotaoLink href={`/painel/anuncio/${anuncio.id}`} variante="sucesso">
          Ver quem curtiu
        </BotaoLink>
        <BotaoLink href={`/painel/anuncio/${anuncio.id}/editar`}>Editar anúncio</BotaoLink>
      </div>
    ) : (
      <PainelCurtir
        idCampo={`mensagem-curtida-${sufixo}`}
        anuncioId={anuncio.id}
        titulo={anuncio.titulo}
        tipo={anuncio.tipo}
        status={anuncio.minha_curtida}
        mensagem={anuncio.minha_mensagem}
        logado={usuario !== null}
        contato={contato}
      />
    );

  return (
    <Container className="py-6 sm:py-8">
      {vaga && anuncio.status === "ativo" && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(dadosVaga(anuncio)).replace(/</g, "\\u003c") }}
        />
      )}

      <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Voltar para a busca
      </Link>

      {primeiro(sp.publicado) === "1" && (
        <Aviso tipo="sucesso" className="mt-4" titulo="Seu anúncio está no ar!">
          Ele fica 30 dias publicado. Quando alguém curtir, você recebe um aviso e vê a pessoa no seu painel.
        </Aviso>
      )}
      {primeiro(sp.salvo) === "1" && <Aviso tipo="sucesso" className="mt-4" titulo="Alterações salvas." />}
      {proprio && status !== "ativo" && (
        <Aviso tipo="alerta" className="mt-4" titulo={`Este anúncio está: ${STATUS_ANUNCIO[status]?.nome ?? status}`}>
          {STATUS_ANUNCIO[status]?.ajuda}. Só você consegue ver esta página agora.
        </Aviso>
      )}

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <article className="min-w-0">
          <div className="flex flex-wrap gap-2">
            {novo && <Selo variante="novo">Novo</Selo>}
            <Selo>{rotuloModalidade(anuncio.tipo, anuncio.regime)}</Selo>
            <Selo variante="contorno">{categoria(anuncio.categoria).nome}</Selo>
          </div>
          <h1 className="mt-3 text-h2 sm:text-h1">{anuncio.titulo}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-1 text-body text-ink-muted">
            <Link href={`/perfil/${anuncio.autor_id}`} className="font-semibold text-ink underline-offset-2 hover:underline">
              {anuncio.autor_nome}
            </Link>
            · {rotuloConta(anuncio.autor_tipo)}
            {anuncio.autor_verificado && (
              <BadgeCheck aria-label="Perfil verificado" className="size-4 text-cerrado-text" />
            )}
          </p>

          <dl className="mt-6 grid gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:grid-cols-2 sm:p-6">
            <Fato icone={MapPin} rotulo="Onde é">
              {lugar}
              <span className="block text-body-sm font-normal text-ink-muted">região aproximada</span>
            </Fato>
            <Fato icone={Banknote} rotulo="Valor">
              {valor}
            </Fato>
            <Fato icone={vaga ? Briefcase : Wrench} rotulo={vaga ? "Contratação" : "Tipo"}>
              {vaga && anuncio.regime ? REGIMES[anuncio.regime as Regime]?.nome : "Serviço"}
            </Fato>
            {anuncio.horario && (
              <Fato icone={Clock} rotulo="Quando">
                {anuncio.horario}
              </Fato>
            )}
            {vaga && anuncio.vagas > 1 && (
              <Fato icone={Users} rotulo="Vagas">
                {anuncio.vagas} pessoas
              </Fato>
            )}
            <Fato icone={CalendarClock} rotulo="Publicado">
              {tempoRelativo(anuncio.criado_em, agora)}
              <span className="block text-body-sm font-normal text-ink-muted">
                fica no ar até {formatarData(anuncio.expira_em)}
              </span>
            </Fato>
          </dl>

          {/* No celular, curtir fica logo aqui; no computador, na coluna ao lado */}
          <div className="mt-6 lg:hidden">{quadroAcao("celular")}</div>

          <h2 className="mt-8 text-h2">{vaga ? "Sobre a vaga" : "Sobre o serviço"}</h2>
          <div className="mt-3 text-body whitespace-pre-line text-ink">{anuncio.descricao}</div>

          <h2 className="mt-8 text-h2">Onde é</h2>
          <p className="mt-1 mb-3 text-body-sm text-ink-muted">
            Mostramos só uma área de uns 500 metros em {lugar}. O endereço vocês combinam depois do match.
          </p>
          <MapaArea lat={anuncio.lat} lng={anuncio.lng} />
        </article>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <div className="hidden lg:block">{quadroAcao("lateral")}</div>

          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-200 p-4">
            <Avatar nome={anuncio.autor_nome} foto={anuncio.autor_foto} tamanho={48} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-label">{anuncio.autor_nome}</p>
              <p className="text-body-sm text-ink-muted">
                {rotuloConta(anuncio.autor_tipo)} · no Publike desde {formatarMesAno(anuncio.autor_desde)}
              </p>
            </div>
            <Link href={`/perfil/${anuncio.autor_id}`} className="text-label text-terra-text underline-offset-2 hover:underline">
              Ver perfil
            </Link>
          </div>

          <div className="flex justify-start">
            <BotaoCompartilhar titulo={anuncio.titulo} texto={`${anuncio.titulo} · ${lugar} · Publike`} />
          </div>

          <div className="flex gap-3 rounded-lg bg-terra-soft p-4 text-body-sm text-ink">
            <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-terra-text" />
            <div>
              <p className="text-label">Fique de olho</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>Ninguém pode cobrar para você conseguir trabalho.</li>
                <li>Não mande Pix adiantado nem senhas.</li>
                <li>No primeiro encontro, prefira um lugar movimentado.</li>
              </ul>
            </div>
          </div>

          {!proprio && (
            <Link
              href={`/anuncio/${anuncio.id}/denunciar`}
              className="inline-flex min-h-11 items-center gap-2 self-start text-label text-danger underline-offset-2 hover:underline"
            >
              <Flag aria-hidden className="size-4" />
              Denunciar anúncio
            </Link>
          )}
        </aside>
      </div>
    </Container>
  );
}

function EsqueletoAnuncio() {
  return (
    <Container className="py-8" aria-busy="true">
      <Esqueleto className="h-6 w-40" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <div className="flex flex-col gap-4">
          <Esqueleto className="h-6 w-32 rounded-pill" />
          <Esqueleto className="h-10 w-3/4" />
          <Esqueleto className="h-5 w-1/3" />
          <Esqueleto className="h-48 w-full rounded-lg" />
          <Esqueleto className="h-32 w-full" />
        </div>
        <Esqueleto className="h-64 w-full rounded-lg" />
      </div>
    </Container>
  );
}
