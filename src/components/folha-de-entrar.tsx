"use client";

import { Mail, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { startTransition, useEffect, useRef, useState } from "react";
import { ehNavegacao } from "@/lib/acao-segura";
import { irDepoisDoLogin } from "@/lib/acoes/perfil";
import { LOGIN_CELULAR } from "@/lib/config";
import { contexto } from "@/lib/contexto-de-entrar";
import { REDES, type BotaoRede, type RedeSocial } from "@/lib/login-social";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { BotaoGoogle } from "./botao-google";
import { classesBotaoRede } from "./ui/botao";

// A folha de entrar (claude/plano-curtir-sem-pagina-de-entrar.md): quem está sem conta e toca em Curtir (ou em
// "Receber as novas", "Me avise", "Salvar vaga") vê as redes de entrar numa folha por cima da página, sem passar
// pela página /entrar. O Google entra ali mesmo (a janela de escolher a conta abre por cima); o LinkedIn e o Facebook
// vão direto à rede e voltam pelo /auth/callback. "Entrar com e-mail ou celular" leva ao /entrar de sempre.
// Os botões chamam pedirEntrar(): sem a folha na página (modo demonstração, nenhuma rede ligada, quem já entrou),
// ninguém responde e o botão segue para o /entrar como antes.

const EVENTO = "publike:entrar";

type Pedido = { proximo: string; titulo?: string; texto?: string };

/**
 * Pede a folha de entrar. true: a folha abriu (o botão não faz mais nada); false: não há folha nesta página e o
 * botão segue para o /entrar.
 */
export function pedirEntrar(pedido: Pedido): boolean {
  if (typeof window === "undefined") return false;
  const evento = new CustomEvent<Pedido>(EVENTO, { detail: pedido, cancelable: true });
  // quem responde (a folha) cancela o evento: dispatchEvent devolve false
  return !window.dispatchEvent(evento);
}

const linkDeEntrar = (proximo: string) => `/entrar?next=${encodeURIComponent(proximo)}`;

/**
 * Na volta, o botão terminou o que a pessoa pediu (?curtir=auto, ?salvar=1): tira o pedido do endereço, sem recarregar,
 * para o link copiado da barra não curtir nem salvar por quem abrir depois.
 */
export function tirarPedidoDoEndereco(parametro: string) {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(parametro)) return;
  url.searchParams.delete(parametro);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function FolhaDeEntrar({ redes, googleClientId }: { redes: BotaoRede[]; googleClientId: string }) {
  const janela = useRef<HTMLDialogElement>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [abrindo, setAbrindo] = useState<RedeSocial | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // o botão oficial do Google; se o script dele não carregar, volta o botão comum (que leva ao Google e volta)
  const [googleOficial, setGoogleOficial] = useState(Boolean(googleClientId));
  const temRedes = redes.length > 0;

  useEffect(() => {
    // sem rede ligada, ninguém responde ao pedido: o botão segue para o /entrar
    if (!temRedes) return;
    const abrir = (e: Event) => {
      const detalhe = (e as CustomEvent<Pedido>).detail;
      if (!detalhe?.proximo) return;
      e.preventDefault();
      setErro(null);
      setAbrindo(null);
      setPedido(detalhe);
      // o quadro do "entrar num toque" no canto sai: a folha já tem o Google
      window.google?.accounts?.id?.cancel();
    };
    window.addEventListener(EVENTO, abrir);
    // quem volta da página da rede pelo botão "voltar" encontra os botões liberados
    const aoMostrar = (e: PageTransitionEvent) => {
      if (e.persisted) setAbrindo(null);
    };
    window.addEventListener("pageshow", aoMostrar);
    return () => {
      window.removeEventListener(EVENTO, abrir);
      window.removeEventListener("pageshow", aoMostrar);
    };
  }, [temRedes]);

  useEffect(() => {
    const el = janela.current;
    if (!el) return;
    if (pedido && !el.open) el.showModal();
    if (!pedido && el.open) el.close();
  }, [pedido]);

  if (!temRedes) return null;
  const ctx = pedido ? contexto(pedido.proximo) : null;
  const titulo = pedido?.titulo ?? ctx?.titulo ?? "Entrar no Publike";
  const texto = pedido?.texto ?? ctx?.texto ?? "";

  function fechar() {
    setPedido(null);
  }

  /** LinkedIn, Facebook (e o Google sem o botão oficial): vai à rede e volta pelo /auth/callback. */
  async function entrarCom(rede: RedeSocial) {
    if (!pedido) return;
    setErro(null);
    setAbrindo(rede);
    const volta = new URLSearchParams({ next: pedido.proximo, via: rede });
    // o cliente só na hora do toque: a folha está em toda página de quem não entrou
    const { error } = await criarClienteNavegador().auth.signInWithOAuth({
      provider: REDES[rede].provedor,
      options: { redirectTo: `${window.location.origin}/auth/callback?${volta}` },
    });
    if (error) {
      setErro("Não deu para abrir agora. Tente de novo ou entre com o e-mail.");
      setAbrindo(null);
    }
  }

  /** O botão oficial do Google: o Supabase confere o token, e a pessoa segue (perfil novo ou o destino). */
  async function entrarComGoogle(token: string, nonce: string) {
    if (!pedido) return;
    setErro(null);
    setAbrindo("google");
    const { error } = await criarClienteNavegador().auth.signInWithIdToken({ provider: "google", token, nonce });
    if (error) {
      setErro("Não deu para entrar com o Google agora. Tente de novo ou entre com o e-mail.");
      setAbrindo(null);
      return;
    }
    const destino = pedido.proximo;
    startTransition(async () => {
      try {
        await irDepoisDoLogin(destino);
      } catch (e) {
        if (ehNavegacao(e)) throw e;
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/auth/continuar?${new URLSearchParams({ next: destino })}`);
      }
    });
  }

  return (
    <dialog
      ref={janela}
      aria-labelledby="folha-entrar-titulo"
      onClose={fechar}
      onCancel={fechar}
      // toque fora da folha (no fundo escuro): fecha
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-[22px] border border-line bg-surface-100 p-0 text-ink shadow-raised backdrop:bg-ink/40 sm:m-auto sm:w-[26rem] sm:rounded-[22px] print:hidden"
    >
      {pedido && (
        <div className="flex flex-col gap-5 px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-7">
          <div className="flex items-start gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <h2 id="folha-entrar-titulo" className="text-h3">
                {titulo}
              </h2>
              {texto && <p className="text-body-sm text-ink-muted">{texto}</p>}
            </div>
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar"
              className="-mt-1 -mr-1 grid size-10 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-300"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>

          <div role="group" aria-label="Entrar com uma rede social" className="flex flex-col gap-3">
            {redes.map(({ rede, nome, logo }) =>
              rede === "google" && googleOficial ? (
                <div key={rede} className="flex flex-col gap-1">
                  <BotaoGoogle
                    clientId={googleClientId}
                    aoEntrar={entrarComGoogle}
                    aoFalhar={() => setGoogleOficial(false)}
                  />
                  {abrindo === "google" && (
                    <p role="status" className="text-center text-body-sm text-ink-muted">
                      Entrando com o Google…
                    </p>
                  )}
                </div>
              ) : (
                <button
                  key={rede}
                  type="button"
                  onClick={() => void entrarCom(rede)}
                  disabled={abrindo !== null}
                  className={classesBotaoRede}
                >
                  {logo && <Image src={logo} alt="" width={20} height={20} unoptimized className="size-5 shrink-0" />}
                  {abrindo === rede ? `Abrindo o ${nome}…` : `Continuar com o ${nome}`}
                </button>
              ),
            )}
          </div>

          {erro && (
            <p role="alert" className="text-body-sm text-danger">
              {erro}
            </p>
          )}

          <Link
            href={linkDeEntrar(pedido.proximo)}
            onClick={fechar}
            className="inline-flex min-h-11 items-center justify-center gap-2 self-center text-label text-ink underline underline-offset-2 hover:text-terra-text"
          >
            <Mail aria-hidden className="size-4" />
            {LOGIN_CELULAR ? "Entrar com e-mail ou celular" : "Entrar com e-mail"}
          </Link>

          <p className="text-center text-caption text-ink-muted">
            Ao continuar, você aceita as{" "}
            {/* a folha fica no layout: quem vai ler as regras não as lê por baixo dela */}
            <Link href="/regras" onClick={fechar} className="underline underline-offset-2 hover:text-ink">
              regras
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" onClick={fechar} className="underline underline-offset-2 hover:text-ink">
              política de privacidade
            </Link>
            .
          </p>
        </div>
      )}
    </dialog>
  );
}
