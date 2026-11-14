import type { VarianteSelo } from "@/components/ui/basicos";
import type { ImpulsoDoAdmin } from "@/lib/acoes/admin-impulsos";

// Os nomes de Admin › Impulsos, iguais em todas as abas (a página, o histórico e o impulso novo).

export const NOME_DA_SITUACAO: Record<string, string> = {
  pago: "Criando no Google",
  em_revisao: "Em revisão no Google",
  no_ar: "No ar",
  encerrado: "Encerrado",
  credito: "Virou crédito",
  devolvido: "Devolvido",
};

export const VARIANTE_DA_SITUACAO: Record<string, VarianteSelo> = {
  pago: "neutro",
  em_revisao: "neutro",
  no_ar: "match",
  encerrado: "neutro",
  credito: "neutro",
  devolvido: "aviso",
};

/** De onde veio o impulso: quem pagou e como. */
export const NOME_DA_ORIGEM: Record<string, string> = {
  compra: "Pago",
  credito: "Crédito",
  cortesia: "Grátis",
  admin: "Pelo admin",
  automatico: "Automático",
  cliente: "Campanha do cliente",
};

/** O pacote de candidatos (migração 20270519120000): sem campanha no Google, no quadro até chegarem os candidatos. */
export function ehPacote(i: Pick<ImpulsoDoAdmin, "produto">) {
  return i.produto === "candidatos";
}

/** O nome da situação: o pacote fala de destaque e de saldo. */
export function nomeDaSituacao(i: Pick<ImpulsoDoAdmin, "situacao" | "produto">) {
  if (ehPacote(i) && i.situacao === "no_ar") return "No destaque";
  if (ehPacote(i) && i.situacao === "credito") return "Virou saldo";
  return NOME_DA_SITUACAO[i.situacao] ?? i.situacao;
}

/** "3 de 5 candidatos" do pacote (a curtida desfeita não conta). */
export function candidatosDoPacote(i: Pick<ImpulsoDoAdmin, "alvo" | "entregues">) {
  const alvo = Number(i.alvo ?? 0);
  return `${Math.min(Number(i.entregues ?? 0), alvo)} de ${alvo} ${alvo === 1 ? "candidato" : "candidatos"}`;
}

/** O impulso ainda corre (criando, em revisão ou no ar). */
export function ehCorrendo(situacao: string) {
  return situacao === "pago" || situacao === "em_revisao" || situacao === "no_ar";
}

/** De onde veio o impulso, para os filtros e as contas: o automático e a campanha do cliente antes da origem. */
export function origemDo(i: Pick<ImpulsoDoAdmin, "origem" | "automatico" | "campanha_cliente_id">) {
  if (i.campanha_cliente_id) return "cliente";
  if (i.automatico) return "automatico";
  return i.origem;
}

/** "5 automáticos, 2 manuais e 1 pago": o que corre agora, por quem pediu. */
export function quemPediu(impulsos: Pick<ImpulsoDoAdmin, "origem" | "automatico" | "campanha_cliente_id">[]) {
  const grupos: [string, string, string][] = [
    ["automatico", "automático", "automáticos"],
    ["manual", "manual", "manuais"],
    ["compra", "pago", "pagos"],
    ["cortesia", "grátis", "grátis"],
    ["credito", "com crédito", "com crédito"],
  ];
  const conta = new Map<string, number>();
  for (const i of impulsos) {
    const o = origemDo(i);
    const g = o === "cliente" || o === "admin" ? "manual" : o;
    conta.set(g, (conta.get(g) ?? 0) + 1);
  }
  const partes = grupos.filter(([g]) => conta.get(g)).map(([g, um, varios]) => `${conta.get(g)} ${conta.get(g) === 1 ? um : varios}`);
  return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}` : (partes[0] ?? "");
}
