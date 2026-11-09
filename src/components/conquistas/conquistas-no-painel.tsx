import { conquistasParaConfirmar } from "@/lib/servidor/conquistas";
import { ConfirmarConquistas } from "./confirmar-conquistas";

/** No painel da vaga: quem disse que começou, esperando a confirmação (sem a migração 20270322120000, nada). */
export async function ConquistasNoPainel({ anuncioId }: { anuncioId: string }) {
  return <ConfirmarConquistas itens={await conquistasParaConfirmar(anuncioId)} />;
}
