"use server";

import { refresh, revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { VERSAO_TERMOS } from "@/lib/constantes";
import { aceitePendente, obterMeuPerfil, obterUsuario, perfilCompleto } from "@/lib/dados";
import { consultarCnpj } from "@/lib/servidor/brasilapi";
import { mensagemDeErro } from "@/lib/erros";
import { caminhoSeguro } from "@/lib/formato";
import { COOKIE_INTENCAO } from "@/lib/intencao";
import { lerModos, modosDoTipo } from "@/lib/modo-painel";
import { COOKIE_ORIGEM } from "@/lib/origem";
import { COOKIE_LOCAL } from "@/lib/local";
import { apagarArquivosDaPessoa } from "@/lib/servidor/arquivos";
import { registrarOrigemDaConta } from "@/lib/servidor/origem";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm } from "@/lib/tipos";
import { errosPorCampo, lerPerfil } from "@/lib/validacao";

export async function salvarPerfil(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar?next=/perfil");

  // conta nova: precisa marcar que leu e aceita as regras e a política de privacidade
  // conta criada pela equipe: o primeiro acesso também pede o aceite
  const [perfilAntes, pendente] = await Promise.all([obterMeuPerfil(), aceitePendente()]);
  const pedeAceite = !perfilAntes || pendente;
  const faltaAceite = pedeAceite && formData.get("aceite") !== "on";
  const leitura = lerPerfil(formData);
  // "O que você quer fazer no Publike?": pelo menos um (procurar trabalho só para pessoa)
  const tipoEscolhido = leitura.success ? leitura.data.tipo : String(formData.get("tipo") ?? "pessoa");
  const modos = lerModos(formData.getAll("modos").map(String)).filter((m) => modosDoTipo(tipoEscolhido).includes(m));
  // as caixinhas desmarcadas não vão no formulário: "tem_modos" diz que a pergunta estava lá
  const semModo = formData.get("tem_modos") === "1" && modos.length === 0;
  if (!leitura.success || faltaAceite || semModo) {
    return {
      ok: false,
      erro: "Confira os campos marcados.",
      erros: {
        ...(leitura.success ? {} : errosPorCampo(leitura.error)),
        ...(faltaAceite
          ? {
              aceite: `Para ${perfilAntes ? "usar" : "criar"} a conta, marque que leu e aceita as regras e a política de privacidade.`,
            }
          : {}),
        ...(semModo ? { modos: "Marque pelo menos uma opção: procurar trabalho, oferecer serviços ou contratar." } : {}),
      },
    };
  }
  const d = leitura.data;

  // A foto precisa estar na pasta da própria pessoa no Storage (o banco confere de novo).
  if (d.foto && !d.foto.startsWith(`${usuario.id}/`)) {
    return { ok: false, erro: "Envie a foto de novo.", erros: { foto: "Envie a foto de novo." } };
  }

  // CNPJ novo: confere na Receita (BrasilAPI). Baixado, inapto ou suspenso não entra.
  // Se não achar (empresa aberta há pouco) ou a consulta falhar, segue: a equipe confere.
  if (d.cnpj && d.cnpj !== perfilAntes?.cnpj) {
    const consulta = await consultarCnpj(d.cnpj);
    if (consulta.ok && !consulta.dados.ativa) {
      const erro = `Este CNPJ está com a situação ${consulta.dados.situacao.toLowerCase()} na Receita. Use um CNPJ ativo.`;
      return { ok: false, erro: "Confira os campos marcados.", erros: { cnpj: erro } };
    }
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_perfil", {
    p_nome: d.nome,
    p_tipo: d.tipo,
    p_cidade: d.cidade,
    p_bairro: d.bairro,
    p_sobre: d.sobre,
    p_servicos: d.servicos,
    p_foto: d.foto,
    p_whatsapp: d.whatsapp,
    p_email: d.email,
    p_receber_emails: d.receber_emails,
    p_cnpj: d.cnpj,
  });
  if (error?.hint === "cnpj") {
    return { ok: false, erro: "Confira os campos marcados.", erros: { cnpj: mensagemDeErro(error) } };
  }
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível salvar o perfil agora.") };
  // o que a conta faz: o painel e a home mostram só esses modos (banco sem a migração: segue)
  if (modos.length) {
    const { error: erroModos } = await supabase.rpc("salvar_meus_modos", { p_modos: modos });
    if (erroModos && erroModos.code !== "PGRST202") {
      return { ok: false, erro: mensagemDeErro(erroModos, "Não foi possível salvar o que você faz no Publike.") };
    }
  }
  // conta nova (ou criada pela equipe): guarda qual versão das regras e da política foi aceita, e quando
  if (pedeAceite) {
    const { error: erroAceite } = await supabase.rpc("registrar_aceite", { p_versao: VERSAO_TERMOS });
    if (erroAceite) console.error("Publike: não deu para guardar o aceite das regras:", erroAceite.message);
  }
  // conta nova que veio pela página de serviços: a jornada é a do prestador (montar a vitrine)
  const proximo = formData.get("next");
  if (!perfilAntes && d.tipo === "pessoa" && typeof proximo === "string" && proximo.startsWith("/painel/servicos")) {
    const { error: erroBoasVindas } = await supabase.rpc("quero_oferecer_servicos");
    if (erroBoasVindas) console.error("Publike: não deu para trocar as boas-vindas:", erroBoasVindas.message);
  }
  // perfil novo avisa a equipe por e-mail
  after(processarFilas);

  // Apaga fotos antigas que ficaram na pasta da pessoa
  const atual = d.foto?.split("/")[1] ?? null;
  const { data: arquivos } = await supabase.storage.from("avatars").list(usuario.id, { limit: 100 });
  const sobras = (arquivos ?? []).filter((a) => a.name !== atual).map((a) => `${usuario.id}/${a.name}`);
  if (sobras.length) await supabase.storage.from("avatars").remove(sobras);

  if (typeof proximo === "string" && proximo) {
    revalidatePath("/", "layout");
    redirect(caminhoSeguro(proximo, "/painel"));
  }
  refresh();
  return { ok: true, mensagem: "Perfil salvo." };
}

/** LGPD: apaga a conta e tudo o que é dela. */
export async function excluirConta(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (formData.get("confirmar") !== "on") {
    return { ok: false, erro: "Marque a caixa de confirmação para excluir a conta." };
  }
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar");

  const supabase = await criarClienteServidor();
  // Conta suspensa não se exclui (não dá para fugir da suspensão); confere
  // antes de mexer na foto.
  const { data: suspensa } = await supabase.rpc("minha_conta_suspensa");
  if (suspensa) return { ok: false, erro: "Sua conta está suspensa. Se achar que é um engano, fale com a gente." };
  if (!(await apagarArquivosDaPessoa(supabase, usuario.id))) {
    return { ok: false, erro: "Não foi possível apagar suas fotos agora. Tente de novo." };
  }
  const { error } = await supabase.rpc("excluir_minha_conta");
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível excluir agora. Tente de novo.") };

  await supabase.auth.signOut().catch(() => undefined);
  (await cookies()).delete(COOKIE_INTENCAO);
  revalidatePath("/", "layout");
  redirect("/?conta=excluida");
}

export async function sair() {
  if (!MODO_DEMO) {
    const supabase = await criarClienteServidor();
    await supabase.auth.signOut();
  }
  // a resposta fica na conta; sem login, a pergunta volta. O CEP de casa guardado neste
  // navegador também sai: num celular dividido, quem vem depois não vê onde o outro mora.
  const loja = await cookies();
  loja.delete(COOKIE_INTENCAO);
  loja.delete(COOKIE_LOCAL);
  revalidatePath("/", "layout");
  redirect("/");
}

/** Depois do login por celular: completa o perfil se faltar, senão segue. */
export async function irDepoisDoLogin(proximo: string) {
  const destino = caminhoSeguro(proximo, "/");
  const usuario = await obterUsuario();
  if (!usuario) redirect(`/entrar?next=${encodeURIComponent(destino)}`);
  // entrou pelo celular (código por SMS): se chegou por uma campanha e a conta é nova, anota de qual
  // (os outros jeitos de entrar passam por /auth/continuar, que faz o mesmo)
  const jar = await cookies();
  const origem = jar.get(COOKIE_ORIGEM)?.value;
  if (origem !== undefined) {
    await registrarOrigemDaConta(origem);
    // já serviu: quem entra de novo depois não conta outra vez
    jar.delete(COOKIE_ORIGEM);
  }
  const perfil = await obterMeuPerfil();
  revalidatePath("/", "layout");
  if (!perfilCompleto(perfil)) redirect(`/perfil?completar=1&next=${encodeURIComponent(destino)}`);
  redirect(destino);
}
