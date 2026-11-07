import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Inbox,
  KanbanSquare,
  Route,
  List,
  ListOrdered,
  Pencil,
  ScanSearch,
  Sparkles,
  Video,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/config";
import { STATUS_ANUNCIO } from "@/lib/constantes";
import { recursosPagos } from "@/lib/dados";
import { formatarLugar, formatarNumero } from "@/lib/formato";
import { marcaDoRecurso, NOME_RECURSO, type EstadoRecurso, type FerramentaDeAvaliar } from "@/lib/recursos-pagos";
import type { Saude } from "@/lib/saude-vaga";
import { candidaturasDaVaga, contarCandidaturas, type ContagemDaVaga } from "@/lib/servidor/numeros-da-vaga";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { StatusAnuncio } from "@/lib/tipos";
import { SeloCortesia } from "../selo-cortesia";
import { Selo } from "../ui/basicos";
import { CopiarLinkDaVaga } from "./links-para-mandar";
import { MaisDaVaga } from "./mais-da-vaga";
import { EtiquetaDaSaude } from "./saude-vaga";

export type AbaDaVaga =
  "candidatos" | "avaliar" | "copiloto" | "testes" | "video" | "automacoes" | "numeros" | "editar";

/** As páginas que ficam dentro da aba Avaliar: a Triagem com IA, o Teste Prático e a Entrevista em vídeo. */
const DO_AVALIAR: AbaDaVaga[] = ["avaliar", "copiloto", "testes", "video"];

export const ICONE_DA_FERRAMENTA: Record<FerramentaDeAvaliar, LucideIcon> = {
  copiloto: Sparkles,
  testes: ClipboardCheck,
  video: Video,
};

/**
 * O alto de toda página de uma vaga no painel (pedido de 01/11/2026: todas as abas à vista, e os números dos
 * candidatos no alto): a volta para Vagas, o estado, a saúde e o lugar; o nome, com a linha dos números (quem
 * espera a resposta, em análise, em entrevista, contratados); "Editar a vaga", "Copiar o link da vaga" e o
 * "Mais"; e as 4 abas, que cabem na largura do painel e do celular: Candidatos, Avaliar (a Triagem com IA, o
 * Teste Prático e a Entrevista em vídeo, numa linha embaixo das abas quando se está numa delas), Automações e
 * Resultados. A pílula dos recursos pagos segue a conta (`marcaDoRecurso`).
 */
export async function CabecalhoDaVaga({
  anuncio,
  aba,
  extra,
  cliente,
  acoes,
  nota,
  saude,
}: {
  anuncio: {
    id: string;
    titulo: string;
    status: string;
    cidade: string;
    bairro: string | null;
    /** quantas pessoas a vaga quer contratar */
    vagas?: number | null;
  };
  aba: AbaDaVaga;
  /** uma informação a mais no fim da linha dos números ("2 nos finalistas") */
  extra?: string | null;
  /** agência: o cliente da vaga, na trilha */
  cliente?: { id: string; nome: string } | null;
  /** botões a mais, à direita (agência: os finalistas) */
  acoes?: ReactNode;
  /** uma linha embaixo do nome (agência: o cliente em sigilo) */
  nota?: ReactNode;
  /** a saúde da vaga (nas páginas de Candidatos) */
  saude?: Saude | null;
}) {
  const [recursos, agora, candidaturas] = await Promise.all([
    recursosPagos(),
    agoraDaRequisicao(),
    candidaturasDaVaga(anuncio.id),
  ]);
  const contagem = candidaturas ? contarCandidaturas(candidaturas) : null;
  // sem a migração 20270104120000, a Entrevista em vídeo não aparece
  const ferramentas: FerramentaDeAvaliar[] = [
    "copiloto",
    "testes",
    ...(recursos && !recursos.video.indisponivel ? ["video" as const] : []),
  ];
  const marca = (r: FerramentaDeAvaliar) => marcaDoRecurso(recursos?.[r], agora).curto;
  const status = anuncio.status as StatusAnuncio;
  const noAr = status === "ativo";
  const id = anuncio.id;
  const noAvaliar = DO_AVALIAR.includes(aba);
  const abas: {
    chave: string;
    nome: string;
    href: string;
    icone: LucideIcon;
    ativa: boolean;
    numero?: number | null;
    marca?: string | null;
    novo?: boolean;
  }[] = [
    {
      chave: "candidatos",
      nome: "Candidatos",
      href: `/painel/anuncio/${id}/quadro`,
      icone: Inbox,
      ativa: aba === "candidatos",
      numero: contagem?.total,
    },
    {
      chave: "avaliar",
      nome: "Avaliar",
      href: `/painel/anuncio/${id}/avaliar`,
      icone: ScanSearch,
      ativa: noAvaliar,
      marca: marcaDoAvaliar(
        ferramentas.map((r) => recursos?.[r]),
        agora,
      ),
    },
    // as automações da vaga (migrações 20270109120000 e 20270111120000)
    {
      chave: "automacoes",
      nome: "Automações",
      href: `/painel/anuncio/${id}/automacoes`,
      icone: Workflow,
      ativa: aba === "automacoes",
    },
    {
      chave: "numeros",
      nome: "Resultados",
      href: `/painel/anuncio/${id}/numeros`,
      icone: BarChart3,
      ativa: aba === "numeros",
      novo: true,
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Trilha" className="flex flex-wrap items-center gap-1 text-label text-ink-muted">
        <Link href="/painel/anuncios?tipo=vaga" className="inline-flex min-h-11 items-center gap-1.5 hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" />
          Vagas
        </Link>
        {cliente && (
          <>
            <ChevronRight aria-hidden className="size-4" />
            <Link href={`/painel/clientes/${cliente.id}`} className="inline-flex min-h-11 items-center hover:text-ink">
              {cliente.nome}
            </Link>
          </>
        )}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="relative flex flex-wrap items-center gap-2">
            <Selo variante={noAr ? "match" : "contorno"}>{STATUS_ANUNCIO[status]?.nome ?? status}</Selo>
            {saude && <EtiquetaDaSaude s={saude} />}
            <span className="text-body-sm text-ink-muted">{formatarLugar(anuncio.bairro, anuncio.cidade)}</span>
          </div>
          <h2 className="mt-2 text-h2">{anuncio.titulo}</h2>
          {nota}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {acoes}
          <Link
            href={`/painel/anuncio/${id}/editar`}
            scroll={false}
            title="Editar a vaga"
            aria-current={aba === "editar" ? "page" : undefined}
            className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3.5 text-label ${
              aba === "editar"
                ? "border-ink bg-ink text-surface-100"
                : "border-line-strong bg-surface-200 hover:bg-surface-300"
            }`}
          >
            <Pencil aria-hidden className="size-[18px]" />
            {/* no celular, só o lápis: os três botões cabem numa linha */}
            <span className="max-sm:sr-only">Editar a vaga</span>
          </Link>
          {noAr && <CopiarLinkDaVaga url={`${SITE_URL}/anuncio/${id}`} />}
          <MaisDaVaga id={id} noAr={noAr} />
        </div>
      </div>
      {contagem && <LinhaDosNumeros id={id} n={contagem} vagas={anuncio.vagas ?? 1} extra={extra} />}
      {/* as 4 abas sempre à vista: lado a lado, com as pílulas, quando cabem; no celular, o ícone em cima do nome */}
      <nav aria-label="Partes da vaga" className="@container/abas">
        <ul className="grid grid-cols-4 border-b border-line @[42rem]/abas:flex @[42rem]/abas:gap-2">
          {abas.map((a) => {
            const Icone = a.icone;
            const numero = a.numero != null && a.numero > 0 ? (a.numero > 99 ? "99+" : String(a.numero)) : null;
            const dito = numero && <span className="sr-only"> {a.numero === 1 ? "candidato" : "candidatos"}</span>;
            return (
              <li key={a.chave} className="min-w-0">
                <Link
                  href={a.href}
                  scroll={false}
                  aria-current={a.ativa ? "page" : undefined}
                  className={`group -mb-px flex min-h-15 flex-col items-center justify-center gap-1 border-b-[3px] px-1 pt-1.5 pb-1 text-[13px] leading-4 font-semibold transition-colors @[42rem]/abas:min-h-12 @[42rem]/abas:flex-row @[42rem]/abas:gap-2 @[42rem]/abas:px-3 @[42rem]/abas:py-0 @[42rem]/abas:text-label ${
                    a.ativa
                      ? "border-ink text-ink"
                      : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  <span className="relative flex">
                    <Icone
                      aria-hidden
                      className={`size-5 @[42rem]/abas:size-[18px] ${a.ativa ? "text-ink" : "text-ink-muted group-hover:text-ink"}`}
                    />
                    {/* estreito: o número e a marca no canto do ícone */}
                    {numero && (
                      <span
                        className={`absolute -top-2 left-3.5 min-w-5 rounded-pill px-1 text-center text-[11px] leading-5 font-bold tabular-nums ring-2 ring-surface-100 @[42rem]/abas:hidden ${
                          a.ativa ? "bg-ink text-surface-100" : "bg-surface-300 text-ink"
                        }`}
                      >
                        {numero}
                        {dito}
                      </span>
                    )}
                    {a.marca && (
                      <span
                        title={a.marca}
                        className="absolute -top-0.5 -right-1 size-2.5 rounded-pill bg-ipe ring-2 ring-surface-100 @[42rem]/abas:hidden"
                      >
                        <span className="sr-only">{a.marca}</span>
                      </span>
                    )}
                  </span>
                  <span className="max-w-full truncate">{a.nome}</span>
                  {numero && (
                    <span
                      className={`hidden min-w-6 rounded-pill px-1.5 text-center text-caption leading-6 tabular-nums @[42rem]/abas:inline ${
                        a.ativa ? "bg-ink text-surface-100" : "bg-surface-300 text-ink"
                      }`}
                    >
                      {numero}
                      {dito}
                    </span>
                  )}
                  {/* o Selo já é inline-flex: quem esconde é a caixa em volta */}
                  {a.marca && (
                    <span className="hidden @[42rem]/abas:flex">
                      <SeloCortesia curto texto={a.marca} />
                    </span>
                  )}
                  {a.novo && (
                    <span className="hidden @[48rem]/abas:flex">
                      <Selo variante="novo">Novo</Selo>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {noAvaliar && aba !== "avaliar" && (
        <nav aria-label="Ferramentas para avaliar" className="flex flex-wrap gap-2">
          {ferramentas.map((r) => {
            const Icone = ICONE_DA_FERRAMENTA[r];
            const ativa = r === aba;
            return (
              <Link
                key={r}
                href={`/painel/anuncio/${id}/${r}`}
                scroll={false}
                aria-current={ativa ? "page" : undefined}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
                  ativa ? "border-ink bg-ink text-surface-100" : "border-line-strong text-ink hover:bg-surface-300"
                }`}
              >
                <Icone aria-hidden className={`size-4 ${ativa ? "" : "text-ink-muted"}`} />
                {NOME_RECURSO[r]}
                <span className="flex max-sm:hidden">
                  <SeloCortesia curto texto={marca(r)} />
                </span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

/**
 * A aba Avaliar leva a pílula das três ferramentas numa só: "15 dias grátis" se dá para experimentar alguma; senão,
 * os dias grátis que acabam primeiro; nada quando todas estão liberadas ou o teste já acabou.
 */
function marcaDoAvaliar(estados: (EstadoRecurso | null | undefined)[], agora: number): string | null {
  // sem o estado (antes da migração), vale a oferta, como em `marcaDoRecurso`
  const oferta = estados.findIndex((e) => !e || (!e.liberado && e.pode_experimentar));
  if (oferta >= 0) return marcaDoRecurso(estados[oferta], agora).curto;
  const emTeste = estados
    .filter((e): e is EstadoRecurso & { ate: string } => Boolean(e?.liberado && e.ate && !e.assinante))
    .sort((a, b) => a.ate.localeCompare(b.ate));
  return emTeste.length ? marcaDoRecurso(emTeste[0], agora).curto : null;
}

/**
 * Os números dos candidatos, embaixo do nome da vaga: quem espera a sua resposta (ou "Respostas em dia"), em
 * análise, em entrevista e os contratados (com a meta, quando a vaga quer mais de uma pessoa). Cada número abre a
 * lista; quem espera abre em Candidatos, onde vem primeiro.
 */
function LinhaDosNumeros({
  id,
  n,
  vagas,
  extra,
}: {
  id: string;
  n: ContagemDaVaga;
  vagas: number;
  extra?: string | null;
}) {
  if (n.total === 0) {
    return <p className="-mt-1 text-body-sm text-ink-muted">Nenhum candidato ainda.{extra ? ` ${extra}` : ""}</p>;
  }
  const item = "inline-flex min-h-8 items-center gap-1 underline-offset-2 hover:underline";
  const preenchida = n.contratados >= vagas;
  return (
    <p className="-mt-1 flex flex-wrap items-center gap-x-5 gap-y-0.5 text-body-sm">
      {n.esperam > 0 ? (
        <Link href={`/painel/caixa?aba=novos&vaga=${id}`} className={`${item} font-semibold text-terra-text`}>
          <strong className="tabular-nums">{formatarNumero(n.esperam)}</strong>
          {n.esperam === 1 ? "espera a sua resposta" : "esperam a sua resposta"}
        </Link>
      ) : (
        <span className="inline-flex min-h-8 items-center gap-1.5 text-ink-muted">
          <CircleCheck aria-hidden className="size-4 text-cerrado-text" />
          Respostas em dia
        </span>
      )}
      {n.analise > 0 && (
        <Link href={`/painel/anuncio/${id}?etapa=analise`} className={`${item} text-ink-muted hover:text-ink`}>
          <strong className="font-semibold text-ink tabular-nums">{formatarNumero(n.analise)}</strong>
          em análise
        </Link>
      )}
      {n.entrevista > 0 && (
        <Link href={`/painel/anuncio/${id}?etapa=entrevista`} className={`${item} text-ink-muted hover:text-ink`}>
          <strong className="font-semibold text-ink tabular-nums">{formatarNumero(n.entrevista)}</strong>
          em entrevista
        </Link>
      )}
      {(n.contratados > 0 || vagas > 1) && (
        <Link
          href={`/painel/anuncio/${id}?etapa=contratados`}
          className={`${item} ${preenchida ? "font-semibold text-cerrado-text" : "text-ink-muted hover:text-ink"}`}
        >
          {preenchida && <CircleCheck aria-hidden className="size-4" />}
          <strong className={`font-semibold tabular-nums ${preenchida ? "" : "text-ink"}`}>
            {formatarNumero(n.contratados)}
            {vagas > 1 && ` de ${formatarNumero(vagas)}`}
          </strong>
          {(vagas > 1 ? vagas : n.contratados) === 1 ? "contratado" : "contratados"}
        </Link>
      )}
      {extra && <span className="text-ink-muted">{extra}</span>}
    </p>
  );
}

/** Dentro de Candidatos: o quadro (por etapa) ou a lista, a escolha de cada um. */
export function VistaDosCandidatos({ id, atual }: { id: string; atual: "quadro" | "lista" | "trilha" }) {
  const opcoes = [
    { vista: "quadro" as const, nome: "Quadro", href: `/painel/anuncio/${id}/quadro`, icone: KanbanSquare },
    // a trilha de cada candidato, etapa por etapa (claude/plano-trilha-dos-candidatos.md)
    { vista: "trilha" as const, nome: "Trilha", href: `/painel/anuncio/${id}/trilha`, icone: Route },
    { vista: "lista" as const, nome: "Lista", href: `/painel/anuncio/${id}`, icone: List },
  ];
  return (
    <div
      role="group"
      aria-label="Ver os candidatos em"
      className="inline-flex self-start rounded-pill border border-line p-1"
    >
      {opcoes.map((o) => {
        const Icone = o.icone;
        const ativo = o.vista === atual;
        return (
          <Link
            key={o.vista}
            href={o.href}
            scroll={false}
            aria-current={ativo ? "page" : undefined}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-pill px-3.5 text-label ${
              ativo ? "bg-ink text-surface-100" : "text-ink-muted hover:text-ink"
            }`}
          >
            <Icone aria-hidden className="size-4" />
            {o.nome}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * "Ordenar pelo Copiloto" (claude/plano-painel-simples.md, parte 3): na lista e no quadro da vaga, quando a
 * vaga já foi lida. Ligado, quem o Copiloto pôs na frente vem primeiro; desligado, a ordem de sempre.
 */
/**
 * "Quem chamar primeiro" (plano da Triagem, item 2): a Triagem, o Teste Prático, o % de match e quem espera há mais
 * tempo numa ordem só. Ficou no lugar do "Ordenar pela triagem" e do "Ordenar pelo teste" no quadro.
 */
export function OrdemQuemChamar({ ativo, href }: { ativo: boolean; href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={ativo}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
        ativo ? "border-ink bg-ink text-surface-100" : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
      }`}
    >
      <ListOrdered aria-hidden className={`size-4 ${ativo ? "" : "text-terra-text"}`} />
      Quem chamar primeiro
      {!ativo && <Selo variante="novo">Novo</Selo>}
    </Link>
  );
}

export function OrdemPeloCopiloto({ ativo, href }: { ativo: boolean; href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={ativo}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
        ativo ? "border-ink bg-ink text-surface-100" : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
      }`}
    >
      <Sparkles aria-hidden className={`size-4 ${ativo ? "" : "text-terra-text"}`} />
      Ordenar pela triagem
      {!ativo && <Selo variante="novo">Novo</Selo>}
    </Link>
  );
}
