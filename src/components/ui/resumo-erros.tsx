"use client";

import { useRef } from "react";
import { Aviso } from "./basicos";

/**
 * Perto do botão de enviar: o que falta, campo por campo, em vez de só "confira os campos".
 * Tocar num item leva até o campo (e abre a seção dele, com `antesDeIr`).
 */
export function ResumoErros({
  erros,
  nomes,
  acao,
  alvos = {},
  reserva,
  antesDeIr,
}: {
  erros: Record<string, string>;
  /** o nome de cada campo como a pessoa vê; campo sem nome aqui não entra na lista */
  nomes: Record<string, string>;
  /** "publicar", "salvar"... */
  acao: string;
  /** o id do campo na tela, quando não é o próprio nome do campo */
  alvos?: Record<string, string>;
  /** a mensagem geral, quando nenhum erro tem nome */
  reserva?: string;
  antesDeIr?: (campo: string) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  // lat e lng têm o mesmo nome ("Lugar no mapa"): aparece uma vez só
  const vistos = new Set<string>();
  const itens: { campo: string; nome: string; mensagem: string }[] = [];
  // na ordem do formulário (a ordem de `nomes`)
  const ordem = Object.keys(nomes);
  const campos = Object.keys(erros).sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b));
  for (const campo of campos) {
    const mensagem = erros[campo];
    const nome = nomes[campo];
    if (!nome || vistos.has(nome)) continue;
    vistos.add(nome);
    itens.push({ campo, nome, mensagem });
  }
  if (!itens.length) return reserva ? <Aviso tipo="erro">{reserva}</Aviso> : null;

  function ir(campo: string, mensagem: string) {
    antesDeIr?.(campo);
    // espera a seção abrir antes de procurar o campo
    window.requestAnimationFrame(() => {
      const form = caixa.current?.closest("form");
      if (!form) return;
      const campoNaTela =
        form.querySelector<HTMLElement>(`#${CSS.escape(alvos[campo] ?? campo)}`) ??
        form.querySelector<HTMLElement>(`[name="${CSS.escape(campo)}"]:not([type="hidden"])`);
      // sem campo com esse nome (mapa, ganhos a mais...): vai até a mensagem de erro
      const mensagemNaTela = [...form.querySelectorAll<HTMLElement>("p")].find(
        (p) => p.textContent === mensagem && !caixa.current?.contains(p),
      );
      const alvo = campoNaTela ?? mensagemNaTela;
      if (!alvo) return;
      (alvo.closest("fieldset, label") ?? alvo).scrollIntoView({ behavior: "smooth", block: "center" });
      campoNaTela?.focus({ preventScroll: true });
    });
  }

  const n = itens.length;
  return (
    <div ref={caixa}>
      <Aviso tipo="erro" titulo={n === 1 ? `Falta 1 coisa para ${acao}` : `Faltam ${n} coisas para ${acao}`}>
        <ul className="flex flex-col gap-1">
          {itens.map(({ campo, nome, mensagem }) => (
            <li key={campo}>
              <button type="button" onClick={() => ir(campo, mensagem)} className="group text-left">
                <span className="font-semibold underline decoration-line-strong underline-offset-2 group-hover:decoration-ink">
                  {nome}
                </span>{" "}
                — {mensagem}
              </button>
            </li>
          ))}
        </ul>
      </Aviso>
    </div>
  );
}
