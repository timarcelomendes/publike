"use server";

import { refresh, revalidatePath, updateTag } from "next/cache";
import { mensagemDeErro } from "@/lib/erros";
import { LISTA_TEMAS_NOTICIA, proximoHorarioLivre, type TemaNoticia } from "@/lib/noticias";
import {
  fotoAbre,
  fotoValida,
  opcoesDeFoto,
  prepararFotoEscolhida,
  type FotoNoticia,
} from "@/lib/servidor/fotos-noticias";
import { buscarNoticias } from "@/lib/servidor/noticias-ia";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Notícias: a fila de aprovação do admin. Nada vai para o site sem passar por aqui.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";

function atualizarSite() {
  // no seu computador, o site atualiza na hora; no site no ar, em alguns minutos
  updateTag("noticias");
  revalidatePath("/noticias", "layout");
  refresh();
}

export async function buscarNoticiasAgora(): Promise<Resultado> {
  if (!(await clienteAdminOuNulo())) return { ok: false, erro: FORA };
  const r = await buscarNoticias({ forcar: true });
  refresh();
  if (!r.ok) return { ok: false, erro: r.erro };
  return {
    ok: true,
    mensagem:
      r.novas === 0
        ? "A IA não achou notícia nova que valesse. Tente mais tarde."
        : `${r.novas === 1 ? "1 notícia nova chegou" : `${r.novas} notícias novas chegaram`} para você revisar.`,
  };
}

export async function ligarBuscaNoticias(ligada: boolean): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  const { error } = await c.from("config_site").update({ ia_noticias: ligada }).eq("id", true);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return {
    ok: true,
    mensagem: ligada
      ? "Busca automática ligada: a IA procura notícias uma vez por dia."
      : "Busca automática desligada.",
  };
}

export type CamposNoticia = {
  titulo: string;
  resumo: string;
  corpo: string;
  pratico: string;
  tema: TemaNoticia;
  cidade: string;
};

function conferir(n: CamposNoticia): CamposNoticia | string {
  const t = (v: unknown, max: number) =>
    String(v ?? "")
      .trim()
      .slice(0, max);
  const d = {
    titulo: t(n.titulo, 140),
    resumo: t(n.resumo, 300),
    corpo: t(n.corpo, 3000),
    pratico: t(n.pratico, 400),
    tema: n.tema,
    cidade: t(n.cidade, 60),
  };
  if (d.titulo.length < 10) return "O título precisa de pelo menos 10 letras.";
  if (d.resumo.length < 20) return "O resumo precisa de pelo menos 20 letras.";
  if (d.corpo.length < 50) return "O texto precisa de pelo menos 50 letras.";
  if (!LISTA_TEMAS_NOTICIA.includes(d.tema)) return "Escolha um tema.";
  return d;
}

/** Salva o texto e, se pedido, aprova: agora ou no próximo horário livre (8h, 12h ou 18h). */
export async function salvarNoticia(
  id: string,
  campos: CamposNoticia,
  publicar: "nao" | "agora" | "agendar",
): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const d = conferir(campos);
  if (typeof d === "string") return { ok: false, erro: d };

  // a foto tem que abrir antes de ir para o site (o Flickr e a Wikimedia às vezes apagam a foto)
  if (publicar !== "nao") {
    const { data: atual } = await c.from("noticias").select("foto_url").eq("id", id).maybeSingle();
    if (atual?.foto_url && !(await fotoAbre(atual.foto_url))) {
      return {
        ok: false,
        erro: "A foto desta notícia não abre. Troque a foto ou use a capa desenhada antes de publicar.",
      };
    }
  }

  let publicar_em: string | undefined;
  if (publicar === "agora") publicar_em = new Date().toISOString();
  if (publicar === "agendar") {
    const { data: ocupados } = await c
      .from("noticias")
      .select("publicar_em")
      .eq("status", "aprovada")
      .gt("publicar_em", new Date().toISOString());
    publicar_em = proximoHorarioLivre(
      (ocupados ?? []).map((o) => o.publicar_em).filter((v): v is string => Boolean(v)),
      Date.now(),
    );
  }
  const { error } = await c
    .from("noticias")
    .update({
      ...d,
      pratico: d.pratico || null,
      cidade: d.cidade || null,
      ...(publicar_em ? { status: "aprovada", publicar_em } : {}),
    })
    .eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  atualizarSite();
  if (publicar === "agora") return { ok: true, mensagem: "Publicada. Já está em publike.org/noticias." };
  if (publicar_em) {
    const quando = new Date(publicar_em).toLocaleString("pt-BR", {
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    return { ok: true, mensagem: `Agendada para ${quando}.` };
  }
  return { ok: true, mensagem: "Texto salvo." };
}

/** Descarta, ou tira do site (volta a ser rascunho). */
export async function mudarSituacaoNoticia(id: string, para: "descartada" | "rascunho"): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.from("noticias").update({ status: para, publicar_em: null }).eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  atualizarSite();
  return { ok: true, mensagem: para === "descartada" ? "Descartada." : "Saiu do site e voltou para revisar." };
}

/** Fotos para escolher (só as que abrem), pela busca digitada ou pelo assunto da notícia. */
export async function buscarFotosNoticia(
  busca: string,
  tema: TemaNoticia,
): Promise<{ ok: true; fotos: FotoNoticia[] } | { ok: false; erro: string }> {
  if (!(await clienteAdminOuNulo())) return { ok: false, erro: FORA };
  if (!LISTA_TEMAS_NOTICIA.includes(tema)) return { ok: false, erro: "Pedido inválido." };
  const { fotos, erro } = await opcoesDeFoto(String(busca ?? "").slice(0, 80), tema);
  return erro ? { ok: false, erro } : { ok: true, fotos };
}

/** Troca a foto da notícia (ou tira: fica a capa desenhada). */
export async function trocarFotoNoticia(id: string, foto: FotoNoticia | null): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  let campos: Record<keyof FotoNoticia, string | null>;
  if (foto === null) {
    campos = {
      foto_url: null,
      foto_autor: null,
      foto_autor_url: null,
      foto_link: null,
      foto_alt: null,
      foto_fonte: null,
      foto_licenca: null,
      foto_licenca_url: null,
    };
  } else {
    const f = fotoValida(foto);
    if (!f) return { ok: false, erro: "Essa foto não serve. Escolha outra." };
    const pronta = await prepararFotoEscolhida(f);
    if (!pronta) return { ok: false, erro: "Essa foto não abre ou não deu para guardar. Escolha outra." };
    campos = Object.fromEntries(Object.entries(pronta).map(([k, v]) => [k, v || null])) as typeof campos;
  }
  const { error } = await c.from("noticias").update(campos).eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  atualizarSite();
  return { ok: true, mensagem: foto ? "Foto trocada." : "Sem foto: a notícia usa a capa desenhada." };
}
