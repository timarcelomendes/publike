import { NextResponse } from "next/server";
import { diasDoPeriodo, nomeDaOrigem, PERIODOS_NUMEROS } from "@/lib/automacoes";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { dataHora, respostaCsv } from "@/lib/planilha";
import { numerosDoProcesso, numerosOrigem } from "@/lib/servidor/automacoes";

// Os números do processo numa planilha (?periodo=30|90|tudo): uma linha por vaga, a de todas as vagas e, embaixo,
// de onde vieram os candidatos (migração 20270109120000).
export async function GET(req: Request) {
  if (MODO_DEMO) return new NextResponse("Não encontrado.", { status: 404 });
  const usuario = await obterUsuario();
  if (!usuario) return NextResponse.redirect(new URL("/entrar?next=%2Fpainel%2Fnumeros", SITE_URL));
  const { periodo, dias } = diasDoPeriodo(new URL(req.url).searchParams.get("periodo") ?? undefined);
  const [vagas, origens] = await Promise.all([numerosDoProcesso(dias), numerosOrigem(dias)]);
  if (!vagas || !origens) return new NextResponse("Não deu para montar a planilha agora.", { status: 503 });
  const num = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
  const linhas = vagas.map((v) => [
    v.anuncio_id ? v.titulo : `Todas as vagas (${PERIODOS_NUMEROS[periodo].toLowerCase()})`,
    v.anuncio_id ? dataHora(v.criado_em) : "",
    String(v.candidatos),
    String(v.respondidos),
    String(v.analise),
    String(v.entrevista),
    String(v.contratados),
    String(v.nao_seguiu),
    num(v.horas_resposta),
    num(v.dias_entrevista),
    num(v.dias_contratar),
  ]);
  linhas.push([], ["Origem dos candidatos", "", "Candidatos", "", "", "Entrevista", "Contratados"]);
  for (const o of origens)
    linhas.push([
      nomeDaOrigem(o.origem),
      "",
      String(o.candidatos),
      "",
      "",
      String(o.entrevista),
      String(o.contratados),
    ]);
  return respostaCsv(
    [
      "Vaga",
      "Publicada em",
      "Candidatos",
      "Responderam",
      "Em análise ou depois",
      "Entrevista",
      "Contratados",
      "Não seguiram",
      "Horas até a 1ª resposta (mediana)",
      "Dias até a entrevista (mediana)",
      "Dias até contratar (mediana)",
    ],
    linhas,
    `numeros-publike-${periodo}.csv`,
  );
}
