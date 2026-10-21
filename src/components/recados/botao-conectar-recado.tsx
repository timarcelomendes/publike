"use client";

import { Check, Clock, Handshake, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { pedirConexao } from "@/lib/acoes/conexoes";
import { caminhoConexao, type EstadoConexao } from "@/lib/conexoes";
import { caminhoConversa } from "@/lib/conversas";

const BOTAO =
  "inline-flex min-h-9 items-center gap-1.5 rounded-pill px-3 text-label whitespace-nowrap text-ink hover:bg-surface-100 disabled:opacity-60";

/**
 * Conectar com quem escreveu o recado, no rodapé, ao lado da Força e do Indicar. O pedido sai
 * direto (sem recado); depois o botão diz como ficou: pedido enviado, para responder ou conectados.
 * No celular estreito fica só o ícone (o nome vai para o leitor de tela).
 */
export function BotaoConectarRecado({
  recadoId,
  autor,
  estado: inicial,
}: {
  recadoId: string;
  autor: { id: string; nome: string; tipo: string };
  estado: EstadoConexao | null;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  // pessoa: o primeiro nome; empresa: o nome inteiro
  const nome = autor.tipo === "pessoa" ? autor.nome.split(" ")[0] : autor.nome;
  const texto = "max-[359px]:sr-only";

  if (estado?.status === "recusada") return null;

  if (estado?.status === "aceita") {
    return (
      <Link href={caminhoConversa(autor.id)} className={`relative z-10 ${BOTAO} text-cerrado-text`}>
        <Check aria-hidden className="size-[18px]" />
        <span className={texto}>Conectados</span>
        <span className="sr-only"> com {nome}: conversar</span>
      </Link>
    );
  }

  if (estado?.status === "pendente" && !estado.pedi) {
    return (
      <Link href={caminhoConexao(autor.id)} className={`relative z-10 ${BOTAO} text-terra-text`}>
        <Handshake aria-hidden className="size-[18px]" />
        <span className={texto}>Responder pedido</span>
        <span className="sr-only"> de {nome}</span>
      </Link>
    );
  }

  if (estado?.status === "pendente") {
    return (
      <span role="status" className={`${BOTAO} text-ink-muted hover:bg-transparent`}>
        <Clock aria-hidden className="size-[18px]" />
        <span className={texto}>Pedido enviado</span>
      </span>
    );
  }

  return (
    <span className="relative z-10 flex flex-col">
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await pedirConexao(autor.id, null, `/recado/${recadoId}`);
            if (r.ok) return setEstado(r.estado);
            if (r.ir?.startsWith("/entrar")) return router.push(r.ir);
            setErro(r.erro);
          })
        }
        className={BOTAO}
      >
        <UserPlus aria-hidden className="size-[18px]" />
        <span className={texto}>{pendente ? "Enviando…" : "Conectar"}</span>
        <span className="sr-only"> com {nome}</span>
      </button>
      {erro && (
        <span role="alert" className="px-3 text-body-sm text-danger">
          {erro}
        </span>
      )}
    </span>
  );
}
