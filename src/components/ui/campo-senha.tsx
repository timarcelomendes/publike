"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { classesEntrada } from "./campo";

/**
 * Campo de senha com o "Ver senha" ao lado. O botão fica fora do campo para o ícone do gerenciador de
 * senhas (que o navegador põe dentro dele) não ficar por cima. `visivel` e `aoTrocar` deixam outro campo
 * acompanhar (o "Repita a senha" mostra junto); `semBotao` esconde o botão nesse outro campo.
 */
export function CampoSenha({
  className = "",
  visivel,
  aoTrocar,
  semBotao = false,
  ...props
}: Omit<ComponentProps<"input">, "type"> & {
  visivel?: boolean;
  aoTrocar?: (ver: boolean) => void;
  semBotao?: boolean;
}) {
  const [verAqui, setVerAqui] = useState(false);
  const ver = visivel ?? verAqui;
  const trocar = () => (aoTrocar ? aoTrocar(!ver) : setVerAqui(!ver));
  return (
    <div className="flex items-stretch gap-2">
      <input
        {...props}
        type={ver ? "text" : "password"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`${classesEntrada} min-w-0 flex-1 ${className}`}
      />
      {!semBotao && (
        <button
          type="button"
          onClick={trocar}
          aria-controls={props.id}
          aria-label={ver ? "Esconder a senha" : "Ver a senha"}
          title={ver ? "Esconder a senha" : "Ver a senha"}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-sm border border-line-strong bg-surface-200 px-3 text-label text-ink-muted transition-colors hover:text-ink"
        >
          {ver ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
          <span aria-hidden className="hidden sm:inline">
            {ver ? "Esconder" : "Ver"}
          </span>
        </button>
      )}
    </div>
  );
}
