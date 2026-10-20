"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { lerDadosDoConvite, TOKEN_CONVITE } from "@/lib/convite-candidato";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro, precisaCompletarPerfil } from "@/lib/erros";
import type { CurriculoLido } from "@/lib/ia/curriculo-do-arquivo";
import { iaConfigurada } from "@/lib/ia/openai";
import { processarFilas } from "@/lib/servidor/filas";
import { lerArquivoDoCurriculo } from "@/lib/servidor/ler-curriculo";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { temContato, UUID } from "@/lib/validacao";
import { lerRespostas, perguntasDoBanco } from "@/lib/vaga-extra";

// Candidato de fora. Quem publicou a vaga cria o convite (com o currículo lido, se mandou) e
// cancela; quem foi chamado aceita (respondendo às perguntas da vaga) ou diz que não quer.
// As regras ficam no banco (criar_convite_candidato, aceitar_convite_candidato…).

export type ConviteCriado =
  | { ok: true; token: string; expira_em: string; curriculo: CurriculoLido | null }
  | { ok: false; erro: string; campo?: "nome" | "arquivo" };

/**
 * Cria o convite. `dados`: "nome" e, se veio o currículo, "pdf" (o caminho do PDF que o navegador
 * mandou para a pasta da conta) ou "foto" (até 3). O PDF sai do Storage logo depois da leitura.
 */
export async function criarConviteCandidato(anuncioId: string, dados: FormData): Promise<ConviteCriado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Vaga não encontrada." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  const nomeBruto = dados.get("nome");
  const nome = typeof nomeBruto === "string" ? nomeBruto.replace(/\s+/g, " ").trim() : "";
  if (nome.length < 2) return { ok: false, erro: "Escreva o nome da pessoa.", campo: "nome" };
  if (nome.length > 80) return { ok: false, erro: `Use no máximo 80 letras (tem ${nome.length}).`, campo: "nome" };
  if (temContato(nome)) {
    return { ok: false, erro: "Só o nome: o telefone a pessoa põe quando entrar.", campo: "nome" };
  }

  const supabase = await criarClienteServidor();
  const comArquivo = Boolean(dados.get("pdf")) || dados.getAll("foto").some((f) => f instanceof File && f.size > 0);
  // a vaga antes da leitura (sem gastar a cota da IA à toa)
  const { data: vaga } = await supabase
    .from("anuncios")
    .select("status, expira_em, preenchida_em")
    .eq("id", anuncioId)
    .eq("autor_id", usuario.id)
    .eq("tipo", "vaga")
    .maybeSingle();
  const noAr = vaga && vaga.status === "ativo" && !vaga.preenchida_em && new Date(vaga.expira_em) > new Date();
  if (!vaga || !noAr) {
    // o PDF já subiu: não fica guardado
    const caminho = dados.get("pdf");
    if (typeof caminho === "string" && caminho.startsWith(`${usuario.id}/`)) {
      await supabase.storage.from("curriculos").remove([caminho]);
    }
    return { ok: false, erro: vaga ? "Ponha a vaga no ar para chamar candidatos." : "Esta vaga não é sua." };
  }

  let curriculo: CurriculoLido | null = null;
  if (comArquivo) {
    if (!iaConfigurada()) {
      return {
        ok: false,
        erro: "A leitura do currículo não está disponível agora. Chame sem o currículo.",
        campo: "arquivo",
      };
    }
    const lido = await lerArquivoDoCurriculo(dados, usuario.id, supabase, true);
    if (!lido.ok) return { ok: false, erro: lido.erro, campo: "arquivo" };
    curriculo = lido.curriculo;
  }

  const { data, error } = await supabase.rpc("criar_convite_candidato", {
    p_anuncio: anuncioId,
    p_nome: nome,
    p_curriculo: curriculo,
  });
  const criado = data?.[0];
  if (error || !criado) {
    return error?.hint === "nome"
      ? { ok: false, erro: mensagemDeErro(error), campo: "nome" }
      : { ok: false, erro: mensagemDeErro(error, "Não deu para criar o convite agora. Tente de novo.") };
  }
  refresh();
  return { ok: true, token: criado.token, expira_em: criado.expira_em, curriculo };
}

/** Quem convidou desiste: o link para de valer e o currículo lido sai do convite. */
export async function cancelarConviteCandidato(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Convite não encontrado." };
  const { error } = await (await criarClienteServidor()).rpc("cancelar_convite_candidato", { p_id: id });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Convite cancelado: o link não abre mais." };
}

export type ConviteAceito = { ok: true; ir: string; match: boolean } | { ok: false; erro: string; ir?: string };

/**
 * Quem foi chamado aceita. Com currículo, dá match na hora e vai para a vaga; sem currículo,
 * vai conferir o que veio pronto (ao salvar, dá match).
 */
export async function aceitarConviteCandidato(token: string, respostasBrutas: unknown): Promise<ConviteAceito> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (typeof token !== "string" || !TOKEN_CONVITE.test(token)) return { ok: false, erro: "Este link não vale." };
  const aqui = `/candidatura/${token}`;
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: `/entrar?next=${encodeURIComponent(aqui)}` };
  const supabase = await criarClienteServidor();
  const { data: convite } = await supabase.rpc("convite_candidato_do_token", { p_token: token });
  const anuncioId = lerDadosDoConvite(convite)?.anuncio_id;
  if (!anuncioId) return { ok: false, erro: "Este convite não existe. Confira o link." };

  const { data: alvo } = await supabase.from("anuncios").select("perguntas").eq("id", anuncioId).maybeSingle();
  const perguntas = perguntasDoBanco(alvo?.perguntas);
  const lidas = lerRespostas(perguntas, respostasBrutas ?? {});
  if (!lidas.ok) return { ok: false, erro: lidas.erro };

  const { data, error } = await supabase.rpc("aceitar_convite_candidato", {
    p_token: token,
    p_respostas: lidas.respostas,
  });
  if (error) {
    if (precisaCompletarPerfil(error) || error.code === "23503") {
      return {
        ok: false,
        erro: "Complete seu perfil com o WhatsApp para aceitar.",
        ir: `/perfil?completar=1&next=${encodeURIComponent(aqui)}`,
      };
    }
    return { ok: false, erro: mensagemDeErro(error, "Não deu para aceitar agora. Tente de novo.") };
  }
  after(processarFilas);
  return data === "curriculo"
    ? { ok: true, ir: `/perfil/curriculo?convite=${token}`, match: false }
    : { ok: true, ir: `/anuncio/${anuncioId}`, match: true };
}

/** "Não tenho interesse" (vale sem conta: o link chegou para a pessoa). */
export async function recusarConviteCandidato(token: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (typeof token !== "string" || !TOKEN_CONVITE.test(token)) return { ok: false, erro: "Este link não vale." };
  const { data, error } = await (await criarClienteServidor()).rpc("recusar_convite_candidato", { p_token: token });
  if (error) return { ok: false, erro: "Não deu para registrar agora. Tente de novo." };
  if (data !== "ok") return { ok: false, erro: "Este convite não vale mais." };
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Pronto: avisamos que você não tem interesse. Seus dados saíram do convite." };
}
