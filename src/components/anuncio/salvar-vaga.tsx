"use client";

import { Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarVaga } from "@/lib/acoes/descobrir";
import { pedirEntrar, tirarPedidoDoEndereco } from "../folha-de-entrar";

const CLASSES =
  "inline-flex min-h-11 items-center gap-2 rounded-pill border border-line-strong bg-surface-200 px-4 text-label text-ink transition-colors hover:bg-surface-300 disabled:opacity-60";

const COMPACTO =
  "relative z-10 inline-flex size-11 shrink-0 items-center justify-center rounded-pill border border-line-strong bg-surface-200 text-ink transition-colors hover:bg-surface-300 disabled:opacity-60";

/**
 * Estrela de "salvar para depois" na página da vaga. `compacto`: só a estrela, no
 * cartão da busca (as salvas ficam em Descobrir › Salvas).
 */
export function BotaoSalvarVaga({
  anuncioId,
  salva,
  logado,
  compacto = false,
  salvarSozinho = false,
}: {
  anuncioId: string;
  salva: boolean;
  logado: boolean;
  compacto?: boolean;
  /** voltou de entrar pelo "Salvar" (?salvar=1): a vaga é salva sozinha
   * (claude/plano-curtir-sem-pagina-de-entrar.md) */
  salvarSozinho?: boolean;
}) {
  const [marcada, setMarcada] = useState(salva);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const fez = useRef(false);

  function trocar(salvar: boolean) {
    iniciar(async () => {
      const r = await chamarAcao(() => salvarVaga(anuncioId, salvar));
      if (r.ok) {
        setMarcada(salvar);
        setErro(null);
      } else setErro(r.erro);
    });
  }

  // a pessoa tocou em Salvar sem conta, entrou e voltou: termina o que começou (uma vez)
  useEffect(() => {
    if (!logado || !salvarSozinho || salva || fez.current) return;
    fez.current = true;
    tirarPedidoDoEndereco("salvar");
    trocar(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez, na volta de entrar
  }, [logado, salvarSozinho, salva]);

  if (!logado) {
    const proximo = `/anuncio/${anuncioId}?salvar=1`;
    return (
      <Link
        href={`/entrar?next=${encodeURIComponent(proximo)}`}
        // a folha de entrar por cima da página; sem ela, o link leva ao /entrar
        onClick={(e) => {
          if (pedirEntrar({ proximo })) e.preventDefault();
        }}
        className={CLASSES}
      >
        <Star aria-hidden className="size-[18px] text-ipe" />
        Salvar
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-pressed={marcada}
        disabled={pendente}
        onClick={() => trocar(!marcada)}
        className={compacto ? COMPACTO : CLASSES}
        aria-label={compacto ? (marcada ? "Vaga salva (tocar tira das salvas)" : "Salvar vaga para depois") : undefined}
        title={compacto ? (marcada ? "Salva" : "Salvar para depois") : undefined}
      >
        <Star aria-hidden className="size-[18px] text-ipe" fill={marcada ? "currentColor" : "none"} />
        {!compacto && (marcada ? "Salva" : "Salvar")}
      </button>
      {erro && <p className={`text-body-sm text-danger ${compacto ? "relative z-10 max-w-40" : ""}`}>{erro}</p>}
    </div>
  );
}
