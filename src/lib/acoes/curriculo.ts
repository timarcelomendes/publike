"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { mensagemDeErro, precisaCompletarPerfil } from "@/lib/erros";
import { caminhoSeguro } from "@/lib/formato";
import { avisarDepois } from "@/lib/servidor/aviso-depois";
import { iaConfigurada } from "@/lib/ia/openai";
import { limparCurriculos } from "@/lib/servidor/arquivos";
import { marcarConversao } from "@/lib/servidor/conversao";
import { registrarFalha, textoDoErro, vigiar, type Vigia } from "@/lib/servidor/falhas";
import { processarFilas } from "@/lib/servidor/filas";
import { lerArquivoDoCurriculo, type LeituraDoArquivo } from "@/lib/servidor/ler-curriculo";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm } from "@/lib/tipos";
import { lerCurriculo } from "@/lib/validacao";

/**
 * Salva o currículo. Só a própria pessoa e quem anunciou uma vaga que ela
 * curtiu conseguem ver (o banco garante). O PDF já foi enviado pelo navegador
 * para a pasta privada da pessoa; os antigos saem do Storage. Nas vagas que já
 * aceitaram a pessoa e esperavam o currículo, dá match na hora (gatilho no banco):
 * sem um "next", ela volta para a vaga (ou para os matches, se forem várias).
 */
export async function salvarCurriculo(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  // qualquer falha fica registrada e chega à equipe (src/lib/servidor/falhas.ts)
  return vigiar("curriculo", (vigia) => salvar(formData, vigia));
}

async function salvar(formData: FormData, vigia: Vigia): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar?next=/perfil/curriculo");

  // currículo é de pessoa: comércio, empresa e agência não cadastram
  const perfil = await obterMeuPerfil();
  if (perfil && perfil.tipo !== "pessoa") {
    vigia.marcar("validacao", `conta do tipo ${perfil.tipo}`);
    return { ok: false, erro: "Currículo é só para conta de pessoa." };
  }

  const leitura = lerCurriculo(formData);
  if (!leitura.ok) {
    // o primeiro problema já no aviso (alguns campos não têm lugar para a mensagem embaixo deles)
    const primeiro = Object.values(leitura.erros)[0];
    return {
      ok: false,
      erro: primeiro ? `Confira os campos marcados: ${primeiro}` : "Confira os campos marcados.",
      erros: leitura.erros,
    };
  }
  const d = leitura.dados;
  if (d.arquivo && !d.arquivo.startsWith(`${usuario.id}/`)) {
    vigia.marcar("arquivo", "o caminho do PDF não é da pasta da pessoa");
    return { ok: false, erro: "Envie o PDF de novo." };
  }

  const supabase = await criarClienteServidor();
  // as vagas que já aceitaram e esperavam este currículo (sem a migração do aceite, nenhuma)
  const { data: aceitas } = await supabase
    .from("curtidas")
    .select("anuncio_id")
    .eq("perfil_id", usuario.id)
    .eq("status", "pendente")
    .not("aceita_em", "is", null);
  // o primeiro currículo vale para a campanha (Google Ads)
  const { count: jaTinha } = await supabase
    .from("curriculos")
    .select("perfil_id", { count: "exact", head: true })
    .eq("perfil_id", usuario.id);
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
    vigia.banco(error);
    return { ok: false, erro: mensagemDeErro(error, "Não foi possível salvar seu currículo agora.") };
  }
  // os PDFs antigos: o currículo já salvou, a sobra no Storage não muda nada para a pessoa
  try {
    await limparCurriculos(supabase, usuario.id, d.arquivo);
  } catch (e) {
    console.warn("Publike: não deu para apagar os PDFs antigos do currículo:", e);
  }
  if (jaTinha === 0) await marcarConversao("curriculo");
  // os avisos do match (para a pessoa e para quem publicou) saem já
  if (aceitas?.length) after(processarFilas);

  revalidatePath("/perfil/curriculo");
  const proximo = caminhoSeguro(formData.get("next"), "");
  // fora da página do currículo (que já mostra "salvo"), o aviso vai junto para o destino
  if (proximo || aceitas?.length) await avisarDepois(aceitas?.length ? "curriculo_match" : "curriculo_salvo");
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

export type { LeituraDoArquivo } from "@/lib/servidor/ler-curriculo";

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
  let leitura: LeituraDoArquivo;
  try {
    leitura = await lerArquivoDoCurriculo(dados, usuario.id, await criarClienteServidor());
  } catch (e) {
    console.error("Publike: erro ao ler o currículo enviado:", e);
    leitura = { ok: false, erro: "Não deu para ler o arquivo agora. Preencha os campos ou tente de novo." };
    await registrarFalha({ onde: "curriculo", etapa: "leitura", mensagem: leitura.erro, detalhe: textoDoErro(e) });
    return leitura;
  }
  if (!leitura.ok && leitura.erro !== MENSAGEM_DEMO) {
    // a IA ou o arquivo falharam (aviso na hora); o resto é o arquivo que não serve (só registra)
    const doSistema = /^Não deu para (ler o currículo agora|abrir o PDF)/.test(leitura.erro);
    await registrarFalha({ onde: "curriculo", etapa: doSistema ? "leitura" : "validacao", mensagem: leitura.erro });
  }
  return leitura;
}
