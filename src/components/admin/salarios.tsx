"use client";

import { Upload } from "lucide-react";
import { useRef } from "react";
import { enviarSalarios } from "@/lib/acoes/admin-salarios";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** Admin › Salários, o plano B do robô: escolhe o salarios.json que o script fez e troca a tabela das faixas. */
export function EnviarSalarios() {
  const { rodar, pendente, mensagem } = useAcao();
  const arquivo = useRef<HTMLInputElement>(null);

  function enviar(lista: FileList | null) {
    const f = lista?.[0];
    if (!f) return;
    rodar(async () => enviarSalarios(await f.text()));
    if (arquivo.current) arquivo.current.value = "";
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <input
        ref={arquivo}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        id="arquivo-salarios"
        aria-label="O salarios.json do script"
        onChange={(e) => enviar(e.target.files)}
      />
      <Botao tamanho="sm" disabled={pendente} onClick={() => arquivo.current?.click()}>
        <Upload aria-hidden />
        {pendente ? "Enviando…" : "Enviar o salarios.json"}
      </Botao>
      {mensagem}
    </div>
  );
}
