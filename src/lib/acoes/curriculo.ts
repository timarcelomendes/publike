"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { MAX_PDF_MB } from "@/lib/constantes";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro, precisaCompletarPerfil } from "@/lib/erros";
import { caminhoSeguro } from "@/lib/formato";
import { camposLidos, lerCurriculoDoArquivo, type CurriculoLido } from "@/lib/ia/curriculo-do-arquivo";
import { iaConfigurada, MODELO_PADRAO } from "@/lib/ia/openai";
import { limparCurriculos } from "@/lib/servidor/arquivos";
import { processarFilas } from "@/lib/servidor/filas";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm } from "@/lib/tipos";
import { CAMINHO_CURRICULO, lerCurriculo } from "@/lib/validacao";

/**
 * Salva o currículo. Só a própria pessoa e quem anunciou uma vaga que ela
 * curtiu conseguem ver (o banco garante). O PDF já foi enviado pelo navegador
 * para a pasta privada da pessoa; os antigos saem do Storage. Nas vagas que já
 * aceitaram a pessoa e esperavam o currículo, dá match na hora (gatilho no banco):
 * sem um "next", ela volta para a vaga (ou para os matches, se forem várias).
 */
export async function salvarCurriculo(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar?next=/perfil/curriculo");

  const leitura = lerCurriculo(formData);
  if (!leitura.ok) return { ok: false, erro: "Confira os campos marcados.", erros: leitura.erros };
  const d = leitura.dados;
  if (d.arquivo && !d.arquivo.startsWith(`${usuario.id}/`)) return { ok: false, erro: "Envie o PDF de novo." };

  const supabase = await criarClienteServidor();
  // as vagas que já aceitaram e esperavam este currículo (sem a migração do aceite, nenhuma)
  const { data: aceitas } = await supabase
    .from("curtidas")
    .select("anuncio_id")
    .eq("perfil_id", usuario.id)
    .eq("status", "pendente")
    .not("aceita_em", "is", null);
  const { error } = await supabase.from("curriculos").upsert(
    {
      perfil_id: usuario.id,
      escolaridade: d.escolaridade,
      curso: d.curso,
      experiencias: d.experiencias,
      cursos: d.cursos,
      cnh: d.cnh,
      disponibilidade: d.disponibilidade,
      arquivo: d.arquivo,
      titulo: d.titulo,
      habilidades: d.habilidades,
      estudos: d.estudos,
    },
    { onConflict: "perfil_id" },
  );
  if (error) {
    if (precisaCompletarPerfil(error)) redirect("/perfil?completar=1&next=/perfil/curriculo");
    return { ok: false, erro: mensagemDeErro(error, "Não foi possível salvar seu currículo agora.") };
  }
  await limparCurriculos(supabase, usuario.id, d.arquivo);
  // os avisos do match (para a pessoa e para quem publicou) saem já
  if (aceitas?.length) after(processarFilas);

  revalidatePath("/perfil/curriculo");
  const proximo = caminhoSeguro(formData.get("next"), "");
  redirect(
    proximo ||
      (aceitas?.length === 1
        ? `/anuncio/${aceitas[0].anuncio_id}`
        : aceitas?.length
          ? "/painel/curtidas?situacao=match"
          : "/perfil/curriculo?salvo=1"),
  );
}

/** Apaga o currículo inteiro (e o PDF). */
export async function apagarCurriculo(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (formData.get("confirmar") !== "on") return { ok: false, erro: "Marque a caixa para confirmar." };
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar?next=/perfil/curriculo");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("curriculos").delete().eq("perfil_id", usuario.id);
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível apagar seu currículo agora.") };
  await limparCurriculos(supabase, usuario.id, null);
  revalidatePath("/perfil/curriculo");
  redirect("/perfil/curriculo?apagado=1");
}

export type LeituraDoArquivo = { ok: true; curriculo: CurriculoLido } | { ok: false; erro: string };

/** Fotos do currículo: no máximo 3, já diminuídas no navegador (a ação aceita até 1 MB ao todo). */
const MAX_FOTOS = 3;
const TIPOS_DE_FOTO: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 4).toString("hex") === "89504e47",
  "image/webp": (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP",
};

/**
 * "Já tem currículo pronto?": a IA lê o PDF (que o navegador já mandou para a pasta da pessoa)
 * ou as fotos da folha e devolve os campos do currículo. Nada é salvo aqui: a pessoa confere e
 * salva. Usa a cota da ajuda da IA (a mesma chave do admin e o mesmo limite por dia).
 */
export async function lerCurriculoEnviado(dados: FormData): Promise<LeituraDoArquivo> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!iaConfigurada()) return { ok: false, erro: "A leitura do currículo não está disponível agora." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta para continuar." };

  // primeiro o arquivo (sem gastar a cota com arquivo errado)
  const caminho = dados.get("pdf");
  const fotos = dados.getAll("foto").filter((f): f is File => f instanceof File && f.size > 0);
  if (fotos.length > MAX_FOTOS) return { ok: false, erro: `Mande no máximo ${MAX_FOTOS} fotos.` };
  const imagens: string[] = [];
  for (const foto of fotos) {
    const bytes = Buffer.from(await foto.arrayBuffer());
    if (!TIPOS_DE_FOTO[foto.type]?.(bytes)) return { ok: false, erro: "Mande a foto em JPG ou PNG." };
    imagens.push(`data:${foto.type};base64,${bytes.toString("base64")}`);
  }
  const supabase = await criarClienteServidor();
  let pdf: { nome: string; dados: string } | null = null;
  if (typeof caminho === "string" && caminho) {
    if (!CAMINHO_CURRICULO.test(caminho) || !caminho.startsWith(`${usuario.id}/`)) {
      return { ok: false, erro: "Envie o PDF de novo." };
    }
    const { data: arquivo } = await supabase.storage.from("curriculos").download(caminho);
    const bytes = arquivo ? Buffer.from(await arquivo.arrayBuffer()) : null;
    if (!bytes) return { ok: false, erro: "Não deu para abrir o PDF. Envie de novo." };
    if (bytes.subarray(0, 5).toString() !== "%PDF-" || bytes.length > MAX_PDF_MB * 1024 * 1024) {
      return { ok: false, erro: "Envie um arquivo PDF." };
    }
    pdf = { nome: "curriculo.pdf", dados: `data:application/pdf;base64,${bytes.toString("base64")}` };
  }
  if (!pdf && !imagens.length) return { ok: false, erro: "Escolha o PDF ou a foto do seu currículo." };

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
    const lido = await lerCurriculoDoArquivo({ pdf, fotos: imagens }, modelo, new Date().toISOString().slice(0, 7));
    if (!lido) return { ok: false, erro: "Isso não parece um currículo. Envie o PDF ou a foto do seu currículo." };
    if (!camposLidos(lido)) {
      return {
        ok: false,
        erro: pdf
          ? "Não deu para ler este PDF. Preencha os campos aqui embaixo."
          : "Não deu para ler a foto. Tire de perto, com a folha inteira e boa luz, ou envie o PDF.",
      };
    }
    return { ok: true, curriculo: lido };
  } catch (e) {
    // o motivo técnico (chave, créditos, modelo) fica no registro do servidor, não na tela
    console.error("Publike: a leitura do currículo falhou:", e instanceof Error ? e.message : e);
    return { ok: false, erro: "Não deu para ler o currículo agora. Tente de novo ou preencha aqui embaixo." };
  }
}
