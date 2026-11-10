"use client";

import { MessageSquareText, Send } from "lucide-react";
import { useState } from "react";
import { explicarParaModeracao, perguntarAoAnunciante } from "@/lib/acoes/moderacao";
import { LIMITE_CONVERSA_MODERACAO, type MensagemModeracao } from "@/lib/conversa-moderacao";
import { formatarDataHora } from "@/lib/formato";
import { Botao } from "./ui/botao";
import { classesEntrada } from "./ui/campo";
import { useAcao } from "./ui/usar-acao";

/**
 * A conversa entre quem publicou e a moderação (migração 20270405120000). Na página do anúncio, quem publicou
 * explica a vaga em análise ou removida; na fila da moderação e na ficha, a equipe lê e pergunta.
 */
export function ConversaModeracao({
  anuncioId,
  mensagens,
  lado,
  status,
}: {
  anuncioId: string;
  mensagens: MensagemModeracao[];
  /** "autor": quem publicou, na página do anúncio; "equipe": a moderação */
  lado: "autor" | "equipe";
  status: string;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [texto, setTexto] = useState("");
  const [aberta, setAberta] = useState(lado === "autor" || mensagens.length > 0);
  const comModeracao = status === "em_analise" || status === "removido";
  // quem publicou só escreve enquanto o anúncio está com a moderação; a equipe pergunta sempre
  const podeEscrever = lado === "equipe" || comModeracao;
  const idCampo = `conversa-${lado}-${anuncioId}`;

  if (lado === "equipe" && !aberta) {
    return (
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="inline-flex min-h-10 items-center gap-2 self-start text-body-sm font-semibold underline underline-offset-2"
      >
        <MessageSquareText aria-hidden className="size-4" />
        Perguntar a quem publicou
      </button>
    );
  }

  const titulo =
    lado === "autor"
      ? status === "removido"
        ? "Não concorda? Fale com a moderação"
        : "Explique o anúncio para a moderação"
      : "Conversa com quem publicou";
  const ajuda =
    lado === "autor"
      ? "Conte o que a moderação precisa saber para decidir: como é o pagamento, quem é a empresa, o que a vaga pede. Só a equipe do Publike lê."
      : "Quem publicou recebe a pergunta no sino, no celular e no e-mail, e responde na página do anúncio.";

  return (
    <section
      id={lado === "autor" ? "moderacao" : undefined}
      aria-labelledby={`${idCampo}-titulo`}
      className={
        lado === "autor"
          ? "flex scroll-mt-24 flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:p-5"
          : "flex flex-col gap-3 rounded-md bg-surface-300 p-3"
      }
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${idCampo}-titulo`} className={lado === "autor" ? "text-h3" : "text-label"}>
          {titulo}
        </h2>
        {podeEscrever && <p className="text-body-sm text-ink-muted">{ajuda}</p>}
      </div>

      {mensagens.length > 0 && (
        <ol className="flex flex-col gap-2" aria-label="Mensagens">
          {mensagens.map((m) => {
            const minha = m.de === lado;
            const quem =
              m.de === "equipe"
                ? lado === "equipe" && m.quem_nome
                  ? `Moderação (${m.quem_nome})`
                  : "Moderação do Publike"
                : lado === "autor"
                  ? "Você"
                  : "Quem publicou";
            return (
              <li
                key={m.id}
                className={`flex max-w-[44rem] flex-col gap-1 rounded-md px-3 py-2 text-body-sm ${
                  minha ? "self-end bg-surface-100" : "self-start border border-line bg-surface-200"
                }`}
              >
                <span className="text-caption text-ink-muted">
                  {quem} · {formatarDataHora(m.criado_em)}
                </span>
                <p className="whitespace-pre-line">{m.texto}</p>
              </li>
            );
          })}
        </ol>
      )}

      {podeEscrever ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const acao = lado === "autor" ? explicarParaModeracao : perguntarAoAnunciante;
            rodar(
              () => acao(anuncioId, texto),
              (r) => r.ok && setTexto(""),
            );
          }}
        >
          <label htmlFor={idCampo} className="sr-only">
            {lado === "autor" ? "Sua explicação" : "Sua pergunta"}
          </label>
          <textarea
            id={idCampo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={lado === "autor" ? 4 : 2}
            maxLength={LIMITE_CONVERSA_MODERACAO}
            placeholder={
              lado === "autor"
                ? "Ex.: a comissão é de 40% sobre cada venda, sem custo para o candidato. A empresa tem CNPJ…"
                : "Ex.: Qual é o CNPJ da empresa? O candidato paga alguma coisa para começar?"
            }
            className={`${classesEntrada} resize-y`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Botao type="submit" tamanho="sm" disabled={pendente || !texto.trim()}>
              <Send aria-hidden />
              {pendente ? "Enviando…" : lado === "autor" ? "Enviar para a moderação" : "Perguntar"}
            </Botao>
            <span className="text-caption text-ink-muted" aria-live="polite">
              {texto.length > LIMITE_CONVERSA_MODERACAO - 100 ? `${LIMITE_CONVERSA_MODERACAO - texto.length} letras restantes` : ""}
            </span>
          </div>
          {mensagem}
        </form>
      ) : (
        <p className="text-body-sm text-ink-muted">A moderação já decidiu. A conversa fica aqui para consulta.</p>
      )}
    </section>
  );
}
