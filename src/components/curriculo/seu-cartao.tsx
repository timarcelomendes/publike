"use client";

import { Check, Eye, EyeOff } from "lucide-react";
import { useId } from "react";
import { cartaoDoCurriculo } from "@/lib/cartao-do-curriculo";
import { forcaDoCurriculo, partesDoCurriculo, type ParteDoCurriculo } from "@/lib/curriculo-forca";
import type { Curriculo } from "@/lib/tipos";
import { CurriculoResumo } from "../curriculo-resumo";
import { JanelaDoCurriculo } from "../painel/janela-curriculo";
import { CartaoTalento } from "../talentos/cartao-talento";

/** Quem acha o currículo salvo (os dois interruptores de "Quem vê seu currículo"). */
export type QuemVe = { visivel: boolean; vitrine: boolean };

/** A pessoa no cartão: o nome já encurtado (como no banco) e o lugar do perfil. */
export type PessoaDoCartao = { id: string; nome: string; bairro: string | null; cidade: string };

/** Leva até o campo e põe o foco nele (o link também funciona sem o script). */
export function irParaOCampo(id: string) {
  const alvo = document.getElementById(id);
  if (!alvo) return false;
  alvo.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "center",
  });
  const campo = alvo.matches("input, select, textarea, button")
    ? alvo
    : alvo.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea, button");
  campo?.focus({ preventScroll: true });
  return true;
}

/** Onde cada parte fica no formulário e o nome dela na lista do que falta. */
function ondeFica(p: ParteDoCurriculo, c: Curriculo): { nome: string; id: string } {
  if (p.chave === "o-que-faz") {
    if (c.titulo?.trim() && !c.habilidades?.length) return { nome: "Pôr as habilidades", id: "nova-habilidade" };
    if (!c.titulo?.trim() && c.habilidades?.length) return { nome: "Dizer o que você faz", id: "titulo" };
    return { nome: "O que você faz e as habilidades", id: "titulo" };
  }
  return {
    experiencia: { nome: "Onde já trabalhou", id: "experiencias" },
    estudos: { nome: "Até onde estudou", id: "escolaridade" },
    cursos: { nome: "Cursos", id: "cursos" },
    horarios: { nome: "Horários", id: "horarios" },
    pdf: { nome: "PDF (se tiver)", id: "pdf" },
  }[p.chave];
}

/** A ordem do formulário (a força do currículo conta na ordem que mais ajuda nas vagas). */
const ORDEM: ParteDoCurriculo["chave"][] = ["o-que-faz", "experiencia", "estudos", "cursos", "horarios", "pdf"];

/** "Seu currículo está 71% completo": a barra (a mesma conta do cartão da conta na home) e cada parte. */
function OQueFalta({ curriculo, vazio }: { curriculo: Curriculo; vazio: boolean }) {
  const pontos = vazio ? 0 : forcaDoCurriculo(curriculo).pontos;
  const partes = partesDoCurriculo(curriculo).sort((a, b) => ORDEM.indexOf(a.chave) - ORDEM.indexOf(b.chave));
  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-300 p-4">
      <div className="flex flex-col gap-2">
        <p className="text-body-sm">
          {pontos >= 100 ? (
            <strong className="text-label">Seu currículo está completo</strong>
          ) : (
            <>
              Seu currículo está <strong className="text-label tabular-nums">{pontos}% completo</strong>
            </>
          )}
        </p>
        <span
          role="img"
          aria-label={`${pontos}% completo`}
          className="flex h-2 overflow-hidden rounded-pill bg-surface-100"
        >
          <span
            className={`${pontos >= 80 ? "bg-cerrado" : "bg-ipe"} motion-safe:transition-[width] motion-safe:duration-300`}
            style={{ width: `${pontos}%` }}
          />
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 text-body-sm" aria-label="As partes do currículo">
        {partes.map((p) => {
          const { nome, id } = ondeFica(p, curriculo);
          return (
            <li key={p.chave} className="flex items-center gap-2">
              {p.feito ? (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-pill bg-cerrado text-on-cerrado">
                  <Check aria-hidden className="size-3.5" strokeWidth={3} />
                </span>
              ) : (
                <span aria-hidden className="size-5 shrink-0 rounded-pill border-2 border-line-strong" />
              )}
              {p.feito ? (
                <span className="text-ink-muted">
                  {nome}
                  <span className="sr-only">: feito</span>
                </span>
              ) : (
                <a
                  href={`#${id}`}
                  onClick={(e) => irParaOCampo(id) && e.preventDefault()}
                  className="font-semibold underline underline-offset-2 hover:text-terra-text"
                >
                  {nome}
                  <span className="sr-only">: falta</span>
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** As partes que faltam, numa linha (no celular, embaixo do cartão). */
function Faltam({ curriculo }: { curriculo: Curriculo }) {
  const faltam = partesDoCurriculo(curriculo)
    .filter((p) => !p.feito && p.chave !== "pdf")
    .sort((a, b) => ORDEM.indexOf(a.chave) - ORDEM.indexOf(b.chave));
  if (!faltam.length) return null;
  return (
    <p className="text-body-sm">
      <span className="text-ink-muted">Para completar: </span>
      {faltam.map((p, i) => {
        const { nome, id } = ondeFica(p, curriculo);
        return (
          <span key={p.chave}>
            {i > 0 && <span className="text-ink-muted">{i === faltam.length - 1 ? " e " : ", "}</span>}
            <a
              href={`#${id}`}
              onClick={(e) => irParaOCampo(id) && e.preventDefault()}
              className="font-semibold underline underline-offset-2"
            >
              {nome.charAt(0).toLowerCase() + nome.slice(1)}
            </a>
          </span>
        );
      })}
    </p>
  );
}

/** Quem acha o currículo, numa linha, com o caminho para mudar. */
function LinhaQuemVe({ quemVe }: { quemVe: QuemVe | null }) {
  const Icone = quemVe && !quemVe.visivel ? EyeOff : Eye;
  return (
    <p className="flex items-start gap-2 text-body-sm">
      <Icone aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
      <span>
        {!quemVe ? (
          "Ao salvar, ele aparece para as empresas da região, sem o seu telefone e o e-mail."
        ) : (
          <>
            {quemVe.visivel
              ? quemVe.vitrine
                ? "Aparece para as empresas e na aba Talentos."
                : "Aparece para as empresas da região."
              : "Escondido: as empresas não acham você."}{" "}
            <a href="#quem-acha" className="font-semibold underline underline-offset-2">
              Mudar
            </a>
          </>
        )}
      </span>
    </p>
  );
}

/**
 * "Seu cartão" (claude/plano-tela-do-curriculo.md): o cartão da aba Talentos com o que está no formulário, que
 * muda enquanto a pessoa preenche, e o currículo completo como a empresa que entrou vê. `jeito`:
 *   lado: a coluna da direita no computador, com o que falta e quem vê;
 *   topo: no alto, no celular de quem já tem currículo, com o que falta numa linha;
 *   fim: antes do botão de salvar, no celular de quem está começando ("Confira como fica").
 */
export function SeuCartao({
  curriculo,
  pessoa,
  hoje,
  linkPdf,
  jeito,
  quemVe = null,
  vazio = false,
}: {
  curriculo: Curriculo;
  pessoa: PessoaDoCartao;
  /** "2026-11", do servidor: o trabalho atual conta até aqui */
  hoje: string;
  /** o link do PDF salvo (o anexado agora ainda não abre) */
  linkPdf: string | null;
  jeito: "lado" | "topo" | "fim";
  /** o currículo salvo: quem acha (sem currículo salvo, null) */
  quemVe?: QuemVe | null;
  /** nada preenchido ainda */
  vazio?: boolean;
}) {
  const id = useId();
  const cartao = cartaoDoCurriculo(curriculo, pessoa, hoje);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div>
        <h2 id={id} className="text-h3">
          {jeito === "fim" ? "Confira como fica" : "Seu cartão"}
        </h2>
        <p className="mt-0.5 text-body-sm text-ink-muted">
          {jeito === "fim"
            ? "Assim as empresas vão ver você na aba Talentos."
            : jeito === "lado"
              ? "Assim as empresas veem você. Ele muda enquanto você preenche."
              : "Assim as empresas veem você na aba Talentos."}
        </p>
      </div>
      <CartaoTalento t={cartao} previa />
      {vazio && <p className="text-body-sm text-ink-muted">Preencha os campos e o cartão vai se montando.</p>}
      <JanelaDoCurriculo nome={pessoa.nome} rotulo="Ver o currículo completo" titulo="Seu currículo completo">
        <div className="flex flex-col gap-4">
          <p className="text-body-sm text-ink-muted">
            Assim uma empresa que entrou no Publike vê o seu currículo. Telefone e e-mail só aparecem no match.
          </p>
          <CurriculoResumo curriculo={curriculo} linkPdf={linkPdf} hoje={hoje} />
        </div>
      </JanelaDoCurriculo>
      {jeito === "lado" && (
        <>
          <OQueFalta curriculo={curriculo} vazio={vazio} />
          <LinhaQuemVe quemVe={quemVe} />
        </>
      )}
      {jeito === "topo" && <Faltam curriculo={curriculo} />}
    </section>
  );
}
