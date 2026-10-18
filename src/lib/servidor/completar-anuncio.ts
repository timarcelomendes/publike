import "server-only";
import { CENTRO_GOIANIA } from "@/lib/config";
import { REGIMES } from "@/lib/constantes";
import { categoriaPeloTitulo, descricaoSimples } from "@/lib/modelos-anuncio";
import { centroDoBairro } from "@/lib/servidor/cep";
import type { Regime } from "@/lib/tipos";
import { lerHorario, textoDoHorario } from "@/lib/vaga-extra";

/**
 * Publicar sem travar: só o título, o tipo de contratação, o valor e o bairro são
 * obrigatórios. Sem categoria, vale a do título; sem descrição, uma simples com o que
 * foi preenchido; sem ponto no mapa, o meio do bairro (`provisorio`: só para conferir
 * o formulário antes de entrar, sem consultar o mapa).
 */
export async function completarAnuncio(formData: FormData, provisorio = false) {
  const texto = (nome: string) => {
    const v = formData.get(nome);
    return typeof v === "string" ? v.trim() : "";
  };
  const titulo = texto("titulo");
  if (!texto("categoria") && titulo) formData.set("categoria", categoriaPeloTitulo(titulo));
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
        cidade: texto("cidade") || "Goiânia",
      }),
    );
  }
  if ((!texto("lat") || !texto("lng")) && texto("bairro")) {
    const centro = provisorio
      ? CENTRO_GOIANIA
      : await centroDoBairro(texto("bairro"), texto("cidade") || "Goiânia").catch(() => null);
    if (centro) {
      formData.set("lat", String(centro.lat));
      formData.set("lng", String(centro.lng));
    }
  }
}
