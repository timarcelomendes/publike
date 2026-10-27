import { caminhoConversa } from "@/lib/conversas";

/** O que o aviso precisa ter para saber aonde levar. */
export type AvisoComDestino = {
  tipo: string;
  anuncio_id: string | null;
  ator_id: string | null;
  recado_id: string | null;
  /** o link do comunicado da equipe (só caminho do site); os outros avisos não têm */
  link?: string | null;
};

/**
 * Para onde o aviso leva: no sino (o link de cada linha) e na notificação no celular (o toque
 * abre esta página). `usuarioId` é a conta que recebeu o aviso.
 */
export function destinoDoAviso(n: AvisoComDestino, usuarioId: string) {
  if (n.tipo === "mensagem_equipe") return "/painel/mensagens-da-equipe";
  if (n.tipo === "comunicado") return n.link ?? "/";
  // as vagas e os talentos da semana: a lista pelo % de match e a aba Talentos
  if (n.tipo === "vagas_semana") return "/?tipo=vaga&ordem=combina";
  if (n.tipo === "talentos_semana") return "/talentos";
  if (n.tipo === "convite_curriculo") return "/perfil/curriculo";
  if (n.tipo === "curriculo_publico") return "/perfil/curriculo#quem-acha";
  if (n.tipo === "visitas_novidade") return "/painel/visitas#opcoes";
  if (n.tipo === "visita" || n.tipo === "visitas_do_dia") return "/painel/visitas";
  if (n.tipo === "convite_empresa" || n.tipo === "convite_agencia") return "/painel";
  if (n.tipo === "convite_servicos") return `/perfil/${usuarioId}`;
  if (n.tipo === "convite_vitrine") return "/painel/servicos";
  if (n.tipo === "curtida" && n.anuncio_id) return `/painel/anuncio/${n.anuncio_id}`;
  if (n.tipo === "match") return "/painel/matches";
  if (n.tipo === "match_desfeito" && n.anuncio_id) return `/anuncio/${n.anuncio_id}`;
  if (n.tipo === "avaliacao") return "/painel/avaliacoes";
  if (n.tipo === "avaliacao_retida" || n.tipo === "avaliacao_removida") return "/regras";
  if (n.tipo === "avaliacao_liberada" && n.anuncio_id) return `/anuncio/${n.anuncio_id}`;
  // moderação do anúncio: Meus anúncios mostra se está em análise, no ar ou como pôr de volta
  if (n.tipo === "em_analise" || n.tipo === "liberado") return "/painel/anuncios";
  if (n.tipo === "etapa") return "/painel/curtidas";
  if (n.tipo === "entrevista" && n.anuncio_id) return `/anuncio/${n.anuncio_id}`;
  if (n.tipo === "entrevista_resposta" && n.anuncio_id) return `/painel/anuncio/${n.anuncio_id}/quadro`;
  if (n.tipo === "finalistas" && n.anuncio_id) return `/painel/anuncio/${n.anuncio_id}/finalistas`;
  if (n.tipo === "convite_candidato" && n.anuncio_id) return `/painel/anuncio/${n.anuncio_id}/convidar`;
  if (n.tipo === "equipe") return "/painel/equipe";
  // recados: a página do recado (o "não publicado" leva aos recados do perfil, onde aparece o motivo)
  if ((n.tipo === "recado_no_ar" || n.tipo === "recado_forca") && n.recado_id) return `/recado/${n.recado_id}`;
  if (n.tipo === "recado_retido") return `/perfil/${usuarioId}#recados`;
  if (n.tipo === "conexao") return n.ator_id ? `/painel/conexoes/${n.ator_id}` : "/painel/conexoes";
  // aceito numa vaga que pede currículo: direto para o currículo, que volta para a vaga
  if (n.tipo === "aceite_curriculo" && n.anuncio_id)
    return `/perfil/curriculo?next=${encodeURIComponent(`/anuncio/${n.anuncio_id}`)}`;
  if (n.tipo === "curriculo_recebido" && n.anuncio_id)
    return `/painel/anuncio/${n.anuncio_id}${n.ator_id ? `#candidato-${n.ator_id}` : ""}`;
  if ((n.tipo === "seguindo" || n.tipo === "busca" || n.tipo === "convite") && n.anuncio_id)
    return `/anuncio/${n.anuncio_id}`;
  if (n.tipo === "vaga_preenchida") return "/?tipo=vaga";
  if (n.tipo === "recomendacao") return `/perfil/${usuarioId}#recomendacoes`;
  if (n.tipo === "contratacao" && n.anuncio_id) return `/painel/contratacao/${n.anuncio_id}`;
  // a conversa é uma por pessoa (as vagas em comum e a conexão juntas)
  if (n.tipo === "mensagem") return n.ator_id ? caminhoConversa(n.ator_id) : "/painel/conversas";
  return "/painel";
}
