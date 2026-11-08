import { CalendarClock, Inbox } from "lucide-react";
import { plural } from "@/lib/formato";
import { resumoDosPedidos } from "@/lib/servidor/pedidos-do-cliente";
import { BotaoLink } from "../ui/botao";

/**
 * No Hoje da agência: os pedidos de vaga novos dos clientes e os prazos que vencem em até 2 dias ou já venceram
 * (migração 20270307120000). Sem nada disso, nada.
 */
export async function AlertaDePedidos() {
  const r = await resumoDosPedidos().catch(() => null);
  if (!r || (!r.novos && !r.perto && !r.atrasados)) return null;
  const partes = [
    r.novos > 0 && `${plural(r.novos, "pedido novo", "pedidos novos")} para responder`,
    r.atrasados > 0 && `${plural(r.atrasados, "pedido passou", "pedidos passaram")} do prazo`,
    r.perto > 0 && `${plural(r.perto, "prazo vence", "prazos vencem")} em até 2 dias`,
  ].filter(Boolean);
  const Icone = r.novos ? Inbox : CalendarClock;
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-lg border-2 bg-surface-200 p-4 shadow-card sm:p-5 ${
        r.atrasados ? "border-danger" : "border-terra"
      }`}
    >
      <Icone aria-hidden className={`size-5 shrink-0 ${r.atrasados ? "text-danger" : "text-terra-text"}`} />
      <p className="min-w-0 grow basis-56 text-body-sm">
        <span className="text-label">Pedidos dos clientes:</span> {partes.join("; ")}.
      </p>
      <BotaoLink href="/painel/pedidos" tamanho="sm" variante="primario">
        Ver os pedidos
      </BotaoLink>
    </div>
  );
}
