import {
  ArrowLeft,
  ChevronRight,
  ClipboardCheck,
  Inbox,
  KanbanSquare,
  List,
  ListOrdered,
  Pencil,
  Sparkles,
  Video,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/config";
import { STATUS_ANUNCIO } from "@/lib/constantes";
import { contarCandidatosDaVaga, recursosPagos } from "@/lib/dados";
import { formatarLugar } from "@/lib/formato";
import { marcaDoRecurso } from "@/lib/recursos-pagos";
import type { Saude } from "@/lib/saude-vaga";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { StatusAnuncio } from "@/lib/tipos";
import { SeloCortesia } from "../selo-cortesia";
import { Selo } from "../ui/basicos";
import { CopiarLinkDaVaga } from "./links-para-mandar";
import { MaisDaVaga } from "./mais-da-vaga";
import { RolagemDasAbas } from "./rolagem-das-abas";
import { EtiquetaDaSaude } from "./saude-vaga";

export type AbaDaVaga = "candidatos" | "copiloto" | "testes" | "video" | "automacoes" | "editar";

/**
 * O alto de toda página de uma vaga no painel: a volta para Vagas, o nome, onde e quantos candidatos, o
 * link da vaga, o "Mais" e as abas (Candidatos, Copiloto, Testes e Editar). Assim a vaga é um lugar só:
 * de qualquer aba se chega às outras. O Copiloto aparece em toda vaga (sem o recurso, a aba mostra a oferta), e
 * a pílula segue a conta: "15 dias grátis", "faltam N dias" no teste, nada depois de liberado. A saúde da
 * vaga é uma etiqueta ao lado do estado (abre o que falta).
 */
export async function CabecalhoDaVaga({
  anuncio,
  aba,
  resumo,
  cliente,
  acoes,
  nota,
  saude,
}: {
  anuncio: { id: string; titulo: string; status: string; cidade: string; bairro: string | null };
  aba: AbaDaVaga;
  /** "3 candidatos · 1 para responder" */
  resumo?: string | null;
  /** agência: o cliente da vaga, na trilha */
  cliente?: { id: string; nome: string } | null;
  /** botões a mais, à direita (agência: os finalistas) */
  acoes?: ReactNode;
  /** uma linha embaixo do nome (agência: o cliente em sigilo) */
  nota?: ReactNode;
  /** a saúde da vaga (nas páginas de Candidatos) */
  saude?: Saude | null;
}) {
  const [recursos, agora, candidatos] = await Promise.all([
    recursosPagos(),
    agoraDaRequisicao(),
    contarCandidatosDaVaga(anuncio.id),
  ]);
  const marca = {
    copiloto: marcaDoRecurso(recursos?.copiloto, agora).curto,
    testes: marcaDoRecurso(recursos?.testes, agora).curto,
    video: marcaDoRecurso(recursos?.video, agora).curto,
  };
  const status = anuncio.status as StatusAnuncio;
  const noAr = status === "ativo";
  const id = anuncio.id;
  // as abas de ver a vaga à esquerda, todas com ícone; o Editar, que muda a vaga, à direita, separado
  const abas: {
    aba: AbaDaVaga;
    nome: string;
    href: string;
    icone: LucideIcon;
    numero?: number | null;
    marca?: string | null;
  }[] = [
    {
      aba: "candidatos",
      nome: "Candidatos",
      href: `/painel/anuncio/${id}/quadro`,
      icone: Inbox,
      numero: candidatos,
    },
    {
      aba: "copiloto",
      nome: "Triagem com IA",
      href: `/painel/anuncio/${id}/copiloto`,
      icone: Sparkles,
      marca: marca.copiloto,
    },
    {
      aba: "testes",
      nome: "Teste Prático",
      href: `/painel/anuncio/${id}/testes`,
      icone: ClipboardCheck,
      marca: marca.testes,
    },
    // sem a migração 20270104120000, a aba não aparece
    ...(recursos && !recursos.video.indisponivel
      ? [
          {
            aba: "video" as const,
            nome: "Entrevista em vídeo",
            href: `/painel/anuncio/${id}/video`,
            icone: Video,
            marca: marca.video,
          },
        ]
      : []),
    // as automações da vaga (migrações 20270109120000 e 20270111120000)
    { aba: "automacoes", nome: "Automações", href: `/painel/anuncio/${id}/automacoes`, icone: Workflow },
    { aba: "editar", nome: "Editar", href: `/painel/anuncio/${id}/editar`, icone: Pencil },
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
            <span className="text-body-sm text-ink-muted">
              {[formatarLugar(anuncio.bairro, anuncio.cidade), resumo].filter(Boolean).join(" · ")}
            </span>
          </div>
          <h2 className="mt-2 text-h2">{anuncio.titulo}</h2>
          {nota}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {acoes}
          {noAr && <CopiarLinkDaVaga url={`${SITE_URL}/anuncio/${id}`} />}
          <MaisDaVaga id={id} noAr={noAr} />
        </div>
      </div>
      <RolagemDasAbas rotulo="Partes da vaga">
        <ul className="flex min-w-max gap-1 border-b border-line sm:gap-2">
          {abas.map((a) => {
            const ativa = a.aba === aba;
            const Icone = a.icone;
            return (
              <li key={a.aba} className={a.aba === "editar" ? "sm:ml-auto" : undefined}>
                <Link
                  href={a.href}
                  scroll={false}
                  aria-current={ativa ? "page" : undefined}
                  className={`group -mb-px inline-flex min-h-12 items-center gap-2 border-b-[3px] px-3 text-label transition-colors ${
                    ativa
                      ? "border-ink text-ink"
                      : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  <Icone
                    aria-hidden
                    className={`size-[18px] ${ativa ? "text-ink" : "text-ink-muted group-hover:text-ink"}`}
                  />
                  {a.nome}
                  {a.numero != null && a.numero > 0 && (
                    <span
                      className={`min-w-6 rounded-pill px-1.5 text-center text-caption leading-6 tabular-nums ${
                        ativa ? "bg-ink text-surface-100" : "bg-surface-300 text-ink"
                      }`}
                    >
                      {a.numero > 99 ? "99+" : a.numero}
                      <span className="sr-only"> {a.numero === 1 ? "candidato" : "candidatos"}</span>
                    </span>
                  )}
                  {a.marca && <SeloCortesia curto texto={a.marca} />}
                </Link>
              </li>
            );
          })}
        </ul>
      </RolagemDasAbas>
    </div>
  );
}

/** Dentro de Candidatos: o quadro (por etapa) ou a lista, a escolha de cada um. */
export function VistaDosCandidatos({ id, atual }: { id: string; atual: "quadro" | "lista" }) {
  const opcoes = [
    { vista: "quadro" as const, nome: "Quadro", href: `/painel/anuncio/${id}/quadro`, icone: KanbanSquare },
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
