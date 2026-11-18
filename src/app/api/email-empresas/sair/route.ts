import { responderEmailEmpresas } from "@/lib/acoes/email-empresas";

// O "parar de receber" de um toque do e-mail às empresas (RFC 8058; migração 20270722120000): o Gmail e o Yahoo mandam
// um POST para o endereço do cabeçalho List-Unsubscribe. Quem abre no navegador (GET) vai para a página, que pede o
// toque: assim um leitor de links não tira ninguém da lista.

const tokenDe = (request: Request) => new URL(request.url).searchParams.get("t") ?? "";

export async function POST(request: Request) {
  const r = await responderEmailEmpresas(tokenDe(request), "nao");
  return new Response(r.ok ? "Pronto: não mandamos mais e-mails como este." : r.erro, {
    status: r.ok ? 200 : 400,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = tokenDe(request);
  const pagina = new URL(`/empresas/resposta/${/^[0-9a-f]{64}$/.test(token) ? token : "x"}`, url.origin);
  pagina.search = "sair=1";
  return Response.redirect(pagina, 303);
}
