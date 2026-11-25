"use server";

import { buscaDoLido, pareceFrase, type BuscaEntendida, type LidoDaFrase } from "@/lib/busca-por-frase";
import { CATEGORIAS, CIDADES, REGIMES } from "@/lib/constantes";
import { TURNOS } from "@/lib/filtros";
import { chamarIA, lerJson } from "@/lib/ia/openai";
import { modeloDaFuncionalidade } from "@/lib/ia/funcionalidades";
import { noPublike, ONDE_FUNCIONA } from "@/lib/pracas";
import { centroDoBairro } from "@/lib/servidor/cep";
import { dentroDoLimite, embaralhar, enderecoDeQuemPediu } from "@/lib/servidor/limite";

// A busca escrita como a pessoa fala (src/lib/busca-por-frase.ts): a IA tira da frase a função, a área, o turno, o tipo
// de contratação, o "começa já" e o lugar; o lugar vira o ponto do mapa (centroDoBairro). Sem a IA (desligada no
// Admin › IA, falhou ou passou do limite), null: a busca segue pelas palavras, como antes.

const ESQUEMA = {
  nome: "busca_por_frase",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["funcao", "categoria", "turno", "regime", "comeca_ja", "bairro", "cidade", "perto_de_mim"],
    properties: {
      funcao: { type: "string", description: "a função ou cargo, curto, como se procura (\"garçom\", \"auxiliar de cozinha\"); vazio se não disse" },
      categoria: { type: "string", enum: ["", ...CATEGORIAS.map((c) => c.slug)] },
      turno: { type: "string", enum: ["", ...TURNOS.map((t) => t.valor)] },
      regime: { type: "string", enum: ["", ...Object.keys(REGIMES)] },
      comeca_ja: { type: "boolean", description: "quer começar logo, urgente, hoje" },
      bairro: { type: "string", description: "o bairro ou setor, como escreveu; vazio se não disse" },
      cidade: { type: "string", enum: ["", ...CIDADES] },
      perto_de_mim: { type: "boolean", description: "disse \"perto de mim\" ou \"perto daqui\" sem o bairro" },
    },
  },
};

const SISTEMA = `Você lê o que alguém escreveu na busca de vagas do Publike (vagas de emprego em ${ONDE_FUNCIONA}) e diz os filtros. "funcao": só a função ou o cargo, no singular e curto (sem "vaga de", sem o lugar, sem o turno). "categoria" só se tiver certeza. "turno": manha, tarde, noite ou fim_de_semana, se disse. "regime" só se disse o tipo de contratação (CLT/carteira, estágio, aprendiz, diária, freelance, temporário, PJ...). "bairro" como a pessoa escreveu. "cidade" só uma das cidades da lista, se disse ou se o bairro é claramente dela.`;

export async function entenderBusca(texto: string): Promise<BuscaEntendida | null> {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!pareceFrase(t)) return null;
  // no máximo 10 frases por minuto por endereço (a IA custa)
  if (!dentroDoLimite(`frase:${embaralhar(await enderecoDeQuemPediu())}`, 10, 60_000)) return null;
  let lido: LidoDaFrase;
  try {
    const r = await chamarIA({
      uso: "busca_frase",
      modelo: await modeloDaFuncionalidade("chat"),
      sistema: SISTEMA,
      mensagem: t,
      maxTokens: 200,
      esquema: ESQUEMA,
      tempoLimite: 12_000,
    });
    lido = lerJson(r.texto);
  } catch (e) {
    console.warn("Publike: a busca por frase não foi lida:", e instanceof Error ? e.message : e);
    return null;
  }
  const bairro = String(lido.bairro ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const cidade = (CIDADES as readonly string[]).includes(lido.cidade) ? lido.cidade : null;
  let lugar: BuscaEntendida["lugar"] = null;
  if (bairro) {
    const ponto = await centroDoBairro(bairro, cidade ?? "Goiânia").catch(() => null);
    if (ponto && noPublike(ponto)) lugar = { nome: bairro, ...ponto };
  }
  return buscaDoLido(lido, lugar);
}
