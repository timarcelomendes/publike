import { ArrowRight, ImagePlus, Link2, MapPin } from "lucide-react";
import Link from "next/link";
import { forcaDoCurriculo } from "@/lib/curriculo-forca";
import { pendenciasDeConexao } from "@/lib/conexoes";
import {
  contarMinhasSalvas,
  listarMeusAnuncios,
  listarMinhasCurtidas,
  minhasBuscasSalvas,
  obterMeuCurriculo,
  obterMeuPerfil,
} from "@/lib/dados";
import { minhasConexoes } from "@/lib/servidor/conexoes";
import { conversasPorPessoa } from "@/lib/servidor/conversas";
import { formatarLugar, plural } from "@/lib/formato";
import type { ModoPainel } from "@/lib/modo-painel";
import { agoraDaRequisicao } from "@/lib/tempo";
import { SeloVerificado } from "../selo-verificado";
import { Avatar } from "../ui/basicos";

const TIPO: Record<string, string> = { empresa: "Empresa", comercio: "Comércio", agencia: "Agência / RH" };

/**
 * O cartão da conta no alto da coluna da esquerda da home (como o perfil do LinkedIn):
 * Trabalhar mostra o currículo e o que falta; Serviços, a vitrine; Contratar, a empresa
 * com o link da página de vagas.
 */
export async function CartaoDaConta({ modo }: { modo: ModoPainel }) {
  const perfil = await obterMeuPerfil().catch(() => null);
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
      <div aria-hidden className="h-14 bg-ipe" />
      <div className="flex flex-col gap-3 px-4 pb-4">
        <Link href={`/perfil/${perfil.id}`} className="-mt-8 self-start rounded-md ring-4 ring-surface-200">
          <Avatar
            nome={perfil.nome}
            foto={perfil.foto}
            tamanho={64}
            forma={empresa ? "quadrada" : "redonda"}
            colorida
          />
        </Link>
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-body-lg font-semibold">
            <Link href={`/perfil/${perfil.id}`} className="truncate hover:underline">
              {perfil.nome}
            </Link>
            {perfil.verificado && <SeloVerificado agencia={perfil.tipo === "agencia"} />}
          </p>
          <p className="flex items-center gap-1 text-body-sm text-ink-muted">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">
              {empresa ? `${TIPO[perfil.tipo] ?? "Empresa"} · ` : ""}
              {formatarLugar(perfil.bairro, perfil.cidade)}
            </span>
          </p>
        </div>
        {modo === "trabalhar" ? (
          <Curriculo />
        ) : modo === "servicos" ? (
          <Vitrine />
        ) : (
          <div className="flex flex-col gap-2 border-t border-line pt-3 text-body-sm">
            <Link
              href={`/perfil/${perfil.id}/vagas`}
              className="inline-flex items-center gap-1.5 font-semibold text-ink hover:text-terra-text"
            >
              <Link2 aria-hidden className="size-4 shrink-0" />
              Sua página de vagas
            </Link>
            {!perfil.foto && (
              <Link href="/perfil" className="inline-flex items-center gap-1.5 text-ink-muted hover:text-ink">
                <ImagePlus aria-hidden className="size-4 shrink-0" />
                Ponha o logo: aparece nas suas vagas
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
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
 * Os atalhos da coluna da esquerda (Trabalhar e Serviços): uma lista curta com os números,
 * no lugar do menu inteiro do painel (que continua em Meu painel).
 */
export async function AtalhosDaConta({ modo }: { modo: ModoPainel }) {
  const [conversas, conexoes] = await Promise.all([
    conversasPorPessoa().catch(() => null),
    minhasConexoes().catch(() => null),
  ]);
  const novas = (conversas ?? []).reduce((total, c) => total + (c.nao_lidas ?? 0), 0);
  const pedidosDeConexao = pendenciasDeConexao(conexoes ?? []);
  let itens: Atalho[];
  if (modo === "servicos") {
    const anuncios = await listarMeusAnuncios().catch(() => []);
    const pedidos = anuncios.filter((a) => a.tipo === "servico").reduce((t, a) => t + (a.curtidas_novas ?? 0), 0);
    itens = [
      { nome: "Pedidos", href: "/painel/anuncios?tipo=servico", numero: pedidos, destaque: pedidos > 0 },
      { nome: "Conversas", href: "/painel/conversas", numero: novas, destaque: novas > 0 },
      { nome: "Vitrine", href: "/painel/servicos", numero: null },
      { nome: "Avaliações", href: "/painel/avaliacoes", numero: null },
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
