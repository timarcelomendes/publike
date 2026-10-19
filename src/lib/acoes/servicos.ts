"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro, precisaCompletarPerfil } from "@/lib/erros";
import { limparFotosDeTrabalho } from "@/lib/servidor/arquivos";
import { centroDoBairro } from "@/lib/servidor/cep";
import { salvarContatoDireto } from "@/lib/servidor/contato-direto";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm } from "@/lib/tipos";
import { lerServicos } from "@/lib/validacao";

/**
 * "Meus serviços": salva todos de uma vez. Cada serviço vira um anúncio na
 * busca; o que saiu da lista fica encerrado. Salvar também renova os 90 dias.
 */
export async function salvarServicos(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar?next=/painel/servicos");

  // veio do convite e não marcou o mapa: vale o meio do bairro (como na vaga)
  const bairro = String(formData.get("bairro") ?? "").trim();
  if (formData.get("convite") && (!formData.get("lat") || !formData.get("lng")) && bairro) {
    const centro = await centroDoBairro(bairro, String(formData.get("cidade") ?? "") || "Goiânia").catch(() => null);
    if (centro) {
      formData.set("lat", String(centro.lat));
      formData.set("lng", String(centro.lng));
    }
  }
  const leitura = lerServicos(formData);
  if (!leitura.ok) return { ok: false, erro: "Confira os campos marcados.", erros: leitura.erros };
  const d = leitura.dados;

  // As fotos precisam estar na pasta da própria pessoa (o banco confere de novo).
  if (d.servicos.some((s) => s.fotos.some((f) => !f.startsWith(`${usuario.id}/`)))) {
    return { ok: false, erro: "Envie as fotos de novo." };
  }
  // Goiânia inteira já inclui as regiões
  const atende = d.atende.includes("Goiânia") ? d.atende.filter((a) => !a.startsWith("Goiânia: ")) : d.atende;

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_meus_servicos", {
    p_servicos: d.servicos.map((s) => ({
      ...(s.id ? { id: s.id } : {}),
      oficio: s.oficio,
      categoria: s.categoria,
      titulo: s.titulo,
      descricao: s.descricao,
      pagamento_valor: s.pagamento_valor,
      pagamento_unidade: s.pagamento_unidade,
      fotos: s.fotos,
    })),
    p_cidade: d.cidade,
    p_bairro: d.bairro,
    p_lat: d.lat,
    p_lng: d.lng,
    p_atende: atende,
    p_horario: d.horario,
  });
  if (error) {
    if (precisaCompletarPerfil(error)) redirect("/perfil?completar=1&next=/painel/servicos");
    return { ok: false, erro: mensagemDeErro(error, "Não foi possível salvar seus serviços agora.") };
  }

  await salvarContatoDireto(supabase, usuario.id, formData);

  // Fotos que nenhum serviço usa mais saem do Storage (inclusive as dos encerrados).
  const { data: meus } = await supabase.from("anuncios").select("fotos").eq("autor_id", usuario.id);
  await limparFotosDeTrabalho(
    supabase,
    usuario.id,
    (meus ?? []).flatMap((a) => a.fotos),
  );

  // veio do link do convite: salvar a vitrine é o aceite (o convite vira "Autorizou" no admin)
  const convite = formData.get("convite");
  if (typeof convite === "string" && /^[0-9a-f]{64}$/.test(convite)) {
    const { data: ultimo } = await supabase
      .from("anuncios")
      .select("id")
      .eq("autor_id", usuario.id)
      .eq("tipo", "servico")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultimo) {
      const { error: erroConvite } = await supabase.rpc("aceitar_convite", { p_token: convite, p_anuncio: ultimo.id });
      if (erroConvite) console.warn("Publike: não deu para registrar o aceite do convite:", erroConvite.message);
    }
  }

  // com a moderação automática ligada, a IA revisa os textos e as fotos logo depois
  after(processarFilas);
  revalidatePath("/");
  redirect("/painel/servicos?salvo=1");
}
