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
}: {
  whatsapp: string | null;
  email: string | null;
  mensagem: string;
  /** a empresa falando com um candidato: Admin › Retorno conta o toque em cada botão */
  candidatura?: { anuncioId: string; perfilId: string };
}) {
  const marca = (canal: "whatsapp" | "telefone" | "email") =>
    candidatura ? marcaDeContato(candidatura.anuncioId, candidatura.perfilId, canal) : {};
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
