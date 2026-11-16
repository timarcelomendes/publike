import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ConferirAgora, DecidirConteudo } from "@/components/admin/conteudos";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import { lerDadosDoConteudo, textoDoBloco } from "@/lib/conteudos/atualizacao";
import { formatarDataHora } from "@/lib/formato";
import { situacaoFilas } from "@/lib/servidor/filas";
import { conteudoAtual } from "@/lib/servidor/conteudos-atuais";
import { exigirAdminLocal } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Conteúdos" };

// Admin › Conteúdos (migração 20270705120000): as versões dos artigos com os números atualizados que a IA escreveu
// (o Novo Caged, a PNAD, o IBGE), para revisar e publicar, e o que cada conferência achou. O site só muda quando o
// admin publica.

type Rascunho = { id: number; slug: string; dados: unknown; motivo: string; criado_em: string };
type Conferido = { slug: string; conferido_em: string; resultado: string };

export default function Conteudos() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Pagina />
    </Suspense>
  );
}

async function Pagina() {
  const c = await exigirAdminLocal();
  const { data, error } = await c.rpc("admin_conteudos_atualizados");
  const lido = (data ?? {}) as { rascunhos?: Rascunho[]; conferidos?: Conferido[] };
  const rascunhos = lido.rascunhos ?? [];
  const conferidos = lido.conferidos ?? [];
  const filas = situacaoFilas();
  const falta = !filas.ia
    ? "Falta a chave da IA (OPENAI_API_KEY ou ANTHROPIC_API_KEY)."
    : !filas.acesso
      ? "Falta a chave do servidor (PUBLIKE_CHAVE_SERVIDOR) ou a chave secreta do Supabase."
      : null;

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Números dos conteúdos"
        descricao="Todo dia, o site confere até 2 artigos com número (cada um no máximo a cada 7 dias): a IA procura o dado oficial mais novo (Novo Caged, PNAD, IBGE) e, se achar, escreve o artigo com os números trocados. Nada muda no site até você publicar."
        acoes={<ConferirAgora falta={falta} />}
      >
        {error && (
          <Aviso tipo="alerta" titulo="Não deu para ler">
            A migração 20270705120000 já rodou? ({error.message})
          </Aviso>
        )}
        {!error && rascunhos.length === 0 && (
          <p className="text-body-sm text-ink-muted">Nenhuma versão nova esperando. Embaixo, o que cada conferência achou.</p>
        )}
      </Secao>

      {rascunhos.map((r) => (
        <VersaoNova key={r.id} r={r} />
      ))}

      {conferidos.length > 0 && (
        <Secao titulo="Últimas conferências">
          <ul className="flex flex-col divide-y divide-line">
            {conferidos.map((k) => (
              <li key={k.slug} className="flex flex-col gap-0.5 py-2.5">
                <p className="text-label">
                  <Link href={`/conteudos/${k.slug}`} className="underline-offset-2 hover:underline">
                    {k.slug}
                  </Link>{" "}
                  <span className="font-normal text-ink-muted">· {formatarDataHora(k.conferido_em)}</span>
                </p>
                <p className="text-body-sm text-ink-muted">{k.resultado || "—"}</p>
              </li>
            ))}
          </ul>
        </Secao>
      )}
    </div>
  );
}

/** Uma versão nova: o que mudou, bloco a bloco (o de antes riscado), as fontes novas e os botões. */
async function VersaoNova({ r }: { r: Rascunho }) {
  const atual = await conteudoAtual(r.slug);
  const nova = lerDadosDoConteudo(r.dados);
  if (!atual || !nova) {
    return (
      <Secao titulo={r.slug}>
        <Aviso tipo="alerta" titulo="Esta versão não está no formato do artigo">
          Descarte e confira de novo.
        </Aviso>
        <DecidirConteudo id={r.id} />
      </Secao>
    );
  }
  const mudancas = [
    { nome: "Título", antes: atual.titulo, depois: nova.titulo },
    { nome: "Descrição", antes: atual.descricao, depois: nova.descricao },
    ...nova.blocos.map((b, i) => ({
      nome: `Bloco ${i + 1}`,
      antes: atual.blocos[i] ? textoDoBloco(atual.blocos[i]) : "",
      depois: textoDoBloco(b),
    })),
  ].filter((m) => m.antes !== m.depois);
  return (
    <Secao
      titulo={atual.titulo}
      descricao={
        <>
          {r.motivo || "A IA achou números novos."} · escrita em {formatarDataHora(r.criado_em)} ·{" "}
          <Link href={`/conteudos/${r.slug}`} className="underline underline-offset-2">
            ver o artigo no ar
          </Link>
        </>
      }
    >
      <ul className="flex flex-col gap-3">
        {mudancas.map((m) => (
          <li key={m.nome} className="rounded-md border border-line p-3">
            <p className="text-caption text-ink-muted">{m.nome}</p>
            <p className="mt-1 text-body-sm whitespace-pre-line text-ink-muted line-through">{m.antes || "—"}</p>
            <p className="mt-1 text-body-sm whitespace-pre-line">{m.depois}</p>
          </li>
        ))}
      </ul>
      <div>
        <p className="text-label">Fontes da versão nova</p>
        <ol className="mt-1 list-decimal pl-5 text-body-sm">
          {nova.fontes.map((f) => (
            <li key={f.url}>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                {f.titulo}
              </a>{" "}
              <span className="text-ink-muted">({f.data})</span>
            </li>
          ))}
        </ol>
      </div>
      <DecidirConteudo id={r.id} />
    </Secao>
  );
}
