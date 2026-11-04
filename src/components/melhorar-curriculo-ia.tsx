"use client";

import { Check, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { melhorarCurriculoComIA } from "@/lib/acoes/curriculo-ia";
import type { CurriculoParaIA, SugestaoCurriculo } from "@/lib/ia/curriculo-melhorar";
import { Botao } from "./ui/botao";

type ExperienciaDoForm = { chave: string; cargo: string; onde: string };

/**
 * "Melhorar com a IA" (claude/plano-salario-e-curriculo.md, parte 4), dentro do formulário do currículo: a IA lê o
 * que está preenchido e sugere até 5 coisas. "Usar este texto" põe o texto no campo; nada é salvo sozinho.
 */
export function MelhorarCurriculoComIA({
  ler,
  experiencias,
  aoUsarTitulo,
  aoUsarDescricao,
  aoUsarHabilidades,
}: {
  /** o que está no formulário agora */
  ler: () => CurriculoParaIA;
  experiencias: ExperienciaDoForm[];
  aoUsarTitulo: (texto: string) => void;
  aoUsarDescricao: (chave: string, texto: string) => void;
  aoUsarHabilidades: (itens: string[]) => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // as experiências na hora do pedido: a sugestão volta pela posição
  const [resposta, setResposta] = useState<{ sugestoes: SugestaoCurriculo[]; chaves: string[] } | null>(null);
  const [usadas, setUsadas] = useState<number[]>([]);

  function pedir() {
    setErro(null);
    const chaves = experiencias.map((e) => e.chave);
    iniciar(async () => {
      const r = await melhorarCurriculoComIA(ler());
      if (r.ok) {
        setResposta({ sugestoes: r.sugestoes, chaves });
        setUsadas([]);
      } else setErro(r.erro);
    });
  }

  const daExperiencia = (i: number | null) => {
    const chave = i === null ? undefined : resposta?.chaves[i];
    return chave ? (experiencias.find((e) => e.chave === chave) ?? null) : null;
  };
  const nomeDa = (e: ExperienciaDoForm) => `${e.cargo || "Experiência"}${e.onde ? ` em ${e.onde}` : ""}`;

  return (
    <section
      id="melhorar-com-ia"
      aria-labelledby="melhorar-com-ia-titulo"
      className="flex scroll-mt-24 flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-300">
          <Sparkles aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="melhorar-com-ia-titulo" className="text-h3">
            Melhorar com a IA
          </h2>
          <p className="mt-1 max-w-prose text-body-sm text-ink-muted">
            A IA lê o que está neste formulário e sugere textos e perguntas para o currículo combinar com mais vagas. Só
            quando você pede, sem seu nome, foto ou contato. Nada é salvo sozinho: você escolhe o que usar.
          </p>
        </div>
      </div>
      <Botao tamanho="sm" disabled={pendente} onClick={pedir} className="self-start">
        <Sparkles aria-hidden />
        {pendente ? "A IA está lendo o seu currículo…" : resposta ? "Pedir outras sugestões" : "Melhorar com a IA"}
      </Botao>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
      {resposta && (
        <ol aria-label="Sugestões da IA" className="flex flex-col gap-3">
          {resposta.sugestoes.map((s, i) => {
            const exp = s.tipo === "descricao" || s.tipo === "pergunta" ? daExperiencia(s.experiencia) : null;
            // a experiência da sugestão saiu do formulário depois do pedido
            const sumiu = s.tipo === "descricao" && !exp;
            const usada = usadas.includes(i);
            const usar = () => {
              if (s.tipo === "titulo") aoUsarTitulo(s.texto);
              else if (s.tipo === "descricao" && exp) aoUsarDescricao(exp.chave, s.texto);
              else if (s.tipo === "habilidades") aoUsarHabilidades(s.itens);
              setUsadas((l) => [...l, i]);
            };
            const sobre =
              s.tipo === "titulo"
                ? "O que você faz"
                : s.tipo === "habilidades"
                  ? "Habilidades"
                  : s.tipo === "descricao"
                    ? `O que você fazia: ${exp ? nomeDa(exp) : "experiência"}`
                    : exp
                      ? `Uma pergunta sobre ${nomeDa(exp)}`
                      : "Uma pergunta";
            return (
              <li key={`${s.tipo}-${i}`} className="flex flex-col gap-2 rounded-md bg-surface-300 p-4">
                <p className="text-label">{sobre}</p>
                {s.tipo === "habilidades" ? (
                  <ul className="flex flex-wrap gap-2" aria-label="Habilidades sugeridas">
                    {s.itens.map((h) => (
                      <li key={h} className="rounded-pill bg-surface-200 px-3 py-1 text-body-sm">
                        {h}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="max-w-prose text-body">{s.texto}</p>
                )}
                {s.motivo && <p className="max-w-prose text-body-sm text-ink-muted">{s.motivo}</p>}
                {s.tipo === "pergunta" ? (
                  <p className="text-body-sm">
                    Se for verdade, conte no currículo
                    {exp ? (
                      <>
                        {", em "}
                        <a href={`#exp-${exp.chave}-descricao`} className="text-label underline underline-offset-2">
                          O que você fazia
                        </a>
                      </>
                    ) : null}
                    .
                  </p>
                ) : usada ? (
                  <p role="status" className="flex flex-wrap items-center gap-x-1.5 text-body-sm">
                    <Check aria-hidden className="size-4 shrink-0 text-cerrado-text" />
                    <span className="text-cerrado-text">
                      {s.tipo === "habilidades" ? "Habilidades postas." : "Texto posto no campo."}
                    </span>
                    <span>Confira e salve no fim da página.</span>
                    <a
                      href={
                        s.tipo === "titulo"
                          ? "#titulo"
                          : s.tipo === "habilidades"
                            ? "#habilidades-titulo"
                            : `#exp-${exp?.chave}-descricao`
                      }
                      className="text-label underline underline-offset-2"
                    >
                      Ver no formulário
                    </a>
                  </p>
                ) : sumiu ? (
                  <p className="text-body-sm text-ink-muted">Essa experiência saiu do formulário.</p>
                ) : (
                  <Botao tamanho="sm" onClick={usar} className="self-start">
                    {s.tipo === "habilidades" ? "Pôr estas habilidades" : "Usar este texto"}
                  </Botao>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
