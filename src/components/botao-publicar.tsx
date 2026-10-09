"use client";

import { Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { BotaoLink } from "./ui/botao";

// Páginas com a própria ação principal em terra: o botão do topo some,
// para manter um botão terra por tela (regra do Design System).
const SEM_BOTAO = [/^\/publicar/, /^\/entrar/, /^\/perfil$/, /^\/painel\/anuncio\/[^/]+\/editar/, /^\/admin/];

export function BotaoPublicar() {
  return (
    <div className="hidden md:block">
      <BotaoLink href="/publicar" variante="primario">
        <Plus aria-hidden />
        Publicar grátis
      </BotaoLink>
    </div>
  );
}

export function BotaoPublicarCabecalho() {
  const caminho = usePathname();
  if (SEM_BOTAO.some((r) => r.test(caminho))) return null;
  return <BotaoPublicar />;
}

/** "Entrar" do topo: some na própria tela de entrar. */
export function BotaoEntrarCabecalho() {
  const caminho = usePathname();
  if (caminho.startsWith("/entrar")) return null;
  return (
    <BotaoLink href="/entrar" variante="secundario" tamanho="sm">
      Entrar
    </BotaoLink>
  );
}
