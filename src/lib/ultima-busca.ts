// A última busca da home (endereço com os filtros), nesta aba do navegador.
// A página do anúncio usa para "Voltar para a busca" do jeito que a pessoa deixou.
const CHAVE = "publike_ultima_busca";

export function lembrarBusca(endereco: string) {
  try {
    window.sessionStorage.setItem(CHAVE, endereco);
  } catch {
    // sem armazenamento: o link leva para a busca do tipo do anúncio
  }
}

export function lerUltimaBusca(): string | null {
  try {
    const v = window.sessionStorage.getItem(CHAVE);
    // só endereços da própria home
    return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
  } catch {
    return null;
  }
}

/** Ao sair da conta: quem usar o aparelho depois não volta para a busca de outra pessoa. */
export function esquecerBusca() {
  try {
    window.sessionStorage.removeItem(CHAVE);
  } catch {
    // sem armazenamento: não havia nada guardado
  }
}
