import { timingSafeEqual } from "node:crypto";
import {
  enviarEmailsPendentes,
  enviarPushPendentes,
  liberarContatosParados,
  revisarAnunciosPendentes,
  revisarAvaliacoesPendentes,
  revisarRecadosPendentes,
} from "@/lib/servidor/filas";

// A garantia das filas: a tarefa agendada do GitHub (.github/workflows/filas.yml) chama a cada 5 minutos,
// com "Authorization: Bearer <CRON_SECRET>". Esvazia os e-mails e as revisões da IA mesmo sem ninguém
// usando o site (hoje elas só andam em after() das ações). Responde 500 quando a fila não anda (chave do
// servidor recusada, configuração faltando, e-mail com falha): a tarefa falha e o GitHub avisa por e-mail.
export const maxDuration = 60;

function autorizado(cabecalho: string | null) {
  const segredo = (process.env.CRON_SECRET || "").trim();
  if (segredo.length < 16 || !cabecalho) return false;
  const esperado = Buffer.from(`Bearer ${segredo}`);
  const veio = Buffer.from(cabecalho);
  return esperado.length === veio.length && timingSafeEqual(esperado, veio);
}

export async function GET(request: Request) {
  if (!autorizado(request.headers.get("authorization"))) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }
  const [ia, avaliacoes, recados, parados] = await Promise.all([
    revisarAnunciosPendentes(20),
    revisarAvaliacoesPendentes(20),
    revisarRecadosPendentes(20),
    // curtida parada há 48 h numa vaga de quem nunca entrou: o "Deu match" sai junto com os e-mails abaixo
    liberarContatosParados(),
  ]);
  // depois da IA: ela pode ter tirado um anúncio do ar, e esse aviso sai junto
  const [emails, celular] = await Promise.all([enviarEmailsPendentes(20), enviarPushPendentes(50)]);

  const problemas = [
    emails.motivo,
    celular.motivo,
    ia.motivo,
    avaliacoes.motivo,
    recados.motivo,
    parados.motivo,
  ].filter((m): m is string => Boolean(m));
  // só o erro, sem o endereço de ninguém (a resposta aparece no registro da tarefa do GitHub)
  if (emails.falhas > 0) {
    problemas.push(
      `${emails.falhas} e-mail(s) não saíram: ${[...new Set(emails.erros.map((e) => e.erro))].join("; ")}`,
    );
  }
  const ok = problemas.length === 0;
  return Response.json(
    {
      ok,
      problemas,
      emails: { enviados: emails.enviados, falhas: emails.falhas },
      celular,
      contatos_liberados: parados.liberadas,
      ia: { anuncios: ia, avaliacoes, recados },
    },
    { status: ok ? 200 : 500, headers: { "cache-control": "no-store" } },
  );
}
