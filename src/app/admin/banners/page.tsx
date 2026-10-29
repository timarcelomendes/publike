import { LayoutList, MousePointerClick, Pencil, Plus, X as Fechou, Eye } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AcoesBanner, FormBanner, type BannerParaEditar } from "@/components/admin/banners";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao } from "@/components/admin/ui";
import { Aviso, Selo, Vazio, type VarianteSelo } from "@/components/ui/basicos";
import { classesBotao } from "@/components/ui/botao";
import {
  ACOES_BANNER,
  PAGINAS_BANNER,
  PUBLICOS_BANNER,
  resumoDoFiltro,
  temFiltro,
  type AcaoBanner,
  type FiltroBanner,
  type PaginaBanner,
  type PublicoBanner,
} from "@/lib/banners";
import { categoria, TIPOS_CONTA } from "@/lib/constantes";
import type { TipoConta } from "@/lib/tipos";
import { formatarDataCurta, formatarNumero, primeiro } from "@/lib/formato";
import type { Database } from "@/lib/supabase/tipos-banco";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Banners" };

type Banner = Database["public"]["Tables"]["banners"]["Row"];

export default function Banners({ searchParams }: PageProps<"/admin/banners">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

/** "2026-10-25T03:00:00Z" → "2026-10-25" (o dia em Brasília); `fimDoDia`: o dia anterior (o fim é exclusivo). */
function diaDeBrasilia(iso: string | null, fimDoDia = false) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000 - (fimDoDia ? 1 : 0));
  return d.toISOString().slice(0, 10);
}

// sub-abas: a lista (abre primeiro) e o formulário (novo ou editar)
function SubAbas({ ativa, total, editando }: { ativa: "lista" | "form"; total: number; editando: string | null }) {
  const classe = (atual: boolean) =>
    `inline-flex min-h-10 shrink-0 items-center gap-2 rounded-pill border px-3.5 text-label transition-colors ${
      atual ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-300 text-ink hover:border-line-strong"
    }`;
  return (
    <nav aria-label="Banners" className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <Link
        href="/admin/banners"
        scroll={false}
        aria-current={ativa === "lista" ? "page" : undefined}
        className={classe(ativa === "lista")}
      >
        <LayoutList aria-hidden className="size-4" />
        Banners
        <span className="tabular-nums opacity-70">{formatarNumero(total)}</span>
      </Link>
      {editando ? (
        <span aria-current="page" className={classe(true)}>
          <Pencil aria-hidden className="size-4" />
          Editar: {editando}
        </span>
      ) : (
        <Link
          href="/admin/banners?aba=novo"
          scroll={false}
          aria-current={ativa === "form" ? "page" : undefined}
          className={classe(ativa === "form")}
        >
          <Plus aria-hidden className="size-4" />
          Novo banner
        </Link>
      )}
    </nav>
  );
}

function situacao(b: Banner, agora: number): { nome: string; variante: VarianteSelo } {
  if (!b.ativo) return { nome: "Desligado", variante: "contorno" };
  if (b.fim && Date.parse(b.fim) <= agora) return { nome: "Terminou", variante: "contorno" };
  if (b.inicio && Date.parse(b.inicio) > agora) return { nome: "Agendado", variante: "aviso" };
  return { nome: "No ar", variante: "match" };
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/banners">["searchParams"] }) {
  const c = await exigirAdminLocal();
  const sp = await searchParams;
  const [{ data, error }, { data: numeros }, { data: escolhidas }, agora] = await Promise.all([
    c.from("banners").select("*").order("criado_em", { ascending: false }).limit(100),
    c.from("banner_numeros").select("banner_id, vistos, cliques, fechados"),
    // sem a migração 20261214120000: nenhuma (a consulta falha e fica vazia)
    c.from("banners_contas").select("banner_id, perfil_id"),
    agoraDaRequisicao(),
  ]);
  if (error) {
    return (
      <Aviso tipo="erro" titulo="Não deu para ler os banners">
        Confira se a migração 20261029120000_banners.sql já rodou no Supabase.
      </Aviso>
    );
  }
  const banners = data ?? [];
  const somas = new Map<string, { vistos: number; cliques: number; fechados: number }>();
  for (const n of numeros ?? []) {
    const s = somas.get(n.banner_id) ?? { vistos: 0, cliques: 0, fechados: 0 };
    s.vistos += n.vistos;
    s.cliques += n.cliques;
    s.fechados += n.fechados;
    somas.set(n.banner_id, s);
  }
  const contasPorBanner = new Map<string, string[]>();
  for (const e of escolhidas ?? [])
    contasPorBanner.set(e.banner_id, [...(contasPorBanner.get(e.banner_id) ?? []), e.perfil_id]);
  const filtroDe = (b: Banner): FiltroBanner => ({
    tipos_conta: b.tipos_conta ?? [],
    categorias: b.categorias ?? [],
    curriculo: b.curriculo ?? null,
    cidades: b.cidades ?? [],
    conta_ate_dias: b.conta_ate_dias ?? null,
    so_contas: b.so_contas ?? false,
  });
  const nomes = {
    tipo: (t: string) => TIPOS_CONTA[t as TipoConta]?.minusculo ?? t,
    area: (a: string) => categoria(a).nome,
  };
  const editar = banners.find((b) => b.id === primeiro(sp.editar));
  // as contas escolhidas do banner aberto, pelo e-mail (sem e-mail, o código)
  const idsDoEditado = editar ? (contasPorBanner.get(editar.id) ?? []) : [];
  const { data: emailsDoEditado } = idsDoEditado.length
    ? await c.from("contatos").select("perfil_id, email").in("perfil_id", idsDoEditado)
    : { data: [] as { perfil_id: string; email: string | null }[] };
  const emailDe = new Map((emailsDoEditado ?? []).map((l) => [l.perfil_id, l.email]));
  // "?novo=1" é o endereço antigo do formulário
  const novo = primeiro(sp.aba) === "novo" || primeiro(sp.novo) === "1" || banners.length === 0;
  const aba = editar || novo ? "form" : "lista";
  const salvo = primeiro(sp.salvo);
  const noAr = banners.filter((b) => situacao(b, agora).nome === "No ar");

  const paraEditar: BannerParaEditar | undefined = editar && {
    id: editar.id,
    titulo: editar.titulo,
    texto: editar.texto,
    botao: editar.botao,
    acao: editar.acao as AcaoBanner,
    link: editar.link,
    publico: editar.publico as PublicoBanner,
    repetir_dias: editar.repetir_dias,
    ativo: editar.ativo,
    inicio: diaDeBrasilia(editar.inicio),
    fim: diaDeBrasilia(editar.fim, true),
    // sem a migração 20261117120000: só a inicial, em 3 segundos
    paginas: (editar.paginas ?? ["inicio"]) as PaginaBanner[],
    atraso_segundos: editar.atraso_segundos ?? 3,
    busca_da_area: editar.busca_da_area ?? false,
    // sem a migração 20261213120000: sem imagem
    imagem: editar.imagem ?? null,
    filtro: filtroDe(editar),
    contas: idsDoEditado.map((i) => emailDe.get(i) || i).join("\n"),
  };

  return (
    <div className="flex flex-col gap-6">
      <SubAbas ativa={aba} total={banners.length} editando={editar?.titulo ?? null} />
      {salvo && aba === "lista" && (
        <Aviso tipo="sucesso" titulo={salvo === "novo" ? "Banner criado" : "Banner salvo"}>
          Quem abrir a página inicial vê o banner depois de 3 segundos.
        </Aviso>
      )}
      {aba === "form" && (
        <Secao
          id="formulario"
          titulo={editar ? "Editar o banner" : "Novo banner"}
          descricao="Uma janela nas páginas que você escolher, alguns segundos depois de abrir. Na visita em que já apareceu outra janela (as boas-vindas, a pergunta da inicial, o aviso de cookies ou outro banner), o banner fica para a próxima."
          acoes={
            banners.length > 0 && (
              <Link href="/admin/banners" className={classesBotao("fantasma", "sm")}>
                Cancelar
              </Link>
            )
          }
        >
          <FormBanner key={editar?.id ?? "novo"} banner={paraEditar} />
        </Secao>
      )}
      {aba === "lista" && (
        <Secao
          titulo="Banners"
          descricao={
            <>
              Aparece um banner por visita: o mais novo no ar para quem chega (todo mundo, visitante, conta de pessoa ou
              de empresa), na primeira das páginas dele que a pessoa abrir.{" "}
              {noAr.length > 1 &&
                "Com mais de um no ar para o mesmo público, quem já viu o mais novo vê o seguinte na próxima visita."}
            </>
          }
        >
          {banners.length === 0 ? (
            <Vazio icone={Plus} titulo="Nenhum banner ainda">
              Crie o primeiro em Novo banner.
            </Vazio>
          ) : (
            <ul aria-label="Banners" className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {banners.map((b) => {
                const s = situacao(b, agora);
                const n = somas.get(b.id) ?? { vistos: 0, cliques: 0, fechados: 0 };
                const taxa = n.vistos ? Math.round((n.cliques / n.vistos) * 100) : null;
                return (
                  <li key={b.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Selo variante={s.variante}>{s.nome}</Selo>
                        <span className="text-label">{b.titulo}</span>
                      </div>
                      {b.texto && <p className="text-body-sm text-ink-muted">{b.texto}</p>}
                      <p className="text-body-sm text-ink-muted">
                        {ACOES_BANNER[b.acao as AcaoBanner] ?? b.acao}
                        {b.acao === "busca" && b.busca_da_area
                          ? " pela área de quem vê"
                          : b.link && b.acao !== "novas"
                            ? ` (${b.link})`
                            : ""}{" "}
                        · botão “{b.botao}” · {PUBLICOS_BANNER[b.publico as PublicoBanner] ?? b.publico}
                        {b.repetir_dias === null
                          ? " · só uma vez"
                          : ` · de novo a cada ${b.repetir_dias} ${b.repetir_dias === 1 ? "dia" : "dias"}`}
                        {` · ${(b.paginas ?? ["inicio"]).map((p) => PAGINAS_BANNER[p as PaginaBanner] ?? p).join(", ")}`}
                        {` · depois de ${b.atraso_segundos ?? 3} s`}
                        {b.inicio ? ` · de ${formatarDataCurta(b.inicio)}` : ""}
                        {b.fim ? ` · até ${formatarDataCurta(diaDeBrasilia(b.fim, true) + "T12:00:00-03:00")}` : ""}
                      </p>
                      {temFiltro(filtroDe(b)) && (
                        <p className="text-body-sm">
                          <span className="text-label">Só para:</span>{" "}
                          {resumoDoFiltro(filtroDe(b), contasPorBanner.get(b.id)?.length ?? 0, nomes)}
                        </p>
                      )}
                      <p className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm">
                        <span className="inline-flex items-center gap-1.5">
                          <Eye aria-hidden className="size-4 text-ink-muted" />
                          {formatarNumero(n.vistos)} {n.vistos === 1 ? "viu" : "viram"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <MousePointerClick aria-hidden className="size-4 text-ink-muted" />
                          {formatarNumero(n.cliques)} {n.cliques === 1 ? "clicou" : "clicaram"}
                          {taxa !== null && <span className="text-ink-muted">({taxa}%)</span>}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Fechou aria-hidden className="size-4 text-ink-muted" />
                          {formatarNumero(n.fechados)} {n.fechados === 1 ? "fechou" : "fecharam"}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                      <Link href={`/admin/banners?editar=${b.id}`} className={classesBotao("secundario", "sm")}>
                        <Pencil aria-hidden />
                        Editar
                      </Link>
                      <AcoesBanner id={b.id} ativo={b.ativo} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Secao>
      )}
    </div>
  );
}
