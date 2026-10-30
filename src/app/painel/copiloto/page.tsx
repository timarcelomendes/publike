import { ChevronRight, ListChecks, Plus, Search, Sparkles, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { FaixaExperimento, OfertaRecurso } from "@/components/recurso-pago";
import { SeloCortesia } from "@/components/selo-cortesia";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { copilotoLiberado, listarMeusAnuncios, recursosPagos } from "@/lib/dados";
import { formatarLugar, plural } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import { marcaDoRecurso } from "@/lib/recursos-pagos";

export const metadata: Metadata = { title: "Copiloto" };

// O copiloto (teste; migração 20261203120000): a porta de entrada no menu do painel, com as vagas no ar.

const PASSOS = [
  { icone: ListChecks, titulo: "Critérios", texto: "A IA sugere o que a vaga pede; você ajusta." },
  { icone: Search, titulo: "Busca", texto: "Ele lê os currículos de Talentos e dos candidatos." },
  { icone: UserCheck, titulo: "Prova", texto: "Cada “atende” vem com o trecho do currículo. Você convida." },
];

export default function Copiloto() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/copiloto");
  const [liberado, recursos, agora] = await Promise.all([copilotoLiberado(), recursosPagos(), agoraDaRequisicao()]);
  // recurso pago: sem ele, a oferta dos 15 dias grátis (migração 20261215120000)
  if (!liberado) return <OfertaRecurso recurso="copiloto" estado={recursos?.copiloto ?? null} />;
  const vagas = (await listarMeusAnuncios().catch(() => [])).filter((a) => a.tipo === "vaga" && a.status === "ativo");
  return (
    <div className="flex flex-col gap-6">
      <FaixaExperimento recurso="copiloto" estado={recursos?.copiloto} agora={agora} />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-h2">
            <Sparkles aria-hidden className="size-6 text-terra-text" />
            Copiloto
          </h2>
          <SeloCortesia texto={marcaDoRecurso(recursos?.copiloto, agora).longo} />
        </div>
        <p className="text-body text-ink-muted">
          Encontra os profissionais que combinam com a sua vaga e mostra o porquê. Quem decide é você.
        </p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {PASSOS.map((p, i) => (
          <li key={p.titulo} className="flex gap-3 rounded-lg bg-surface-300 p-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-200 text-label">
              {i + 1}
            </span>
            <span>
              <span className="block text-label">{p.titulo}</span>
              <span className="block text-body-sm text-ink-muted">{p.texto}</span>
            </span>
          </li>
        ))}
      </ol>
      <section aria-labelledby="titulo-vagas" className="flex flex-col gap-3">
        <h3 id="titulo-vagas" className="text-h3">
          Escolha a vaga
        </h3>
        {vagas.length ? (
          <ul className="flex flex-col gap-2">
            {vagas.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/painel/anuncio/${v.id}/copiloto`}
                  className="flex min-h-16 items-center gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card hover:bg-surface-300"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label">{v.titulo}</span>
                    <span className="block truncate text-body-sm text-ink-muted">
                      {formatarLugar(v.bairro, v.cidade)} · {plural(v.curtidas_total, "candidato", "candidatos")}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-label text-terra-text">
                    Abrir o copiloto
                    <ChevronRight aria-hidden className="size-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Vazio
            icone={Sparkles}
            titulo="Nenhuma vaga no ar"
            acao={
              <BotaoLink href="/publicar" variante="primario" tamanho="sm">
                <Plus aria-hidden />
                Publicar vaga
              </BotaoLink>
            }
          >
            Publique uma vaga e o copiloto busca quem combina com ela.
          </Vazio>
        )}
      </section>
    </div>
  );
}
