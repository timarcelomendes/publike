import { vapidPublica } from "@/lib/servidor/ambiente";

// Se as notificações no celular estão ligadas neste site (as chaves VAPID estão na hospedagem). O
// admin, que roda no computador do dono, pergunta aqui para mostrar como está o site publicado. Só
// diz o que já é público: a chave pública é a mesma que vai para o navegador de quem ativa.
export function GET() {
  const publica = vapidPublica();
  return Response.json({ ligadas: Boolean(publica), chave: publica }, { headers: { "cache-control": "no-store" } });
}
