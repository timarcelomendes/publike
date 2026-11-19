"use server";

import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { rascunhoValido, type RascunhoConvite } from "@/lib/convites";
import { ErroIA, iaConfigurada } from "@/lib/ia/openai";
import { lerVagas } from "@/lib/ia/ler-vagas";
import { erroDaLeitura } from "@/lib/leitura-de-vagas";
import { ACABOU_SEM_CONTA, usarLeituraDaVaga } from "@/lib/servidor/cota-leitura-vaga";
import { registrarFalha, textoDoErro } from "@/lib/servidor/falhas";
import { TIPOS_DE_FOTO } from "@/lib/servidor/ler-curriculo";

// "Tem a arte da vaga?": quem publica manda a foto do anúncio (a arte que postou numa rede social)
// e a IA preenche a vaga. Nada é salvo aqui: a pessoa confere o formulário e publica.

/** `total`: quantas vagas o anúncio tem (vem a primeira; a pessoa publica uma por vez). */
export type LeituraDaArte =
  | { ok: true; vaga: RascunhoConvite; vagas: RascunhoConvite[]; total: number }
  | { ok: false; erro: string };

/** A foto já vem diminuída do navegador (JPG de até 1 MB). */
const MAX_BYTES = 1024 * 1024;

export async function lerArteDaVaga(dados: FormData): Promise<LeituraDaArte> {
  const leitura = await lerArte(dados);
  // a imagem que não serve fica só registrada; a falha da IA chega à equipe (no catch, abaixo)
  if (!leitura.ok && leitura.erro !== MENSAGEM_DEMO && leitura.erro !== ACABOU_SEM_CONTA && !falhouNaIA.has(leitura)) {
    await registrarFalha({ onde: "vaga", etapa: "validacao", mensagem: leitura.erro, detalhe: "arte da vaga" });
  }
  return leitura;
}

/** As respostas de erro da IA (já registradas como falha do sistema). */
const falhouNaIA = new WeakSet<object>();

async function lerArte(dados: FormData): Promise<LeituraDaArte> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!iaConfigurada()) return { ok: false, erro: "A leitura da imagem não está disponível agora." };

  const foto = dados.get("foto");
  if (!(foto instanceof File) || foto.size === 0) return { ok: false, erro: "Escolha a imagem da vaga." };
  if (foto.size > MAX_BYTES) return { ok: false, erro: "A imagem ficou grande demais. Tente outra." };
  const bytes = Buffer.from(await foto.arrayBuffer());
  if (!TIPOS_DE_FOTO[foto.type]?.(bytes)) return { ok: false, erro: "Mande a imagem em JPG ou PNG." };

  // com conta, a cota da ajuda da IA; sem conta, a do visitante (o login fica para quando publicar)
  const cota = await usarLeituraDaVaga();
  if ("erro" in cota) return { ok: false, erro: cota.erro };
  const modelo = cota.modelo;

  try {
    const nome = typeof dados.get("nome") === "string" ? String(dados.get("nome")) : "";
    const lida = await lerVagas({ imagens: [`data:${foto.type};base64,${bytes.toString("base64")}`], nome }, modelo);
    if (lida.tipo !== "vaga") return { ok: false, erro: erroDaLeitura(lida.tipo, lida.motivo) };
    const vaga = rascunhoValido(lida.vagas[0]);
    if (!vaga) return { ok: false, erro: "Não deu para achar o cargo na imagem. Tente uma foto mais nítida." };
    return { ok: true, vaga, vagas: lida.vagas, total: lida.vagas.length };
  } catch (e) {
    const falha = {
      ok: false as const,
      erro: e instanceof ErroIA ? e.message : "Não deu para ler a imagem agora. Tente de novo.",
    };
    console.error("Publike: a leitura da arte da vaga falhou:", e);
    await registrarFalha({ onde: "vaga", etapa: "leitura", mensagem: falha.erro, detalhe: textoDoErro(e) });
    falhouNaIA.add(falha);
    return falha;
  }
}
