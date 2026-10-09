import { Heart, Megaphone, MessageCircle } from "lucide-react";

/** Os três passos do Publike (página inicial e Como funciona). */
export const PASSOS = [
  {
    icone: Megaphone,
    titulo: "Quem precisa publica",
    texto: "Empresa, comércio do bairro ou família: publique a vaga ou o serviço em dois minutos. De graça.",
    cor: "bg-terra-soft text-terra-text",
    cheio: false,
  },
  {
    icone: Heart,
    titulo: "Quem faz curte",
    texto: "Viu algo que combina com você? Curta. Quem publicou vê seu perfil e o que você faz.",
    cor: "bg-like-soft text-like",
    cheio: true,
  },
  {
    icone: MessageCircle,
    titulo: "Deu match, vocês conversam",
    texto: "Se quem publicou curtir você de volta, o WhatsApp dos dois aparece. Antes disso, ninguém vê seu número.",
    cor: "bg-cerrado text-on-cerrado",
    cheio: false,
  },
] as const;
