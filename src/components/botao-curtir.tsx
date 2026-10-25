"use client";

import { Heart, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { curtirAnuncio, curtirDeNovo, descurtirAnuncio } from "@/lib/acoes/curtidas";
import { EVENTO_BOAS_VINDAS, esperandoBoasVindas } from "./boas-vindas-parceiro";
import { ConviteNotificacoes } from "./convite-notificacoes";

// A dica "Curtir é se candidatar" (curtir aqui não é reagir, como numa rede social): aparece uma
// vez por navegador, no primeiro botão de vaga que fica inteiro na tela, depois das boas-vindas.
const DICA = "publike_dica_curtir";
/** O botão que está mostrando a dica nesta página (um só). */
let donoDaDica: string | null = null;

function dicaJaVista() {
  try {
    return window.localStorage.getItem(DICA) === "1";
  } catch {
    // sem armazenamento, a dica voltaria em toda página: melhor não mostrar
    return true;
  }
}

function guardarDicaVista() {
  try {
    window.localStorage.setItem(DICA, "1");
  } catch {
    // sem armazenamento: nada a guardar
  }
}

/**
 * Botão de curtir do card (Design System: pill; "Curtido" com fundo like-soft
 * e coração vermelho). Na vaga, curtir é se candidatar: uma dica diz isso uma vez,
 * e o balão de depois de curtir repete. Curtir aqui é rápido; a mensagem opcional
 * fica na página do anúncio. Depois de curtir, o balão explica o que vem: quem
 * publicou decide se aceita, e só com o aceite vocês se conectam.
 */
export function BotaoCurtir({
  anuncioId,
  status,
  logado,
  servico = false,
  quem,
  className = "",
}: {
  anuncioId: string;
  status: string | null;
  logado: boolean;
  /** No serviço, curtir é pedir para contratar. */
  servico?: boolean;
  /** quem decide se aceita (o nome de quem publicou) */
  quem?: string;
  className?: string;
}) {
  const router = useRouter();
  const [atual, setAtual] = useOptimistic(status);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [explicar, setExplicar] = useState(false);
  // com o dedo ou o foco no balão (o convite das notificações está nele), ele não fecha sozinho
  const [segurar, setSegurar] = useState(false);
  const [dica, setDica] = useState(false);
  const eu = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const balao = useRef<HTMLDivElement>(null);
  // a dica vale para a vaga ainda não curtida (no serviço, o botão já diz "Contratar")
  const podeDica = !servico && status === null;

  useEffect(() => {
    const el = caixa.current;
    if (!podeDica || !el || typeof IntersectionObserver === "undefined" || dicaJaVista()) return;
    let visivel = false;
    let espera: number | undefined;
    // um tempinho com o botão parado na tela (rolando, não aparece)
    const agendar = () => {
      window.clearTimeout(espera);
      if (!visivel) return;
      espera = window.setTimeout(() => {
        if (!visivel || donoDaDica || dicaJaVista() || esperandoBoasVindas(window.location.pathname)) return;
        donoDaDica = eu;
        guardarDicaVista();
        setDica(true);
      }, 1200);
    };
    // inteiro na tela, com espaço em cima para o balão (o cabeçalho) e embaixo (a barra do celular)
    const observador = new IntersectionObserver(
      ([e]) => {
        visivel = Boolean(e?.isIntersecting);
        agendar();
      },
      { threshold: 1, rootMargin: "-200px 0px -80px 0px" },
    );
    observador.observe(el);
    // as boas-vindas fecharam com o botão já na tela
    window.addEventListener(EVENTO_BOAS_VINDAS, agendar);
    return () => {
      window.clearTimeout(espera);
      observador.disconnect();
      window.removeEventListener(EVENTO_BOAS_VINDAS, agendar);
      if (donoDaDica === eu) donoDaDica = null;
    };
  }, [podeDica, eu]);

  useEffect(() => {
    if (!erro) return;
    const t = setTimeout(() => setErro(null), 6000);
    return () => clearTimeout(t);
  }, [erro]);

  // o balão abre em cima do botão: perto do topo, ficava embaixo do cabeçalho
  useEffect(() => {
    if (explicar) balao.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [explicar]);

  useEffect(() => {
    if (!explicar || segurar) return;
    const t = setTimeout(() => setExplicar(false), 9000);
    return () => clearTimeout(t);
  }, [explicar, segurar]);

  // match desfeito: dá para curtir de novo (o servidor recusa se a outra pessoa bloqueou)
  const desfeito = atual === "desfeito";
  const curtido = atual !== null && !desfeito;
  const respondido = atual === "match" || atual === "dispensada";

  // a dica sai com qualquer toque fora dela (o toque segue para o que estiver embaixo) ou com o Esc
  useEffect(() => {
    if (!dica) return;
    const fechar = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.target instanceof Element && e.target.closest(`[id="${eu}-dica"]`)) return;
      setDica(false);
    };
    document.addEventListener("pointerdown", fechar, true);
    document.addEventListener("keydown", fechar);
    return () => {
      document.removeEventListener("pointerdown", fechar, true);
      document.removeEventListener("keydown", fechar);
    };
  }, [dica, eu]);

  function clicar() {
    setErro(null);
    setExplicar(false);
    setDica(false);
    if (!logado) {
      // volta para a vaga com o quadro de curtir à mão (?curtir=1)
      router.push(`/entrar?next=${encodeURIComponent(`/anuncio/${anuncioId}?curtir=1`)}`);
      return;
    }
    if (respondido) {
      router.push(`/anuncio/${anuncioId}`);
      return;
    }
    const curtindo = !curtido;
    iniciar(async () => {
      setAtual(curtido ? null : "pendente");
      // sem chegar ao servidor, volta { ok: false }: o coração desfaz e o erro aparece
      const r = await chamarAcao(() =>
        desfeito ? curtirDeNovo(anuncioId) : curtido ? descurtirAnuncio(anuncioId) : curtirAnuncio(anuncioId),
      );
      if (!r.ok) {
        if ("ir" in r && r.ir) router.push(r.ir);
        else setErro(r.erro);
      } else if (curtindo) {
        setExplicar(true);
      }
    });
  }

  const estilo =
    atual === "match"
      ? "border-transparent bg-cerrado text-on-cerrado"
      : curtido
        ? "border-like-soft bg-like-soft text-like-text"
        : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300";

  return (
    <div ref={caixa} className={`relative ${className}`}>
      <button
        type="button"
        onClick={clicar}
        disabled={pendente}
        aria-pressed={curtido}
        title={!servico && !curtido ? "Curtir é se candidatar a esta vaga" : undefined}
        aria-describedby={dica ? `${eu}-dica` : undefined}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors disabled:opacity-70 ${estilo}`}
      >
        <Heart
          aria-hidden
          className={`size-4 ${curtido && atual !== "match" ? "text-like" : ""}`}
          fill={curtido ? "currentColor" : "none"}
        />
        {atual === "match"
          ? "Deu match"
          : desfeito
            ? servico
              ? "Pedir de novo"
              : "Curtir de novo"
            : curtido
              ? servico
                ? "Pedido enviado"
                : "Curtido"
              : servico
                ? "Contratar"
                : "Curtir"}
      </button>
      {erro && (
        <p
          role="alert"
          className="absolute right-0 bottom-full z-20 mb-2 w-64 rounded-md border border-danger bg-surface-200 p-3 text-body-sm text-ink shadow-raised"
        >
          {erro}
        </p>
      )}
      {explicar && !erro && (
        <div
          ref={balao}
          role="status"
          onPointerEnter={() => setSegurar(true)}
          onFocus={() => setSegurar(true)}
          className="absolute right-0 bottom-full z-20 mb-2 flex w-64 scroll-mt-36 items-start gap-2 rounded-md border border-line-strong bg-surface-200 p-3 text-body-sm text-ink shadow-raised"
        >
          <div className="flex min-w-0 flex-col gap-2.5">
            <p>
              <strong>{servico ? "Pedido enviado!" : "Curtido: você se candidatou!"}</strong> Agora{" "}
              {quem || "quem publicou"} decide se aceita. Se aceitar, vocês se conectam e o contato aparece no seu
              painel.
            </p>
            <ConviteNotificacoes
              jeito="balao"
              titulo="Saiba na hora"
              texto={servico ? "Avisar no celular quando responder" : "Avisar no celular se aceitar"}
            />
          </div>
          <button
            type="button"
            onClick={() => setExplicar(false)}
            className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
          >
            <X aria-hidden className="size-4" />
            <span className="sr-only">Fechar</span>
          </button>
        </div>
      )}
      {dica && !explicar && !erro && (
        // a dica (uma vez): curtir é se candidatar, não um "gostei"
        <div
          id={`${eu}-dica`}
          role="status"
          data-pode-olhar
          // não segura o toque: o que está embaixo continua tocável (menos o Entendi)
          className="pointer-events-none absolute right-0 bottom-full z-30 mb-3 w-72 max-w-[calc(100vw-2rem)] rounded-md bg-ink p-3.5 text-left text-body-sm text-surface-100 shadow-raised"
        >
          <p className="flex items-center gap-1.5 text-label">
            <Heart aria-hidden className="size-4 shrink-0 text-like" fill="currentColor" />
            Curtir é se candidatar
          </p>
          <p className="mt-1 opacity-90">
            Não é só um “gostei”: {quem || "quem publicou"} recebe o seu perfil e decide se aceita. Se aceitar, vocês
            trocam o contato.
          </p>
          <div className="mt-2.5 flex justify-end">
            <button
              type="button"
              onClick={() => setDica(false)}
              className="pointer-events-auto inline-flex min-h-9 items-center rounded-pill bg-surface-100 px-4 text-label text-ink hover:opacity-90"
            >
              Entendi
            </button>
          </div>
          <span aria-hidden className="absolute right-7 -bottom-1.5 size-3 rotate-45 bg-ink" />
        </div>
      )}
    </div>
  );
}
