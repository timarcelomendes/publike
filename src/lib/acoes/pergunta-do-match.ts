"use server";

import type { PedidoDoMatch } from "@/lib/abrir-conversa";
import { MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { linkDoMatch, mensagemComLink } from "@/lib/link-do-match";
import { curriculoDeQuemCurte } from "@/lib/servidor/curriculo-de-quem-curte";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

type MatchDoBanco = {
  anuncio_id: string;
  titulo: string | null;
  tipo: string | null;
  direto: boolean | null;
  autor_id: string;
  autor_nome: string | null;
  whatsapp: string | null;
  /** a vaga é só pelo chat do Publike (migração 20270221120000): sem o WhatsApp */
  so_chat?: boolean | null;
};

/**
 * A pergunta do match ao entrar (06/11/2026): o match mais novo de quem curtiu, com o WhatsApp de quem publicou
 * liberado (ou de vaga só pelo chat do Publike), que ainda não teve a pergunta "Quer falar agora?" (nem conversa
 * começada). A mensagem pronta é a mesma do resto do site: no contato direto, "Me candidatei…"; no aceite, "Deu
 * match no Publike em…". Sem match, ou sem a migração 20270220120000 no banco, null: nada aparece.
 */
export async function matchParaPerguntar(): Promise<PedidoDoMatch | null> {
  if (MODO_DEMO) return null;
  const usuario = await obterUsuario().catch(() => null);
  if (!usuario) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("match_para_perguntar");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const m = data as unknown as MatchDoBanco;
  const soChat = Boolean(m.so_chat);
  if ((!m.whatsapp && !soChat) || !UUID.test(m.anuncio_id) || !UUID.test(m.autor_id)) return null;
  const titulo = m.titulo ?? "";
  const servico = m.tipo === "servico";
  const direto = Boolean(m.direto);
  // sem currículo, a pergunta oferece fazer; com ele à mostra, o link vai na mensagem do contato direto
  const cv = await curriculoDeQuemCurte(m.tipo);
  const texto = direto
    ? servico
      ? `Olá! Pedi o seu serviço “${titulo}” pelo Publike. Podemos combinar?`
      : `Olá! Me candidatei à vaga “${titulo}” pelo Publike. Podemos conversar?`
    : `Olá! Deu match no Publike em “${titulo}”. Podemos ${servico ? "combinar" : "conversar"}?`;
  return {
    conversa: { outroId: m.autor_id, outroNome: m.autor_nome ?? "", titulo },
    whatsapp: soChat ? null : m.whatsapp,
    mensagem: mensagemComLink(
      texto,
      linkDoMatch({
        anuncioId: m.anuncio_id,
        perfilId: usuario.id,
        para: "quem_publicou",
        direto,
        servico,
      }),
      direto && cv.naVitrine ? usuario.id : null,
    ),
    anuncioId: m.anuncio_id,
    perfilId: usuario.id,
    servico,
    direto,
    soChat,
    semCurriculo: cv.sem,
  };
}

/** A pergunta apareceu (na hora da curtida ou ao entrar): não aparece de novo para este match. */
export async function marcarMatchPerguntado(anuncioId: string): Promise<void> {
  if (MODO_DEMO || !UUID.test(anuncioId)) return;
  const usuario = await obterUsuario().catch(() => null);
  if (!usuario) return;
  const supabase = await criarClienteServidor();
  // sem a migração no banco, não marca (e a pergunta ao entrar também não aparece)
  await supabase.rpc("marcar_match_perguntado", { p_anuncio: anuncioId });
}
