"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { lerMaisNaTriagem } from "@/lib/acoes/copiloto";
import { TETO_LEITURA } from "@/lib/copiloto";
import { Botao } from "../ui/botao";

/** "Ler mais 50" (o funil da Triagem): a IA passa a ler os próximos 50 candidatos pela pré-nota. */
export function LerMaisNaTriagem({ anuncioId, abaixo }: { anuncioId: string; abaixo: number }) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const quantos = Math.min(TETO_LEITURA, abaixo);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Botao
          tamanho="sm"
          variante="secundario"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setAviso(null);
              const r = await chamarAcao(() => lerMaisNaTriagem(anuncioId));
              setAviso(
                r.ok
                  ? {
                      ok: true,
                      texto: `Pronto: a IA vai ler mais ${quantos}. Em alguns minutos eles entram no ranking.`,
                    }
                  : { ok: false, texto: r.erro },
              );
            })
          }
        >
          <Sparkles aria-hidden />
          Ler mais {quantos}
        </Botao>
      </div>
      {aviso && (
        <p role="status" className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
