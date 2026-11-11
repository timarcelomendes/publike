import Link from "next/link";
import { Aviso } from "@/components/ui/basicos";
import { dataDoDia } from "@/lib/pagamentos";
import type { MinhaFaixa } from "@/lib/servidor/pagina-de-carreiras";

/**
 * O plano por faixa ficou pequeno (migração 20270412120000): as vagas no ar, o limite e até quando dá para mudar para a
 * faixa de cima (30 dias). Nada trava, nem depois do prazo (por enquanto). Na Assinatura e nos Planos.
 */
/** As faixas de cada plano, da menor para a maior. */
const FAIXAS: Record<string, { recurso: string; limite: number }[]> = {
  empresa: [
    { recurso: "empresa_5", limite: 5 },
    { recurso: "empresa_20", limite: 20 },
    { recurso: "empresa_50", limite: 50 },
  ],
  agencia: [
    { recurso: "agencia_15", limite: 15 },
    { recurso: "agencia_200", limite: 200 },
  ],
};

export function AvisoDaFaixa({ faixa, comLink = true }: { faixa: MinhaFaixa | null; comLink?: boolean }) {
  const p = faixa?.passou;
  if (!p) return null;
  // a faixa de cima em que as vagas cabem (ou a maior): a troca paga só a diferença (migração 20270416120000)
  const lista = (FAIXAS[String(p.plano).split("_")[0]] ?? []).filter((f) => f.limite > p.limite);
  const cima = lista.find((f) => f.limite >= faixa.vagas_no_ar) ?? lista.at(-1);
  return (
    <Aviso tipo="alerta" titulo={`Você tem ${faixa.vagas_no_ar} vagas no ar, e o seu plano vai até ${p.limite}`}>
      Você tem até <strong>{dataDoDia(p.prazo)}</strong> para mudar para a faixa de cima. Nada para de funcionar
      enquanto isso.
      {cima ? (
        <>
          {" "}
          <Link
            href={`/painel/assinar?recurso=${cima.recurso}&mudar=1`}
            className="font-semibold underline underline-offset-2"
          >
            Mudar para a faixa até {cima.limite} vagas, pagando só a diferença
          </Link>
        </>
      ) : null}
      {comLink && !cima && (
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
