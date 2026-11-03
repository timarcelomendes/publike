"use client";

import { CalendarClock, KanbanSquare, UserRoundX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { moverCandidatos } from "@/lib/acoes/recrutamento";
import type { EtapaCandidato } from "@/lib/constantes";
import { Botao, BotaoLink } from "../ui/botao";

/** Os botões de cada coluna do Comparar: levar para Entrevista, Não seguir, ou abrir no quadro. */
export function AcoesDoComparar({
  anuncioId,
  perfilId,
  nome,
  coluna,
}: {
  anuncioId: string;
  perfilId: string;
  nome: string;
  coluna: EtapaCandidato;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const primeiro = nome.split(" ")[0];

  function mover(destino: EtapaCandidato) {
    setAviso(null);
    iniciar(async () => {
      const r = await chamarAcao(() => moverCandidatos(anuncioId, [perfilId], destino));
      if (!r.ok && "ir" in r && r.ir) router.push(r.ir);
      else if (!r.ok) setAviso({ ok: false, texto: r.erro });
      else if (r.falhas.length) setAviso({ ok: false, texto: r.falhas.map((f) => f.erro).join(" ") });
      else {
        setAviso({ ok: true, texto: r.mensagem });
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {coluna !== "entrevista" && coluna !== "contratado" && coluna !== "nao_seguiu" && (
          <Botao tamanho="sm" disabled={pendente} onClick={() => mover("entrevista")}>
            <CalendarClock aria-hidden />
            Entrevista
          </Botao>
        )}
        {coluna !== "nao_seguiu" && coluna !== "contratado" && (
          <Botao
            tamanho="sm"
            variante="fantasma"
            disabled={pendente}
            onClick={() => mover("nao_seguiu")}
            aria-label={`Não seguir com ${primeiro}`}
          >
            <UserRoundX aria-hidden />
            Não seguir
          </Botao>
        )}
        <BotaoLink href={`/painel/anuncio/${anuncioId}/quadro?candidato=${perfilId}`} tamanho="sm" variante="fantasma">
          <KanbanSquare aria-hidden />
          Abrir no quadro
        </BotaoLink>
      </div>
      {aviso && (
        <p
          role={aviso.ok ? "status" : "alert"}
          className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}
        >
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
