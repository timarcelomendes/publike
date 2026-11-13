"use client";

import { BellPlus, Check, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";
import { registrarIdaAoSite } from "@/lib/acoes/candidatura";
import { linkComOrigem } from "@/lib/candidatura";
import { pedirEntrar } from "../folha-de-entrar";
import { classesBotao } from "../ui/botao";
import { NuncaPague } from "./nunca-pague";

// A vaga com candidatura no site da empresa (claude/plano-candidatura-no-site-da-empresa.md, parte 2): no lugar do
// Curtir, o botão que leva à página da vaga no site dela (Gupy, Inhire...), com a origem Publike no link. Quem está
// sem conta vê antes o convite para receber vagas assim (com "Agora não", que segue direto para o site); quem tem
// conta vai direto, e a vaga fica em Minhas curtidas ("Fui para o site").

const CHAVE_DEPOIS = "publike_convite_site_depois";
const SETE_DIAS = 7 * 24 * 3600 * 1000;

function conviteAdiado() {
  try {
    return Date.now() < Number(window.localStorage.getItem(CHAVE_DEPOIS) ?? 0);
  } catch {
    return false;
  }
}

function adiarConvite() {
  try {
    window.localStorage.setItem(CHAVE_DEPOIS, String(Date.now() + SETE_DIAS));
  } catch {}
}

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

export function QuadroNoSite({
  anuncioId,
  link,
  site,
  logado,
  idaEm,
  area,
}: {
  anuncioId: string;
  /** o link da vaga no site da empresa (o botão acrescenta a origem Publike) */
  link: string;
  /** o nome do site de vagas ("Gupy"); null: o site da própria empresa */
  site: string | null;
  logado: boolean;
  /** quem tem conta e já foi para o site desta vaga: quando */
  idaEm: string | null;
  /** a área da vaga, para o convite ("vagas de Logística") */
  area: string;
}) {
  const router = useRouter();
  const [convite, setConvite] = useState(false);
  const [foi, setFoi] = useState(false);
  const destino = linkComOrigem(link);
  const onde = site ? `na ${site}, o site de vagas da empresa` : "no site da empresa";

  function ir() {
    void registrarIdaAoSite(anuncioId);
    setConvite(false);
    setFoi(true);
  }

  function aoTocar(e: MouseEvent<HTMLAnchorElement>) {
    // sem conta: antes de sair, o convite (uma vez por semana neste aparelho)
    if (!logado && !conviteAdiado()) {
      e.preventDefault();
      setConvite(true);
      return;
    }
    ir();
  }

  function entrar() {
    const proximo = `/anuncio/${anuncioId}?avisar_area=1`;
    const abriu = pedirEntrar({
      proximo,
      titulo: "Entre para receber vagas assim",
      texto: `Avisamos no site e por e-mail quando abrir uma vaga nova de ${area}. Depois de entrar, você volta para esta vaga.`,
    });
    if (!abriu) router.push(`/entrar?next=${encodeURIComponent(proximo)}`);
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
      <div>
        <p className="font-display text-h3">Quer se candidatar?</p>
        <p className="mt-2 text-body">
          A candidatura desta vaga é feita {onde}. Toque no botão para abrir a página dela lá.
        </p>
      </div>

      {convite ? (
        <div role="group" aria-label="Antes de ir" className="flex flex-col gap-3 rounded-md border-2 border-terra bg-terra-soft p-4">
          <p className="flex items-start gap-2.5 text-body">
            <BellPlus aria-hidden className="mt-0.5 size-5 shrink-0 text-terra-text" />
            <span>
              <strong className="font-semibold">Antes de ir: quer receber vagas assim?</strong> Entre e ligamos o aviso
              das vagas novas de {area}. Grátis, por e-mail e no sino do Publike.
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" onClick={entrar} className={classesBotao("primario")}>
              Entrar e ligar o aviso
            </button>
            <a
              href={destino}
              target="_blank"
              rel="noopener noreferrer nofollow"
              onClick={() => {
                adiarConvite();
                ir();
              }}
              className="inline-flex min-h-11 items-center gap-1.5 text-label text-ink underline underline-offset-2 hover:text-terra-text"
            >
              Agora não, ir para o site
              <ExternalLink aria-hidden className="size-4" />
              <span className="sr-only">(abre em outra aba)</span>
            </a>
          </div>
        </div>
      ) : (
        <a
          href={destino}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={aoTocar}
          className={classesBotao("primario", "md", "w-full")}
        >
          Candidatar no site da empresa
          <ExternalLink aria-hidden />
          <span className="sr-only">(abre em outra aba)</span>
        </a>
      )}

      {foi ? (
        <p role="status" className="flex items-start gap-2 text-body-sm">
          <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
          <span>
            Abrimos a página da vaga em outra aba.
            {logado && " Ela fica em Minhas curtidas, em “Fui para o site”, para você voltar quando quiser."}
          </span>
        </p>
      ) : idaEm ? (
        <p className="flex items-start gap-2 text-body-sm text-ink-muted">
          <Check aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>Você abriu o site desta vaga em {dataCurta(idaEm)}.</span>
        </p>
      ) : (
        <p className="text-body-sm text-ink-muted">Você sai do Publike, e a resposta vem da empresa, pelo site dela.</p>
      )}
      <NuncaPague />
    </div>
  );
}
