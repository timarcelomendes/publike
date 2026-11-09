import { sairDasIndicacoes } from "@/lib/acoes/indicacao-email";

// O "parar de receber indicações" de um toque (RFC 8058): o Gmail e o Yahoo mandam um POST para o endereço do
// cabeçalho List-Unsubscribe, sem abrir nada. Quem abre no navegador (GET) vai para a página, que pede para
// confirmar: assim um leitor de links não tira ninguém da lista.

export async function POST(request: Request) {
  const codigo = new URL(request.url).searchParams.get("c") ?? "";
  const r = await sairDasIndicacoes(codigo);
  return new Response(r.ok ? (r.mensagem ?? "Pronto.") : r.erro, {
    status: r.ok ? 200 : 400,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pagina = new URL("/indicacao/sair", url.origin);
  pagina.search = new URLSearchParams({ c: url.searchParams.get("c") ?? "" }).toString();
  return Response.redirect(pagina, 303);
}
