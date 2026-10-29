"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  ACOES_BANNER,
  caminhoDoSite,
  LINK_VAGAS_NOVAS,
  linkDaBusca,
  PAGINAS_BANNER,
  PUBLICOS_BANNER,
  type AcaoBanner,
  type PublicoBanner,
} from "@/lib/banners";
import { mensagemDeErro } from "@/lib/erros";
import { prepararImagemBanner } from "@/lib/servidor/imagem-banner";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Banners da página inicial (Admin › Banners). Só com o admin aberto no computador do dono.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const SEM_MIGRACAO_IMAGEM = "Para pôr imagem, rode antes a migração 20261213120000_banners_imagem.sql no Supabase.";

function texto(formData: FormData, nome: string) {
  const v = formData.get(nome);
  return typeof v === "string" ? v.trim() : "";
}

/** "2026-10-25" → o começo do dia em Brasília; com `fimDoDia`, o começo do dia seguinte. */
function dataDeBrasilia(valor: string, fimDoDia = false) {
  if (!DATA.test(valor)) return null;
  const d = new Date(`${valor}T00:00:00-03:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (fimDoDia) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/** Cria (sem `id`) ou salva um banner. */
export async function salvarBanner(id: string | null, _anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (id !== null && !UUID.test(id)) return { ok: false, erro: "Banner inválido." };

  const erros: Record<string, string> = {};
  const titulo = texto(formData, "titulo");
  const corpo = texto(formData, "texto");
  const botao = texto(formData, "botao");
  const acao = texto(formData, "acao") as AcaoBanner;
  const publico = texto(formData, "publico") as PublicoBanner;
  if (titulo.length < 3 || titulo.length > 80) erros.titulo = "Escreva um título de 3 a 80 letras.";
  if (corpo.length > 240) erros.texto = "Até 240 letras.";
  if (botao.length < 2 || botao.length > 30) erros.botao = "Escreva o texto do botão (2 a 30 letras).";
  if (!(acao in ACOES_BANNER)) erros.acao = "Escolha o que o botão faz.";
  if (!(publico in PUBLICOS_BANNER)) erros.publico = "Escolha quem vê.";

  let link: string | null = null;
  if (acao === "novas") link = LINK_VAGAS_NOVAS;
  // na busca, a área de quem vê (o currículo); sem ela, a palavra escrita (ou as vagas novas)
  const buscaDaArea = acao === "busca" && formData.get("busca_da_area") === "on";
  if (acao === "busca") {
    const palavra = texto(formData, "palavra");
    if (buscaDaArea && !palavra) link = LINK_VAGAS_NOVAS;
    else if (palavra.length < 2 || palavra.length > 60) erros.palavra = "Escreva o que buscar (ex.: garçom).";
    else link = linkDaBusca(palavra);
  }
  if (acao === "link") {
    link = caminhoDoSite(texto(formData, "caminho"));
    if (!link) erros.caminho = "Use um endereço do Publike começando com /, como /vagas/goiania.";
  }

  // null: só uma vez; N: de novo a cada N dias (até tocar no botão)
  let repetirDias: number | null = null;
  if (texto(formData, "repetir") === "dias") {
    repetirDias = Number(texto(formData, "repetir_dias"));
    if (!Number.isInteger(repetirDias) || repetirDias < 1 || repetirDias > 90) {
      erros.repetir_dias = "Escolha de 1 a 90 dias.";
    }
  }

  const paginas = formData.getAll("paginas").filter((p): p is string => typeof p === "string" && p in PAGINAS_BANNER);
  if (!paginas.length) erros.paginas = "Escolha pelo menos uma página.";
  const atraso = Number(texto(formData, "atraso_segundos") || "3");
  if (!Number.isInteger(atraso) || atraso < 0 || atraso > 60) erros.atraso_segundos = "De 0 a 60 segundos.";

  const inicioTexto = texto(formData, "inicio");
  const fimTexto = texto(formData, "fim");
  const inicio = inicioTexto ? dataDeBrasilia(inicioTexto) : null;
  const fim = fimTexto ? dataDeBrasilia(fimTexto, true) : null;
  if (inicioTexto && !inicio) erros.inicio = "Confira a data.";
  if (fimTexto && !fim) erros.fim = "Confira a data.";
  if (inicio && fim && fim <= inicio) erros.fim = "O fim vem depois do começo.";

  if (Object.keys(erros).length) return { ok: false, erro: "Confira os campos marcados.", erros };

  // a imagem do alto da janela: uma nova (ajustada e guardada no Storage), a de antes ou nenhuma
  const pasta = c.storage.from("banners");
  const publicaDaPasta = pasta.getPublicUrl("").data.publicUrl;
  const atual = texto(formData, "imagem_atual");
  let imagem: string | null = atual && atual.startsWith(publicaDaPasta) ? atual : null;
  if (formData.get("imagem_tirar") === "1") imagem = null;
  const arquivo = formData.get("imagem_arquivo");
  if (arquivo instanceof File && arquivo.size > 0) {
    const pronta = await prepararImagemBanner(Buffer.from(await arquivo.arrayBuffer()));
    if (!pronta.ok) return { ok: false, erro: pronta.erro, erros: { imagem: pronta.erro } };
    const caminho = `banner-${Date.now()}.webp`;
    const { error: erroEnvio } = await pasta.upload(caminho, pronta.webp, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
    if (erroEnvio) {
      console.error("Publike: não deu para guardar a imagem do banner:", erroEnvio.message);
      return {
        ok: false,
        erro: `Não deu para guardar a imagem no Supabase. ${SEM_MIGRACAO_IMAGEM}`,
        erros: { imagem: "Não deu para guardar." },
      };
    }
    imagem = pasta.getPublicUrl(caminho).data.publicUrl;
  }

  const dados = {
    titulo,
    texto: corpo || null,
    botao,
    acao,
    link,
    publico,
    repetir_dias: repetirDias,
    paginas: [...new Set(paginas)],
    atraso_segundos: atraso,
    busca_da_area: buscaDaArea,
    // sem imagem nenhuma, nem manda a coluna (os banners de texto salvam mesmo sem a migração 20261213)
    ...(imagem || atual || formData.get("imagem_tirar") === "1" ? { imagem } : {}),
    inicio,
    fim,
    ativo: formData.get("ativo") === "on",
  };
  const { error } = id ? await c.from("banners").update(dados).eq("id", id) : await c.from("banners").insert(dados);
  if (error?.code === "PGRST204" && error.message.includes("imagem")) return { ok: false, erro: SEM_MIGRACAO_IMAGEM };
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  redirect(`/admin/banners?salvo=${id ? "editado" : "novo"}`);
}

/** Liga ou desliga um banner. */
export async function ligarBanner(id: string, ativo: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Banner inválido." };
  const { error } = await c.from("banners").update({ ativo }).eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: ativo ? "Banner ligado." : "Banner desligado." };
}

/** Apaga um banner (e os números dele). */
export async function apagarBanner(id: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Banner inválido." };
  const { error } = await c.from("banners").delete().eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Banner apagado." };
}
