import { FileText, Flag, Heart, PartyPopper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BotaoConversar } from "@/components/botao-conversar";
import { CaminhoDaCurtida } from "@/components/caminho-curtida";
import { BotaoCurtir } from "@/components/botao-curtir";
import { BotoesContato } from "@/components/contato";
import { BotaoBloquear, CurtirDeNovo, DesfazerMatch } from "@/components/desfazer-match";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { ChipFiltro } from "@/components/painel/fluxo";
import { SoComSupabase } from "@/components/so-com-supabase";
import { linkDoMatch, mensagemComLink } from "@/lib/link-do-match";
import { anunciosComContatoDireto } from "@/lib/servidor/contato-direto";
import { minhasCandidaturasVistas } from "@/lib/servidor/visitas";
import { Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import {
  ETAPAS_CANDIDATO,
  esperaCurriculo,
  esperaResposta,
  etapaParaQuemCurtiu,
  motivoParaOutro,
  nomeMotivoDesfazer,
  STATUS_ANUNCIO,
  type EtapaCandidato,
} from "@/lib/constantes";
import {
  listarMeusBloqueios,
  listarMeusDesfeitos,
  listarMinhasCurtidas,
  listarMinhasEtapas,
  obterMeuCurriculo,
  vagasQuePedemCurriculo,
} from "@/lib/dados";
import { formatarLugar, primeiro, rotuloConta, rotuloModalidade, tempoRelativo, valorDoAnuncio } from "@/lib/formato";
import { ContratacaoPublica } from "@/components/social/botoes";
import { minhasContratacoesPublicas } from "@/lib/dados-social";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { MinhaCurtida, StatusAnuncio, TipoAnuncio } from "@/lib/tipos";

export const metadata: Metadata = { title: "Minhas curtidas" };

/**
 * Em que pé está cada curtida (os filtros da página; a visão geral do painel usa os mesmos).
 * "Falta o currículo": quem publicou aceitou, e a vaga espera o currículo para dar match.
 */
const SITUACOES = {
  aguardando: { nome: "Aguardando aceite", vale: esperaResposta },
  curriculo: { nome: "Falta o currículo", vale: esperaCurriculo },
  match: { nome: "Deu match", vale: (c: MinhaCurtida) => c.status === "match" },
  encerradas: { nome: "Encerradas", vale: (c: MinhaCurtida) => c.status === "dispensada" || c.status === "desfeito" },
} as const satisfies Record<string, { nome: string; vale: (c: MinhaCurtida) => boolean }>;
type Situacao = keyof typeof SITUACOES;
const naSituacao = (s: Situacao, c: MinhaCurtida) => SITUACOES[s].vale(c);

const TITULOS: Record<"todos" | TipoAnuncio, string> = {
  todos: "Minhas curtidas",
  vaga: "Vagas que você curtiu",
  servico: "Serviços que você pediu",
};

export default function MinhasCurtidas({ searchParams }: PageProps<"/painel/curtidas">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/curtidas">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/painel/curtidas");
  const sp = await searchParams;
  const [curtidas, desfeitos, etapas, bloqueios, publicas, curriculo, vistas] = await Promise.all([
    listarMinhasCurtidas(),
    listarMeusDesfeitos(),
    listarMinhasEtapas(),
    listarMeusBloqueios(),
    minhasContratacoesPublicas(),
    obterMeuCurriculo().catch(() => null),
    // as candidaturas que a empresa já abriu (Quem viu seu perfil)
    minhasCandidaturasVistas(),
  ]);
  const agora = await agoraDaRequisicao();
  // sem currículo, as vagas que pedem um ganham o passo "Você manda o currículo" no caminho
  const [pedemCurriculo, diretos] = await Promise.all([
    curriculo
      ? new Set<string>()
      : vagasQuePedemCurriculo(curtidas.filter((c) => c.tipo === "vaga" && esperaResposta(c)).map((c) => c.anuncio_id)),
    // contato direto: o match saiu na hora (sem aceite); a mensagem do WhatsApp leva o link do anúncio
    anunciosComContatoDireto(curtidas.filter((c) => c.status === "match").map((c) => c.anuncio_id)),
  ]);

  if (curtidas.length === 0) {
    return (
      <Vazio icone={Heart} titulo="Você ainda não curtiu nada" acao={<BotaoLink href="/">Ver oportunidades</BotaoLink>}>
        Curta as vagas que combinam com você ou peça um serviço a um profissional. Se a outra pessoa aceitar, dá match.
      </Vazio>
    );
  }

  // filtros: ?tipo=vaga|servico, ?situacao=aguardando|match|encerradas e ?etapa= (vêm da visão geral)
  const pedidoTipo = primeiro(sp.tipo);
  const tipo: TipoAnuncio | null = pedidoTipo === "vaga" || pedidoTipo === "servico" ? pedidoTipo : null;
  const pedidaSituacao = primeiro(sp.situacao);
  const situacao = pedidaSituacao && pedidaSituacao in SITUACOES ? (pedidaSituacao as Situacao) : null;
  const pedidaEtapa = primeiro(sp.etapa);
  const etapa =
    pedidaEtapa && pedidaEtapa !== "novo" && pedidaEtapa in ETAPAS_CANDIDATO ? (pedidaEtapa as EtapaCandidato) : null;

  // a etapa que quem publicou marcou (Em análise, Entrevista, Agendado…): só esperando
  // resposta (até "Em análise") ou depois do match; some se foi dispensada ou desfeita
  const etapaDe = (c: { anuncio_id: string; tipo: string; status: string }) => {
    const e = etapas.get(c.anuncio_id);
    const vale = etapaParaQuemCurtiu(c.tipo, c.status, e?.etapa);
    return e && vale ? { etapa: vale, atualizado_em: e.atualizado_em } : null;
  };

  const vagas = curtidas.filter((c) => c.tipo === "vaga").length;
  const servicos = curtidas.length - vagas;
  const doTipo = tipo ? curtidas.filter((c) => c.tipo === tipo) : curtidas;
  const lista = doTipo
    .filter((c) => !situacao || naSituacao(situacao, c))
    .filter((c) => !etapa || etapaDe(c)?.etapa === etapa);

  const link = (mudar: { tipo?: TipoAnuncio | null; situacao?: Situacao | null; etapa?: EtapaCandidato | null }) => {
    const q = new URLSearchParams();
    const t = "tipo" in mudar ? mudar.tipo : tipo;
    const s = "situacao" in mudar ? mudar.situacao : situacao;
    const e = "etapa" in mudar ? mudar.etapa : etapa;
    if (t) q.set("tipo", t);
    if (s) q.set("situacao", s);
    if (e) q.set("etapa", e);
    const texto = q.toString();
    return `/painel/curtidas${texto ? `?${texto}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="max-w-2xl">
        <h2 className="text-h2">{TITULOS[tipo ?? "todos"]}</h2>
        <p className="mt-1 text-body text-ink-muted">
          {tipo === "servico"
            ? "Você pede e o profissional decide se aceita. Se aceitar, vocês se conectam: a conversa e o WhatsApp aparecem aqui."
            : "Quem publicou decide se aceita. Se aceitar, vocês se conectam: a conversa e o WhatsApp aparecem aqui."}
        </p>
      </div>

      <nav
        aria-label="Filtrar curtidas"
        // no celular, os filtros rolam de lado (uma linha só); no computador, quebram linha
        className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      >
        {(tipo || (vagas > 0 && servicos > 0)) && (
          <>
            {/* trocar de tipo tira a etapa: vagas e serviços têm etapas diferentes */}
            <ChipFiltro
              href={link({ tipo: tipo === "vaga" ? null : "vaga", etapa: null })}
              ativo={tipo === "vaga"}
              nome="Vagas"
              numero={vagas}
            />
            <ChipFiltro
              href={link({ tipo: tipo === "servico" ? null : "servico", etapa: null })}
              ativo={tipo === "servico"}
              nome="Serviços"
              numero={servicos}
            />
            <span aria-hidden className="mx-1 h-6 w-px shrink-0 self-center bg-line-strong" />
          </>
        )}
        {(Object.keys(SITUACOES) as Situacao[]).map((s) => {
          const numero = doTipo.filter((c) => naSituacao(s, c)).length;
          // "Falta o currículo" só aparece quando tem
          if (s === "curriculo" && !numero && situacao !== s) return null;
          return (
            <ChipFiltro
              key={s}
              href={link({ situacao: situacao === s ? null : s })}
              ativo={situacao === s}
              nome={SITUACOES[s].nome}
              numero={numero}
            />
          );
        })}
        {etapa && (
          <ChipFiltro href={link({ etapa: null })} ativo nome={`Etapa: ${ETAPAS_CANDIDATO[etapa].paraQuemCurtiu}`} />
        )}
      </nav>

      {lista.length === 0 ? (
        <p className="text-body text-ink-muted">
          Nada aqui com esse filtro.{" "}
          <Link href="/painel/curtidas" className="font-semibold text-ink underline underline-offset-2">
            Ver todas
          </Link>
        </p>
      ) : (
        <ul aria-label="Lista de curtidas" className="flex flex-col gap-4">
          {lista.map((c) => {
            const noAr = c.anuncio_status === "ativo";
            const etapaVisivel = etapaDe(c);
            // a empresa já abriu a candidatura (só enquanto espera a resposta)
            const vista = esperaResposta(c) && vistas.has(c.anuncio_id);
            return (
              <li
                key={c.anuncio_id}
                className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {c.status === "match" && <Selo variante="match">Deu match</Selo>}
                  {esperaResposta(c) && <Selo variante="like">Aguardando aceite</Selo>}
                  {vista && <Selo variante="contorno">Vista pela empresa</Selo>}
                  {esperaCurriculo(c) && <Selo variante="aviso">Falta o currículo</Selo>}
                  {c.status === "dispensada" && <Selo variante="contorno">Não foi dessa vez</Selo>}
                  {c.status === "desfeito" && <Selo variante="contorno">Match desfeito</Selo>}
                  {etapaVisivel && (
                    <Selo
                      variante={
                        etapaVisivel.etapa === "contratado" || etapaVisivel.etapa === "concluido"
                          ? "match"
                          : etapaVisivel.etapa === "nao_seguiu"
                            ? "contorno"
                            : "aviso"
                      }
                    >
                      {ETAPAS_CANDIDATO[etapaVisivel.etapa].paraQuemCurtiu}
                    </Selo>
                  )}
                  <Selo>{rotuloModalidade(c.tipo, c.regime)}</Selo>
                  {!noAr && (
                    <Selo variante="contorno">
                      {STATUS_ANUNCIO[c.anuncio_status as StatusAnuncio]?.nome ?? "Fora do ar"}
                    </Selo>
                  )}
                </div>
                <h3 className="text-h3">
                  {noAr ? (
                    <Link href={`/anuncio/${c.anuncio_id}`} className="underline-offset-2 hover:underline">
                      {c.titulo}
                    </Link>
                  ) : (
                    c.titulo
                  )}
                </h3>
                <p className="text-body-sm text-ink-muted">
                  {c.autor_nome} · {rotuloConta(c.autor_tipo)} · {formatarLugar(c.bairro, c.cidade)}
                </p>
                <p className="text-label">{valorDoAnuncio(c)}</p>
                {/* quem publicou decide se aceita; só com o aceite vocês se conectam */}
                {(esperaResposta(c) || c.status === "dispensada") && (
                  <CaminhoDaCurtida
                    situacao={c.status as "pendente" | "dispensada"}
                    quem={c.autor_nome}
                    servico={c.tipo === "servico"}
                    passoDoCurriculo={c.status === "pendente" && pedemCurriculo.has(c.anuncio_id)}
                    className="rounded-md border border-line bg-surface-100 p-3"
                  />
                )}
                {/* aceito, falta o currículo: o próximo passo é com a pessoa */}
                {esperaCurriculo(c) && (
                  <div className="flex flex-col gap-3 rounded-md border-2 border-terra bg-surface-100 p-3 sm:p-4">
                    <p className="flex items-center gap-2 text-label">
                      <PartyPopper aria-hidden className="size-[18px] shrink-0 text-terra-text" />
                      {c.autor_nome} aceitou você! Falta só o seu currículo.
                    </p>
                    <CaminhoDaCurtida situacao="aceita" quem={c.autor_nome} />
                    <BotaoLink
                      href={`/perfil/curriculo?next=${encodeURIComponent(`/anuncio/${c.anuncio_id}`)}`}
                      variante="primario"
                      className="self-start"
                    >
                      <FileText aria-hidden />
                      Mandar meu currículo
                    </BotaoLink>
                  </div>
                )}
                {c.mensagem && (
                  <p className="rounded-md bg-surface-300 p-3 text-body-sm italic">Sua mensagem: “{c.mensagem}”</p>
                )}
                {etapaVisivel && (
                  <p className="text-body-sm text-ink-muted">
                    {c.autor_nome.split(" ")[0]}{" "}
                    {etapaVisivel.etapa === "nao_seguiu" ? "encerrou o processo" : "atualizou a etapa"}{" "}
                    {tempoRelativo(etapaVisivel.atualizado_em, agora)}.
                  </p>
                )}
                {c.status === "match" && (
                  <div className="flex flex-col gap-2 rounded-md bg-surface-300 p-3">
                    <p className="text-label text-cerrado-text">Deu match! Agora é só conversar.</p>
                    <p className="text-body-sm">
                      {diretos.has(c.anuncio_id)
                        ? `${c.autor_nome} libera o contato para quem se interessa: vocês estão conectados.`
                        : `${c.autor_nome} aceitou e vocês estão conectados.`}
                    </p>
                    <BotaoConversar outroId={c.autor_id} />
                    <BotoesContato
                      whatsapp={c.autor_whatsapp}
                      email={c.autor_email}
                      // o link: o aceite (a ficha, para quem publicou) ou, no contato direto, o anúncio
                      mensagem={mensagemComLink(
                        `Olá! Deu match no Publike em “${c.titulo}”. Podemos conversar?`,
                        linkDoMatch({
                          anuncioId: c.anuncio_id,
                          perfilId: usuario.id,
                          para: "quem_publicou",
                          direto: diretos.has(c.anuncio_id),
                          servico: c.tipo === "servico",
                        }),
                      )}
                    />
                    {/* desfazer e denunciar na mesma linha (o formulário do desfazer abre embaixo) */}
                    <div className="flex flex-wrap items-start gap-x-1">
                      <DesfazerMatch anuncioId={c.anuncio_id} perfilId={usuario.id} outroNome={c.autor_nome} />
                      <Link
                        href={`/anuncio/${c.anuncio_id}/denunciar`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-label text-danger underline-offset-2 hover:underline"
                      >
                        <Flag aria-hidden className="size-4" />
                        Denunciar
                        <span className="sr-only"> {c.tipo === "servico" ? "o serviço" : "a vaga"} {c.titulo}</span>
                      </Link>
                    </div>
                  </div>
                )}
                {c.status === "match" && c.tipo === "vaga" && etapaVisivel?.etapa === "contratado" && (
                  <ContratacaoPublica
                    anuncioId={c.anuncio_id}
                    perfilId={usuario.id}
                    lado="pessoa"
                    okEmpresa={publicas.get(`${c.anuncio_id}:${usuario.id}`)?.ok_empresa ?? false}
                    okPessoa={publicas.get(`${c.anuncio_id}:${usuario.id}`)?.ok_pessoa ?? false}
                    outro={c.autor_nome}
                  />
                )}
                {c.status === "desfeito" && (
                  <div className="flex flex-col gap-2">
                    <p className="text-body-sm text-ink-muted">
                      {desfeitos.get(c.anuncio_id)?.porMim
                        ? `Você desfez o match. Motivo: ${nomeMotivoDesfazer(desfeitos.get(c.anuncio_id)?.motivo).toLowerCase()}.`
                        : `${c.autor_nome.split(" ")[0]} desfez o match. Motivo: ${motivoParaOutro(desfeitos.get(c.anuncio_id)?.motivo)}.`}
                      {bloqueios.get(c.autor_id)?.ele
                        ? ` ${c.autor_nome.split(" ")[0]} preferiu não negociar de novo.`
                        : noAr
                          ? ` Se quiser, dá para ${c.tipo === "servico" ? "pedir" : "curtir"} de novo.`
                          : ""}
                    </p>
                    {!bloqueios.get(c.autor_id)?.ele && noAr && (
                      <CurtirDeNovo anuncioId={c.anuncio_id} servico={c.tipo === "servico"} />
                    )}
                    <BotaoBloquear
                      outroId={c.autor_id}
                      outroNome={c.autor_nome}
                      bloqueado={Boolean(bloqueios.get(c.autor_id)?.eu)}
                    />
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-body-sm text-ink-muted">
                  <span>
                    {c.tipo === "servico" ? "Você pediu" : "Você curtiu"} {tempoRelativo(c.curtido_em, agora)}
                  </span>
                  {esperaResposta(c) && noAr && <BotaoCurtir anuncioId={c.anuncio_id} status="pendente" logado />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
