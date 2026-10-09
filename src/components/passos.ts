import { Heart, Megaphone, MessageCircle } from "lucide-react";

/** Os três passos do Publike (página inicial e Como funciona). */
export const PASSOS = [
  {
    icone: Megaphone,
    titulo: "Publique ou mostre o que faz",
    texto: "Empresa, comércio ou família publica a vaga. Pedreiro, diarista ou manicure mostra os serviços, com fotos e preço. De graça.",
    cor: "bg-terra-soft text-terra-text",
    cheio: false,
  },
  {
    icone: Heart,
    titulo: "Curta o que combina",
    texto: "Viu uma vaga ou um profissional que combina com você? Curta. A outra pessoa vê seu perfil e a sua mensagem.",
    cor: "bg-like-soft text-like",
    cheio: true,
  },
  {
    icone: MessageCircle,
    titulo: "Deu match, vocês conversam",
    texto: "Se a outra pessoa aceitar, o WhatsApp dos dois aparece. Antes disso, ninguém vê seu número.",
    cor: "bg-cerrado text-on-cerrado",
    cheio: false,
  },
] as const;
