import { NextResponse } from "next/server";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { esperaResposta, ETAPAS_CANDIDATO, situacaoDaCurtida, TIPOS_CONTA } from "@/lib/constantes";
import { listarMeusCandidatos, listarRespostasDosCandidatos, obterUsuario, perguntasDasVagas } from "@/lib/dados";
import { formatarTelefone } from "@/lib/formato";
import { dataHora, nomeDoArquivo, respostaCsv, SITUACAO_CURTIDA } from "@/lib/planilha";
import { UUID } from "@/lib/validacao";
import { textoDaResposta } from "@/lib/vaga-extra";

// Todos os candidatos das minhas vagas numa planilha (ou só de uma vaga: ?vaga=id;
// só de uma etapa: ?etapa=entrevista; só quem espera resposta: ?situacao=responder).
// Contato só de quem deu match, como na tela.
export async function GET(req: Request) {
  if (MODO_DEMO) return new NextResponse("Não encontrado.", { status: 404 });
  const usuario = await obterUsuario();
  if (!usuario) return NextResponse.redirect(new URL("/entrar?next=%2Fpainel%2Fcandidatos", SITE_URL));
  const url = new URL(req.url);
  const vaga = url.searchParams.get("vaga");
  const etapa = url.searchParams.get("etapa");
  const responder = url.searchParams.get("situacao") === "responder";
  const todos = await listarMeusCandidatos();
  if (!todos) return new NextResponse("Não deu para montar a planilha agora.", { status: 503 });
  const lista = todos.filter(
    (c) =>
      (!vaga || !UUID.test(vaga) || c.anuncio_id === vaga) &&
      (responder ? esperaResposta(c) : !etapa || c.etapa === etapa),
  );

  const ids = [...new Set(lista.map((c) => c.anuncio_id))];
  const [perguntas, respostas] = await Promise.all([perguntasDasVagas(ids), listarRespostasDosCandidatos(ids)]);
  // uma vaga só: uma coluna para cada pergunta; várias: tudo numa coluna ("Pergunta: resposta; …")
  const umaVaga = ids.length === 1 ? (perguntas.get(ids[0]) ?? []) : null;
  const algumaPergunta = [...perguntas.values()].some((l) => l.length > 0);
  const colunasPerguntas = umaVaga ? umaVaga.map((q) => q.nome) : algumaPergunta ? ["Respostas às perguntas"] : [];
  const respostasDe = (c: (typeof lista)[number]) => {
    const r = respostas.get(`${c.anuncio_id}:${c.perfil_id}`) ?? {};
    if (umaVaga) return umaVaga.map((q) => textoDaResposta(q, r[q.id]));
    if (!algumaPergunta) return [];
    return [
      (perguntas.get(c.anuncio_id) ?? [])
        .map((q) => `${q.nome}: ${textoDaResposta(q, r[q.id]) || "não respondeu"}`)
        .join("; "),
    ];
  };

  const cabecalho = [
    "Vaga",
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
    ...colunasPerguntas,
    "Perfil no Publike",
    "Candidatos da vaga",
  ];
  const linhas = lista.map((c) => [
    c.anuncio_titulo,
    c.nome,
    TIPOS_CONTA[c.tipo as keyof typeof TIPOS_CONTA]?.nome ?? c.tipo,
    c.bairro,
    c.cidade,
    dataHora(c.curtido_em),
    c.mensagem,
    SITUACAO_CURTIDA[situacaoDaCurtida(c)] ?? c.status,
    ETAPAS_CANDIDATO[c.etapa].nome,
    c.nota,
    c.whatsapp ? formatarTelefone(c.whatsapp) : "",
    c.email,
    c.tem_curriculo ? "Sim" : "Não",
    ...respostasDe(c),
    `${SITE_URL}/perfil/${c.perfil_id}`,
    `${SITE_URL}/painel/anuncio/${c.anuncio_id}`,
  ]);
  const titulo = vaga && lista[0] ? lista[0].anuncio_titulo : "todas-as-vagas";
  return respostaCsv(cabecalho, linhas, nomeDoArquivo(titulo));
}
