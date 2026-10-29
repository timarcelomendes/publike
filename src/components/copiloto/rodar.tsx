"use client";

import { Sparkles, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { lerLoteDoCopiloto } from "@/lib/acoes/copiloto";
import { POR_CLIQUE_COPILOTO, type OrigemCopiloto } from "@/lib/copiloto";
import { Botao } from "../ui/botao";

/**
 * "Ler os currículos": lê em lotes até 24 currículos por clique, com o progresso. Com "todos", quem se
 * candidatou vem primeiro e depois os Talentos.
 */
export function RodarCopiloto({
  anuncioId,
  origem,
  faltam,
  lidos,
}: {
  anuncioId: string;
  origem: OrigemCopiloto | "todos";
  /** quantos ainda não têm leitura com os critérios de agora */
  faltam: number;
  lidos: number;
}) {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const parar = useRef(false);
  const alvo = Math.min(POR_CLIQUE_COPILOTO, faltam);

  async function rodar() {
    parar.current = false;
    setRodando(true);
    setFeitos(0);
    setAviso(null);
    let total = 0;
    let falhas = 0;
    while (!parar.current && total < POR_CLIQUE_COPILOTO) {
      const r = await chamarAcao(() => lerLoteDoCopiloto(anuncioId, origem));
      if (!r.ok) {
        setAviso({ ok: false, texto: r.erro });
        break;
      }
      total += r.lidos;
      falhas += r.falhas;
      setFeitos(total);
      router.refresh();
      if (r.faltam === 0 || r.lidos === 0) break;
    }
    setRodando(false);
    if (total) {
      setAviso({
        ok: true,
        texto: `Pronto: ${total} ${total === 1 ? "currículo lido" : "currículos lidos"}${falhas ? ` (${falhas} ficaram para a próxima)` : ""}.`,
      });
    }
    router.refresh();
  }

  const nome =
    origem === "talento" ? "Buscar profissionais" : origem === "candidato" ? "Ler candidatos" : "Ler os currículos";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {rodando ? (
          <>
            <p role="status" className="inline-flex min-h-10 items-center gap-2 text-label">
              <Sparkles aria-hidden className="size-[18px] animate-pulse text-terra-text motion-reduce:animate-none" />
              Lendo currículos… {feitos} de {alvo}
            </p>
            <Botao tamanho="sm" variante="fantasma" onClick={() => (parar.current = true)}>
              <Square aria-hidden />
              Parar
            </Botao>
          </>
        ) : faltam > 0 ? (
          <Botao variante="primario" tamanho="sm" onClick={rodar}>
            <Sparkles aria-hidden />
            {lidos ? `Ler mais ${Math.min(POR_CLIQUE_COPILOTO, faltam)}` : nome}
          </Botao>
        ) : (
          <p className="text-body-sm text-ink-muted">
            {lidos ? "Todos já foram lidos com estes critérios." : "Ninguém para ler ainda."}
          </p>
        )}
      </div>
      {aviso && (
        <p role="status" className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
