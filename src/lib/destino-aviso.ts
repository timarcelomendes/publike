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
  // pagamentos: a fatura, a assinatura (o link vem do banco, só caminho do site)
  if (n.tipo === "pagamento") return n.link?.startsWith("/painel/") ? n.link : "/painel/faturas";
  if (n.tipo === "noticias_do_dia") return "/noticias";
  // a funcionalidade liberada: a página dela (o link vem do banco, só caminho do site)
  // o candidato que combina: a ficha dele em Talentos
  if (n.tipo === "talento_combina") return n.ator_id ? `/talentos/${n.ator_id}` : "/talentos";
  // o pedido de vaga do cliente da agência: a página dos pedidos (o link vem do banco, só caminho do site)
  // a busca salva de Talentos: a busca já aberta (o link vem do banco, só caminho do site)
  if (n.tipo === "busca_talentos") return n.link?.startsWith("/talentos") ? n.link : "/talentos?ver=todos";
  if (n.tipo === "pedido_cliente") return n.link?.startsWith("/painel/") ? n.link : "/painel/pedidos";
  if (n.tipo === "liberacao") return n.link?.startsWith("/painel/") ? n.link : "/painel";
  // os testes Publike: quem curtiu abre os seus testes; quem publicou, os testes da vaga
  if (n.tipo === "teste_pedido") return "/testes";
  if (n.tipo === "teste_feito" && n.anuncio_id) return `/painel/anuncio/${n.anuncio_id}/testes`;
  // as vagas e os talentos da semana: a lista pelo % de match e a aba Talentos
  if (n.tipo === "vagas_semana") return "/?tipo=vaga&ordem=combina";
  // o resumo da segunda sem talento novo leva a vaga: abre o quadro dela
  if (n.tipo === "talentos_semana") return n.anuncio_id ? `/painel/anuncio/${n.anuncio_id}/quadro` : "/talentos";
  // "Volte a contratar": publicar de novo a vaga de antes (já preenchido)
  if (n.tipo === "talentos_reativar") return n.anuncio_id ? `/publicar?copiar=${n.anuncio_id}` : "/publicar";
  // deu match (ou respondeu às perguntas do match): a ficha da pessoa no quadro da vaga; os sem contato, a lista
  if (n.tipo === "match_empresa" || n.tipo === "respostas_match")
    return n.anuncio_id && n.ator_id
      ? `/painel/anuncio/${n.anuncio_id}/quadro?candidato=${n.ator_id}`
      : "/painel/matches";
  if (n.tipo === "matches_sem_contato") return "/painel/matches";
  if (n.tipo === "convite_curriculo") return "/perfil/curriculo";
  if (n.tipo === "curriculo_publico") return "/perfil/curriculo#quem-acha";
  if (n.tipo === "visitas_novidade") return "/painel/visitas#opcoes";
  if (n.tipo === "visita" || n.tipo === "visitas_do_dia") return "/painel/visitas";
  if (n.tipo === "convite_empresa" || n.tipo === "convite_agencia") return "/painel";
  if (n.tipo === "convite_servicos") return `/perfil/${usuarioId}`;
  if (n.tipo === "convite_vitrine") return "/painel/servicos";
  // a curtida abre a ficha de quem curtiu na Caixa de entrada, com o Aceitar e o Dispensar (a do serviço
  // volta para o anúncio, na própria Caixa)
  if (n.tipo === "curtida" && n.anuncio_id)
    return n.ator_id ? `/painel/caixa?c=${n.anuncio_id}:${n.ator_id}` : `/painel/anuncio/${n.anuncio_id}`;
  if (n.tipo === "lembrete_curtida" && n.anuncio_id) return `/painel/caixa?aba=novos&vaga=${n.anuncio_id}`;
  // 5 dias sem resposta: as vagas parecidas (a mesma área, pela vaga)
  if (n.tipo === "sem_resposta" && n.anuncio_id) return `/anuncio/${n.anuncio_id}/parecidas`;
  // o retorno de quem não seguiu: as vagas parecidas (migração 20261230120000)
  if (n.tipo === "dispensada" && n.anuncio_id) return `/anuncio/${n.anuncio_id}/parecidas`;
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
  // a entrevista em vídeo: o candidato vai gravar; a empresa, ao candidato no quadro
  if (n.tipo === "video_pedido" && n.anuncio_id) return `/entrevista-video/${n.anuncio_id}`;
  if (n.tipo === "video_enviado" && n.anuncio_id)
    return `/painel/anuncio/${n.anuncio_id}/quadro${n.ator_id ? `?candidato=${n.ator_id}` : ""}`;
  // o recado automático de que a candidatura chegou: as candidaturas da pessoa (migração 20270111120000)
  if (n.tipo === "candidatura_recebida") return "/painel/curtidas";
  // a proposta: o candidato vai à proposta; a empresa, ao candidato no quadro (migração 20270110120000)
  if (n.tipo === "proposta" && n.anuncio_id) return `/proposta/${n.anuncio_id}`;
  if (n.tipo === "proposta_resposta" && n.anuncio_id)
    return `/painel/anuncio/${n.anuncio_id}/quadro${n.ator_id ? `?candidato=${n.ator_id}` : ""}`;
  // a automação "Lembrar dos parados": o quadro da vaga (migração 20270109120000)
  // o aviso de uma regra das Automações personalizadas leva à ficha da pessoa (migração 20270115120000)
  if (n.tipo === "parados" && n.link?.startsWith("/painel/")) return n.link;
  if (n.tipo === "parados" && n.anuncio_id) return `/painel/anuncio/${n.anuncio_id}/quadro`;
  // o lembrete da véspera: o candidato vai à vaga; quem marcou, ao quadro
  if (n.tipo === "entrevista_lembrete" && n.anuncio_id)
    return n.link?.startsWith("/") ? n.link : `/anuncio/${n.anuncio_id}`;
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
