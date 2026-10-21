import { ArrowLeft, List, Users, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { FichaCandidato } from "@/components/painel/ficha-candidato";
import { FiltroVaga } from "@/components/painel/filtro-vaga";
import { classesChip } from "@/components/painel/fluxo";
import { ItemDaLista } from "@/components/painel/item-caixa";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { ajudaDaIADisponivel } from "@/lib/dados";
import { primeiro } from "@/lib/formato";
import { ABAS, montarCaixa, naAba, ordenar, type Aba, type ItemCaixa } from "@/lib/servidor/caixa";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Caixa de entrada" };

// A caixa de entrada de quem contrata: a lista à esquerda (por aba: para responder, em
// andamento, entrevistas, mensagens novas, encerrados) e a ficha de quem está aberto
// à direita, com a decisão e os atalhos de teclado. No celular, a lista e a ficha
// viram duas telas; a triagem rápida (cartões de arrastar) fica num botão em cima.

export default function CaixaDeEntrada({ searchParams }: PageProps<"/painel/caixa">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/caixa">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/caixa");
  const sp = await searchParams;
  const agora = await agoraDaRequisicao();
  const [itens, comIA] = await Promise.all([montarCaixa(agora), ajudaDaIADisponivel()]);

  if (!itens) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para carregar a caixa de entrada agora">
        Tente de novo em instantes. Enquanto isso, cada vaga mostra quem curtiu em “Minhas vagas”.
      </Aviso>
    );
  }
  if (itens.length === 0) {
    return (
      <Vazio
        icone={Users}
        titulo="Ninguém curtiu suas vagas ainda"
        acao={<BotaoLink href="/publicar">Publicar vaga grátis</BotaoLink>}
      >
        Quem curtir qualquer vaga sua chega aqui, numa caixa de entrada só: você aceita ou dispensa com um toque, marca
        a entrevista e conversa, tudo na ficha da pessoa.
      </Vazio>
    );
  }

  // filtros: a vaga e a aba
  const vagas = new Map<string, { id: string; titulo: string; total: number }>();
  for (const c of itens) {
    const v = vagas.get(c.anuncio_id) ?? { id: c.anuncio_id, titulo: c.anuncio_titulo, total: 0 };
    v.total++;
    vagas.set(c.anuncio_id, v);
  }
  const pedidaVaga = primeiro(sp.vaga);
  const vaga = pedidaVaga && UUID.test(pedidaVaga) && vagas.has(pedidaVaga) ? pedidaVaga : null;
  const daVaga = vaga ? itens.filter((c) => c.anuncio_id === vaga) : itens;
  const contagem = new Map(ABAS.map((a) => [a.valor, daVaga.filter(naAba[a.valor]).length]));
  const pedidaAba = primeiro(sp.aba);
  const aba: Aba = ABAS.some((a) => a.valor === pedidaAba)
    ? (pedidaAba as Aba)
    : contagem.get("responder")
      ? "responder"
      : "andamento";
  const lista = ordenar(aba, daVaga.filter(naAba[aba]));

  // quem está aberto: o pedido (mesmo fora da aba, depois de um "desfazer") ou o primeiro
  const pedido = primeiro(sp.c);
  const escolhido = Boolean(pedido && itens.some((c) => c.chave === pedido));
  const aberto: ItemCaixa | null = escolhido ? (itens.find((c) => c.chave === pedido) ?? null) : (lista[0] ?? null);
  const posicao = aberto ? lista.findIndex((c) => c.chave === aberto.chave) : -1;

  const href = (mudar: { aba?: Aba; c?: string | null }) => {
    const q = new URLSearchParams();
    q.set("aba", mudar.aba ?? aba);
    if (vaga) q.set("vaga", vaga);
    if (mudar.c) q.set("c", mudar.c);
    return `/painel/caixa?${q}`;
  };
  const anterior = posicao > 0 ? href({ c: lista[posicao - 1].chave }) : null;
  const proximo = posicao >= 0 && posicao < lista.length - 1 ? href({ c: lista[posicao + 1].chave }) : null;
  // depois de responder, abre o próximo que ainda espera (ou o anterior, se era o último)
  const seguinte = posicao >= 0 ? (lista[posicao + 1] ?? lista[posicao - 1] ?? null) : (lista[0] ?? null);
  const depois = href({ c: seguinte && seguinte.chave !== aberto?.chave ? seguinte.chave : null });
  const paraResponder = contagem.get("responder") ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-h2">Caixa de entrada</h2>
          <p className="mt-1 text-body text-ink-muted">
            Quem curtiu suas vagas, numa lista só. Abra a ficha, decida e siga para o próximo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {paraResponder > 0 && (
            <BotaoLink href={`/painel/caixa/triagem${vaga ? `?vaga=${vaga}` : ""}`} variante="primario" tamanho="sm">
              <Zap aria-hidden />
              Triagem rápida ({paraResponder})
            </BotaoLink>
          )}
          <BotaoLink href="/painel/candidatos" tamanho="sm" variante="fantasma">
            <List aria-hidden />
            Lista e planilha
          </BotaoLink>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <nav
          aria-label="Abas da caixa de entrada"
          className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          {ABAS.map((a) => {
            const n = contagem.get(a.valor) ?? 0;
            const ativa = a.valor === aba;
            const destaque = n > 0 && (a.valor === "responder" || a.valor === "mensagens");
            return (
              <Link
                key={a.valor}
                href={href({ aba: a.valor })}
                scroll={false}
                aria-current={ativa ? "page" : undefined}
                className={classesChip(ativa, destaque)}
              >
                {a.nome}
                <span className={ativa ? "text-surface-100/80" : destaque ? "" : "text-ink-muted"}>{n}</span>
              </Link>
            );
          })}
        </nav>
        {vagas.size > 1 && (
          <div className="sm:w-72">
            <FiltroVaga vagas={[...vagas.values()]} vaga={vaga} etapa={null} caminho="/painel/caixa" aba={aba} />
          </div>
        )}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        <div className={escolhido ? "hidden lg:block" : ""}>
          {lista.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface-200 px-4 py-6 text-body-sm text-ink-muted">
              {ABAS.find((a) => a.valor === aba)?.vazio}
            </p>
          ) : (
            <ul
              aria-label="Lista da caixa de entrada"
              className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-200 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto"
            >
              {lista.map((c) => (
                <ItemDaLista key={c.chave} c={c} agora={agora} href={href({ c: c.chave })} aberto={c === aberto} />
              ))}
            </ul>
          )}
        </div>

        <div className={escolhido ? "flex flex-col gap-3" : "hidden lg:flex lg:flex-col lg:gap-3"}>
          {escolhido && (
            <Link
              href={href({ c: null })}
              scroll={false}
              className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink lg:hidden"
            >
              <ArrowLeft aria-hidden className="size-4" />
              Voltar à lista
            </Link>
          )}
          {aberto ? (
            <FichaCandidato
              c={aberto}
              agora={agora}
              anterior={anterior}
              proximo={proximo}
              depois={depois}
              comIA={comIA}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-line-strong px-4 py-10 text-center text-body-sm text-ink-muted">
              Nada aberto. Escolha alguém de outra aba.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
