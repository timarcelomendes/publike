import { Mail, MessageCircle, Phone } from "lucide-react";
import { formatarTelefone, linkWhatsApp } from "@/lib/formato";
import { classesBotao } from "./ui/botao";

/** Botões que aparecem depois do match. */
export function BotoesContato({
  whatsapp,
  email,
  mensagem,
}: {
  whatsapp: string | null;
  email: string | null;
  mensagem: string;
}) {
  if (!whatsapp && !email) {
    return <p className="text-body-sm text-ink-muted">Esta pessoa ainda não cadastrou um contato.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {whatsapp && (
        <a
          href={linkWhatsApp(whatsapp, mensagem)}
          target="_blank"
          rel="noopener noreferrer"
          className={classesBotao("sucesso", "sm")}
        >
          <MessageCircle aria-hidden />
          Chamar no WhatsApp
        </a>
      )}
      {whatsapp && (
        <a href={`tel:+${whatsapp}`} className={classesBotao("secundario", "sm")}>
          <Phone aria-hidden />
          {formatarTelefone(whatsapp)}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className={classesBotao("secundario", "sm")}>
          <Mail aria-hidden />
          {email}
        </a>
      )}
    </div>
  );
}
