"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { pedirTeste } from "@/lib/acoes/testes";
import { Botao } from "../ui/botao";
import { Seletor, classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

/** Manda um teste para um candidato da vaga (os que ele ainda não recebeu). */
export function PedirTeste({
  anuncioId,
  perfilId,
  nome,
  opcoes,
}: {
  anuncioId: string;
  perfilId: string;
  nome: string;
  opcoes: { id: string; titulo: string }[];
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [modelo, setModelo] = useState(opcoes[0]?.id ?? "");
  if (!opcoes.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`pedir-${perfilId}`} className="sr-only">
          Teste para {nome}
        </label>
        <Seletor
          id={`pedir-${perfilId}`}
          value={modelo}
          onChange={(e) => setModelo(e.target.value)}
          className={`${classesEntrada} min-h-10 py-1.5 text-body-sm`}
          envoltorio="min-w-0 flex-1 sm:max-w-xs"
        >
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.titulo}
            </option>
          ))}
        </Seletor>
        <Botao
          tamanho="sm"
          disabled={pendente || !modelo}
          onClick={() => rodar(() => pedirTeste(anuncioId, perfilId, modelo))}
        >
          <Send aria-hidden />
          Mandar teste
        </Botao>
      </div>
      {mensagem}
    </div>
  );
}
