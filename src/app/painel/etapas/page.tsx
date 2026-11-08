import { redirect } from "next/navigation";

// "Etapas e horários" virou uma parte de Configurações (08/11/2026): as etapas próprias em Processo e os horários
// livres em Entrevistas e mensagens. O endereço antigo leva para lá.
export default function EtapasEHorarios() {
  redirect("/painel/configuracoes?aba=processo#etapas");
}
