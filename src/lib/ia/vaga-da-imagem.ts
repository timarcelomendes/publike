import "server-only";
import { BENEFICIOS, CATEGORIAS, LISTA_REGIMES, LISTA_UNIDADES, OFICIOS } from "@/lib/constantes";
import { chamarIA, ErroIA, lerJson } from "./openai";

// Lê a imagem de um anúncio de vaga (a arte que a empresa postou numa rede social) e devolve
// a empresa, o contato e a vaga, para o admin importar em Convites. Só o que está escrito.

export type LeituraDaImagem = {
  e_vaga: boolean;
  /** anúncio de profissional oferecendo serviço (eletricista, diarista...): convite para a vitrine */
  e_servico: boolean;
  motivo: string;
  empresa: string;
  tipo: "empresa" | "agencia" | "prestador";
  cargos: string[];
  whatsapp: string[];
  telefones: string[];
  email: string;
  vaga: {
    oficio: string;
    titulo: string;
    descricao: string;
    categoria: string;
    regime: string;
    salario: number | null;
    salario_ate: number | null;
    unidade: string;
    beneficios: string[];
    cidade: string;
    bairro: string;
    quantidade: number;
  };
};

const comVazio = (l: readonly string[]) => [...l, ""];

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["e_vaga", "e_servico", "motivo", "empresa", "tipo", "cargos", "whatsapp", "telefones", "email", "vaga"],
  properties: {
    e_vaga: { type: "boolean" },
    e_servico: { type: "boolean" },
    motivo: { type: "string" },
    empresa: { type: "string" },
    tipo: { type: "string", enum: ["empresa", "agencia", "prestador"] },
    cargos: { type: "array", items: { type: "string" } },
    whatsapp: { type: "array", items: { type: "string" } },
    telefones: { type: "array", items: { type: "string" } },
    email: { type: "string" },
    vaga: {
      type: "object",
      additionalProperties: false,
      required: [
        "oficio",
        "titulo",
        "descricao",
        "categoria",
        "regime",
        "salario",
        "salario_ate",
        "unidade",
        "beneficios",
        "cidade",
        "bairro",
        "quantidade",
      ],
      properties: {
        oficio: { type: "string", enum: comVazio(OFICIOS.map((o) => o.slug)) },
        titulo: { type: "string" },
        descricao: { type: "string" },
        categoria: { type: "string", enum: comVazio(CATEGORIAS.map((c) => c.slug)) },
        regime: { type: "string", enum: comVazio(LISTA_REGIMES) },
        salario: { type: ["number", "null"] },
        salario_ate: { type: ["number", "null"] },
        unidade: { type: "string", enum: comVazio(LISTA_UNIDADES) },
        beneficios: { type: "array", items: { type: "string", enum: BENEFICIOS.map((b) => b.valor) } },
        cidade: { type: "string" },
        bairro: { type: "string" },
        quantidade: { type: "integer" },
      },
    },
  },
} as const;

function instrucoes() {
  return `Você lê a imagem de um anúncio de vaga de emprego, ou de um profissional oferecendo serviço (uma arte postada em rede social), de Goiânia e região, e passa os dados para o Publike, um site gratuito de vagas e serviços.

Regras:
- Use só o que está escrito na imagem. Não invente nome, número, salário nem endereço. O que não aparece fica vazio ("" ou null).
- "e_vaga": true se a imagem é um anúncio de vaga de emprego de uma empresa, loja, comércio ou agência.
- "e_servico": true se é um profissional (ou pequeno negócio) oferecendo o próprio serviço: eletricista, diarista, pedreiro, manicure, frete, conserto... Nesse caso "tipo" é "prestador".
- Os dois false para outra coisa (propaganda de loja, meme, curso pago, "trabalhe em casa", pedido de dinheiro); diga o porquê em "motivo", em poucas palavras.
- "empresa": o nome da empresa, da loja ou do profissional como aparece. "tipo": "agencia" se for agência de emprego/RH anunciando para um cliente; "prestador" se for serviço; senão "empresa".
- "cargos": os cargos anunciados, curtos ("Atendente de balcão"); no serviço, os serviços oferecidos ("Eletricista", "Instalação de chuveiro").
- "whatsapp": os números que o anúncio diz ser WhatsApp ou que são celular (9 dígitos). "telefones": os fixos. Escreva com DDD, só os números (ex.: "62999990000"). Sem DDD na imagem, use 62.
- "email": o e-mail do anúncio, se houver.
- "vaga": a primeira vaga (ou a principal); no serviço, o serviço principal: "oficio" da lista quando der (senão ""), "titulo" o nome do serviço, "salario" o preço (e "unidade": hora, dia, servico, m2 ou visita), "regime" "". "titulo": o cargo, até 90 letras. "descricao": o que a vaga pede e oferece (atividades, requisitos, horário, escala), em frases simples, sem telefone, e-mail, link ou @ (o contato vai separado). "categoria", "regime", "unidade" e "beneficios": escolha da lista; se não der para saber, "". "salario": o valor em reais (número), "salario_ate" quando for faixa. "quantidade": quantas pessoas, 1 se não disser.
- "cidade" e "bairro" só se o anúncio disser.`;
}

/** Lê uma imagem (data: URL). Erros da IA saem como ErroIA. */
export async function lerVagaDaImagem(imagem: string, nomeArquivo: string, modelo: string): Promise<LeituraDaImagem> {
  const { texto, parada } = await chamarIA({
    modelo,
    sistema: instrucoes(),
    mensagem: `Imagem: ${nomeArquivo.slice(0, 120)}`,
    imagens: [imagem],
    detalhe: "high",
    maxTokens: 1500,
    esquema: { nome: "vaga_da_imagem", schema: ESQUEMA },
    tempoLimite: 60_000,
  });
  if (parada === "recusa") throw new ErroIA("A IA não quis ler esta imagem.");
  if (parada === "limite") throw new ErroIA("A resposta da IA ficou incompleta.");
  return lerJson<LeituraDaImagem>(texto);
}
