import { NOME_SITUACAO, type SituacaoFatura } from "@/lib/pagamentos";
import { Selo, type VarianteSelo } from "../ui/basicos";

const VARIANTE: Record<SituacaoFatura, VarianteSelo> = {
  pendente: "aviso",
  paga: "match",
  atrasada: "perigo",
  recusada: "perigo",
  estornada: "contorno",
  cancelada: "contorno",
};

export function SeloDaFatura({ situacao }: { situacao: SituacaoFatura }) {
  return <Selo variante={VARIANTE[situacao]}>{NOME_SITUACAO[situacao]}</Selo>;
}
