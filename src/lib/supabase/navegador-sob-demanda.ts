// O cliente do Supabase no navegador só quando precisa (17/11/2026): o @supabase/supabase-js tem ~70 KiB (gzip) e ia
// no primeiro carregamento de todas as páginas por causa do "Entrar" (a folha e o "entrar num toque"), que existem em
// todas mas quase nunca são usados. Com o import() aqui, o pacote só baixa quando a pessoa toca para entrar.

export async function clienteDoNavegador() {
  const { criarClienteNavegador } = await import("./navegador");
  return criarClienteNavegador();
}
