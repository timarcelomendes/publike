import { redirect } from "next/navigation";

// Os números da equipe moraram aqui até 08/11/2026: agora ficam em Equipe › Números, junto da moderação
// (Curtidas, Denúncias, Anúncios e Vagas do dia). O endereço antigo leva para lá.
export default function PainelDaEquipe() {
  redirect("/admin/numeros");
}
