"use client";

import { Check, Copy, ExternalLink, MessageCircle, Power, RefreshCw } from "lucide-react";
import { useState } from "react";
import { mudarLinkDoCliente } from "@/lib/acoes/pedidos-do-cliente";
import { chamarAcao } from "@/lib/acao-segura";
import { linkWhatsApp } from "@/lib/formato";
import { urlDoLinkDoCliente } from "@/lib/pedidos-do-cliente";
import type { LinkDoCliente } from "@/lib/servidor/pedidos-do-cliente";
import { Botao, classesBotao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

/**
 * O link do cliente na ficha dele (painel da agência): copiar, mandar no WhatsApp do cliente, abrir, trocar (o antigo
 * para de valer) e desligar.
 */
export function LinkDoClienteBox({
  cliente,
  nome,
  telefone,
  agencia,
  site,
  inicial,
}: {
  cliente: string;
  nome: string;
  telefone: string | null;
  agencia: string;
  site: string;
  inicial: LinkDoCliente;
}) {
  const [link, setLink] = useState(inicial);
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, setPendente] = useState(false);
  const url = urlDoLinkDoCliente(site, link.token);
  const mensagem = `Olá! Aqui é da ${agencia}. Por este link você pede as vagas de ${nome} e acompanha cada uma, com o prazo combinado: ${url}`;

  async function mudar(acao: "trocar" | "ligar" | "desligar") {
    setPendente(true);
    setAviso(null);
    const r = await chamarAcao(() => mudarLinkDoCliente(cliente, acao));
    setPendente(false);
    if (r.ok && "link" in r) {
      setLink(r.link);
      setAviso({ ok: true, texto: r.mensagem });
    } else if (!r.ok) setAviso({ ok: false, texto: r.erro });
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // sem acesso à área de transferência: a pessoa seleciona o link na caixa
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {link.ativo ? (
        <>
          <label htmlFor="link-do-cliente" className="sr-only">
            O link do cliente
          </label>
          <input
            id="link-do-cliente"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className={`${classesEntrada} font-normal text-body-sm`}
          />
          <div className="flex flex-wrap gap-2">
            <Botao tamanho="sm" variante="primario" onClick={copiar}>
              {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
              <span aria-live="polite">{copiado ? "Copiado" : "Copiar o link"}</span>
            </Botao>
            <a
              href={telefone ? linkWhatsApp(telefone.length >= 12 ? telefone : `55${telefone}`, mensagem) : `https://wa.me/?text=${encodeURIComponent(mensagem)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={classesBotao("secundario", "sm")}
            >
              <MessageCircle aria-hidden />
              Mandar no WhatsApp
            </a>
            <a href={url} target="_blank" rel="noopener noreferrer" className={classesBotao("fantasma", "sm")}>
              <ExternalLink aria-hidden />
              Ver como o cliente vê
            </a>
          </div>
          <p className="text-body-sm text-ink-muted">
            {link.aberto_em
              ? `O cliente abriu ${link.aberturas === 1 ? "1 vez" : `${link.aberturas} vezes`}.`
              : "O cliente ainda não abriu."}{" "}
            Quem tiver o link pede vagas para este cliente: mande só para ele.
          </p>
          <div className="flex flex-wrap gap-2">
            <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={() => mudar("trocar")}>
              <RefreshCw aria-hidden />
              Trocar o link
            </Botao>
            <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={() => mudar("desligar")}>
              <Power aria-hidden />
              Desligar
            </Botao>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-body-sm">O link está desligado: o cliente não consegue abrir.</p>
          <Botao tamanho="sm" variante="secundario" disabled={pendente} onClick={() => mudar("ligar")}>
            <Power aria-hidden />
            Ligar de novo
          </Botao>
        </div>
      )}
      {aviso && (
        <p role="status" className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
