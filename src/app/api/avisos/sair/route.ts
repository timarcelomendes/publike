import { sairDosAvisos } from "@/lib/acoes/avisos";

// O "parar de receber" de um toque (RFC 8058): o Gmail e o Yahoo mandam um POST para o endereço do
// cabeçalho List-Unsubscribe, sem abrir nada. Quem abre o endereço no navegador (GET) vai para a
// página, que pede para confirmar: assim um leitor de links não desliga os avisos de ninguém.

function chaveEGrupo(request: Request) {
  const url = new URL(request.url);
  return { url, chave: url.searchParams.get("c") ?? "", grupo: url.searchParams.get("g") ?? "todos" };
}

export async function POST(request: Request) {
  const { chave, grupo } = chaveEGrupo(request);
  const r = await sairDosAvisos(chave, grupo);
  return new Response(r.ok ? "Pronto: este tipo de aviso não chega mais por e-mail." : r.erro, {
    status: r.ok ? 200 : 400,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: Request) {
  const { url, chave, grupo } = chaveEGrupo(request);
  const pagina = new URL("/avisos/sair", url.origin);
  pagina.search = new URLSearchParams({ c: chave, g: grupo }).toString();
  return Response.redirect(pagina, 303);
}
