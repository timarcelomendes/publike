"use client";

import { Building2, ClipboardCheck, Palette, Sparkles, Video, Workflow } from "lucide-react";
import {
  liberarAutomacoes,
  liberarCopiloto,
  liberarPaginaDeVagas,
  liberarPlanoAgencia,
  liberarTestes,
  liberarVideo,
} from "@/lib/acoes/admin";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** Libera o Copiloto sem prazo, ou tira (também tira o prazo dos 15 dias grátis). */
export function BotaoCopiloto({ contaId, liberado }: { contaId: string; liberado: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-1">
      <Botao
        tamanho="sm"
        variante={liberado ? "secundario" : "primario"}
        disabled={pendente}
        onClick={() => rodar(() => liberarCopiloto(contaId, !liberado))}
      >
        <Sparkles aria-hidden />
        {liberado ? "Tirar a Triagem com IA" : "Liberar a Triagem com IA"}
      </Botao>
      {mensagem}
    </div>
  );
}

/** Libera o Teste Prático sem prazo, ou tira. */
export function BotaoTestes({ contaId, liberado }: { contaId: string; liberado: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-1">
      <Botao
        tamanho="sm"
        variante={liberado ? "secundario" : "primario"}
        disabled={pendente}
        onClick={() => rodar(() => liberarTestes(contaId, !liberado))}
      >
        <ClipboardCheck aria-hidden />
        {liberado ? "Tirar o Teste Prático" : "Liberar o Teste Prático"}
      </Botao>
      {mensagem}
    </div>
  );
}

/** Libera a Entrevista em vídeo sem prazo, ou tira (migração 20270104120000). */
export function BotaoVideo({ contaId, liberado }: { contaId: string; liberado: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-1">
      <Botao
        tamanho="sm"
        variante={liberado ? "secundario" : "primario"}
        disabled={pendente}
        onClick={() => rodar(() => liberarVideo(contaId, !liberado))}
      >
        <Video aria-hidden />
        {liberado ? "Tirar a Entrevista em vídeo" : "Liberar a Entrevista em vídeo"}
      </Botao>
      {mensagem}
    </div>
  );
}

/** Libera as Automações personalizadas sem prazo, ou tira (migração 20270114120000). */
export function BotaoAutomacoes({ contaId, liberado }: { contaId: string; liberado: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-1">
      <Botao
        tamanho="sm"
        variante={liberado ? "secundario" : "primario"}
        disabled={pendente}
        onClick={() => rodar(() => liberarAutomacoes(contaId, !liberado))}
      >
        <Workflow aria-hidden />
        {liberado ? "Tirar as Automações personalizadas" : "Liberar as Automações personalizadas"}
      </Botao>
      {mensagem}
    </div>
  );
}

/** Libera a página de carreiras sem prazo, ou tira a liberação da equipe (migração 20270117120000). */
export function BotaoPaginaDeVagas({ contaId, liberado }: { contaId: string; liberado: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-1">
      <Botao
        tamanho="sm"
        variante={liberado ? "secundario" : "primario"}
        disabled={pendente}
        onClick={() => rodar(() => liberarPaginaDeVagas(contaId, !liberado))}
      >
        <Palette aria-hidden />
        {liberado ? "Tirar a página de carreiras" : "Liberar a página de carreiras"}
      </Botao>
      {mensagem}
    </div>
  );
}

/** O Plano Agência por cortesia (migração 20270408120000), para a primeira agência testar. */
export function BotaoPlanoAgencia({ contaId, liberado }: { contaId: string; liberado: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-1">
      <Botao
        tamanho="sm"
        variante={liberado ? "secundario" : "primario"}
        disabled={pendente}
        onClick={() => rodar(() => liberarPlanoAgencia(contaId, !liberado))}
      >
        <Building2 aria-hidden />
        {liberado ? "Tirar a cortesia do Plano Agência" : "Liberar o Plano Agência (cortesia)"}
      </Botao>
      {mensagem}
    </div>
  );
}
