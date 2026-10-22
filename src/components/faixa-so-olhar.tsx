"use client";

import { Eye } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { COOKIE_SO_OLHAR, paginaDePessoa, voltaParaAConta } from "@/lib/so-olhar";
import { Container } from "./ui/basicos";

/** Liga o "só olhar" (empresa, comércio ou agência vendo como pessoa) e abre a home. */
export function verComoPessoa() {
  document.cookie = `${COOKIE_SO_OLHAR}=1; path=/; samesite=lax`;
  // navegação inteira: o layout (a faixa do alto) só se refaz assim; numa troca de página, ele fica
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/");
}

function desligar() {
  document.cookie = `${COOKIE_SO_OLHAR}=; path=/; max-age=0; samesite=lax`;
}

/**
 * Só olhando dá para andar pelo site, abrir e fechar (menus, filtros, detalhes), escolher o
 * jeito de ver, as abas e as páginas da lista. Curtir, salvar, conectar, seguir, escrever,
 * responder e chamar no WhatsApp, não.
 */
function podeTocar(alvo: Element, tipo: string) {
  if (alvo.closest("[data-pode-olhar]")) return true;
  if (tipo === "submit") return alvo.getAttribute("role") === "search";
  const tocado = alvo.closest("a[href], button, [role='button'], input[type='submit'], input[type='button']");
  if (!tocado) return true;
  if (tocado.matches("a[href]")) {
    return !/^(https:\/\/(wa\.me|api\.whatsapp\.com)\/|mailto:|tel:)/.test(tocado.getAttribute("href") ?? "");
  }
  if (["aria-expanded", "aria-haspopup", "aria-controls"].some((a) => tocado.hasAttribute(a))) return true;
  return ["radio", "tab", "option", "menuitemradio"].includes(tocado.getAttribute("role") ?? "");
}

/**
 * A faixa do "só olhar", no alto das páginas que uma pessoa vê, e o bloqueio das ações nelas: o
 * toque é parado antes de chegar ao React (captura na janela) e um aviso aparece embaixo do
 * cabeçalho. Abrir o painel, o próprio perfil ou o Publicar desliga o "só olhar".
 */
export function FaixaSoOlhar({ conta }: { conta: string }) {
  const caminho = usePathname() ?? "/";
  const router = useRouter();
  const [aviso, setAviso] = useState(false);
  const [saindo, iniciar] = useTransition();
  const ativo = paginaDePessoa(caminho);

  useEffect(() => {
    if (!voltaParaAConta(caminho)) return;
    desligar();
    router.refresh();
  }, [caminho, router]);

  useEffect(() => {
    if (!ativo) return;
    document.documentElement.dataset.soOlhar = "1";
    let tempo: ReturnType<typeof setTimeout> | undefined;
    const bloquear = (e: Event) => {
      const alvo = e.target instanceof Element ? e.target : null;
      if (!alvo?.closest("#conteudo") || podeTocar(alvo, e.type)) return;
      e.preventDefault();
      e.stopPropagation();
      setAviso(true);
      clearTimeout(tempo);
      tempo = setTimeout(() => setAviso(false), 4000);
    };
    window.addEventListener("click", bloquear, true);
    window.addEventListener("submit", bloquear, true);
    return () => {
      delete document.documentElement.dataset.soOlhar;
      window.removeEventListener("click", bloquear, true);
      window.removeEventListener("submit", bloquear, true);
      clearTimeout(tempo);
    };
  }, [ativo]);

  if (!ativo) return null;
  return (
    <>
      {/* a faixa fica no alto da página (sem prender: as abas da linha já ficam presas embaixo do cabeçalho) */}
      <div role="region" aria-label="Vendo como pessoa" className="bg-ink text-surface-100">
        <Container className="flex min-h-12 items-center gap-3 py-1.5">
          <Eye aria-hidden className="size-5 shrink-0" />
          <p className="min-w-0 flex-1 text-body-sm">
            <strong className="font-semibold">Você está vendo como pessoa.</strong>{" "}
            <span className="hidden text-surface-100/75 sm:inline">
              Só olhar: curtir, salvar, conectar e escrever ficam desligados.
            </span>
          </p>
          <button
            type="button"
            disabled={saindo}
            onClick={() =>
              iniciar(() => {
                desligar();
                router.refresh();
              })
            }
            className="inline-flex min-h-9 shrink-0 items-center rounded-pill bg-surface-100 px-3.5 text-label text-ink transition-colors hover:bg-surface-300 disabled:opacity-70"
          >
            Voltar para {conta}
          </button>
        </Container>
      </div>
      {/* tocou numa ação: o aviso aparece embaixo do cabeçalho, onde quer que a página esteja */}
      <p
        role="status"
        aria-live="polite"
        className={
          aviso
            ? "fixed inset-x-4 top-20 z-50 mx-auto w-fit max-w-md rounded-md bg-ink px-4 py-3 text-body-sm text-surface-100 shadow-raised"
            : "sr-only"
        }
      >
        {aviso ? `Só olhar: para curtir, salvar ou conectar, volte para ${conta}.` : ""}
      </p>
    </>
  );
}
