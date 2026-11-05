"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  ACOES_BANNER,
  caminhoDoSite,
  FORMATOS_BANNER,
  LINK_VAGAS_NOVAS,
  linkDaBusca,
  PAGINAS_BANNER,
  PUBLICOS_BANNER,
  SEM_FILTRO,
  type AcaoBanner,
  type FiltroBanner,
  type PublicoBanner,
  temFiltro,
} from "@/lib/banners";
import { CATEGORIAS, CIDADES, LISTA_TIPOS_CONTA } from "@/lib/constantes";
import { mensagemDeErro } from "@/lib/erros";
import { prepararImagemBanner } from "@/lib/servidor/imagem-banner";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Banners da página inicial (Admin › Banners). Só com o admin aberto no computador do dono.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const SEM_MIGRACAO_FILTROS =
  "Para escolher para quem, rode antes a migração 20261214120000_banners_filtros.sql no Supabase.";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * As contas escolhidas, uma por linha (ou separadas por vírgula): o e-mail da conta ou o código dela (o do
 * endereço no Admin › Usuários). Devolve os códigos e o que não foi achado.
 */
async function lerContas(
  c: NonNullable<Awaited<ReturnType<typeof clienteAdminOuNulo>>>,
  texto: string,
): Promise<{ ids: string[]; naoAchadas: string[] }> {
  const itens = [
    ...new Set(
      texto
        .split(/[\s,;]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ].slice(0, 500);
  const ids = itens.filter((t) => ID.test(t)).map((t) => t.toLowerCase());
  const emails = itens.filter((t) => EMAIL.test(t)).map((t) => t.toLowerCase());
  const naoAchadas = itens.filter((t) => !ID.test(t) && !EMAIL.test(t));
  const achados = new Set<string>();
  if (ids.length) {
    const { data } = await c.from("perfis").select("id").in("id", ids);
    for (const p of data ?? []) achados.add(p.id);
    naoAchadas.push(...ids.filter((i) => !achados.has(i)));
  }
  if (emails.length) {
    const { data } = await c.from("contatos").select("perfil_id, email").not("email", "is", null);
    const porEmail = new Map((data ?? []).map((l) => [String(l.email).toLowerCase(), l.perfil_id]));
    for (const e of emails) {
      const id = porEmail.get(e);
      if (id) achados.add(id);
      else naoAchadas.push(e);
    }
  }
  return { ids: [...achados], naoAchadas };
}

const SEM_MIGRACAO_CARTAO =
  "Para o cartão Do Publike e as Novidades, rode antes a migração 20270118120000_novidades_do_publike.sql no Supabase.";
const SEM_MIGRACAO_IMAGEM = "Para pôr imagem, rode antes a migração 20261213120000_banners_imagem.sql no Supabase.";
const SEM_MIGRACAO_DESTAQUE =
  "Para o destaque no alto da inicial, rode antes a migração 20270123120000_banners_destaque.sql no Supabase.";

const SEM_MIGRACAO_FORMATOS =
  "Para marcar mais de um formato ou o topo da linha do tempo, rode antes a migração 20270217120000_banner_em_varios_formatos.sql no Supabase.";

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

  // um ou mais formatos (migração 20270217120000). As páginas e a espera são só da janela (sem ela, ficam guardadas
  // como estavam, para voltar); o "quantas vezes" e o "Só para" não valem para o destaque (é vitrine, só para quem
  // não tem conta): só destaque marcado, nem os usa
  const pedidos = formData.getAll("formatos").filter((f): f is string => typeof f === "string");
  const formatos = (Object.keys(FORMATOS_BANNER) as (keyof typeof FORMATOS_BANNER)[]).filter((f) => pedidos.includes(f));
  if (!formatos.length) erros.formatos = "Marque pelo menos um formato.";
  const formato = formatos[0] ?? "janela";
  const janela = formatos.includes("janela");
  const destaque = formatos.length === 1 && formatos[0] === "destaque";
  // a coluna nova vai sempre que não é só a janela (agora ou antes); sem a migração 20270217120000, um formato só
  // salva mesmo assim (sem a coluna, mais abaixo)
  const comFormatos = formatos.join() !== "janela" || (texto(formData, "formatos_antes") || "janela") !== "janela";

  // null: só uma vez; N: de novo a cada N dias (até tocar no botão)
  let repetirDias: number | null = null;
  if (texto(formData, "repetir") === "dias") {
    repetirDias = Number(texto(formData, "repetir_dias"));
    if (!Number.isInteger(repetirDias) || repetirDias < 1 || repetirDias > 90) {
      if (destaque) repetirDias = null;
      else erros.repetir_dias = "Escolha de 1 a 90 dias.";
    }
  }

  let paginas = formData.getAll("paginas").filter((p): p is string => typeof p === "string" && p in PAGINAS_BANNER);
  if (!paginas.length && janela) erros.paginas = "Escolha pelo menos uma página.";
  if (!paginas.length) paginas = ["inicio"];
  let atraso = Number(texto(formData, "atraso_segundos") || "3");
  if (!Number.isInteger(atraso) || atraso < 0 || atraso > 60) {
    if (janela) erros.atraso_segundos = "De 0 a 60 segundos.";
    else atraso = 3;
  }
  const emNovidades = formData.get("em_novidades") === "on";
  // só manda as colunas novas quando precisa: a janela de sempre salva mesmo sem a migração 20270118
  const comNovidades =
    !janela ||
    emNovidades ||
    (texto(formData, "formatos_antes") || "janela") !== "janela" ||
    texto(formData, "novidades_antes") === "1";

  const inicioTexto = texto(formData, "inicio");
  const fimTexto = texto(formData, "fim");
  const inicio = inicioTexto ? dataDeBrasilia(inicioTexto) : null;
  const fim = fimTexto ? dataDeBrasilia(fimTexto, true) : null;
  if (inicioTexto && !inicio) erros.inicio = "Confira a data.";
  if (fimTexto && !fim) erros.fim = "Confira a data.";
  if (inicio && fim && fim <= inicio) erros.fim = "O fim vem depois do começo.";

  // para quem (além do público): tipos de conta, áreas, currículo, cidades, contas novas e contas escolhidas
  const marcados = (nome: string, validos: readonly string[]) => [
    ...new Set(formData.getAll(nome).filter((v): v is string => typeof v === "string" && validos.includes(v))),
  ];
  const curriculo = texto(formData, "curriculo");
  const ateDias = texto(formData, "conta_ate_dias");
  // o destaque não tem "Só para": nem confere as contas escolhidas (o campo fica escondido no formulário)
  const contas = destaque ? { ids: [], naoAchadas: [] } : await lerContas(c, texto(formData, "contas"));
  if (contas.naoAchadas.length) {
    erros.contas = `Não achamos: ${contas.naoAchadas.slice(0, 5).join(", ")}${contas.naoAchadas.length > 5 ? "…" : ""}.`;
  }
  if (!destaque && ateDias && !(Number.isInteger(Number(ateDias)) && Number(ateDias) >= 1 && Number(ateDias) <= 365)) {
    erros.conta_ate_dias = "De 1 a 365 dias.";
  }
  const filtro: FiltroBanner = {
    tipos_conta: marcados("tipos_conta", LISTA_TIPOS_CONTA),
    categorias: marcados(
      "categorias",
      CATEGORIAS.filter((x) => x.slug !== "outros").map((x) => x.slug),
    ),
    curriculo: curriculo === "com" || curriculo === "sem" ? curriculo : null,
    cidades: marcados("cidades", CIDADES),
    conta_ate_dias: ateDias ? Number(ateDias) : null,
    so_contas: contas.ids.length > 0,
  };
  // o destaque não tem "Só para" (é só para quem ainda não tem conta): grava sem filtro
  if (destaque) Object.assign(filtro, SEM_FILTRO);

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
    // sem filtro nenhum (e sem ter tido antes), nem manda as colunas: salva mesmo sem a migração 20261214
    ...(temFiltro(filtro) || formData.get("filtros_antes") === "1" ? filtro : {}),
    ...(comNovidades ? { formato, em_novidades: emNovidades } : {}),
    ...(comFormatos ? { formatos } : {}),
    inicio,
    fim,
    ativo: formData.get("ativo") === "on",
  };
  const gravar = (d: typeof dados) =>
    id
      ? c.from("banners").update(d).eq("id", id).select("id").single()
      : c.from("banners").insert(d).select("id").single();
  let { data: salvo, error } = await gravar(dados);
  // sem a migração 20270217120000: um formato só (e não o topo) salva sem a lista
  if (error?.code === "PGRST204" && error.message.includes("formatos") && formatos.length === 1 && formato !== "topo") {
    const { formatos: _semLista, ...semLista } = dados as typeof dados & { formatos?: unknown };
    void _semLista;
    ({ data: salvo, error } = await gravar(semLista));
  }
  if (error?.code === "PGRST204" && error.message.includes("imagem")) return { ok: false, erro: SEM_MIGRACAO_IMAGEM };
  if ((error?.code === "PGRST204" && error.message.includes("formatos")) || (error?.code === "23514" && formato === "topo"))
    return { ok: false, erro: SEM_MIGRACAO_FORMATOS };
  if (error?.code === "23514" && formatos.includes("destaque") && error.message.includes("formato"))
    return { ok: false, erro: SEM_MIGRACAO_DESTAQUE };
  if (error?.code === "PGRST204" && /formato|em_novidades/.test(error.message))
    return { ok: false, erro: SEM_MIGRACAO_CARTAO };
  if (error?.code === "PGRST204") return { ok: false, erro: SEM_MIGRACAO_FILTROS };
  if (error || !salvo) return { ok: false, erro: error ? mensagemDeErro(error) : "Não deu para salvar o banner." };
  // as contas escolhidas: troca a lista toda
  if (temFiltro(filtro) || formData.get("filtros_antes") === "1") {
    const { error: erroApagar } = await c.from("banners_contas").delete().eq("banner_id", salvo.id);
    if (erroApagar)
      return { ok: false, erro: `O banner salvou, mas as contas escolhidas não. ${SEM_MIGRACAO_FILTROS}` };
    if (contas.ids.length) {
      const { error: erroContas } = await c
        .from("banners_contas")
        .insert(contas.ids.map((perfil_id) => ({ banner_id: salvo.id, perfil_id })));
      if (erroContas)
        return { ok: false, erro: `O banner salvou, mas as contas escolhidas não: ${mensagemDeErro(erroContas)}` };
    }
  }
  // a página /novidades (no site rodando aqui; na Vercel, em até 15 minutos)
  updateTag("novidades");
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
  updateTag("novidades");
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
  updateTag("novidades");
  return { ok: true, mensagem: "Banner apagado." };
}
