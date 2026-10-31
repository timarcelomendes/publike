"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { MOTIVOS_ENCERRAMENTO, type MotivoEncerramento } from "@/lib/encerramento";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro, precisaCompletarPerfil } from "@/lib/erros";
import { marcarConversao } from "@/lib/servidor/conversao";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { lerAnuncio, registroDoAnuncio, UUID, type DadosAnuncio } from "@/lib/validacao";
import { salvarTriagem } from "@/lib/servidor/triagem";
import { ajustarErros, completarAnuncio } from "@/lib/servidor/completar-anuncio";
import { vigiar, type Vigia } from "@/lib/servidor/falhas";
import { gravarVaga } from "@/lib/servidor/comeca-ja";
import { porTesteSugerido } from "@/lib/servidor/testes";

/**
 * Antes de entrar: confere o anúncio de quem ainda não tem conta (nada é salvo). Com
 * tudo certo, a página guarda o rascunho no aparelho e leva para entrar; depois de
 * entrar, ele é publicado.
 */
export async function conferirAnuncio(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return vigiar("vaga", () => conferir(formData));
}

async function conferir(formData: FormData): Promise<EstadoForm> {
  const trocas = await completarAnuncio(formData, true);
  const leitura = lerAnuncio(formData);
  if (!leitura.ok)
    return { ok: false, erro: "Confira os campos marcados.", erros: ajustarErros(leitura.erros, trocas) };
  return { ok: true };
}

/** Erro do banco no formulário: o da empresa contratante, do cliente e da faixa salarial ficam marcados no campo. */
function erroDoBanco(error: { code?: string; message?: string; hint?: string | null }): EstadoForm {
  const erro = mensagemDeErro(error);
  if (error.hint === "contratante" || error.hint === "pagamento_ate") {
    return { ok: false, erro: "Confira os campos marcados.", erros: { [error.hint]: erro } };
  }
  if (error.hint === "cliente") return { ok: false, erro: "Confira os campos marcados.", erros: { cliente_id: erro } };
  return { ok: false, erro };
}

type Banco = Awaited<ReturnType<typeof criarClienteServidor>>;

/** Agência: a empresa escrita à mão vira cliente (ou acha o cliente com o mesmo nome). */
async function garantirCliente(supabase: Banco, nome: string) {
  const { data, error } = await supabase.rpc("garantir_cliente", { p_nome: nome });
  if (error) console.warn(`Publike: não deu para guardar o cliente: ${error.message}`);
  return { id: data ?? null, error };
}

/**
 * Depois de salvar a vaga de um cliente: o cliente sem lugar guarda o da vaga (a próxima já vem
 * com ele) e, numa vaga nova, o cliente arquivado volta para a lista.
 */
async function cuidarDoCliente(supabase: Banco, clienteId: string, d: DadosAnuncio, nova: boolean) {
  const mudancas = [
    supabase
      .from("clientes_agencia")
      .update({
        cidade: d.cidade,
        bairro: d.bairro,
        cep: d.endereco ? d.cep : null,
        endereco: d.endereco,
        lat: d.lat,
        lng: d.lng,
      })
      .eq("id", clienteId)
      .is("bairro", null)
      .is("lat", null),
  ];
  if (nova) {
    mudancas.push(
      supabase
        .from("clientes_agencia")
        .update({ arquivado_em: null })
        .eq("id", clienteId)
        .not("arquivado_em", "is", null),
    );
  }
  for (const { error } of await Promise.all(mudancas)) {
    if (error) console.warn(`Publike: não deu para atualizar o cliente: ${error.message}`);
  }
}

/**
 * Publica um anúncio novo ou salva a edição de um existente. Qualquer falha (preenchimento, banco,
 * erro no meio) fica registrada e chega à equipe (src/lib/servidor/falhas.ts).
 */
export async function salvarAnuncio(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return vigiar("vaga", (vigia) => publicarOuSalvar(formData, vigia));
}

async function publicarOuSalvar(formData: FormData, vigia: Vigia): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) redirect("/entrar?next=/publicar");

  const trocas = await completarAnuncio(formData);
  const leitura = lerAnuncio(formData);
  if (!leitura.ok)
    return { ok: false, erro: "Confira os campos marcados.", erros: ajustarErros(leitura.erros, trocas) };
  const d = leitura.dados;
  const supabase = await criarClienteServidor();
  let clienteNovo: string | null = null;
  if (d.cliente_novo) {
    // falhou: a vaga não sai sem o cliente que a pessoa escreveu (sairia no nome errado, sem aviso)
    const garantido = await garantirCliente(supabase, d.cliente_novo);
    if (!garantido.id) {
      if (garantido.error) vigia.banco(garantido.error);
      return {
        ok: false,
        erro: "Não deu para guardar a empresa cliente. Nada foi publicado; tente de novo.",
        erros: { cliente_id: "Não deu para guardar esta empresa agora." },
      };
    }
    clienteNovo = garantido.id;
  }
  const registro = { ...registroDoAnuncio(d), ...(clienteNovo ? { cliente_id: clienteNovo } : {}) };
  const cliente = clienteNovo ?? d.cliente_id ?? null;

  const id = formData.get("id");
  let destino: string;

  if (typeof id === "string" && id) {
    if (!UUID.test(id)) return { ok: false, erro: "Anúncio não encontrado." };
    const { data, error } = await gravarVaga(registro, (r) =>
      supabase.from("anuncios").update(r).eq("id", id).select("id"),
    );
    if (error) {
      vigia.banco(error);
      return erroDoBanco(error);
    }
    if (!data?.length) return { ok: false, erro: "Não encontramos esse anúncio entre os seus." };
    const erroTriagem = await salvarTriagem(supabase, id, d.triagem);
    if (erroTriagem) vigia.parcial("A vaga salvou, mas as respostas da triagem não.", erroTriagem);
    if (cliente) await cuidarDoCliente(supabase, cliente, d, false);
    destino = `/anuncio/${id}?salvo=1${erroTriagem ? "&triagem=0" : ""}`;
  } else {
    const { data, error } = await gravarVaga(registro, (r) =>
      supabase
        .from("anuncios")
        .insert({ ...r, tipo: d.tipo })
        .select("id")
        .single(),
    );
    if (error) {
      if (precisaCompletarPerfil(error)) redirect("/perfil?completar=1&next=/publicar");
      vigia.banco(error);
      return erroDoBanco(error);
    }
    const erroTriagem = await salvarTriagem(supabase, data.id, d.triagem);
    if (erroTriagem) vigia.parcial("A vaga foi publicada, mas as respostas da triagem não salvaram.", erroTriagem);
    if (cliente) await cuidarDoCliente(supabase, cliente, d, true);
    // o Teste Prático que combina com a função já entra na vaga (grátis; a página da vaga diz e deixa tirar)
    const comTeste = d.tipo === "vaga" && (await porTesteSugerido(supabase, data.id, d.titulo, d.categoria));
    // veio do link do convite: publicar é o aceite (o convite vira "Autorizou" no admin)
    const convite = formData.get("convite");
    if (typeof convite === "string" && /^[0-9a-f]{64}$/.test(convite)) {
      const { error: erroConvite } = await supabase.rpc("aceitar_convite", { p_token: convite, p_anuncio: data.id });
      if (erroConvite) {
        console.warn("Publike: não deu para registrar o aceite do convite:", erroConvite.message);
        vigia.parcial("A vaga foi publicada, mas o aceite do convite não ficou registrado.", erroConvite);
      }
    }
    destino = `/anuncio/${data.id}?publicado=1${erroTriagem ? "&triagem=0" : ""}${comTeste ? "&teste=1" : ""}`;
    if (d.tipo === "vaga") await marcarConversao("vaga");
    // o funil do publicar em passos: a vaga saiu (só a contagem do dia; sem a migração, nada)
    if (formData.get("de_passos") === "1") {
      const { error: erroFunil } = await supabase.rpc("registrar_passo_publicar", { p_passo: 6 });
      if (erroFunil && erroFunil.code !== "PGRST202")
        console.error(`Publike: falha ao contar a vaga no funil: ${erroFunil.message}`);
    }
    // "Publicar também para outros cargos com as mesmas condições": uma vaga por cargo, e a lista em Vagas
    const outros = d.tipo === "vaga" && !conviteValido(formData) ? lerOutrosCargos(formData, d.titulo) : [];
    if (outros.length) {
      const r = await publicarOutrosCargos(supabase, formData, outros, cliente, vigia);
      const q = new URLSearchParams({ tipo: "vaga", publicadas: String(1 + r.publicadas) });
      if (r.falhas.length)
        q.set(
          "falharam",
          r.falhas
            .map((f) => f.titulo)
            .join("|")
            .slice(0, 400),
        );
      destino = `/painel/anuncios?${q}`;
    }
  }

  // com a moderação automática ligada, a IA revisa o texto logo depois
  after(processarFilas);
  revalidatePath("/");
  redirect(destino);
}

/** Quantos cargos a mais numa publicação (como no formulário). */
const MAX_OUTROS_CARGOS = 9;

const conviteValido = (formData: FormData) => {
  const c = formData.get("convite");
  return typeof c === "string" && /^[0-9a-f]{64}$/.test(c);
};

/** Os outros cargos escritos no passo 5: sem repetir o da vaga nem entre si, com pelo menos 5 letras. */
function lerOutrosCargos(formData: FormData, titulo: string): string[] {
  const vistos = new Set([titulo.trim().toLowerCase()]);
  const lista: string[] = [];
  for (const v of formData.getAll("outros_cargos")) {
    const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 90) : "";
    if (t.length < 5 || vistos.has(t.toLowerCase())) continue;
    vistos.add(t.toLowerCase());
    lista.push(t);
  }
  return lista.slice(0, MAX_OUTROS_CARGOS);
}

/**
 * Uma vaga para cada outro cargo, com o resto do formulário da primeira (pagamento, horário, local, prazo...).
 * A descrição e a área saem do título de cada uma (`completarAnuncio`), e as regras são as mesmas (`lerAnuncio`
 * e o banco, que confere o limite por dia). O que falhar volta pelo título.
 */
async function publicarOutrosCargos(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  base: FormData,
  cargos: string[],
  cliente: string | null,
  vigia: Vigia,
): Promise<{ publicadas: number; falhas: { titulo: string; erro: string }[] }> {
  let publicadas = 0;
  const falhas: { titulo: string; erro: string }[] = [];
  for (const titulo of cargos) {
    const dados = new FormData();
    for (const [k, v] of base.entries()) {
      if (!["outros_cargos", "descricao", "categoria", "id", "convite", "cliente_novo"].includes(k)) dados.append(k, v);
    }
    dados.set("titulo", titulo);
    if (cliente) dados.set("cliente_id", cliente);
    await completarAnuncio(dados);
    const leitura = lerAnuncio(dados);
    if (!leitura.ok) {
      falhas.push({ titulo, erro: Object.values(leitura.erros).join(" ") });
      continue;
    }
    const { data, error } = await gravarVaga(registroDoAnuncio(leitura.dados), (r) =>
      supabase
        .from("anuncios")
        .insert({ ...r, tipo: "vaga" })
        .select("id")
        .single(),
    );
    if (error || !data) {
      if (error) vigia.parcial(`A vaga "${titulo}" não saiu.`, error);
      falhas.push({ titulo, erro: mensagemDeErro(error) });
      continue;
    }
    await salvarTriagem(supabase, data.id, leitura.dados.triagem);
    await porTesteSugerido(supabase, data.id, titulo, leitura.dados.categoria);
    publicadas++;
  }
  return { publicadas, falhas };
}

export async function mudarStatusAnuncio(
  id: string,
  status: "ativo" | "pausado" | "encerrado",
  /** ao encerrar: o motivo (opcional) que a confirmação perguntou */
  encerramento?: { motivo: MotivoEncerramento; detalhe?: string } | null,
): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id) || !["ativo", "pausado", "encerrado"].includes(status)) {
    return { ok: false, erro: "Pedido inválido." };
  }
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/anuncios" };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("anuncios").update({ status }).eq("id", id).select("id");
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  if (!data?.length) return { ok: false, erro: "Não encontramos esse anúncio entre os seus." };

  // o motivo é só para a conta do Publike: se não gravar (banco sem a migração), a vaga já foi encerrada
  if (status === "encerrado" && encerramento && encerramento.motivo in MOTIVOS_ENCERRAMENTO) {
    const { error: erroMotivo } = await supabase.rpc("registrar_motivo_encerramento", {
      p_anuncio: id,
      p_motivo: encerramento.motivo,
      p_detalhe: (encerramento.detalhe ?? "").slice(0, 200),
    });
    if (erroMotivo && erroMotivo.code !== "PGRST202") {
      console.error(`Publike: não deu para guardar o motivo do encerramento: ${erroMotivo.message}`);
    }
  }

  refresh();
  const mensagens = { ativo: "Anúncio de volta no ar.", pausado: "Anúncio pausado.", encerrado: "Anúncio encerrado." };
  return { ok: true, mensagem: mensagens[status] };
}

export async function renovarAnuncio(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/anuncios" };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("renovar_anuncio", { p_id: id });
  if (error) return { ok: false, erro: mensagemDeErro(error) };

  refresh();
  return { ok: true, mensagem: "Pronto: o prazo da vaga começou de novo." };
}

/**
 * A vaga foi preenchida (ou reaberta). Ela continua no site com a marcação, ninguém mais curte,
 * e quem curtiu e esperava (ou deu match) recebe o aviso, menos quem foi contratado.
 */
export async function marcarVagaPreenchida(id: string, preenchida: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/anuncios" };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("marcar_vaga_preenchida", { p_id: id, p_preenchida: preenchida });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para marcar agora. Tente de novo.") };

  after(processarFilas);
  refresh();
  if (!preenchida) return { ok: true, mensagem: "Vaga reaberta: dá para curtir de novo." };
  const n = data ?? 0;
  return {
    ok: true,
    mensagem:
      n === 0
        ? "Vaga marcada como preenchida."
        : `Vaga marcada como preenchida. ${n === 1 ? "1 pessoa foi avisada" : `${n} pessoas foram avisadas`}.`,
  };
}

export async function excluirAnuncio(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel/anuncios" };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("anuncios").delete().eq("id", id).select("id");
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  if (!data?.length) return { ok: false, erro: "Não encontramos esse anúncio entre os seus." };

  revalidatePath("/");
  redirect("/painel/anuncios?excluido=1");
}
