import "server-only";
import type { ValoresAnuncio } from "@/components/form-anuncio";
import { CIDADES, MODELOS, REGIMES } from "@/lib/constantes";
import { tituloLegivel } from "@/lib/conferir-anuncio";
import { modeloDaGupy, regimeDaGupy, type VagaDaGupy } from "@/lib/gupy";
import { consultarCep } from "./cep";

// A vaga lida da Gupy no formato do Publike (claude/plano-candidatura-no-site-da-empresa.md): os campos do
// formulário (o "Puxar do link" do admin) ou o formulário pronto para publicar (a importação de todas as vagas da
// página de vagas da empresa). Sempre com a candidatura no site da empresa.

const CIDADES_DO_PUBLIKE = new Set<string>(CIDADES);

export const cidadeDoPublike = (cidade: string | null | undefined) => Boolean(cidade && CIDADES_DO_PUBLIKE.has(cidade));

export type LugarDaVaga = {
  cidade: string;
  bairro: string | null;
  cep: string | null;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
};

/**
 * Onde é a vaga: pelo CEP do endereço na Gupy (o bairro, a rua e o ponto no mapa); sem ele, só a cidade. Fora das
 * cidades do Publike, `lugar` é null. `aviso`: o que a equipe precisa conferir.
 */
export async function lugarDaVagaDaGupy(v: VagaDaGupy): Promise<{ lugar: LugarDaVaga | null; aviso: string | null }> {
  const cep = v.cep ? await consultarCep(v.cep).catch(() => null) : null;
  if (cep?.ok && cidadeDoPublike(cep.endereco.cidade)) {
    const lugar = {
      cidade: cep.endereco.cidade,
      bairro: cep.endereco.bairro,
      cep: cep.endereco.cep,
      endereco: cep.endereco.rua,
      lat: cep.ponto?.lat ?? null,
      lng: cep.ponto?.lng ?? null,
    };
    if (!cep.ponto) return { lugar, aviso: "Achamos o CEP, mas não o ponto no mapa: marque o pino na região da vaga." };
    if (cep.precisao === "cep" || cep.precisao === "bairro")
      return { lugar, aviso: "O pino ficou no meio do CEP ou do bairro: confira no mapa." };
    return { lugar, aviso: null };
  }
  if (cidadeDoPublike(v.cidade))
    return {
      lugar: { cidade: v.cidade!, bairro: null, cep: null, endereco: null, lat: null, lng: null },
      aviso: "A Gupy não deu um CEP que o Publike ache: confira o bairro e o pino no mapa.",
    };
  return { lugar: null, aviso: `A vaga é em ${ondeNaGupy(v)}, fora das cidades do Publike.` };
}

/** "Guarulhos (SP)", como a Gupy diz. */
export const ondeNaGupy = (v: Pick<VagaDaGupy, "cidade" | "uf">) =>
  v.cidade ? `${v.cidade}${v.uf ? ` (${v.uf})` : ""}` : "um lugar que a Gupy não diz";

/** Em quantos dias a vaga sai do ar: até o fim da publicação na Gupy (de 1 a 365); sem o fim, 30. */
export function prazoAte(expiraEm: string | null, hoje: string): number {
  if (!expiraEm) return 30;
  const dias = Math.round((Date.parse(`${expiraEm}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);
  return Math.min(Math.max(dias, 1), 365);
}

/** O que conferir antes de publicar: o tipo que o Publike não conhece, o banco de talentos, a descrição. */
export function avisosDaVagaDaGupy(v: VagaDaGupy): string[] {
  const avisos: string[] = [];
  if (!regimeDaGupy(v.tipo))
    avisos.push(`A Gupy diz o tipo “${v.tipo ?? "nenhum"}”, que o Publike não conhece: escolha o tipo de contratação.`);
  if (v.tipo === "vacancy_type_talent_pool")
    avisos.push("Na Gupy, isto é um banco de talentos, não uma vaga aberta. Confira com a empresa antes de publicar.");
  if (v.descricaoCortada) avisos.push("A descrição passou de 3.000 letras: ficou o começo. Confira o fim do texto.");
  if (v.linhasComContato)
    avisos.push(
      `${v.linhasComContato === 1 ? "Saiu 1 linha" : `Saíram ${v.linhasComContato} linhas`} da descrição com telefone, e-mail ou site (o Publike não deixa contato na descrição).`,
    );
  return avisos;
}

/** "CLT · Presencial", para a lista da importação. */
export function resumoDaVagaDaGupy(v: VagaDaGupy): string {
  const regime = regimeDaGupy(v.tipo);
  const modelo = modeloDaGupy(v.modelo);
  return [regime ? REGIMES[regime].selo : null, modelo ? MODELOS.find((m) => m.valor === modelo)?.nome : null]
    .filter(Boolean)
    .join(" · ");
}

/** Os campos do formulário da vaga (o "Puxar do link"): o resto do formulário fica como está. */
export function camposDaVagaDaGupy(v: VagaDaGupy, lugar: LugarDaVaga | null, hoje: string): Partial<ValoresAnuncio> {
  return {
    id: undefined,
    tipo: "vaga",
    titulo: tituloLegivel(v.titulo),
    descricao: v.descricao,
    regime: regimeDaGupy(v.tipo),
    modelo: modeloDaGupy(v.modelo),
    pcd: v.pcd ? "tambem" : null,
    // a Gupy quase nunca mostra o salário: a combinar (quem publica muda, se souber)
    combinar: true,
    pagamento_valor: null,
    pagamento_ate: null,
    pagamento_unidade: "mes",
    vagas: 1,
    prazo_dias: prazoAte(v.expiraEm, hoje),
    candidatura: "site",
    link_candidatura: v.link,
    pede_curriculo: false,
    contato_direto: false,
    perguntas: [],
    ...(lugar
      ? {
          cidade: lugar.cidade,
          ...(lugar.bairro ? { bairro: lugar.bairro } : {}),
          cep: lugar.cep,
          endereco: lugar.endereco,
          lat: lugar.lat,
          lng: lugar.lng,
        }
      : {}),
  };
}

/**
 * O formulário da vaga para publicar sem a tela (a importação em lote), como se quem publica tivesse preenchido:
 * o servidor completa a categoria e o ponto no mapa (`completarAnuncio`) e confere tudo (`lerAnuncio`). Sem o
 * bairro, o da conta (na mesma cidade) ou a própria cidade. Agência: a empresa da vaga é a da página da Gupy.
 */
export function formularioDaVagaDaGupy(
  v: VagaDaGupy,
  lugar: LugarDaVaga,
  { hoje, base, agencia }: { hoje: string; base: { cidade: string; bairro: string | null }; agencia: boolean },
): FormData {
  const f = new FormData();
  const campos: Record<string, string> = {
    tipo: "vaga",
    titulo: tituloLegivel(v.titulo),
    // curta demais, o Publike monta uma pelo título
    descricao: v.descricao.length >= 20 ? v.descricao : "",
    categoria: "",
    regime: regimeDaGupy(v.tipo) ?? "outro",
    combinar: "on",
    pagamento_unidade: "mes",
    vagas: "1",
    cidade: lugar.cidade,
    bairro: lugar.bairro ?? (base.bairro && base.cidade === lugar.cidade ? base.bairro : lugar.cidade),
    cep: lugar.cep ?? "",
    endereco: lugar.endereco ?? "",
    lat: lugar.lat != null ? String(lugar.lat) : "",
    lng: lugar.lng != null ? String(lugar.lng) : "",
    modelo: modeloDaGupy(v.modelo) ?? "",
    pcd: v.pcd ? "tambem" : "",
    prazo: "outro",
    prazo_outro: String(prazoAte(v.expiraEm, hoje)),
    candidatura: "site",
    link_candidatura: v.link,
    ...(agencia ? { agencia: "1", contratante: v.empresa ?? "" } : {}),
  };
  for (const [k, valor] of Object.entries(campos)) f.set(k, valor);
  return f;
}
