import type { Oficio } from "@/lib/constantes";

/**
 * Os ramos da Receita (subclasse do CNAE) de cada ofício da vitrine de serviços, para a lista "Prestadores MEI" de
 * Admin › Convites (claude/plano-base-de-empresas-da-receita.md; 15/11/2026, Marcelo: os mesmos serviços da vitrine).
 * Um ramo pertence a um ofício só; ofício sem ramo próprio na Receita (babá, garçom, decoração...) fica de fora.
 */
export const RAMOS_DOS_OFICIOS: { oficio: Oficio; cnaes: string[] }[] = [
  { oficio: "pedreiro", cnaes: ["4399103", "4330499"] },
  { oficio: "pintor", cnaes: ["4330404"] },
  { oficio: "gesseiro", cnaes: ["4330403"] },
  { oficio: "azulejista", cnaes: ["4330405"] },
  { oficio: "marceneiro", cnaes: ["3101200"] },
  { oficio: "serralheiro", cnaes: ["2512800"] },
  { oficio: "vidraceiro", cnaes: ["4743100"] },
  { oficio: "marido-de-aluguel", cnaes: ["4399199"] },
  { oficio: "montador-de-moveis", cnaes: ["4330402"] },
  { oficio: "eletricista", cnaes: ["4321500"] },
  { oficio: "encanador", cnaes: ["4322301"] },
  { oficio: "ar-condicionado", cnaes: ["4322302"] },
  { oficio: "eletrodomesticos", cnaes: ["9521500"] },
  { oficio: "diarista", cnaes: ["8121400", "9700500"] },
  { oficio: "limpeza-pos-obra", cnaes: ["8129000"] },
  { oficio: "estofados", cnaes: ["9529105"] },
  { oficio: "dedetizacao", cnaes: ["8122200"] },
  { oficio: "cuidador", cnaes: ["8712300"] },
  { oficio: "pets", cnaes: ["9609208"] },
  { oficio: "cabeleireiro", cnaes: ["9602501"] },
  { oficio: "sobrancelha", cnaes: ["9602502"] },
  { oficio: "aulas", cnaes: ["8599699", "8599605"] },
  { oficio: "aulas-musica", cnaes: ["8592903"] },
  { oficio: "personal", cnaes: ["9313100"] },
  { oficio: "informatica", cnaes: ["9511800"] },
  { oficio: "celular", cnaes: ["9512600"] },
  { oficio: "sites", cnaes: ["6201501"] },
  { oficio: "frete", cnaes: ["4930201", "4930202", "4930204"] },
  { oficio: "motorista", cnaes: ["4923001", "4923002"] },
  { oficio: "motoboy", cnaes: ["5320202"] },
  { oficio: "cozinheira", cnaes: ["5620104", "5620102"] },
  { oficio: "salgados", cnaes: ["1091102"] },
  { oficio: "dj", cnaes: ["9001906"] },
  { oficio: "fotografo", cnaes: ["7420001", "7420004"] },
  { oficio: "jardineiro", cnaes: ["8130300"] },
  { oficio: "mecanico", cnaes: ["4520001", "4543900"] },
  { oficio: "lava-jato", cnaes: ["4520005"] },
  { oficio: "funilaria", cnaes: ["4520002"] },
  { oficio: "costureira", cnaes: ["1412602", "1412603"] },
  { oficio: "chaveiro", cnaes: ["9529102"] },
];

/** Todos os ramos de prestador (a lista inteira) ou os de um ofício. */
export function ramosDoOficio(oficio?: string | null) {
  if (oficio) return RAMOS_DOS_OFICIOS.find((r) => r.oficio === oficio)?.cnaes ?? [];
  return RAMOS_DOS_OFICIOS.flatMap((r) => r.cnaes);
}

/** O ofício de um ramo, ou null. */
export function oficioDoRamo(cnae: string | null | undefined): Oficio | null {
  if (!cnae) return null;
  return RAMOS_DOS_OFICIOS.find((r) => r.cnaes.includes(cnae))?.oficio ?? null;
}
