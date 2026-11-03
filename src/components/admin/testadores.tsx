"use client";

import { Mail, MessageCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { apagarTestador, marcarConviteTestador, salvarTestadores } from "@/lib/acoes/admin-testadores";
import { linkWhatsApp } from "@/lib/formato";
import { linkEmailDoTeste, mensagemWhatsappDoTeste, type Testador } from "@/lib/testadores-app";
import { Botao, classesBotao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

// Admin › Testadores do app: colar a lista e, em cada pessoa, o convite pronto no WhatsApp e no e-mail. O Publike
// só abre a mensagem: quem envia é o admin, e o toque fica marcado.

export function FormTestadores() {
  const [texto, setTexto] = useState("");
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(
          () => salvarTestadores(texto),
          (r) => r.ok && setTexto(""),
        );
      }}
    >
      <label htmlFor="testadores-lista" className="text-label">
        Pôr pessoas na lista
      </label>
      <p className="text-body-sm text-ink-muted">
        Uma por linha: o nome, o e-mail da conta Google da Play Store e o WhatsApp. Ex.: Ana Souza, ana@gmail.com, (62)
        99999-0000. O mesmo e-mail de novo só atualiza.
      </p>
      <textarea
        id="testadores-lista"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={5}
        className={`${classesEntrada} resize-y text-body-sm`}
      />
      <Botao type="submit" tamanho="sm" disabled={pendente || !texto.trim()} className="self-start">
        Salvar
      </Botao>
      {mensagem}
    </form>
  );
}

/** Os dois convites de uma pessoa: abre o WhatsApp ou o e-mail com a mensagem pronta e marca que foi mandado. */
export function ConvitesDoTestador({ t }: { t: Testador }) {
  const marcar = (canal: "whatsapp" | "email") => void marcarConviteTestador(t.id, canal).catch(() => {});
  return (
    <span className="flex flex-wrap gap-1.5">
      {t.whatsapp && (
        <a
          href={linkWhatsApp(t.whatsapp, mensagemWhatsappDoTeste(t))}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => marcar("whatsapp")}
          className={classesBotao(t.whatsapp_em ? "secundario" : "sucesso", "sm")}
          aria-label={`Mandar o convite no WhatsApp para ${t.nome}`}
        >
          <MessageCircle aria-hidden />
          WhatsApp
        </a>
      )}
      <a
        href={linkEmailDoTeste(t)}
        onClick={() => marcar("email")}
        className={classesBotao(t.email_em || t.whatsapp ? "secundario" : "primario", "sm")}
        aria-label={`Mandar o convite por e-mail para ${t.nome}`}
      >
        <Mail aria-hidden />
        E-mail
      </a>
    </span>
  );
}

export function TirarTestador({ id, nome }: { id: string; nome: string }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <span className="flex flex-col items-end gap-1">
      <Botao
        variante="fantasma"
        tamanho="sm"
        disabled={pendente}
        aria-label={`Tirar ${nome} da lista`}
        onClick={() => rodar(() => apagarTestador(id))}
      >
        <Trash2 aria-hidden />
      </Botao>
      {mensagem}
    </span>
  );
}
