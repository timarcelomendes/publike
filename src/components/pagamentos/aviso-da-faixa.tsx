import Link from "next/link";
import { Aviso } from "@/components/ui/basicos";
import { dataDoDia } from "@/lib/pagamentos";
import type { MinhaFaixa } from "@/lib/servidor/pagina-de-carreiras";

/**
 * O plano por faixa ficou pequeno (migração 20270412120000): as vagas no ar, o limite e até quando dá para mudar para a
 * faixa de cima (30 dias). Nada trava, nem depois do prazo (por enquanto). Na Assinatura e nos Planos.
 */
export function AvisoDaFaixa({ faixa, comLink = true }: { faixa: MinhaFaixa | null; comLink?: boolean }) {
  const p = faixa?.passou;
  if (!p) return null;
  return (
    <Aviso tipo="alerta" titulo={`Você tem ${faixa.vagas_no_ar} vagas no ar, e o seu plano vai até ${p.limite}`}>
      Você tem até <strong>{dataDoDia(p.prazo)}</strong> para mudar para a faixa de cima. Nada para de funcionar
      enquanto isso.
      {comLink && (
        <>
          {" "}
          <Link href="/painel/planos" className="font-semibold underline underline-offset-2">
            Ver os planos
          </Link>
        </>
      )}
    </Aviso>
  );
}
