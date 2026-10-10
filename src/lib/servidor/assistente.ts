import "server-only";
import { cacheLife } from "next/cache";
import { textoDaAjuda } from "@/lib/ajuda";
import { HISTORICO_CHAT, type AcaoChat, type CartaoChat, type MensagemChat } from "@/lib/assistente";
import { MODO_DEMO } from "@/lib/config";
import { CATEGORIAS } from "@/lib/constantes";
import { buscarAnuncios } from "@/lib/dados";
import { lerFiltros } from "@/lib/filtros";
import { formatarDistancia, formatarLugar, rotuloConta, valorDoAnuncio } from "@/lib/formato";
import { chamarIA, iaConfigurada, lerJson, modeloDaIA } from "@/lib/ia/openai";
import { pontoDoLocal, type Local } from "@/lib/regioes";
import { criarClientePublico, criarClienteServidor } from "@/lib/supabase/servidor";

// O assistente responde dúvidas com o conteúdo da página de ajuda (src/lib/ajuda.ts).
// Com conta, ele também procura vagas, serviços e empresas no banco: a IA só
// diz o que procurar; quem busca é o site, e os resultados vêm do banco (a IA
// não inventa vaga). A conversa não fica guardada: vai e volta do navegador.

/** O assistente aparece no site? (chave da IA no servidor e ligado no admin). Guardado por alguns minutos. */
export async function assistenteDisponivel(): Promise<boolean> {
  "use cache";
  cacheLife("minutes");
  if (MODO_DEMO || !iaConfigurada()) return false;
  try {
    const { data, error } = await criarClientePublico().rpc("assistente_ligado");
    return !error && data === true;
  } catch {
    return false;
  }
}

type Plano = {
  resposta: string;
  acao: "nenhuma" | "buscar_anuncios" | "buscar_empresas" | "pedir_login" | "sugerir";
  busca: { texto: string; tipo: "vaga" | "servico" | "todos"; categoria: string };
};

const ESQUEMA = {
  nome: "resposta_assistente",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["resposta", "acao", "busca"],
    properties: {
      resposta: { type: "string" },
      acao: { type: "string", enum: ["nenhuma", "buscar_anuncios", "buscar_empresas", "pedir_login", "sugerir"] },
      busca: {
        type: "object",
        additionalProperties: false,
        required: ["texto", "tipo", "categoria"],
        properties: {
          texto: { type: "string" },
          tipo: { type: "string", enum: ["vaga", "servico", "todos"] },
          categoria: { type: "string", enum: [...CATEGORIAS.map((c) => c.slug), "todas"] },
        },
      },
    },
  },
};

function instrucoes(pessoa: { logada: boolean; nome: string | null; local: Local | null }) {
  const quem = pessoa.logada
    ? `A pessoa ESTÁ logada${pessoa.nome ? ` e se chama ${pessoa.nome}` : ""}${
        pessoa.local
          ? `; ela informou que fica em ${formatarLugar(pessoa.local.bairro ?? null, pessoa.local.cidade)}`
          : ""
      }. Você pode buscar vagas, serviços e empresas para ela.`
    : "A pessoa NÃO está logada. Você só tira dúvidas. Para buscar vagas, serviços ou empresas, ou para ajudar com a conta dela (anúncios, curtidas, matches, perfil), use a ação pedir_login.";
  return `Você é o assistente do Publike, uma ferramenta do povo para gerar emprego em Goiânia e região.
Responda em português do Brasil, com palavras simples, de forma calorosa e direta, em no máximo 4 frases curtas.
Use só as informações sobre o Publike que estão abaixo. Se não souber, diga que não sabe e indique a página de ajuda (/ajuda) ou a página Sugestões e erros (/sugerir).
Nunca invente vagas, empresas, valores, prazos ou regras. Nunca peça documento, senha, código de SMS, dados de cartão ou dinheiro.
Assunto fora de trabalho e do Publike: diga, com gentileza, que você só ajuda com o Publike.
${quem}

Escolha a ação:
- buscar_anuncios: a pessoa quer achar vagas, bicos, freelances ou um profissional/serviço. Preencha "busca" (texto: as palavras do que ela procura, como "padeiro" ou "diarista", ou vazio; tipo: vaga, servico ou todos; categoria: a que combina, ou "todas"). A resposta é uma frase curta apresentando o resultado, como "Veja o que achei:"; o site mostra a lista logo abaixo.
- buscar_empresas: a pessoa quer conhecer empresas ou comércios que usam o Publike (quem está contratando). Preencha "busca.texto" com o ramo ou o nome, ou vazio.
- pedir_login: só quando a pessoa não está logada e pede algo que precisa de conta. Explique que é só entrar ou criar a conta, de graça e sem senha.
- sugerir: a pessoa conta um erro, dá uma ideia, um elogio ou pede uma melhoria. Agradeça e diga que ela pode mandar na página Sugestões e erros.
- nenhuma: o resto (dúvidas em geral). Nessas ações, preencha "busca" com texto vazio, tipo "todos" e categoria "todas".

O que você sabe sobre o Publike:
${textoDaAjuda()}`;
}

function transcricao(historico: MensagemChat[]) {
  const recentes = historico.slice(-HISTORICO_CHAT);
  return `Conversa até agora:\n${recentes
    .map((m) => `${m.de === "pessoa" ? "Pessoa" : "Assistente"}: ${m.texto}`)
    .join("\n")}\n\nResponda à última mensagem da Pessoa.`;
}

async function buscarVagas(busca: Plano["busca"], local: Local | null) {
  const filtros = lerFiltros({
    q: busca.texto,
    tipo: busca.tipo === "todos" ? undefined : busca.tipo,
    categoria: busca.categoria === "todas" ? undefined : busca.categoria,
  });
  const ponto = local ? pontoDoLocal(local) : null;
  const f = ponto ? { ...filtros, lat: ponto.lat, lng: ponto.lng } : filtros;
  const lista = await buscarAnuncios(f, Date.now(), local);
  const cartoes: CartaoChat[] = lista.slice(0, 5).map((a) => ({
    tipo: "anuncio",
    id: a.id,
    titulo: a.titulo,
    linha: [a.autor_nome, formatarLugar(a.bairro, a.cidade), formatarDistancia(a.distancia_km)]
      .filter(Boolean)
      .join(" · "),
    valor: valorDoAnuncio(a),
  }));
  const p = new URLSearchParams();
  if (busca.texto) p.set("q", busca.texto.slice(0, 80));
  if (busca.tipo !== "todos") p.set("tipo", busca.tipo);
  if (busca.categoria !== "todas") p.set("categoria", busca.categoria);
  return { cartoes, verMais: `/${p.size ? `?${p}` : ""}#busca`, total: lista.length };
}

/** Comércios, empresas e agências pelo nome, ramo ou bairro, com vagas no ar primeiro. */
async function buscarEmpresas(texto: string) {
  const supabase = await criarClienteServidor();
  // só letras, números e espaço (a busca vai num filtro do PostgREST)
  const termo = texto
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  let consulta = supabase
    .from("perfis")
    .select("id, nome, tipo, bairro, cidade, sobre")
    .in("tipo", ["comercio", "empresa", "agencia"])
    .limit(30);
  if (termo) consulta = consulta.or(`nome.ilike.*${termo}*,sobre.ilike.*${termo}*,bairro.ilike.*${termo}*`);
  const { data: perfis } = await consulta;
  if (!perfis?.length) return { cartoes: [] as CartaoChat[], total: 0 };
  const { data: anuncios } = await supabase
    .from("anuncios")
    .select("autor_id")
    .eq("status", "ativo")
    .in(
      "autor_id",
      perfis.map((p) => p.id),
    );
  const vagas = new Map<string, number>();
  for (const a of anuncios ?? []) vagas.set(a.autor_id, (vagas.get(a.autor_id) ?? 0) + 1);
  const ordem = [...perfis].sort((a, b) => (vagas.get(b.id) ?? 0) - (vagas.get(a.id) ?? 0));
  const cartoes: CartaoChat[] = ordem.slice(0, 5).map((p) => {
    const n = vagas.get(p.id) ?? 0;
    return {
      tipo: "empresa",
      id: p.id,
      nome: p.nome,
      linha: [
        rotuloConta(p.tipo),
        formatarLugar(p.bairro, p.cidade),
        n ? `${n} anúncio${n > 1 ? "s" : ""} no ar` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });
  return { cartoes, total: perfis.length };
}

const PEDIR_CONTA =
  "Para eu procurar vagas, serviços e empresas para você, entre ou crie sua conta. É de graça e não precisa de senha.";

export async function responderAssistente(
  historico: MensagemChat[],
  pessoa: { logada: boolean; nome: string | null; local: Local | null },
  modelo: string | null,
): Promise<{ texto: string; acao: AcaoChat; cartoes: CartaoChat[]; verMais: string | null }> {
  const { texto } = await chamarIA({
    modelo: modeloDaIA(modelo).id,
    sistema: instrucoes(pessoa),
    mensagem: transcricao(historico),
    maxTokens: 500,
    esquema: ESQUEMA,
  });
  const plano = lerJson<Plano>(texto);
  const resposta = (plano.resposta ?? "").trim().slice(0, 1200) || "Não entendi. Pode explicar de outro jeito?";
  const busca = {
    texto: (plano.busca?.texto ?? "").trim().slice(0, 80),
    tipo: (["vaga", "servico", "todos"] as const).includes(plano.busca?.tipo) ? plano.busca.tipo : "todos",
    categoria: CATEGORIAS.some((c) => c.slug === plano.busca?.categoria) ? plano.busca.categoria : "todas",
  } satisfies Plano["busca"];

  const quer = plano.acao;
  if (quer === "buscar_anuncios" || quer === "buscar_empresas" || quer === "pedir_login") {
    // a busca é só para quem tem conta, mesmo que a IA tente
    if (!pessoa.logada)
      return {
        texto: quer === "pedir_login" ? resposta : PEDIR_CONTA,
        acao: "pedir_login",
        cartoes: [],
        verMais: null,
      };
    if (quer === "pedir_login") return { texto: resposta, acao: "nenhuma", cartoes: [], verMais: null };
    if (quer === "buscar_anuncios") {
      const r = await buscarVagas(busca, pessoa.local);
      if (!r.cartoes.length) {
        return {
          texto:
            "Não achei nada com isso agora. Tente outras palavras ou veja todas as oportunidades na página inicial.",
          acao: "nenhuma",
          cartoes: [],
          verMais: "/#busca",
        };
      }
      return {
        texto: resposta,
        acao: "nenhuma",
        cartoes: r.cartoes,
        verMais: r.total > r.cartoes.length ? r.verMais : null,
      };
    }
    const r = await buscarEmpresas(busca.texto);
    if (!r.cartoes.length) {
      return {
        texto: "Não achei empresas com isso. Tente o ramo (padaria, oficina) ou o bairro.",
        acao: "nenhuma",
        cartoes: [],
        verMais: null,
      };
    }
    return { texto: resposta, acao: "nenhuma", cartoes: r.cartoes, verMais: null };
  }
  return { texto: resposta, acao: quer === "sugerir" ? "sugerir" : "nenhuma", cartoes: [], verMais: null };
}
