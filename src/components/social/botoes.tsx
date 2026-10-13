"use client";

import { BellOff, BellPlus, BellRing, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { autorizarContratacao, deixarDeSeguir, seguirBairro, seguirPerfil } from "@/lib/acoes/social";
import { Botao, classesBotao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/**
 * Seguir um perfil (comércio, empresa, agência ou profissional) ou um bairro:
 * aviso quando sair anúncio novo. Sem contagem de seguidores: não é vaidade,
 * é para não perder a vaga. O texto diz o que se segue ("Seguindo o bairro
 * Centro"), para dois botões lado a lado nunca ficarem iguais. Embaixo vai
 * uma vez só a frase TEXTO_SEGUIR, em vez de um aviso por botão.
 */
export function BotaoSeguir({
  alvo,
  seguidoId,
  logado,
  voltar,
  rotulo,
  rotuloSeguindo = "Seguindo",
  lista = false,
}: {
  alvo: { perfil: string } | { cidade: string; bairro: string };
  /** id do que já sigo (para deixar de seguir) */
  seguidoId: number | null;
  logado: boolean;
  voltar: string;
  /** texto do botão quando ainda não segue */
  rotulo: string;
  /** texto do botão quando já segue */
  rotuloSeguindo?: string;
  /** na lista do painel o botão é a ação de parar: "Deixar de seguir" */
  lista?: boolean;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [id, setId] = useState<number | null>(seguidoId);
  const seguindo = id !== null;

  if (!logado) {
    return (
      <Link
        href={`/entrar?next=${encodeURIComponent(voltar)}`}
        className={classesBotao("secundario", "sm", "max-w-full")}
      >
        <BellPlus aria-hidden />
        <span className="truncate">{rotulo}</span>
      </Link>
    );
  }

  return (
    <div className="flex max-w-full flex-col items-start gap-1">
      <Botao
        tamanho="sm"
        className="max-w-full"
        disabled={pendente}
        onClick={() => {
          if (id !== null) {
            rodar(
              () => deixarDeSeguir(id, voltar),
              (r) => {
                if (r.ok) setId(null);
              },
            );
          } else {
            rodar(
              () => ("perfil" in alvo ? seguirPerfil(alvo.perfil, voltar) : seguirBairro(alvo.cidade, alvo.bairro, voltar)),
              (r) => {
                if (r.ok && "id" in r && typeof r.id === "number") setId(r.id);
              },
            );
          }
        }}
      >
        {seguindo ? (
          lista ? (
            <BellOff aria-hidden />
          ) : (
            <BellRing aria-hidden className="text-cerrado-text" />
          )
        ) : (
          <BellPlus aria-hidden />
        )}
        <span className="truncate">{seguindo ? (lista ? "Deixar de seguir" : rotuloSeguindo) : rotulo}</span>
      </Botao>
      {mensagem}
    </div>
  );
}

/**
 * Mostrar no Publike que a contratação aconteceu ("Fulano foi contratado pela
 * Padaria X"). Só aparece com o sim dos dois lados; dá para tirar quando quiser.
 */
export function ContratacaoPublica({
  anuncioId,
  perfilId,
  lado,
  okEmpresa,
  okPessoa,
  outro,
}: {
  anuncioId: string;
  perfilId: string;
  /** quem está vendo: quem contratou ou quem foi contratado */
  lado: "empresa" | "pessoa";
  okEmpresa: boolean;
  okPessoa: boolean;
  /** nome do outro lado */
  outro: string;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [eu, setEu] = useState(lado === "empresa" ? okEmpresa : okPessoa);
  const ele = lado === "empresa" ? okPessoa : okEmpresa;
  const publica = eu && ele;

  return (
    <div className="flex basis-full flex-col items-start gap-2 rounded-md border border-line bg-surface-100 p-3">
      <p className="flex items-start gap-2 text-body-sm">
        <PartyPopper aria-hidden className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
        <span>
          {publica
            ? lado === "empresa"
              ? `A contratação de ${outro} aparece no Publike.`
              : `Sua contratação por ${outro} aparece no Publike e no seu perfil.`
            : eu
              ? `Você topou mostrar. Falta ${outro} topar também.`
              : ele
                ? `${outro} quer mostrar no Publike que ${lado === "empresa" ? "contratou você" : "você foi contratado"}. Topa?`
                : lado === "empresa"
                  ? "Mostrar no Publike que você contratou esta pessoa? Ajuda mais gente a confiar e a publicar vaga."
                  : "Mostrar no Publike que você foi contratado aqui? Conta como experiência no seu perfil."}
        </span>
      </p>
      <p className="text-caption text-ink-muted normal-case">
        Aparece só o primeiro nome com a inicial, o nome de quem contratou e a vaga, se os dois disserem sim.
      </p>
      <Botao
        tamanho="sm"
        variante={eu ? "fantasma" : "secundario"}
        disabled={pendente}
        onClick={() =>
          rodar(
            () => autorizarContratacao(anuncioId, perfilId, !eu),
            (r) => {
              if (r.ok) setEu(!eu);
            },
          )
        }
      >
        {eu ? "Não mostrar mais" : ele ? "Topo mostrar" : "Mostrar no Publike"}
      </Botao>
      {mensagem}
    </div>
  );
}
