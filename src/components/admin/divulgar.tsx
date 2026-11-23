"use client";

import { Ban, Check, Copy, Download, MessageCircle, Undo2 } from "lucide-react";
import { useState } from "react";
import { marcarDivulgacao, tirarDasListasDaReceita } from "@/lib/acoes/admin-convites";
import { WHATSAPP_OFICIAL, whatsappDaReceita } from "@/lib/whatsapp-oficial";
import { Botao, classesBotao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

// Admin › Convites › Divulgar (23/11/2026; Marcelo: "vou encaminhar para algumas contabilidades e empresas de
// gestão de pessoas"): a imagem do publicar pelo WhatsApp e as mensagens prontas, para copiar e mandar.

const TEXTO_DO_PUBLICAR = "Olá! Quero publicar uma vaga pelo WhatsApp.";
const LINK_DO_WHATSAPP = `https://wa.me/${WHATSAPP_OFICIAL.numero}?text=${encodeURIComponent(TEXTO_DO_PUBLICAR)}`;
const LINKS = `👉 Pelo WhatsApp: ${LINK_DO_WHATSAPP}\n👉 Pelo site: https://publike.org/publicar`;

export const MENSAGENS_DE_DIVULGAR = [
  {
    id: "contabilidades",
    nome: "Para contabilidades",
    texto: `Olá! Sou o Marcelo, do Publike, o site de vagas de Goiânia e Anápolis.

Se algum cliente de vocês precisar contratar, ele pode publicar a vaga grátis direto pelo WhatsApp: é só mandar a vaga em texto ou foto, e o Publike monta, publica e já mostra as pessoas prontas para assumir.

${LINKS}

Se puderem repassar aos clientes, ajuda muito. Obrigado!`,
  },
  {
    id: "gestao",
    nome: "Para gestão de pessoas e RH",
    texto: `Olá! Sou o Marcelo, do Publike, o site de vagas de Goiânia e Anápolis.

Vocês podem publicar as vagas dos seus clientes no Publike, grátis e sem limite de candidatos, e já ver as pessoas prontas para assumir. O jeito mais rápido é pelo WhatsApp: mande a vaga em texto ou foto, e o Publike monta e publica.

${LINKS}

Qualquer dúvida, é só me chamar.`,
  },
] as const;

const IMAGEM = "/convites/publicar-pelo-whatsapp.png";

export function Divulgar() {
  const [copiado, setCopiado] = useState<string | null>(null);
  async function copiar(id: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 2500);
    } catch {
      setCopiado(null);
    }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={IMAGEM}
          alt="Publique sua vaga pelo WhatsApp: mande a vaga em texto ou foto, e o Publike monta, publica e já mostra as pessoas prontas para assumir."
          width={1080}
          height={1080}
          className="w-full rounded-lg border border-line"
        />
        <a href={IMAGEM} download="publike-vaga-pelo-whatsapp.png" className={`${classesBotao("secundario", "sm")} self-start`}>
          <Download aria-hidden />
          Baixar a imagem
        </a>
        <p className="text-body-sm text-ink-muted">Mande a imagem primeiro e o texto depois: os links ficam no fim da conversa.</p>
      </div>
      <div className="flex flex-col gap-5">
        {MENSAGENS_DE_DIVULGAR.map((m) => (
          <div key={m.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-300 p-4">
            <p className="text-label">{m.nome}</p>
            <p className="whitespace-pre-line break-words text-body-sm">{m.texto}</p>
            <div className="flex flex-wrap gap-2">
              <Botao tamanho="sm" variante="primario" onClick={() => copiar(m.id, m.texto)}>
                {copiado === m.id ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copiado === m.id ? "Copiado" : "Copiar o texto"}
              </Botao>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(m.texto)}`}
                target="_blank"
                rel="noreferrer"
                className={classesBotao("secundario", "sm")}
              >
                <MessageCircle aria-hidden />
                Abrir no WhatsApp
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Os botões de um contato: abrir no WhatsApp com a mensagem, copiar, marcar mandado, não mandar. */
export function AcoesDoContato({
  cnpj,
  publico,
  telefone,
  mandado,
}: {
  cnpj: string;
  publico: "contabilidades" | "gestao";
  telefone: string | null;
  mandado: boolean;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [copiado, setCopiado] = useState(false);
  const texto = MENSAGENS_DE_DIVULGAR.find((m) => m.id === publico)!.texto;
  const zap = whatsappDaReceita(telefone);
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {zap && !mandado && (
          <a
            href={`https://wa.me/${zap.numero}?text=${encodeURIComponent(texto)}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => rodar(() => marcarDivulgacao(cnpj, publico, true))}
            className={classesBotao("primario", "sm")}
          >
            <MessageCircle aria-hidden />
            Abrir no WhatsApp
          </a>
        )}
        {!zap && !mandado && (
          <Botao
            tamanho="sm"
            variante="secundario"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(texto);
                setCopiado(true);
              } catch {
                setCopiado(false);
              }
            }}
          >
            {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copiado ? "Copiado" : "Copiar o texto"}
          </Botao>
        )}
        {mandado ? (
          <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={() => rodar(() => marcarDivulgacao(cnpj, publico, false))}>
            <Undo2 aria-hidden />
            Desfazer
          </Botao>
        ) : (
          <>
            <Botao tamanho="sm" variante="secundario" disabled={pendente} onClick={() => rodar(() => marcarDivulgacao(cnpj, publico, true))}>
              <Check aria-hidden />
              Mandei
            </Botao>
            <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={() => rodar(() => tirarDasListasDaReceita(cnpj))}>
              <Ban aria-hidden />
              Não mandar
            </Botao>
          </>
        )}
      </div>
      {mensagem}
    </div>
  );
}
