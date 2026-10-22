"use client";

import { Check, Clock, Handshake, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { pedirConexao } from "@/lib/acoes/conexoes";
import { caminhoConexao, type EstadoConexao } from "@/lib/conexoes";
import { caminhoConversa } from "@/lib/conversas";

// "rodape": sem borda, como o Indicar no rodapé do recado; "pilula": pequeno e com borda, numa
// lista apertada (Contratando, na home).
const JEITOS = {
  rodape: "min-h-9 px-3 text-label hover:bg-surface-100",
  pilula: "h-8 border border-line-strong px-3 text-body-sm font-semibold hover:bg-surface-300",
  // só o ícone, numa linha com o nome (as listas dos lados da home)
  icone: "size-8 justify-center border border-line-strong hover:bg-surface-300",
};

/**
 * Conectar com uma conta num lugar apertado (rodapé do recado, lista de quem está contratando).
 * O pedido sai direto, sem recado; depois o botão diz como ficou: pedido enviado, para responder
 * ou conectados (leva à conversa). No rodapé, no celular bem estreito, fica só o ícone.
 */
export function BotaoConectarCompacto({
  outro,
  estado: inicial,
  voltar,
  jeito = "rodape",
}: {
  outro: { id: string; nome: string; tipo: string };
  estado: EstadoConexao | null;
  /** para onde voltar depois de entrar na conta */
  voltar: string;
  jeito?: keyof typeof JEITOS;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  // pessoa: o primeiro nome; empresa: o nome inteiro
  const nome = outro.tipo === "pessoa" ? outro.nome.split(" ")[0] : outro.nome;
  const base = `relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-pill whitespace-nowrap transition-colors disabled:opacity-60 ${JEITOS[jeito]}`;
  // no rodapé do recado, no celular, fica só o ícone (Força, Indicar e o menu cabem na linha)
  const texto = jeito === "rodape" ? "max-[419px]:sr-only" : jeito === "icone" ? "sr-only" : "";
  const icone = jeito === "rodape" ? "size-[18px]" : "size-4";
  const dica = jeito === "icone" ? `Conectar com ${nome}` : undefined;
  // depois do pedido, na pílula: só o texto (é um estado, não uma ação)
  const estadoBase =
    jeito === "pilula"
      ? "relative z-10 inline-flex h-8 shrink-0 items-center gap-1.5 px-1 text-body-sm font-semibold whitespace-nowrap"
      : jeito === "icone"
        ? "relative z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-pill"
        : base;

  if (estado?.status === "recusada") return null;

  if (estado?.status === "aceita") {
    return (
      <Link
        href={caminhoConversa(outro.id)}
        className={`${estadoBase} text-cerrado-text hover:underline hover:underline-offset-2`}
      >
        <Check aria-hidden className={icone} />
        <span className={texto}>Conectado</span>
        <span className="sr-only"> com {nome}: conversar</span>
      </Link>
    );
  }

  if (estado?.status === "pendente" && !estado.pedi) {
    return (
      <Link
        href={caminhoConexao(outro.id)}
        className={`${estadoBase} text-terra-text hover:underline hover:underline-offset-2`}
      >
        <Handshake aria-hidden className={icone} />
        <span className={texto}>Responder pedido</span>
        <span className="sr-only"> de {nome}</span>
      </Link>
    );
  }

  if (estado?.status === "pendente") {
    return (
      <span role="status" className={`${estadoBase} pointer-events-none text-ink-muted`}>
        <Clock aria-hidden className={icone} />
        <span className={texto}>Pedido enviado</span>
      </span>
    );
  }

  return (
    <span className="relative z-10 flex flex-col items-start">
      <button
        type="button"
        disabled={pendente}
        title={dica}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await pedirConexao(outro.id, null, voltar);
            if (r.ok) return setEstado(r.estado);
            if (r.ir?.startsWith("/entrar")) return router.push(r.ir);
            setErro(r.erro);
          })
        }
        className={`${base} text-ink`}
      >
        <UserPlus aria-hidden className={icone} />
        <span className={texto}>{pendente ? "Enviando…" : "Conectar"}</span>
        <span className="sr-only"> com {nome}</span>
      </button>
      {erro && (
        <span role="alert" className="mt-1 text-body-sm text-danger">
          {erro}
        </span>
      )}
    </span>
  );
}
