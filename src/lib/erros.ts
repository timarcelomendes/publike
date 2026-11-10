type ErroBanco = { code?: string; message?: string; hint?: string | null; details?: string | null } | null | undefined;

/** Transforma erros do banco em frases para quem está usando o site. */
export function mensagemDeErro(erro: ErroBanco, padrao = "Não deu certo agora. Tente de novo em instantes.") {
  if (!erro) return padrao;
  const msg = erro.message ?? "";
  // Mensagens escritas por nós nos gatilhos e funções do banco (já em português)
  if (erro.code === "P0001" || erro.code === "P0002" || erro.code === "22023") return msg || padrao;
  if (erro.code === "42501") {
    return msg && !msg.toLowerCase().includes("permission denied") && !msg.includes("row-level security")
      ? msg
      : "Você não tem permissão para fazer isso.";
  }
  if (erro.code === "23505") return "Isso já foi feito antes.";
  if (erro.code === "23514") return "Algum campo está fora do formato esperado. Confira e tente de novo.";
  if (erro.code === "23503") return "Não encontramos o que você procurava. Atualize a página.";
  return padrao;
}

/** Quando o banco pede para completar o perfil, mandamos a pessoa para lá. */
export function precisaCompletarPerfil(erro: ErroBanco) {
  return erro?.hint === "perfil_incompleto";
}

/**
 * O mesmo anúncio de novo (migração 20270404120000): o banco recusa e diz qual já está publicado. Devolve o código
 * dele, para levar a pessoa até lá em vez de mostrar erro.
 */
export function anuncioRepetido(erro: ErroBanco) {
  const id = erro?.hint === "repetido" ? (erro.details ?? "").trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}
