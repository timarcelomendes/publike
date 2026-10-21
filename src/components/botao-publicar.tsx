"use client";

import { FileUser, Plus } from "lucide-react";
import Link from "next/link";
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

/**
 * "Publicar" do topo para quem entrou (no computador): com contorno, porque o terra da tela fica
 * com a ação principal de cada página (na home, o cartão do topo). No celular, a barra de baixo tem.
 */
export function PublicarDaConta() {
  const caminho = usePathname();
  if (SEM_BOTAO.some((r) => r.test(caminho))) return null;
  return (
    <div className="hidden lg:block">
      <BotaoLink href="/publicar" variante="secundario" tamanho="sm">
        <Plus aria-hidden />
        Publicar
      </BotaoLink>
    </div>
  );
}

// Telas que já levam ao currículo (ou que não são para quem procura trabalho)
const SEM_CURRICULO = [/^\/perfil\/curriculo/, /^\/talentos/, /^\/publicar/, /^\/entrar/, /^\/admin/];

/** O que o topo oferece para o currículo: cadastrar, o seu (já aparece na aba Talentos) ou nada. */
export type CurriculoNoTopo = "cadastrar" | "meu" | null;

/**
 * "Publicar grátis" do topo, com "Currículo" grudado do lado (porta dupla): quem tem vaga ou
 * serviço publica; quem procura trabalho cadastra o currículo para aparecer na aba Talentos.
 * O terra fica só no "Publicar grátis"; o currículo vai no tom claro do terra.
 */
export function PublicarECurriculo({ curriculo }: { curriculo: CurriculoNoTopo }) {
  const caminho = usePathname();
  const publicar = !SEM_BOTAO.some((r) => r.test(caminho));
  const cv = SEM_CURRICULO.some((r) => r.test(caminho)) ? null : curriculo;
  if (!publicar && !cv) return null;
  return (
    <div className="hidden md:flex">
      {cv && (
        // só a partir do notebook: no meio-termo o topo não cabe (no celular, o caminho fica no "Publicar")
        <Link
          href={cv === "meu" ? "/perfil/curriculo" : "/perfil/curriculo?para=talentos"}
          aria-label={cv === "meu" ? "Meu currículo" : "Cadastrar currículo"}
          title={cv === "meu" ? "Ver e atualizar meu currículo" : "Cadastre seu currículo e apareça para as empresas"}
          className={`hidden min-h-11 items-center gap-2 bg-terra-soft px-4 text-label whitespace-nowrap text-terra-text transition-colors hover:bg-[color-mix(in_srgb,var(--color-terra-soft)_88%,var(--color-terra))] lg:inline-flex [&_svg]:size-[18px] [&_svg]:shrink-0 ${
            publicar ? "rounded-l-md" : "rounded-md"
          }`}
        >
          <FileUser aria-hidden />
          Currículo
        </Link>
      )}
      {publicar && (
        <BotaoLink href="/publicar" variante="primario" className={cv ? "lg:rounded-l-none" : undefined}>
          <Plus aria-hidden />
          Publicar grátis
        </BotaoLink>
      )}
    </div>
  );
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
