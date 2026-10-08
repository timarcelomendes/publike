import { Lock } from "lucide-react";
import { Vazio } from "./ui/basicos";
import { BotaoLink } from "./ui/botao";

/** Mostrado no modo demonstração nas páginas que precisam de conta. */
export function SoComSupabase() {
  return (
    <Vazio
      icone={Lock}
      titulo="Disponível depois de conectar o Supabase"
      acao={<BotaoLink href="/">Ver os anúncios de exemplo</BotaoLink>}
    >
      No modo demonstração não existem contas. Siga o passo a passo do README para criar o banco grátis no Supabase;
      leva uns 15 minutos.
    </Vazio>
  );
}
