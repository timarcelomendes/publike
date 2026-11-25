import "server-only";
import { SITE_URL } from "@/lib/config";
import { CIDADES, REGIMES, type Cidade } from "@/lib/constantes";
import { formatarLugar, valorDoAnuncio } from "@/lib/formato";
import { CIDADES_ATENDIDAS, ONDE_FUNCIONA, noPublike } from "@/lib/pracas";
import { centroDaCidade } from "@/lib/regioes";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { centroDoBairro } from "./cep";

// O app do Publike nas IAs (25/11/2026; Marcelo, com o que o mercado já tem: o Indeed pôs as vagas dele dentro do
// ChatGPT no Brasil). Um servidor MCP público e só de leitura em /api/mcp (o protocolo dos apps do ChatGPT, do Claude
// e das outras IAs): buscar as vagas no ar e ver uma vaga. Para se candidatar, o link leva à vaga no Publike (a origem
// "chatgpt" conta em De onde vêm as contas). Sem login: só o que qualquer visitante vê.

export const VERSAO_DO_PROTOCOLO = "2025-06-18";
const PROTOCOLOS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const link = (caminho: string) => `${SITE_URL}${caminho}${caminho.includes("?") ? "&" : "?"}utm_source=chatgpt&utm_medium=app`;

export const FERRAMENTAS = [
  {
    name: "buscar_vagas",
    title: "Buscar vagas de emprego",
    description: `Procura as vagas de emprego no ar no Publike, o site de vagas de ${ONDE_FUNCIONA} (Goiás, Brasil). Use quando a pessoa procura emprego nessa região. Devolve até 10 vagas, das mais perto do lugar, com o link de cada uma para ver e se candidatar de graça.`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        funcao: { type: "string", description: "A função ou cargo, curto (\"garçom\", \"auxiliar de cozinha\"). Vazio: todas." },
        cidade: { type: "string", enum: [...CIDADES], description: "A cidade (padrão: Goiânia)." },
        bairro: { type: "string", description: "O bairro ou setor, para ordenar pelas mais perto." },
        tipo_de_contratacao: { type: "string", enum: Object.keys(REGIMES), description: "Só deste tipo (CLT, estágio, diária...)." },
        limite: { type: "integer", minimum: 1, maximum: 10, description: "Quantas vagas (padrão 6)." },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "ver_vaga",
    title: "Ver uma vaga",
    description: "Os detalhes de uma vaga do Publike (o que faz, o salário, o horário, os benefícios e o lugar), pelo id que veio da busca.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string", description: "O id da vaga (da busca_vagas)." } },
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
] as const;

type Resultado = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
const texto = (t: string, extra?: Record<string, unknown>, isError = false): Resultado => ({
  content: [{ type: "text", text: t }],
  ...(extra ? { structuredContent: extra } : {}),
  ...(isError ? { isError } : {}),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function buscarVagas(a: Record<string, unknown>): Promise<Resultado> {
  const funcao = typeof a.funcao === "string" ? a.funcao.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const cidade: Cidade = (CIDADES as readonly string[]).includes(String(a.cidade)) ? (a.cidade as Cidade) : "Goiânia";
  const bairro = typeof a.bairro === "string" ? a.bairro.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const regime = typeof a.tipo_de_contratacao === "string" && a.tipo_de_contratacao in REGIMES ? a.tipo_de_contratacao : null;
  const limite = Math.min(10, Math.max(1, Number(a.limite) || 6));
  const doBairro = bairro ? await centroDoBairro(bairro, cidade).catch(() => null) : null;
  const centro = doBairro && noPublike(doBairro) ? doBairro : centroDaCidade(cidade);
  const { data, error } = await criarClientePublico().rpc("buscar_anuncios", {
    p_lat: centro.lat,
    p_lng: centro.lng,
    p_raio_km: 50,
    p_tipo: "vaga",
    p_regime: regime,
    p_texto: funcao || null,
    p_ordem: "perto",
    p_limite: 30,
    p_cidade: cidade,
  });
  if (error) return texto("Não consegui buscar as vagas agora. Tente de novo em instantes.", undefined, true);
  const vagas = (data ?? []).slice(0, limite).map((v) => ({
    id: v.id,
    titulo: v.titulo,
    valor: valorDoAnuncio(v) || null,
    lugar: formatarLugar(v.bairro ?? "", v.cidade ?? ""),
    distancia_km: v.distancia_km != null ? Math.round(v.distancia_km * 10) / 10 : null,
    empresa: v.autor_nome,
    tipo_de_contratacao: v.regime ? (REGIMES[v.regime as keyof typeof REGIMES]?.nome ?? null) : null,
    link: link(`/anuncio/${v.id}`),
  }));
  const onde = `${bairro ? `perto de ${bairro}, ` : ""}${cidade}`;
  if (!vagas.length)
    return texto(
      `Agora não há vaga${funcao ? ` de ${funcao}` : ""} no ar no Publike ${bairro ? "perto de " + onde : "em " + cidade}. Entram vagas novas todo dia. A pessoa pode deixar o currículo grátis em ${link("/perfil/curriculo")} para as empresas da região a acharem e receber o aviso das vagas novas.`,
      { vagas: [], busca: { funcao, cidade, bairro } },
    );
  const linhas = vagas.map(
    (v) =>
      `• ${v.titulo}${v.valor ? ` · ${v.valor}` : ""} · ${v.lugar}${v.distancia_km != null && bairro ? ` (a ${v.distancia_km} km)` : ""} · ${v.empresa}\n  ${v.link}`,
  );
  return texto(
    `Vagas${funcao ? ` de ${funcao}` : ""} no ar no Publike, ${onde} (das mais perto):\n\n${linhas.join("\n")}\n\nPara se candidatar, é grátis: abra o link da vaga e toque em Curtir (entra com o WhatsApp, sem senha). Também dá para pedir vagas pelo WhatsApp do Publike.`,
    { vagas, busca: { funcao, cidade, bairro } },
  );
}

async function verVaga(a: Record<string, unknown>): Promise<Resultado> {
  const id = String(a.id ?? "").trim().toLowerCase();
  if (!UUID.test(id)) return texto("Esse id de vaga não existe. Use o id que veio da busca_vagas.", undefined, true);
  const { data: v } = await criarClientePublico()
    .from("anuncios")
    .select("id, tipo, status, titulo, descricao, bairro, cidade, regime, pagamento_valor, pagamento_unidade, pagamento_ate, horario, beneficios, criado_em")
    .eq("id", id)
    .maybeSingle();
  if (!v || v.tipo !== "vaga" || v.status !== "ativo") return texto("Essa vaga não está mais no ar no Publike.", { ativa: false });
  const valor = valorDoAnuncio(v) || null;
  const regime = v.regime ? (REGIMES[v.regime as keyof typeof REGIMES]?.nome ?? null) : null;
  const vaga = {
    id: v.id,
    titulo: v.titulo,
    descricao: String(v.descricao ?? "").slice(0, 1500),
    lugar: formatarLugar(v.bairro ?? "", v.cidade ?? ""),
    valor,
    tipo_de_contratacao: regime,
    horario: v.horario ?? null,
    beneficios: v.beneficios ?? null,
    publicada_em: v.criado_em,
    link: link(`/anuncio/${v.id}`),
  };
  return texto(
    [
      vaga.titulo,
      [vaga.lugar, valor, regime, vaga.horario].filter(Boolean).join(" · "),
      vaga.descricao,
      vaga.beneficios ? `Benefícios: ${vaga.beneficios}` : "",
      `Ver e se candidatar (grátis): ${vaga.link}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    { vaga },
  );
}

/** Roda a ferramenta. */
export async function chamarFerramenta(nome: string, argumentos: unknown): Promise<Resultado | null> {
  const a = argumentos && typeof argumentos === "object" ? (argumentos as Record<string, unknown>) : {};
  if (nome === "buscar_vagas") return buscarVagas(a);
  if (nome === "ver_vaga") return verVaga(a);
  return null;
}

export const INSTRUCOES = `O Publike é um site grátis de vagas de emprego em ${ONDE_FUNCIONA} (Goiás, Brasil). ${CIDADES_ATENDIDAS} Use buscar_vagas para mostrar as vagas no ar perto de onde a pessoa mora e ver_vaga para os detalhes. Mostre sempre o link de cada vaga: é por ele que a pessoa se candidata, de graça.`;

export const PROTOCOLO = (pedido: unknown) =>
  typeof pedido === "string" && PROTOCOLOS.includes(pedido) ? pedido : VERSAO_DO_PROTOCOLO;
