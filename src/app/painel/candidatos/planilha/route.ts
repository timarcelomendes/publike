import { NextResponse } from "next/server";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { esperaResposta, ETAPAS_CANDIDATO, situacaoDaCurtida, TIPOS_CONTA } from "@/lib/constantes";
import {
  listarMeusCandidatos,
  listarRespostasDosCandidatos,
  obterMeuPerfil,
  obterUsuario,
  perguntasDasVagas,
} from "@/lib/dados";
import { formatarTelefone } from "@/lib/formato";
import { dataHora, nomeDoArquivo, respostaCsv, SITUACAO_CURTIDA } from "@/lib/planilha";
import { empresasDasVagas, listarMeusClientes } from "@/lib/servidor/clientes";
import { UUID } from "@/lib/validacao";
import { textoDaResposta } from "@/lib/vaga-extra";

// Todos os candidatos das minhas vagas numa planilha (ou só de uma vaga: ?vaga=id;
// só de uma etapa: ?etapa=entrevista; só quem espera resposta: ?situacao=responder;
// agência, só de um cliente: ?cliente=id). Contato só de quem deu match, como na tela.
export async function GET(req: Request) {
  if (MODO_DEMO) return new NextResponse("Não encontrado.", { status: 404 });
  const usuario = await obterUsuario();
  if (!usuario) return NextResponse.redirect(new URL("/entrar?next=%2Fpainel%2Fcandidatos", SITE_URL));
  const url = new URL(req.url);
  const vaga = url.searchParams.get("vaga");
  const etapa = url.searchParams.get("etapa");
  const responder = url.searchParams.get("situacao") === "responder";
  const [todos, perfil] = await Promise.all([listarMeusCandidatos(), obterMeuPerfil()]);
  if (!todos) return new NextResponse("Não deu para montar a planilha agora.", { status: 503 });
  // agência: para qual empresa é cada vaga (a coluna "Empresa") e o filtro por cliente
  const [clientes, empresas] =
    perfil?.tipo === "agencia" ? await Promise.all([listarMeusClientes(), empresasDasVagas(usuario.id)]) : [null, null];
  const nomeDoCliente = new Map((clientes ?? []).map((c) => [c.id, c.nome]));
  const pedido = url.searchParams.get("cliente");
  const cliente = pedido && nomeDoCliente.has(pedido) ? pedido : null;
  const lista = todos.filter(
    (c) =>
      (!vaga || !UUID.test(vaga) || c.anuncio_id === vaga) &&
      (!cliente || empresas?.get(c.anuncio_id)?.cliente === cliente) &&
      (responder ? esperaResposta(c) : !etapa || c.etapa === etapa),
  );
  const empresaDe = (anuncioId: string) => {
    const e = empresas?.get(anuncioId);
    if (!e) return "";
    const nome = (e.cliente ? nomeDoCliente.get(e.cliente) : null) ?? e.contratante ?? "";
    return e.confidencial ? `${nome || "Empresa"} (confidencial na vaga)` : nome;
  };

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
    ...(empresas ? ["Empresa"] : []),
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
    ...(empresas ? [empresaDe(c.anuncio_id)] : []),
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
  const titulo =
    vaga && lista[0] ? lista[0].anuncio_titulo : cliente ? (nomeDoCliente.get(cliente) ?? "cliente") : "todas-as-vagas";
  return respostaCsv(cabecalho, linhas, nomeDoArquivo(titulo));
}
