"use client";

import { Check, RefreshCw, X } from "lucide-react";
import { conferirConteudosAgora, decidirConteudo } from "@/lib/acoes/admin-conteudos";
import { useAcao } from "../ui/usar-acao";
import { Botao } from "../ui/botao";

/** "Conferir agora": a rodada do dia sem esperar (até 2 artigos que não foram conferidos nos últimos 7 dias). */
export function ConferirAgora({ falta }: { falta: string | null }) {
  const acao = useAcao();
  return (
    <div className="flex flex-col items-start gap-2">
      <Botao variante="primario" disabled={acao.pendente || Boolean(falta)} onClick={() => acao.rodar(conferirConteudosAgora)}>
        <RefreshCw aria-hidden className={acao.pendente ? "animate-spin" : ""} />
        {acao.pendente ? "Conferindo… (leva até 3 minutos)" : "Conferir agora"}
      </Botao>
      {falta && <p className="text-body-sm text-danger">{falta}</p>}
      {acao.mensagem}
    </div>
  );
}

/** Publicar ou descartar a versão nova de um artigo. */
export function DecidirConteudo({ id }: { id: number }) {
  const acao = useAcao();
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <Botao variante="primario" disabled={acao.pendente} onClick={() => acao.rodar(() => decidirConteudo(id, true))}>
          <Check aria-hidden />
          Publicar no site
        </Botao>
        <Botao variante="secundario" disabled={acao.pendente} onClick={() => acao.rodar(() => decidirConteudo(id, false))}>
          <X aria-hidden />
          Descartar
        </Botao>
      </div>
      {acao.mensagem}
    </div>
  );
}
