"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Botao } from "../ui/botao";

// O botão dos formulários do admin que salvam por uma ação do servidor e voltam para a mesma tela (22/11/2026, Marcelo:
// "esses botões do admin precisam mostrar que está salvo, não tem feedback e não muda nada para salvo"). Enquanto
// salva, "Salvando…" e o botão parado; depois, "Salvo" ao lado do botão, até mexer em alguma coisa do formulário.

export function BotaoSalvar({
  children = "Salvar",
  enviando = "Salvando…",
  feito,
  ...props
}: Omit<ComponentProps<typeof Botao>, "type" | "children"> & {
  children?: ReactNode;
  /** o texto enquanto a ação roda */
  enviando?: string;
  /** o que aconteceu, quando a tela voltou desta ação ("Salvo", "3 avisos mandados"); null: nada */
  feito?: string | null;
}) {
  const { pending } = useFormStatus();
  const ref = useRef<HTMLButtonElement>(null);
  // mexeu no formulário depois de salvar: o "Salvo" sai (o que está na tela ainda não foi salvo)
  const [mexeu, setMexeu] = useState(false);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const ao = () => setMexeu(true);
    // salvou de novo: o resultado desta vez aparece
    const salvou = () => setMexeu(false);
    form.addEventListener("input", ao);
    form.addEventListener("change", ao);
    form.addEventListener("submit", salvou);
    return () => {
      form.removeEventListener("input", ao);
      form.removeEventListener("change", ao);
      form.removeEventListener("submit", salvou);
    };
  }, []);
  const mostrar = Boolean(feito) && !mexeu && !pending;
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Botao ref={ref} type="submit" aria-disabled={pending || undefined} disabled={pending || props.disabled} {...props}>
        {pending ? (
          <>
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            {enviando}
          </>
        ) : (
          children
        )}
      </Botao>
      <span aria-live="polite" className="inline-flex items-center gap-1 text-body-sm text-cerrado-text">
        {mostrar && (
          <>
            <Check aria-hidden className="size-4" />
            {feito}
          </>
        )}
      </span>
    </span>
  );
}
