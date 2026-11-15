"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { Local } from "@/lib/regioes";
import { BotaoOndeMora, PainelOndeMora } from "../explorar/onde-mora";

/** "Onde você mora?" na rota do currículo: a rota sai de casa (o CEP) ou do meio do bairro. */
export function OndeMoraDaRota({ local }: { local: Local | null }) {
  const [aberto, setAberto] = useState(!local);
  const id = useId();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3">
      <div>
        <BotaoOndeMora local={local} aberto={aberto} onClick={() => setAberto((a) => !a)} controla={id} />
      </div>
      {aberto && (
        <PainelOndeMora
          id={id}
          local={local}
          fechar={() => setAberto(false)}
          aoSalvar={() => {
            setAberto(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
