"use client";

import { Ellipsis, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { mudarStatusAnuncio, renovarAnuncio } from "@/lib/acoes/anuncios";
import { testarVisoesDasVagas } from "@/lib/acoes/recursos";
import type { Acao } from "@/lib/visoes-das-vagas";
import { AcoesAnuncio } from "../acoes";
import { Botao, classesBotao } from "../../ui/botao";
import { useAcao } from "../../ui/usar-acao";

// As ações de cada vaga nas visões de Vagas (11/11/2026): um botão só, com o que a vaga pede agora, e o resto no
// "⋯" (antes eram até 8 botões por cartão, a maioria só ícone).

/** O botão do que a vaga pede agora: responder, ver a entrevista, renovar, divulgar, encerrar, voltar ao ar, abrir. */
export function AcaoDaVaga({ id, acao, largo = false }: { id: string; acao: Acao; largo?: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [confirmar, setConfirmar] = useState(false);
  // o que pede resposta ganha o fundo terra claro (o terra cheio é um por tela: o Publicar)
  const forte = acao.tipo === "responder";
  const classe = `${classesBotao("secundario", "sm", largo ? "w-full" : "")} ${
    forte ? "border-transparent bg-terra-soft font-bold text-terra-text hover:bg-terra-soft hover:brightness-95" : ""
  }`;
  const href =
    acao.tipo === "responder"
      ? `/painel/caixa?vaga=${id}`
      : acao.tipo === "entrevista"
        ? `/painel/anuncio/${id}?etapa=entrevista`
        : acao.tipo === "divulgar"
          ? "/painel/links"
          : acao.tipo === "abrir"
            ? `/painel/anuncio/${id}/quadro`
            : null;
  if (href) {
    return (
      <Link href={href} className={classe}>
        {acao.rotulo}
      </Link>
    );
  }
  if (acao.tipo === "encerrar" && confirmar) {
    return (
      <span className="flex flex-wrap items-center justify-end gap-2 text-body-sm">
        Sai do ar e para de receber gente.
        <Botao
          tamanho="sm"
          disabled={pendente}
          onClick={() => rodar(() => mudarStatusAnuncio(id, "encerrado", null))}
        >
          Sim, encerrar
        </Botao>
        <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(false)}>
          Cancelar
        </Botao>
        {mensagem}
      </span>
    );
  }
  return (
    <span className={`flex flex-col gap-1 ${largo ? "w-full" : "items-end"}`}>
      <button
        type="button"
        disabled={pendente}
        className={classe}
        onClick={() =>
          acao.tipo === "renovar"
            ? rodar(() => renovarAnuncio(id))
            : acao.tipo === "reativar"
              ? rodar(() => mudarStatusAnuncio(id, "ativo"))
              : setConfirmar(true)
        }
      >
        {acao.rotulo}
      </button>
      {mensagem}
    </span>
  );
}

/** O "⋯" da vaga: abrir, ver como o candidato vê, editar, publicar parecida, divulgar e o que muda a situação. */
export function MenuDaVaga({
  id,
  titulo,
  status,
  podeRenovar,
  prazoDias,
  preenchida,
}: {
  id: string;
  titulo: string;
  status: string;
  podeRenovar: boolean;
  prazoDias: number | null;
  preenchida: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const idMenu = useId();
  const caminho = usePathname();
  const [deQual, setDeQual] = useState(caminho);
  if (deQual !== caminho) {
    setDeQual(caminho);
    setAberto(false);
  }
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);
  const comModeracao = status === "em_analise" || status === "removido";
  const link = "flex min-h-10 items-center rounded-md px-3.5 text-label text-ink hover:bg-surface-300";
  return (
    <div ref={caixa} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idMenu}
        aria-label={`Mais ações: ${titulo}`}
        title="Mais ações"
        onClick={() => setAberto((a) => !a)}
        className={`inline-flex size-10 items-center justify-center rounded-pill border border-line transition-colors hover:bg-surface-300 ${
          aberto ? "bg-surface-300" : "bg-surface-200"
        }`}
      >
        <Ellipsis aria-hidden className="size-[18px]" />
      </button>
      {aberto && (
        <div
          id={idMenu}
          className="absolute top-full right-0 z-30 mt-1.5 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-0.5 rounded-md border border-line-strong bg-surface-200 p-1.5 shadow-raised"
        >
          <Link href={`/painel/anuncio/${id}/quadro`} className={`${link} font-bold`}>
            Abrir a vaga
          </Link>
          <Link href={`/anuncio/${id}`} className={link}>
            Ver como o candidato vê
          </Link>
          {!comModeracao && (
            <>
              <Link href={`/painel/anuncio/${id}/editar`} className={link}>
                Editar
              </Link>
              <Link href={`/publicar?copiar=${id}`} className={link}>
                Publicar parecida
              </Link>
            </>
          )}
          {status === "ativo" && (
            <Link href="/painel/links" className={link}>
              Divulgar
            </Link>
          )}
          <div aria-hidden className="mx-2 my-1 h-px bg-line" />
          <AcoesAnuncio
            id={id}
            tipo="vaga"
            status={status}
            podeRenovar={podeRenovar}
            prazoDias={prazoDias}
            preenchida={preenchida}
            menu
          />
        </div>
      )}
    </div>
  );
}

/** "Testar 15 dias grátis" das visões dos planos (Vagas e Candidatos, o mesmo teste). */
export function BotaoTestarVisoes() {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <span className="flex flex-col items-start gap-1">
      <Botao variante="primario" disabled={pendente} onClick={() => rodar(() => testarVisoesDasVagas())}>
        <Sparkles aria-hidden />
        Testar 15 dias grátis
      </Botao>
      {mensagem}
    </span>
  );
}
