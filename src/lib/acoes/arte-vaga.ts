"use server";

import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { rascunhoValido, type RascunhoConvite } from "@/lib/convites";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { ErroIA, iaConfigurada, MODELO_PADRAO } from "@/lib/ia/openai";
import { lerVagaDaImagem } from "@/lib/ia/vaga-da-imagem";
import { TIPOS_DE_FOTO } from "@/lib/servidor/ler-curriculo";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// "Tem a arte da vaga?": quem publica manda a foto do anúncio (a arte que postou numa rede social)
// e a IA preenche a vaga. Nada é salvo aqui: a pessoa confere o formulário e publica.

export type LeituraDaArte = { ok: true; vaga: RascunhoConvite } | { ok: false; erro: string };

/** A foto já vem diminuída do navegador (JPG de até 1 MB). */
const MAX_BYTES = 1024 * 1024;

export async function lerArteDaVaga(dados: FormData): Promise<LeituraDaArte> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!iaConfigurada()) return { ok: false, erro: "A leitura da imagem não está disponível agora." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta para continuar." };

  const foto = dados.get("foto");
  if (!(foto instanceof File) || foto.size === 0) return { ok: false, erro: "Escolha a imagem da vaga." };
  if (foto.size > MAX_BYTES) return { ok: false, erro: "A imagem ficou grande demais. Tente outra." };
  const bytes = Buffer.from(await foto.arrayBuffer());
  if (!TIPOS_DE_FOTO[foto.type]?.(bytes)) return { ok: false, erro: "Mande a imagem em JPG ou PNG." };

  // a mesma cota da ajuda da IA (o admin, no computador dele, não gasta)
  const supabase = await criarClienteServidor();
  let modelo = MODELO_PADRAO;
  const admin = await clienteAdminOuNulo();
  if (admin) {
    const { data } = await admin.rpc("admin_config");
    modelo = data?.[0]?.ia_modelo ?? modelo;
  } else {
    const { error } = await supabase.rpc("usar_ia_texto");
    if (error) return { ok: false, erro: mensagemDeErro(error) };
    const { data } = await supabase.rpc("config_publica");
    modelo = data?.[0]?.ia_modelo ?? modelo;
  }

  try {
    const nome = typeof dados.get("nome") === "string" ? String(dados.get("nome")) : "";
    const lida = await lerVagaDaImagem(`data:${foto.type};base64,${bytes.toString("base64")}`, nome, modelo);
    if (!lida.e_vaga) {
      return {
        ok: false,
        erro: lida.e_servico
          ? "Isso parece o anúncio de um serviço. Para oferecer serviço, use “Meus serviços” no painel."
          : `Não parece o anúncio de uma vaga${lida.motivo ? ` (${lida.motivo})` : ""}. Tente outra imagem.`,
      };
    }
    const vaga = rascunhoValido(lida.vaga);
    if (!vaga) return { ok: false, erro: "Não deu para achar o cargo na imagem. Tente uma foto mais nítida." };
    return { ok: true, vaga };
  } catch (e) {
    return { ok: false, erro: e instanceof ErroIA ? e.message : "Não deu para ler a imagem agora. Tente de novo." };
  }
}
