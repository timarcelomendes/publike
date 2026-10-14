// A versão desta publicação, para a página saber que saiu uma nova (aviso-atualizacao.tsx).
// Fica pronta no build: cada publicação responde com a sua.
export async function GET() {
  return Response.json(
    { versao: process.env.NEXT_PUBLIC_VERSAO ?? "" },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
