import "server-only";
import { REGIMES } from "@/lib/constantes";
import { categoriaPeloTitulo, descricaoSimples } from "@/lib/modelos-anuncio";
import { centroDoBairro } from "@/lib/servidor/cep";
import type { Regime } from "@/lib/tipos";
import { lerHorario, textoDoHorario } from "@/lib/vaga-extra";
import { cidadeDoPublike, PRACA_PADRAO } from "@/lib/pracas";
import { centroDaCidade } from "@/lib/regioes";

/**
 * Publicar sem travar: só o título, o tipo de contratação, o valor e o bairro são
 * obrigatórios. Sem categoria, vale a do título; sem descrição, uma simples com o que
 * foi preenchido; sem ponto no mapa, o meio do bairro (`provisorio`: só para conferir
 * o formulário antes de entrar, sem consultar o mapa).
 *
 * Devolve o que fazer com os erros (`ajustarErros`): campo opcional que não deu para completar
 * porque falta o título ou o bairro não mostra erro (o erro fica no título ou no bairro).
 */
export async function completarAnuncio(formData: FormData, provisorio = false): Promise<TrocasDeErro> {
  const trocas: TrocasDeErro = {};
  const texto = (nome: string) => {
    const v = formData.get(nome);
    return typeof v === "string" ? v.trim() : "";
  };
  const titulo = texto("titulo");
  if (!texto("categoria")) {
    if (titulo) formData.set("categoria", categoriaPeloTitulo(titulo));
    else trocas.categoria = null;
  }
  if (!texto("descricao") && (titulo.length < 2 || !texto("bairro"))) trocas.descricao = null;
  if (!texto("descricao") && titulo.length >= 2 && texto("bairro")) {
    const regime = texto("regime");
    const horario = lerHorario(texto("horario_detalhe") || null);
    formData.set(
      "descricao",
      descricaoSimples({
        titulo,
        regime: regime || null,
        nomeRegime: REGIMES[regime as Regime]?.nome ?? null,
        horario: horario.ok && horario.horario ? textoDoHorario(horario.horario) : texto("horario") || null,
        bairro: texto("bairro"),
        cidade: texto("cidade") || PRACA_PADRAO.cidade,
        direto: texto("contato_direto") === "on",
      }),
    );
  }
  if ((!texto("lat") || !texto("lng")) && texto("bairro")) {
    const centro = provisorio
      ? centroDaCidade(cidadeDoPublike(texto("cidade")) ?? PRACA_PADRAO.cidade)
      : await centroDoBairro(texto("bairro"), texto("cidade") || PRACA_PADRAO.cidade).catch(() => null);
    if (centro) {
      formData.set("lat", String(centro.lat));
      formData.set("lng", String(centro.lng));
    } else {
      const aviso = `Não achamos “${texto("bairro")}” no mapa. Confira o nome do bairro ou marque o lugar no mapa.`;
      trocas.lat = aviso;
      trocas.lng = aviso;
    }
  } else if (!texto("lat") || !texto("lng")) {
    trocas.lat = null;
    trocas.lng = null;
  }
  return trocas;
}

/** Por campo: null tira o erro; um texto troca a mensagem. */
export type TrocasDeErro = Record<string, string | null>;

export function ajustarErros(erros: Record<string, string>, trocas: TrocasDeErro) {
  const saida: Record<string, string> = {};
  for (const [campo, mensagem] of Object.entries(erros)) {
    const troca = trocas[campo];
    if (troca === null) continue;
    saida[campo] = troca ?? mensagem;
  }
  return saida;
}
