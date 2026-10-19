"use client";

import { Archive, ArchiveRestore, Pencil, Trash } from "lucide-react";
import { useState } from "react";
import { arquivarCliente, excluirCliente } from "@/lib/acoes/clientes";
import { Botao, BotaoLink } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** Botões da ficha do cliente: editar os dados, arquivar (ou trazer de volta) e excluir (só sem vagas). */
export function AcoesCliente({ id, arquivado, podeExcluir }: { id: string; arquivado: boolean; podeExcluir: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [confirmar, setConfirmar] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <BotaoLink href={`/painel/clientes/${id}/editar`} tamanho="sm">
          <Pencil aria-hidden />
          Editar dados
        </BotaoLink>
        <Botao
          tamanho="sm"
          variante="fantasma"
          disabled={pendente}
          onClick={() => rodar(() => arquivarCliente(id, !arquivado))}
        >
          {arquivado ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
          {arquivado ? "Trazer de volta para a lista" : "Arquivar"}
        </Botao>
        {podeExcluir &&
          (confirmar ? (
            <span className="flex flex-wrap items-center gap-2 text-body-sm">
              Excluir o cliente de vez?
              <Botao tamanho="sm" variante="perigo" disabled={pendente} onClick={() => rodar(() => excluirCliente(id))}>
                Sim, excluir
              </Botao>
              <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(false)}>
                Cancelar
              </Botao>
            </span>
          ) : (
            <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(true)}>
              <Trash aria-hidden />
              Excluir
            </Botao>
          ))}
      </div>
      {mensagem}
    </div>
  );
}
