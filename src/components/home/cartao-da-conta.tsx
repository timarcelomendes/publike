import {
  ArrowRight,
  Briefcase,
  Eye,
  FileText,
  Handshake,
  Heart,
  ImagePlus,
  Inbox,
  Link2,
  MapPin,
  Store,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { esperaResposta } from "@/lib/constantes";
import { forcaDoCurriculo } from "@/lib/curriculo-forca";
import { pendenciasDeConexao } from "@/lib/conexoes";
import {
  contarMinhasSalvas,
  listarMeusAnuncios,
  listarMeusCandidatos,
  listarMinhasCurtidas,
  minhasBuscasSalvas,
  obterMeuCurriculo,
  obterMeuPerfil,
  obterUsuario,
} from "@/lib/dados";
import { minhasConexoes } from "@/lib/servidor/conexoes";
import { resumoDasVisitas } from "@/lib/servidor/visitas";
import { conversasPorPessoa } from "@/lib/servidor/conversas";
import { textoDoQueFaz } from "@/lib/modo-painel";
import { modosMarcados } from "@/lib/servidor/modo";
import { perfilDeUso } from "@/lib/servidor/perfil-de-uso";
import { formatarLugar, plural } from "@/lib/formato";
import { agoraDaRequisicao } from "@/lib/tempo";
import { SeloVerificado } from "../selo-verificado";
import { FotoDaConta } from "./foto-da-conta";

const TIPO: Record<string, string> = { empresa: "Empresa", comercio: "Comércio", agencia: "Agência / RH" };

/**
 * O cartão da conta no alto da coluna da esquerda da home (como o perfil do LinkedIn). Segue o
 * perfil, não o modo do painel: quem procura trabalho vê o currículo e o que falta; quem presta
 * serviço, a vitrine; quem contrata, o link da página de vagas.
 */
export async function CartaoDaConta({ jeito = "painel" }: { jeito?: "painel" | "linha" } = {}) {
  const [perfil, uso, usuario] = await Promise.all([
    obterMeuPerfil().catch(() => null),
    perfilDeUso(),
    obterUsuario().catch(() => null),
  ]);
  if (!perfil) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4">
        <h2 className="text-h3">Complete seu perfil</h2>
        <p className="text-body-sm text-ink-muted">Com nome, bairro e um contato você já pode curtir e publicar.</p>
        <Link href="/perfil" className="self-start text-label underline underline-offset-2 hover:text-terra-text">
          Completar o perfil
        </Link>
      </section>
    );
  }
  const empresa = perfil.tipo !== "pessoa";
  return (
    <section
      aria-label="Sua conta"
      className="overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card"
    >
      {/* a capa calma: o ipê fica para os selos (um por tela) */}
      <div aria-hidden className="h-12 bg-surface-300" />
      <div className="flex flex-col gap-3 px-4 pb-4">
        <FotoDaConta
          nome={perfil.nome}
          foto={perfil.foto}
          empresa={empresa}
          pessoaId={usuario?.pessoaId ?? perfil.id}
          podeTrocar={Boolean(usuario && usuario.id === usuario.pessoaId)}
        />
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-body-lg font-semibold">
            <Link href={`/perfil/${perfil.id}`} className="truncate hover:underline">
              {perfil.nome}
            </Link>
            {perfil.verificado && <SeloVerificado agencia={perfil.tipo === "agencia"} />}
          </p>
          {jeito === "linha" && (
            <p className="text-body-sm text-ink">{empresa ? (TIPO[perfil.tipo] ?? "Empresa") : <QuemE uso={uso} />}</p>
          )}
          <p className="flex items-center gap-1 text-body-sm text-ink-muted">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">
              {empresa && jeito !== "linha" ? `${TIPO[perfil.tipo] ?? "Empresa"} · ` : ""}
              {formatarLugar(perfil.bairro, perfil.cidade)}
            </span>
          </p>
        </div>
        {jeito === "linha" ? (
          <LinksDaLinha id={perfil.id} uso={uso} />
        ) : uso === "trabalho" ? (
          <Curriculo />
        ) : uso === "servicos" ? (
          <Vitrine />
        ) : (
          <PaginaDeVagas id={perfil.id} empresa={empresa} semLogo={!perfil.foto} />
        )}
      </div>
    </section>
  );
}

/** Quem contrata: o link da página de vagas e, sem logo, o convite para pôr. */
async function PaginaDeVagas({ id, empresa, semLogo }: { id: string; empresa: boolean; semLogo: boolean }) {
  // pessoa que contrata: o link só depois da primeira vaga (antes, quem chama é a caixa de publicar)
  if (!empresa && !(await listarMeusAnuncios().catch(() => [])).some((a) => a.tipo === "vaga")) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3 text-body-sm">
      <Link
        href={`/perfil/${id}/vagas`}
        className="inline-flex items-center gap-1.5 font-semibold text-ink hover:text-terra-text"
      >
        <Link2 aria-hidden className="size-4 shrink-0" />
        Sua página de vagas
      </Link>
      {empresa && semLogo && (
        <Link href="/perfil" className="inline-flex items-center gap-1.5 text-ink-muted hover:text-ink">
          <ImagePlus aria-hidden className="size-4 shrink-0" />
          Ponha o logo: aparece nas suas vagas
        </Link>
      )}
    </div>
  );
}

async function Curriculo() {
  const curriculo = await obterMeuCurriculo().catch(() => undefined);
  if (curriculo === undefined) return null;
  const forca = forcaDoCurriculo(curriculo);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      {curriculo?.titulo && <p className="text-body-sm text-ink">{curriculo.titulo}</p>}
      <p className="flex items-baseline justify-between gap-2 text-body-sm">
        <span className="text-ink-muted">Currículo</span>
        <strong className="tabular-nums">{forca.pontos}%</strong>
      </p>
      <span aria-hidden className="flex h-2 overflow-hidden rounded-pill bg-surface-300">
        <span className={forca.pontos >= 80 ? "bg-cerrado" : "bg-ipe"} style={{ width: `${forca.pontos}%` }} />
      </span>
      {forca.dica && <p className="text-body-sm text-ink-muted">{forca.dica}</p>}
      <Link
        href="/perfil/curriculo"
        className="self-start text-label underline underline-offset-2 hover:text-terra-text"
      >
        {curriculo ? "Melhorar o currículo" : "Montar o currículo"}
      </Link>
    </div>
  );
}

async function Vitrine() {
  const [agora, anuncios] = await Promise.all([agoraDaRequisicao(), listarMeusAnuncios().catch(() => [])]);
  const servicos = anuncios.filter((a) => a.tipo === "servico");
  const noAr = servicos.filter((a) => a.status === "ativo" && new Date(a.expira_em).getTime() > agora).length;
  const pedidos = servicos.reduce((total, a) => total + (a.curtidas_novas ?? 0), 0);
  return (
    <div className="flex flex-col gap-1 border-t border-line pt-3 text-body-sm">
      <p className="text-ink-muted">
        {noAr ? `${plural(noAr, "serviço", "serviços")} na vitrine` : "Sua vitrine está vazia"}
      </p>
      {pedidos > 0 && (
        <p className="font-semibold text-terra-text">{plural(pedidos, "pedido", "pedidos")} para responder</p>
      )}
      <Link
        href="/painel/servicos"
        className="self-start text-label underline underline-offset-2 hover:text-terra-text"
      >
        {servicos.length ? "Editar a vitrine" : "Montar a vitrine"}
      </Link>
    </div>
  );
}

type Atalho = { nome: string; href: string; numero: number | null; destaque?: boolean };

/**
 * Os atalhos da coluna da esquerda do feed: uma lista curta com os números, no lugar do menu
 * inteiro do painel (que continua em Meu painel). Também seguem o perfil, como o cartão.
 */
export async function AtalhosDaConta() {
  const [conversas, conexoes, uso, visitas] = await Promise.all([
    conversasPorPessoa().catch(() => null),
    minhasConexoes().catch(() => null),
    perfilDeUso(),
    resumoDasVisitas().catch(() => null),
  ]);
  const novas = (conversas ?? []).reduce((total, c) => total + (c.nao_lidas ?? 0), 0);
  const pedidosDeConexao = pendenciasDeConexao(conexoes ?? []);
  let itens: Atalho[];
  if (uso === "servicos") {
    const anuncios = await listarMeusAnuncios().catch(() => []);
    const pedidos = anuncios.filter((a) => a.tipo === "servico").reduce((t, a) => t + (a.curtidas_novas ?? 0), 0);
    itens = [
      { nome: "Pedidos", href: "/painel/anuncios?tipo=servico", numero: pedidos, destaque: pedidos > 0 },
      { nome: "Conversas", href: "/painel/conversas", numero: novas, destaque: novas > 0 },
      { nome: "Vitrine", href: "/painel/servicos", numero: null },
      { nome: "Avaliações", href: "/painel/avaliacoes", numero: null },
    ];
  } else if (uso === "contratar") {
    // pessoa que contrata (ou conta que trocou o modo do painel): as vagas dela e os serviços pedidos
    const [anuncios, curtidas] = await Promise.all([
      listarMeusAnuncios().catch(() => []),
      listarMinhasCurtidas().catch(() => []),
    ]);
    const candidatos = anuncios.filter((a) => a.tipo === "vaga").reduce((t, a) => t + (a.curtidas_novas ?? 0), 0);
    itens = [
      { nome: "Minhas vagas", href: "/painel/anuncios?tipo=vaga", numero: candidatos, destaque: candidatos > 0 },
      {
        nome: "Serviços pedidos",
        href: "/painel/curtidas?tipo=servico",
        numero: curtidas.filter((c) => c.tipo === "servico").length,
      },
      { nome: "Conversas", href: "/painel/conversas", numero: novas, destaque: novas > 0 },
      { nome: "Conexões", href: "/painel/conexoes", numero: pedidosDeConexao, destaque: pedidosDeConexao > 0 },
    ];
  } else {
    const [curtidas, salvas, avisos] = await Promise.all([
      listarMinhasCurtidas().catch(() => []),
      contarMinhasSalvas().catch(() => null),
      minhasBuscasSalvas().catch(() => []),
    ]);
    itens = [
      {
        nome: "Candidaturas",
        href: "/painel/curtidas?tipo=vaga",
        numero: curtidas.filter((c) => c.tipo === "vaga").length,
      },
      { nome: "Conversas", href: "/painel/conversas", numero: novas, destaque: novas > 0 },
      { nome: "Conexões", href: "/painel/conexoes", numero: pedidosDeConexao, destaque: pedidosDeConexao > 0 },
      { nome: "Vagas salvas", href: "/descobrir?aba=salvas", numero: salvas },
      { nome: "Avisos de vaga", href: "/painel/seguindo", numero: avisos.length },
    ];
  }
  itens.push({
    nome: "Quem viu seu perfil",
    href: "/painel/visitas",
    numero: visitas?.semana ?? null,
    destaque: (visitas?.novas ?? 0) > 0,
  });
  return (
    <nav
      aria-label="Atalhos da conta"
      className="overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card"
    >
      <ul className="flex flex-col py-1">
        {itens.map((i) => (
          <li key={i.nome}>
            <Link
              href={i.href}
              className="flex min-h-12 items-center justify-between gap-3 px-4 text-label transition-colors hover:bg-surface-300"
            >
              {i.nome}
              {i.numero ? (
                <span
                  className={
                    i.destaque
                      ? "min-w-6 rounded-pill bg-like px-1.5 text-center text-caption leading-6 text-on-like"
                      : "text-body-sm text-ink-muted tabular-nums"
                  }
                >
                  {i.numero}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/painel"
        className="flex min-h-11 items-center justify-between border-t border-line px-4 text-body-sm text-ink-muted hover:bg-surface-300 hover:text-ink"
      >
        Meu painel
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </nav>
  );
}

/** A linha de quem é (embaixo do nome, na linha do tempo): o título do currículo ou o que faz. */
async function QuemE({ uso }: { uso: string }) {
  const [marcados, curriculo] = await Promise.all([modosMarcados(), obterMeuCurriculo().catch(() => null)]);
  // o que marcou no perfil ("O que você quer fazer no Publike?"); sem marcação, pelo uso
  if (marcados) return <>{textoDoQueFaz(marcados, curriculo?.titulo)}</>;
  if (uso === "servicos") return <>Presta serviços</>;
  return <>{curriculo?.titulo ? `${curriculo.titulo} · procura trabalho` : "Procura trabalho"}</>;
}

type LinkDoCartao = {
  nome: string;
  href: string;
  icone: LucideIcon;
  numero?: string | null;
  destaque?: boolean;
  /** a ação no lugar do atalho (o currículo que ainda não existe) */
  chamada?: boolean;
};

/**
 * Os atalhos do cartão na linha do tempo: quem procura vê o currículo (com a barra), as curtidas e
 * as conexões; quem presta serviço, a vitrine e os pedidos; quem contrata, o painel de vagas, quem
 * espera resposta e a página de vagas. Todo mundo vê as conexões (com os pedidos em destaque).
 */
async function LinksDaLinha({ id, uso }: { id: string; uso: string }) {
  const [conexoes, visitas] = await Promise.all([
    minhasConexoes().catch(() => null),
    resumoDasVisitas().catch(() => null),
  ]);
  // quem viu o perfil nos últimos 7 dias (em destaque quando há visita nova desde a última vez)
  const linkVisitas: LinkDoCartao = {
    nome: "Quem viu seu perfil",
    href: "/painel/visitas",
    icone: Eye,
    numero: visitas?.semana ? String(visitas.semana) : null,
    destaque: (visitas?.novas ?? 0) > 0,
  };
  const pedidosDeConexao = pendenciasDeConexao(conexoes ?? []);
  const conectados = (conexoes ?? []).filter((c) => c.status === "aceita").length;
  const linkConexoes: LinkDoCartao = {
    nome: "Conexões",
    href: "/painel/conexoes",
    icone: Handshake,
    numero: pedidosDeConexao ? String(pedidosDeConexao) : conectados ? String(conectados) : null,
    destaque: pedidosDeConexao > 0,
  };
  let barra: number | null = null;
  let links: LinkDoCartao[];
  if (uso === "contratar") {
    const [anuncios, candidatos] = await Promise.all([
      listarMeusAnuncios().catch(() => []),
      listarMeusCandidatos().catch(() => null),
    ]);
    const noAr = anuncios.filter((a) => a.tipo === "vaga" && a.status === "ativo").length;
    const esperam = (candidatos ?? []).filter(esperaResposta).length;
    links = [
      { nome: "Painel de vagas", href: "/painel", icone: Briefcase, numero: noAr ? `${noAr} no ar` : null },
      {
        nome: "Candidatos esperando",
        href: "/painel/caixa?aba=responder",
        icone: Inbox,
        numero: esperam ? String(esperam) : null,
        destaque: esperam > 0,
      },
      { nome: "Sua página de vagas", href: `/perfil/${id}/vagas`, icone: Link2 },
      linkConexoes,
      linkVisitas,
    ];
  } else if (uso === "servicos") {
    const anuncios = await listarMeusAnuncios().catch(() => []);
    const servicos = anuncios.filter((a) => a.tipo === "servico");
    const pedidos = servicos.reduce((t, a) => t + (a.curtidas_novas ?? 0), 0);
    links = [
      { nome: "Minha vitrine", href: "/painel/servicos", icone: Store, numero: String(servicos.length) },
      {
        nome: "Pedidos",
        href: "/painel/anuncios?tipo=servico",
        icone: Inbox,
        numero: pedidos ? String(pedidos) : null,
        destaque: pedidos > 0,
      },
      linkConexoes,
      linkVisitas,
    ];
  } else {
    const [curriculo, curtidas] = await Promise.all([
      obterMeuCurriculo().catch(() => null),
      listarMinhasCurtidas().catch(() => []),
    ]);
    barra = forcaDoCurriculo(curriculo).pontos;
    links = [
      // sem currículo, a barra vazia não convida: no lugar dela, a ação
      barra === 0
        ? { nome: "Montar o currículo", href: "/perfil/curriculo", icone: FileText, numero: "5 min", chamada: true }
        : { nome: "Meu currículo", href: "/perfil/curriculo", icone: FileText, numero: `${barra}%` },
      {
        nome: "Minhas curtidas",
        href: "/painel/curtidas",
        icone: Heart,
        numero: curtidas.length ? String(curtidas.length) : null,
      },
      linkConexoes,
      linkVisitas,
    ];
  }
  return (
    <nav aria-label="Atalhos da conta" className="flex flex-col border-t border-line pt-2">
      {links.map(({ nome, href, icone: Icone, numero, destaque, chamada }, i) => (
        <div key={nome}>
          <Link
            href={href}
            className={
              chamada
                ? "-mx-2 my-1 flex min-h-10 items-center gap-2.5 rounded-md bg-terra-soft px-2.5 text-label text-terra-text hover:underline"
                : "-mx-2 flex min-h-10 items-center gap-2.5 rounded-md px-2 text-label hover:bg-surface-300"
            }
          >
            <Icone aria-hidden className={`size-[18px] shrink-0 ${chamada ? "" : "text-ink-muted"}`} />
            <span className="min-w-0 flex-1 truncate">{nome}</span>
            {numero && (
              <span
                className={
                  destaque
                    ? "min-w-6 rounded-pill bg-terra-soft px-1.5 text-center text-caption leading-6 text-terra-text"
                    : chamada
                      ? "text-[12px] font-semibold"
                      : "text-body-sm font-semibold text-ink-muted tabular-nums"
                }
              >
                {numero}
              </span>
            )}
          </Link>
          {i === 0 && barra !== null && !chamada && (
            <span aria-hidden className="mb-1.5 block h-1.5 overflow-hidden rounded-pill bg-surface-300">
              <span className="block h-full rounded-pill bg-cerrado" style={{ width: `${barra}%` }} />
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
