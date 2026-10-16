import { NextResponse, type NextRequest } from "next/server";
import { dataHora, nomeDoArquivo, respostaCsv, SITUACAO_CURTIDA } from "@/lib/planilha";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import {
  DISPONIBILIDADES,
  ETAPAS_CANDIDATO,
  etapaQueVale,
  nomeEscolaridade,
  situacaoDaCurtida,
  TIPOS_CONTA,
} from "@/lib/constantes";
import {
  listarCurriculosDosInteressados,
  listarEtapasDosCandidatos,
  listarInteressados,
  listarRespostasDosCandidatos,
  obterAnuncio,
  obterUsuario,
} from "@/lib/dados";
import { formatarTelefone } from "@/lib/formato";
import { UUID } from "@/lib/validacao";
import { perguntasDoBanco, textoDaResposta } from "@/lib/vaga-extra";

// A lista de quem curtiu uma vaga, para abrir no Excel ou no Google Planilhas.
// Só quem publicou baixa. O WhatsApp e o e-mail só vêm de quem deu match (o banco
// já esconde os outros), como na tela.

export async function GET(_req: NextRequest, { params }: RouteContext<"/painel/anuncio/[id]/planilha">) {
  const { id } = await params;
  if (MODO_DEMO || !UUID.test(id)) return new NextResponse("Não encontrado.", { status: 404 });
  const usuario = await obterUsuario();
  if (!usuario) {
    return NextResponse.redirect(new URL(`/entrar?next=${encodeURIComponent(`/painel/anuncio/${id}`)}`, SITE_URL));
  }
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo === "servico") {
    return new NextResponse("Não encontrado.", { status: 404 });
  }

  const perguntas = perguntasDoBanco(anuncio.perguntas);
  const [interessados, curriculos, etapas, respostas] = await Promise.all([
    listarInteressados(id),
    listarCurriculosDosInteressados(id),
    listarEtapasDosCandidatos(id),
    listarRespostasDosCandidatos(perguntas.length ? [id] : []),
  ]);

  const cabecalho = [
    "Nome",
    "Conta",
    "Bairro",
    "Cidade",
    "Curtiu em",
    "Mensagem",
    "Situação",
    "Etapa",
    "Anotação",
    "WhatsApp",
    "E-mail",
    "Currículo",
    "Escolaridade",
    "CNH",
    "Disponibilidade",
    "Última experiência",
    // uma coluna para cada pergunta da vaga
    ...perguntas.map((q) => q.nome),
    "Perfil no Publike",
  ];
  const linhas = interessados.map((p) => {
    const e = etapas.get(p.perfil_id);
    const c = curriculos.get(p.perfil_id);
    const ultima = c?.experiencias[0];
    const tipo = TIPOS_CONTA[p.tipo as keyof typeof TIPOS_CONTA]?.nome ?? p.tipo;
    return [
      p.nome,
      tipo,
      p.bairro,
      p.cidade,
      dataHora(p.curtido_em),
      p.mensagem,
      SITUACAO_CURTIDA[situacaoDaCurtida(p)] ?? p.status,
      ETAPAS_CANDIDATO[etapaQueVale("vaga", p.status, e?.etapa ?? "novo")].nome,
      e?.nota,
      p.whatsapp ? formatarTelefone(p.whatsapp) : "",
      p.email,
      c ? "Sim" : "Não",
      nomeEscolaridade(c?.escolaridade) ?? "",
      c?.cnh,
      (c?.disponibilidade ?? []).map((d) => DISPONIBILIDADES.find((x) => x.valor === d)?.nome ?? d).join(", "),
      ultima ? [ultima.cargo, ultima.onde].filter(Boolean).join(" em ") : "",
      ...perguntas.map((q) => textoDaResposta(q, respostas.get(`${id}:${p.perfil_id}`)?.[q.id])),
      `${SITE_URL}/perfil/${p.perfil_id}`,
    ];
  });

  return respostaCsv(cabecalho, linhas, nomeDoArquivo(anuncio.titulo));
}
