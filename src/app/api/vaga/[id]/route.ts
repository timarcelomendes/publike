import { headers } from "next/headers";
import { categoria, descreverAtendimento, nomeBeneficio, nomeEscolaridade, nomeExperiencia, nomeJornada, nomeModelo, REGIMES } from "@/lib/constantes";
import { contarVisita, obterAnuncio } from "@/lib/dados";
import { ateQuando, formatarLugar, formatarValor, rotuloConta, rotuloModalidade, tempoRelativo, valorDoAnuncio } from "@/lib/formato";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { Regime } from "@/lib/tipos";
import { ganhosDoBanco } from "@/lib/vaga-extra";
import type { DetalheDaLista } from "@/lib/detalhe-da-lista";

/**
 * Um anúncio para o painel da direita na vitrine (Lista + detalhes): os mesmos dados da página da vaga,
 * já escritos. Conta a visita da vaga, como abrir a página dela.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.status !== "ativo") {
    return Response.json({ ok: false, erro: "Este anúncio não está mais no ar." }, { status: 404 });
  }
  const agora = await agoraDaRequisicao();
  const vaga = anuncio.tipo === "vaga";
  if (vaga) await contarVisita(anuncio.id, (await headers()).get("user-agent"));

  const ganhos = vaga ? ganhosDoBanco(anuncio.ganhos_extras, anuncio.comissao) : [];
  const detalhe: DetalheDaLista = {
    id: anuncio.id,
    vaga,
    titulo: anuncio.titulo,
    autor: {
      id: anuncio.autor_id,
      nome: anuncio.autor_nome,
      conta: rotuloConta(anuncio.autor_tipo),
      verificado: anuncio.autor_verificado,
      agencia: anuncio.autor_tipo === "agencia",
    },
    selos: [
      rotuloModalidade(anuncio.tipo, anuncio.regime),
      categoria(anuncio.categoria).nome,
      ...(vaga && anuncio.pede_curriculo ? ["Pede currículo"] : []),
    ],
    lugar:
      anuncio.local_exato && anuncio.endereco
        ? `${anuncio.endereco}, ${formatarLugar(anuncio.bairro, anuncio.cidade)}`
        : formatarLugar(anuncio.bairro, anuncio.cidade),
    lugarAproximado: !(anuncio.local_exato && anuncio.endereco),
    valor: vaga
      ? formatarValor(anuncio.pagamento_valor, anuncio.pagamento_unidade, null, false, { ate: anuncio.pagamento_ate })
      : valorDoAnuncio(anuncio),
    ganhos: ganhos.map((g) => (g.detalhe ? `${g.nome}: ${g.detalhe}` : g.nome)),
    contratante: vaga
      ? (anuncio.contratante ?? (anuncio.contratante_confidencial ? "Confidencial" : null))
      : null,
    contratacao: vaga ? (anuncio.regime ? (REGIMES[anuncio.regime as Regime]?.nome ?? null) : "Vaga") : null,
    jornada: vaga ? [nomeJornada(anuncio.jornada), nomeModelo(anuncio.modelo)].filter(Boolean).join(" · ") || null : null,
    atende: vaga ? null : anuncio.atende.length ? descreverAtendimento(anuncio.atende) : null,
    horario: anuncio.horario || null,
    beneficios: vaga
      ? [
          ...anuncio.beneficios_lista.flatMap((b) => nomeBeneficio(b) ?? []),
          ...(anuncio.beneficios ? [anuncio.beneficios] : []),
        ]
      : [],
    requisitos: vaga
      ? [
          anuncio.escolaridade_minima ? nomeEscolaridade(anuncio.escolaridade_minima) : null,
          nomeExperiencia(anuncio.experiencia),
          anuncio.cnh ? `CNH ${anuncio.cnh}` : null,
        ].filter((r): r is string => Boolean(r))
      : [],
    pessoas: vaga ? anuncio.vagas : 1,
    publicado: tempoRelativo(anuncio.criado_em, agora),
    noAr: anuncio.preenchida_em ? "vaga preenchida" : `fica no ar ${ateQuando(anuncio.expira_em)}`,
    preenchida: Boolean(anuncio.preenchida_em),
    descricao: anuncio.descricao,
  };
  return Response.json({ ok: true, detalhe }, { headers: { "Cache-Control": "private, max-age=60" } });
}
