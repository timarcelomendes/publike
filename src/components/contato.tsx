import { Mail, MessageCircle, Phone } from "lucide-react";
import { marcaDeContato } from "@/lib/contato-candidato";
import { formatarTelefone, linkWhatsApp } from "@/lib/formato";
import { classesBotao } from "./ui/botao";

/** Botões que aparecem depois do match. */
export function BotoesContato({
  whatsapp,
  email,
  mensagem,
  candidatura,
  soChat = false,
}: {
  whatsapp: string | null;
  email: string | null;
  mensagem: string;
  /**
   * a candidatura (a vaga e quem curtiu): o toque em cada botão fica no histórico dela, o da empresa (Admin ›
   * Retorno e Curtidas) e o da pessoa chamando quem publicou (Admin › Curtidas; migração 20270219120000)
   */
  candidatura?: { anuncioId: string; perfilId: string };
  /** a vaga é só pelo chat do Publike: quem publicou não mostra o contato (claude/plano-so-chat-ou-whatsapp.md) */
  soChat?: boolean;
}) {
  const marca = (canal: "whatsapp" | "telefone" | "email") =>
    candidatura ? marcaDeContato(candidatura.anuncioId, candidatura.perfilId, canal) : {};
  if (!whatsapp && !email) {
    return (
      <p className="text-body-sm text-ink-muted">
        {soChat ? "A conversa é pelo chat do Publike." : "Esta pessoa ainda não cadastrou um contato."}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {whatsapp && (
        <a
          href={linkWhatsApp(whatsapp, mensagem)}
          target="_blank"
          rel="noopener noreferrer"
          className={classesBotao("sucesso", "sm")}
          {...marca("whatsapp")}
        >
          <MessageCircle aria-hidden />
          Chamar no WhatsApp
        </a>
      )}
      {whatsapp && (
        <a href={`tel:+${whatsapp}`} className={classesBotao("secundario", "sm")} {...marca("telefone")}>
          <Phone aria-hidden />
          {formatarTelefone(whatsapp)}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className={classesBotao("secundario", "sm")} {...marca("email")}>
          <Mail aria-hidden />
          {email}
        </a>
      )}
    </div>
  );
}
