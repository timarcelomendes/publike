import { MessageCircleOff } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AceitarWhatsapp } from "@/components/avisos/aceitar-whatsapp";
import { Container, Esqueleto, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { criarClientePublico } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Receber os candidatos no WhatsApp", robots: { index: false } };

// O pedido do WhatsApp para quem contrata (18/11/2026; migração 20270726120000): o link do sino e do e-mail, sem
// entrar. Abrir só registra que abriu; o aceite é o toque no botão.

export default function PaginaPedidoWhatsapp({ params }: PageProps<"/avisos/whatsapp/[token]">) {
  return (
    <Container className="max-w-xl py-10">
      <Suspense fallback={<Esqueleto className="h-80 w-full rounded-lg" />}>
        <Conteudo params={params} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ params }: { params: PageProps<"/avisos/whatsapp/[token]">["params"] }) {
  const { token } = await params;
  const valido = /^[0-9a-f]{64}$/.test(token);
  const { data, error } =
    valido && !MODO_DEMO
      ? await criarClientePublico().rpc("whatsapp_pedido_ver", { p_token: token })
      : { data: null, error: null };
  if (error) console.error(`Publike: a página do pedido do WhatsApp não leu o link: ${error.message}`);
  const pedido = data as { empresa: string; numero: string | null; aceito: boolean } | null;
  if (!pedido) {
    return (
      <Vazio
        icone={MessageCircleOff}
        titulo="Este link não vale mais"
        acao={<BotaoLink href="/perfil/preferencias#avisos">Escolher os avisos</BotaoLink>}
      >
        Entre na sua conta para ligar os avisos pelo WhatsApp em Preferências.
      </Vazio>
    );
  }
  return <AceitarWhatsapp token={token} empresa={pedido.empresa} numero={pedido.numero} jaRecebe={pedido.aceito} />;
}
