"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { acessoDaEquipe } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { errosPorCampo, lerAnuncio, lerDenuncia, UUID } from "@/lib/validacao";

export async function denunciarAnuncio(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const leitura = lerDenuncia(formData);
  if (!leitura.success) {
    return { ok: false, erro: "Escolha o motivo da denúncia.", erros: errosPorCampo(leitura.error) };
  }
  const d = leitura.data;
  if (!UUID.test(d.anuncio_id)) return { ok: false, erro: "Anúncio não encontrado." };

  const usuario = await obterUsuario();
  if (!usuario) redirect(`/entrar?next=${encodeURIComponent(`/anuncio/${d.anuncio_id}/denunciar`)}`);

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("denuncias")
    .insert({ anuncio_id: d.anuncio_id, motivo: d.motivo, detalhes: d.detalhes });
  if (error) {
    if (error.code === "23505") {
      return { ok: true, mensagem: "Você já tinha denunciado este anúncio. A moderação vai analisar." };
    }
    if (error.code === "42501") return { ok: false, erro: "Não dá para denunciar este anúncio (ele é seu?)." };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  after(processarFilas);
  return { ok: true, mensagem: "Denúncia enviada. Obrigado por cuidar da comunidade." };
}

/** Admin (no computador dele) ou moderador: remover (com motivo para quem publicou) ou liberar. */
export async function moderarAnuncio(id: string, decisao: "remover" | "liberar", nota?: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id) || !["remover", "liberar"].includes(decisao)) return { ok: false, erro: "Pedido inválido." };
  const acesso = await acessoDaEquipe();
  if (!acesso) return { ok: false, erro: "Só a moderação pode fazer isso.", ir: "/entrar?next=/admin/denuncias" };

  const motivo = (nota ?? "").trim().slice(0, 500) || null;
  const { error } = await acesso.cliente.rpc("moderar_anuncio", { p_anuncio: id, p_decisao: decisao, p_nota: motivo });
  if (error) return { ok: false, erro: mensagemDeErro(error) };

  after(processarFilas);
  revalidatePath("/");
  refresh();
  return {
    ok: true,
    mensagem: decisao === "remover" ? "Anúncio removido. Quem publicou recebe o aviso." : "Pronto: anúncio no ar e denúncias fechadas.",
  };
}

/** Correção de um anúncio pela moderação (o tipo e o autor não mudam). */
export async function salvarAnuncioDaEquipe(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const id = formData.get("id");
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, erro: "Anúncio não encontrado." };
  const acesso = await acessoDaEquipe();
  if (!acesso) return { ok: false, erro: "Só a moderação pode fazer isso." };

  const leitura = lerAnuncio(formData);
  if (!leitura.ok) return { ok: false, erro: "Confira os campos marcados.", erros: leitura.erros };
  const d = leitura.dados;
  const { data, error } = await acesso.cliente
    .from("anuncios")
    .update({
      titulo: d.titulo,
      descricao: d.descricao,
      categoria: d.categoria,
      regime: d.regime,
      pagamento_valor: d.pagamento_valor,
      pagamento_unidade: d.pagamento_unidade,
      beneficios: d.beneficios,
      horario: d.horario,
      vagas: d.vagas,
      pede_curriculo: d.pede_curriculo,
      contratante: d.contratante,
      contratante_confidencial: d.contratante_confidencial,
      cidade: d.cidade,
      bairro: d.bairro,
      local: `SRID=4326;POINT(${d.lng} ${d.lat})`,
    })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  if (!data?.length) return { ok: false, erro: "Anúncio não encontrado." };

  revalidatePath("/");
  redirect(`/admin/anuncios/${id}?salvo=1`);
}
