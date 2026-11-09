"use client";

import { useEffect, useState } from "react";
import { classesEntrada } from "@/components/ui/campo";
import { COOKIE_NOME_INDICACAO } from "@/lib/indicacao-email";

/** "Seu nome", na página do link da indicação: guardado por 1 hora, para o perfil nascer com ele ao entrar. */
export function NomeDaConta({ inicial }: { inicial: string }) {
  const [nome, setNome] = useState(inicial);

  useEffect(() => {
    const valor = nome.replace(/\s+/g, " ").trim().slice(0, 80);
    const seguro = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = valor
      ? `${COOKIE_NOME_INDICACAO}=${encodeURIComponent(valor)}; Max-Age=3600; Path=/; SameSite=Lax${seguro}`
      : `${COOKIE_NOME_INDICACAO}=; Max-Age=0; Path=/`;
  }, [nome]);

  return (
    <label className="flex flex-col gap-1">
      <span className="text-label">Seu nome</span>
      <input
        type="text"
        autoComplete="name"
        maxLength={80}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        className={classesEntrada}
        placeholder="Como você quer ser chamado"
      />
      <span className="text-body-sm text-ink-muted">Com o Google, vale o nome da sua conta do Google.</span>
    </label>
  );
}
