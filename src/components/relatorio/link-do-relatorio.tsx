"use client";

import { Copy, Link2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { linkDoRelatorio } from "@/lib/acoes/relatorio";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

/** O link do relatório para mandar ao cliente (sem conta): criar, copiar e trocar. */
export function LinkDoRelatorio({ clienteId, inicial }: { clienteId: string; inicial: string | null }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [link, setLink] = useState(inicial);
  const [copiado, setCopiado] = useState(false);
  const pedir = (trocar: boolean) =>
    rodar(
      () => linkDoRelatorio(clienteId, trocar),
      (r) => {
        if (r.ok && "link" in r && typeof r.link === "string") setLink(r.link);
      },
    );
  return (
    <div className="flex flex-col gap-2" data-nao-imprimir>
      {link ? (
        <>
          <label htmlFor="link-relatorio" className="text-label">
            Link para o cliente
          </label>
          <div className="flex flex-wrap gap-2">
            <input id="link-relatorio" readOnly value={link} className={`${classesEntrada} min-w-0 flex-1`} />
            <Botao
              tamanho="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(() => setCopiado(true));
              }}
            >
              <Copy aria-hidden />
              {copiado ? "Copiado" : "Copiar"}
            </Botao>
            <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={() => pedir(true)}>
              <RefreshCw aria-hidden />
              Trocar o link
            </Botao>
          </div>
          <p className="text-body-sm text-ink-muted">
            O cliente abre sem conta e vê os últimos 90 dias. Trocar o link faz o anterior parar de abrir.
          </p>
        </>
      ) : (
        <Botao tamanho="sm" disabled={pendente} onClick={() => pedir(false)} className="self-start">
          <Link2 aria-hidden />
          {pendente ? "Criando…" : "Criar o link para o cliente"}
        </Botao>
      )}
      {mensagem}
    </div>
  );
}
