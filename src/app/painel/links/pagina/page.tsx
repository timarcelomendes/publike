import { ArrowLeft, Check, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { FormPaginaDeVagas } from "@/components/painel/form-pagina-de-vagas";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { obterMeuPerfil, obterPerfilPublico } from "@/lib/dados";
import { formatarLugar, plural } from "@/lib/formato";
import type { Marca } from "@/lib/marca";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Página de carreiras" };

// A página de carreiras personalizada (claude/plano-pagina-de-vagas.md, parte 3): libera com mais de 10 vagas
// publicadas (as encerradas contam) ou com uma assinatura paga valendo. Quem ainda não tem vê a prévia com o
// cadeado, quanto falta e o caminho das assinaturas.

const LIBERA_COM = 11;

export default function PaginaDeCarreiras() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

type Situacao = { liberada: boolean; vagas_publicadas: number; pode_editar: boolean; pagina: Marca | null };

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/painel/links/pagina");
  const perfil = await obterMeuPerfil();
  if (!perfil) return null;
  const [{ data, error }, publico] = await Promise.all([
    (await criarClienteServidor()).rpc("minha_pagina_de_vagas"),
    // as vagas no ar, para escolher os destaques
    obterPerfilPublico(perfil.id, 200),
  ]);
  const situacao = (error ? null : data) as Situacao | null;
  const vagasNoAr = (publico?.anuncios ?? [])
    .filter((a) => a.tipo === "vaga")
    .map((a) => ({ id: a.id, titulo: a.titulo, lugar: formatarLugar(a.bairro, a.cidade) }));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href="/painel/links"
        className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Página de vagas
      </Link>
      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-h2">
          Página de carreiras
          <Selo variante="novo">Novo</Selo>
        </h2>
        <p className="mt-1 text-body text-ink-muted">
          A sua página de vagas com a cara da empresa: a cor da marca, uma capa, por que trabalhar aí, os benefícios e
          um endereço curto.
        </p>
      </div>

      {perfil.tipo === "pessoa" ? (
        <Aviso titulo="Para empresa, comércio e agência">
          <p>A página de carreiras é das contas que contratam. Mude o tipo da conta no perfil, se for o caso.</p>
        </Aviso>
      ) : !situacao ? (
        <Aviso tipo="alerta">
          <p>A página de carreiras ainda não está disponível. Tente de novo mais tarde.</p>
        </Aviso>
      ) : !situacao.liberada ? (
        <Bloqueada vagas={situacao.vagas_publicadas} />
      ) : !situacao.pode_editar ? (
        <Aviso>
          <p>Só quem administra a conta muda a página de carreiras.</p>
        </Aviso>
      ) : (
        <section className="rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-6">
          <FormPaginaDeVagas
            inicial={situacao.pagina}
            pessoaId={usuario.pessoaId}
            perfilId={perfil.id}
            nome={perfil.nome}
            site={SITE_URL}
            vagasNoAr={vagasNoAr}
          />
        </section>
      )}
    </div>
  );
}

/** A prévia com o cadeado: como fica, o que libera e quanto falta. */
function Bloqueada({ vagas }: { vagas: number }) {
  const faltam = Math.max(0, LIBERA_COM - vagas);
  return (
    <section aria-labelledby="bloqueada" className="flex flex-col gap-5">
      <div aria-hidden className="relative overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card">
        <div className="h-24 bg-gradient-to-r from-[#1d3a6e] to-[#0f6b6b] sm:h-32" />
        <div className="flex flex-col gap-3 p-5 opacity-60 blur-[1px] select-none">
          <div className="flex items-center gap-3">
            <span className="size-14 rounded-md bg-[#1d3a6e]" />
            <span className="flex flex-col gap-1.5">
              <span className="h-4 w-40 rounded-pill bg-surface-300" />
              <span className="h-3 w-24 rounded-pill bg-surface-300" />
            </span>
          </div>
          <p className="font-display text-h3 text-[#1d3a6e]">Por que trabalhar aqui</p>
          <span className="h-3 w-full rounded-pill bg-surface-300" />
          <span className="h-3 w-4/5 rounded-pill bg-surface-300" />
          <div className="flex flex-wrap gap-2">
            {["Vale-refeição", "Plano de saúde", "Folga no aniversário"].map((b) => (
              <span
                key={b}
                className="inline-flex items-center gap-1 rounded-pill border border-[#1d3a6e] px-3 py-1 text-label"
              >
                <Check className="size-4" />
                {b}
              </span>
            ))}
          </div>
        </div>
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="inline-flex size-14 items-center justify-center rounded-pill bg-surface-200 shadow-card">
            <Lock className="size-6" />
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
        <h3 id="bloqueada" className="text-h3">
          Libera com mais de 10 vagas publicadas ou com qualquer assinatura
        </h3>
        <p className="text-body text-ink-muted">
          Você já publicou {plural(vagas, "vaga", "vagas")} (as encerradas contam).{" "}
          {faltam > 0 ? `Faltam ${plural(faltam, "vaga", "vagas")}.` : ""} Os dias grátis dos recursos não contam.
        </p>
        <div
          role="progressbar"
          aria-label="Vagas publicadas"
          aria-valuemin={0}
          aria-valuemax={LIBERA_COM}
          aria-valuenow={Math.min(vagas, LIBERA_COM)}
          className="h-2.5 overflow-hidden rounded-pill bg-surface-300"
        >
          <span
            className="block h-full rounded-pill bg-cerrado"
            style={{ width: `${Math.round((Math.min(vagas, LIBERA_COM) / LIBERA_COM) * 100)}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <BotaoLink href="/publicar" variante="primario">
            Publicar vaga
          </BotaoLink>
          <BotaoLink href="/painel/assinar" variante="secundario">
            Ver as assinaturas
          </BotaoLink>
        </div>
        <p className="text-body-sm text-ink-muted">
          Enquanto isso, o kit de divulgação (texto, imagens, cartaz e o quadro do site) é grátis para todos.
        </p>
      </div>
    </section>
  );
}
