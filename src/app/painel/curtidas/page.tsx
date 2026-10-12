import { Heart } from "lucide-react";
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
import { Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import {
  ETAPAS_CANDIDATO,
  etapaParaQuemCurtiu,
  motivoParaOutro,
  nomeMotivoDesfazer,
  STATUS_ANUNCIO,
  type EtapaCandidato,
} from "@/lib/constantes";
import { listarMeusBloqueios, listarMeusDesfeitos, listarMinhasCurtidas, listarMinhasEtapas } from "@/lib/dados";
import { formatarLugar, primeiro, rotuloConta, rotuloModalidade, tempoRelativo, valorDoAnuncio } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { StatusAnuncio, TipoAnuncio } from "@/lib/tipos";

export const metadata: Metadata = { title: "Minhas curtidas" };

/** Em que pé está cada curtida (os filtros da página; a visão geral do painel usa os mesmos). */
const SITUACOES = {
  aguardando: { nome: "Aguardando aceite", status: ["pendente"] },
  match: { nome: "Deu match", status: ["match"] },
  encerradas: { nome: "Encerradas", status: ["dispensada", "desfeito"] },
} as const satisfies Record<string, { nome: string; status: readonly string[] }>;
type Situacao = keyof typeof SITUACOES;
const naSituacao = (s: Situacao, status: string) => (SITUACOES[s].status as readonly string[]).includes(status);

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
  const [curtidas, desfeitos, etapas, bloqueios] = await Promise.all([
    listarMinhasCurtidas(),
    listarMeusDesfeitos(),
    listarMinhasEtapas(),
    listarMeusBloqueios(),
  ]);
  const agora = await agoraDaRequisicao();

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
    .filter((c) => !situacao || naSituacao(situacao, c.status))
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
        {(Object.keys(SITUACOES) as Situacao[]).map((s) => (
          <ChipFiltro
            key={s}
            href={link({ situacao: situacao === s ? null : s })}
            ativo={situacao === s}
            nome={SITUACOES[s].nome}
            numero={doTipo.filter((c) => naSituacao(s, c.status)).length}
          />
        ))}
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
            return (
              <li
                key={c.anuncio_id}
                className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {c.status === "match" && <Selo variante="match">Deu match</Selo>}
                  {c.status === "pendente" && <Selo variante="like">Aguardando aceite</Selo>}
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
                {(c.status === "pendente" || c.status === "dispensada") && (
                  <CaminhoDaCurtida
                    situacao={c.status as "pendente" | "dispensada"}
                    quem={c.autor_nome}
                    servico={c.tipo === "servico"}
                    className="rounded-md border border-line bg-surface-100 p-3"
                  />
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
                    <p className="text-body-sm">{c.autor_nome} aceitou e vocês estão conectados.</p>
                    <BotaoConversar anuncioId={c.anuncio_id} outroId={c.autor_id} />
                    <BotoesContato
                      whatsapp={c.autor_whatsapp}
                      email={c.autor_email}
                      mensagem={`Olá! Deu match no Publike em “${c.titulo}”. Podemos conversar?`}
                    />
                    <DesfazerMatch anuncioId={c.anuncio_id} perfilId={usuario.id} outroNome={c.autor_nome} />
                  </div>
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
                  {c.status === "pendente" && noAr && <BotaoCurtir anuncioId={c.anuncio_id} status="pendente" logado />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
