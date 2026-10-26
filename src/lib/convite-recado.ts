import { diaDeHoje } from "@/lib/banners";

// O convite para deixar um recado, em cima do campo do recado na home de quem entrou: só para a
// conta que nunca deixou recado. Aparece uma vez: mostrado (ou fechado no "Agora não"), o cookie guarda
// quantas vezes foi e o dia; o convite volta depois de 7 dias, até 3 vezes. O servidor lê o cookie
// (nada pisca ao abrir).

export const COOKIE_CONVITE_RECADO = "publike_convite_recado";
const VEZES = 3;
const DIAS = 7;

function ler(valor: string | undefined | null) {
  const [vezes, dia] = (valor ?? "").split("~").map(Number);
  return { vezes: Number.isInteger(vezes) && vezes > 0 ? vezes : 0, dia: Number.isInteger(dia) ? dia : null };
}

/** Fechado há menos de 7 dias, ou já fechado 3 vezes. */
export function conviteRecadoFechado(valor: string | undefined | null, agora: number) {
  const { vezes, dia } = ler(valor);
  return vezes >= VEZES || (dia !== null && diaDeHoje(agora) - dia < DIAS);
}

/** O cookie depois de mais uma vez (o convite apareceu ou a pessoa tocou em "Agora não"). */
export function valorConviteRecadoFechado(valor: string | undefined | null, agora: number) {
  return `${ler(valor).vezes + 1}~${diaDeHoje(agora)}`;
}

/** Já contou hoje: aparecer e fechar no mesmo dia contam uma vez só. */
export function conviteRecadoContadoHoje(valor: string | undefined | null, agora: number) {
  return ler(valor).dia === diaDeHoje(agora);
}
