"use client";

import { Eye, EyeOff, ThumbsUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { apagarRecomendacao, mostrarRecomendacao, recomendarProfissional } from "@/lib/acoes/social";
import { RELACOES_RECOMENDACAO, type RelacaoRecomendacao } from "@/lib/constantes";
import { Botao, classesBotao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

/** "Eu recomendo": o formulário de quem conhece o profissional. */
export function FormRecomendar({
  profissionalId,
  primeiroNome,
  logado,
  minha,
}: {
  profissionalId: string;
  primeiroNome: string;
  logado: boolean;
  /** a recomendação que já fiz, para editar */
  minha: { relacao: string; texto: string } | null;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [aberto, setAberto] = useState(false);
  const [relacao, setRelacao] = useState<string>(minha?.relacao ?? "");
  const [texto, setTexto] = useState(minha?.texto ?? "");
  const id = useId();

  if (!logado) {
    return (
      <Link
        href={`/entrar?next=${encodeURIComponent(`/perfil/${profissionalId}#recomendacoes`)}`}
        className={classesBotao("secundario", "sm")}
      >
        <ThumbsUp aria-hidden />
        Recomendar {primeiroNome}
      </Link>
    );
  }
  if (!aberto) {
    // depois de publicar o formulário fecha, e o aviso ("aparece assim que a pessoa aprovar") fica aqui
    return (
      <div className="flex flex-col items-start gap-2">
        <Botao tamanho="sm" onClick={() => setAberto(true)}>
          <ThumbsUp aria-hidden />
          {minha ? "Mudar minha recomendação" : `Recomendar ${primeiroNome}`}
        </Botao>
        {mensagem}
      </div>
    );
  }
  return (
    <form
      className="flex max-w-xl flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => recomendarProfissional(profissionalId, relacao, texto), (r) => r.ok && setAberto(false));
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-relacao`} className="text-label">
          De onde você conhece {primeiroNome}?
        </label>
        <Seletor
          id={`${id}-relacao`}
          value={relacao}
          required
          onChange={(e) => setRelacao(e.target.value)}
          className={classesEntrada}
        >
          <option value="" disabled>
            Escolha
          </option>
          {(Object.keys(RELACOES_RECOMENDACAO) as RelacaoRecomendacao[]).map((r) => (
            <option key={r} value={r}>
              {RELACOES_RECOMENDACAO[r]}
            </option>
          ))}
        </Seletor>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-texto`} className="text-label">
          Por que você recomenda?
        </label>
        <textarea
          id={`${id}-texto`}
          value={texto}
          required
          minLength={10}
          maxLength={300}
          rows={3}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={`Ex.: ${primeiroNome} fez a reforma do meu banheiro, caprichou e cumpriu o prazo.`}
          className={`${classesEntrada} py-2`}
        />
        <span className="text-caption text-ink-muted normal-case">
          {texto.trim().length}/300 · sem telefone ou link. Seu nome aparece junto.
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Botao type="submit" tamanho="sm" disabled={pendente || !relacao || texto.trim().length < 10}>
          Publicar recomendação
        </Botao>
        <Botao tamanho="sm" variante="fantasma" onClick={() => setAberto(false)}>
          Cancelar
        </Botao>
      </div>
      {mensagem}
    </form>
  );
}

/** Ações numa recomendação: quem recebeu esconde ou mostra; quem escreveu apaga. */
export function AcoesRecomendacao({
  id,
  profissionalId,
  sou,
  oculta,
  decidida,
}: {
  id: number;
  profissionalId: string;
  sou: "profissional" | "autor";
  oculta: boolean;
  /** já decidiu se mostra; nova (ou mudada) espera a decisão */
  decidida: boolean;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-1">
      {sou === "profissional" && !decidida ? (
        // nova: a pessoa aprova ou esconde
        <div className="flex flex-wrap gap-2">
          <Botao
            tamanho="sm"
            disabled={pendente}
            onClick={() => rodar(() => mostrarRecomendacao(id, true, profissionalId))}
          >
            <Eye aria-hidden />
            Mostrar no perfil
          </Botao>
          <Botao
            tamanho="sm"
            variante="fantasma"
            disabled={pendente}
            onClick={() => rodar(() => mostrarRecomendacao(id, false, profissionalId))}
          >
            <EyeOff aria-hidden />
            Esconder
          </Botao>
        </div>
      ) : sou === "profissional" ? (
        <Botao
          tamanho="sm"
          variante="fantasma"
          disabled={pendente}
          onClick={() => rodar(() => mostrarRecomendacao(id, oculta, profissionalId))}
        >
          {oculta ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
          {oculta ? "Mostrar no perfil" : "Esconder do perfil"}
        </Botao>
      ) : (
        <Botao
          tamanho="sm"
          variante="fantasma"
          disabled={pendente}
          onClick={() => rodar(() => apagarRecomendacao(id, profissionalId))}
        >
          <Trash2 aria-hidden />
          Apagar minha recomendação
        </Botao>
      )}
      {mensagem}
    </div>
  );
}
