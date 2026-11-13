// As cidades do impulso no Google (src/lib/impulso-cidades.ts, 13/11/2026): a cidade da vaga e as vizinhas que o raio
// alcança, e o lugar de cada uma no Google pela consulta de `geo_target_constant`. Sem banco e sem rede.
// Roda com `npx tsx scripts/testar-impulso-cidades.ts` (sai com erro se algo mudou).
import { CIDADES } from "../src/lib/constantes";
import { cidadesDoLugar, cidadesNoGoogle } from "../src/lib/impulso-cidades";
import { centroDaCidade } from "../src/lib/regioes";

let falhas = 0;
let total = 0;
function igual(nome: string, veio: unknown, esperado: unknown) {
  total++;
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    falhas++;
    console.error(`✗ ${nome}\n    veio:     ${a}\n    esperado: ${b}`);
  }
}

const em = (cidade: (typeof CIDADES)[number], raio: number) => ({ ...centroDaCidade(cidade), raio });

// a cidade da vaga e as vizinhas que o raio alcança, da mais perto para a mais longe
igual("vaga no centro de Goiânia, 10 km", cidadesDoLugar(em("Goiânia", 10), "Goiânia"), [
  "Goiânia",
  "Aparecida de Goiânia",
  "Senador Canedo",
]);
igual("em Trindade, 15 km: Goiânia entra (pelo centro da região Oeste)", cidadesDoLugar(em("Trindade", 15), "Trindade").includes("Goiânia"), true);
igual("em Aparecida, 15 km: começa por ela e Goiânia", cidadesDoLugar(em("Aparecida de Goiânia", 15), "Aparecida de Goiânia").slice(0, 2), [
  "Aparecida de Goiânia",
  "Goiânia",
]);
igual("em Anápolis, 15 km: Goiânia fica de fora", cidadesDoLugar(em("Anápolis", 15), "Anápolis").includes("Goiânia"), false);
igual("o raio maior alcança mais cidades", cidadesDoLugar(em("Goiânia", 20), "Goiânia").length > 3, true);
igual("sem o ponto, só a cidade da vaga", cidadesDoLugar(null, "goiânia"), ["Goiânia"]);
igual("sem o ponto e fora do Publike, nenhuma", cidadesDoLugar(null, "Rio Verde"), []);
igual("a cidade da vaga entra mesmo longe do ponto", cidadesDoLugar(em("Goiânia", 1), "Anápolis")[0], "Anápolis");
igual("sem repetir a cidade da vaga", new Set(cidadesDoLugar(em("Goiânia", 30), "Goiânia")).size, cidadesDoLugar(em("Goiânia", 30), "Goiânia").length);

// o lugar de cada cidade no Google
const linhas = [
  { resourceName: "geoTargetConstants/1", name: "Goiania", canonicalName: "Goiania,State of Goias,Brazil", targetType: "City", status: "ENABLED" },
  // o bairro com o nome da cidade não conta
  { resourceName: "geoTargetConstants/2", name: "Goiania", canonicalName: "Goiania,Goiania,State of Goias,Brazil", targetType: "Neighborhood", status: "ENABLED" },
  // a Trindade de Pernambuco não conta; a de Goiás, sim
  { resourceName: "geoTargetConstants/3", name: "Trindade", canonicalName: "Trindade,State of Pernambuco,Brazil", targetType: "City", status: "ENABLED" },
  { resourceName: "geoTargetConstants/4", name: "Trindade", canonicalName: "Trindade,State of Goias,Brazil", targetType: "City", status: "ENABLED" },
  // com acento também vale
  { resourceName: "geoTargetConstants/5", name: "Aparecida de Goiânia", canonicalName: "Aparecida de Goiânia,Goiás,Brasil", targetType: "City", status: "ENABLED" },
  // entre duas, a cidade ativa
  { resourceName: "geoTargetConstants/6", name: "Senador Canedo", canonicalName: "Senador Canedo,State of Goias,Brazil", targetType: "City", status: "REMOVAL_PLANNED" },
  { resourceName: "geoTargetConstants/7", name: "Senador Canedo", canonicalName: "Senador Canedo,State of Goias,Brazil", targetType: "City", status: "ENABLED" },
  // o município só quando não há a cidade
  { resourceName: "geoTargetConstants/8", name: "Inhumas", canonicalName: "Inhumas,State of Goias,Brazil", targetType: "Municipality", status: "ENABLED" },
  { resourceName: "geoTargetConstants/9", name: "Caturai", canonicalName: "Caturai,State of Goias,Brazil", targetType: "Municipality", status: "ENABLED" },
  { resourceName: "geoTargetConstants/10", name: "Caturai", canonicalName: "Caturai,State of Goias,Brazil", targetType: "City", status: "ENABLED" },
  // fora do Publike
  { resourceName: "geoTargetConstants/11", name: "Goianesia", canonicalName: "Goianesia,State of Goias,Brazil", targetType: "City", status: "ENABLED" },
  {},
];
const mapa = cidadesNoGoogle(linhas);
igual("Goiânia é a cidade, não o bairro", mapa.get("Goiânia"), "geoTargetConstants/1");
igual("Trindade é a de Goiás", mapa.get("Trindade"), "geoTargetConstants/4");
igual("Aparecida com acento", mapa.get("Aparecida de Goiânia"), "geoTargetConstants/5");
igual("Senador Canedo, a ativa", mapa.get("Senador Canedo"), "geoTargetConstants/7");
igual("Inhumas pelo município", mapa.get("Inhumas"), "geoTargetConstants/8");
igual("Caturaí pela cidade", mapa.get("Caturaí"), "geoTargetConstants/10");
igual("só as cidades do Publike", mapa.size, 6);

console.log(falhas ? `${falhas} de ${total} falharam` : `${total} conferências, todas certas`);
process.exit(falhas ? 1 : 0);
