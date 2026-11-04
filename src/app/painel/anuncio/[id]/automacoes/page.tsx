import {
  CalendarCheck,
  CircleCheckBig,
  Hourglass,
  ListFilter,
  MailCheck,
  MessageCircleQuestion,
  MessageSquareText,
  PartyPopper,
  Reply,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DesfazerRegra } from "@/components/automacoes/desfazer-regra";
import { EditorAutomacoes } from "@/components/automacoes/editor-automacoes";
import { SuasRegras } from "@/components/automacoes/suas-regras";
import { CabecalhoDaVaga } from "@/components/painel/cabecalho-da-vaga";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { BotaoAssinar, FaixaExperimento } from "@/components/recurso-pago";
import { BotaoExperimentar } from "@/components/botao-experimentar";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo } from "@/components/ui/basicos";
import { textoDoFeito, type RegraFeita } from "@/lib/automacoes";
import { textoDoQueFez } from "@/lib/regras";
import { MODO_DEMO } from "@/lib/config";
import { obterAnuncio, obterMeuPerfil, recursosPagos } from "@/lib/dados";
import { formatarLugar, tempoRelativo } from "@/lib/formato";
import type { FormatoEntrevista } from "@/lib/recrutamento";
import { dataCurta, DIAS_GRATIS, type EstadoRecurso } from "@/lib/recursos-pagos";
import { automacoesDaVaga } from "@/lib/servidor/automacoes";
import { dailyConfigurado } from "@/lib/servidor/daily";
import { equipeDaConta } from "@/lib/servidor/equipe";
import { etapasProprias } from "@/lib/servidor/etapas-proprias";
import { feitasDasRegras, regrasDaConta, regrasDaVaga } from "@/lib/servidor/regras-tela";
import { bibliotecaDeTestes } from "@/lib/servidor/testes";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Automações da vaga" };

// As regras da vaga, pelo momento do processo, e o registro do que fizeram (migrações 20270109120000 e
// 20270111120000; as Automações personalizadas, 20270114120000 e 20270115120000).

const ICONE_DA_REGRA: Record<RegraFeita, LucideIcon> = {
  recado: MailCheck,
  dispensar: ListFilter,
  triagem: Sparkles,
  mensagem: MessageSquareText,
  horarios: CalendarCheck,
  parado: Hourglass,
  encerrar: Reply,
  preenchida: CircleCheckBig,
  completa: PartyPopper,
  perguntas: MessageCircleQuestion,
};

export default function AutomacoesDaVaga({ params }: PageProps<"/painel/anuncio/[id]/automacoes">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      {params.then(({ id }) => (
        <Conteudo id={id} />
      ))}
    </Suspense>
  );
}

async function Conteudo({ id }: { id: string }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/automacoes`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") notFound();
  const supabase = await criarClienteServidor();
  const [regras, proprias, perfil, agora, recursos, daConta, feitas, { data: doCliente }, testes, equipe] =
    await Promise.all([
      automacoesDaVaga(id),
      etapasProprias(),
      obterMeuPerfil(),
      agoraDaRequisicao(),
      recursosPagos(),
      regrasDaConta(),
      feitasDasRegras(id),
      supabase.from("anuncios").select("cliente_id").eq("id", id).maybeSingle(),
      bibliotecaDeTestes(),
      equipeDaConta().catch(() => null),
    ]);
  const suas = regrasDaVaga(daConta ?? [], { id, cliente_id: doCliente?.cliente_id ?? null });
  const sobMedida = recursos?.automacoes.indisponivel ? null : (recursos?.automacoes ?? null);
  const cabecalho = <CabecalhoDaVaga anuncio={anuncio} aba="automacoes" />;
  if (!regras) {
    return (
      <div className="flex flex-col gap-4">
        {cabecalho}
        <Aviso tipo="alerta" titulo="As automações ainda não estão disponíveis">
          Tente de novo em instantes.
        </Aviso>
      </div>
    );
  }
  const formatos: FormatoEntrevista[] = [
    "presencial",
    "telefone",
    "video",
    ...(regras.video.liberado && dailyConfigurado() ? (["publike"] as const) : []),
  ];
  const endereco = [anuncio.endereco, formatarLugar(anuncio.bairro, anuncio.cidade)].filter(Boolean).join(", ");
  const nomesDasProprias = new Map((proprias ?? []).map((e) => [`sub:${e.id}`, e.nome]));

  return (
    <div className="flex flex-col gap-6">
      {cabecalho}
      <div className="flex max-w-3xl flex-col gap-1">
        <h2 className="flex flex-wrap items-center gap-2 text-h2">
          <Workflow aria-hidden className="size-6 text-ink-muted" />
          Automações da vaga
          <Selo variante="novo">Novo</Selo>
        </h2>
        <p className="text-body text-ink-muted">
          O Publike faz sozinho o que você faria à mão. Cada regra age uma vez só por candidato, salva assim que você
          liga, e fica anotada no registro aqui embaixo.
        </p>
      </div>
      <div className="max-w-3xl">
        {regras.sobMedida ? (
          <FaixaExperimento recurso="automacoes" estado={sobMedida} agora={agora} />
        ) : (
          sobMedida && <OfertaSobMedida estado={sobMedida} />
        )}
      </div>
      <div className="flex max-w-3xl flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-h3">Prontas · grátis</h3>
          <p className="text-body-sm text-ink-muted">Liga e desliga, com o texto e os prazos do Publike.</p>
        </div>
        <EditorAutomacoes
          anuncioId={id}
          inicial={regras}
          formatos={formatos}
          endereco={endereco}
          vaga={anuncio.titulo}
          empresa={perfil?.nome ?? anuncio.autor_nome}
          quantas={Math.max(1, anuncio.vagas ?? 1)}
        />
      </div>

      {daConta && (
        <div className="max-w-3xl">
          <SuasRegras
            regras={suas}
            liberado={Boolean(sobMedida?.liberado)}
            vaga={id}
            vagas={{ [id]: anuncio.titulo }}
            testes={Object.fromEntries((testes ?? []).map((t) => [t.id, t.titulo]))}
            equipe={Object.fromEntries((equipe ?? []).map((m) => [m.membro_id, m.nome]))}
          />
        </div>
      )}

      <section aria-labelledby="registro" className="flex max-w-3xl flex-col gap-3">
        <h3 id="registro" className="text-h3">
          O que as automações fizeram
        </h3>
        {regras.registro.length === 0 && feitas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-4 text-body-sm text-ink-muted">
            Nada ainda. Quando uma regra agir, aparece aqui quem foi e o que aconteceu.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {feitas.map((f) => (
              <li key={`r${f.id}`} className="flex items-start gap-3 px-4 py-3 text-body-sm">
                <Workflow aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                <p className="min-w-0 flex-1">
                  <Link
                    href={`/painel/caixa?c=${id}:${f.perfil_id}`}
                    className="text-label underline-offset-2 hover:underline"
                  >
                    {f.nome}
                  </Link>{" "}
                  {textoDoQueFez(f.feitas)}
                  <span className="text-ink-muted"> · regra “{f.regra}”</span>
                  {f.desfeito_em && <span className="text-ink-muted"> · desfeito</span>}
                </p>
                <span className="flex shrink-0 flex-col items-end gap-1 text-caption text-ink-muted">
                  {tempoRelativo(f.feito_em, agora)}
                  {!f.desfeito_em && <DesfazerRegra feita={f.id} nome={f.nome.split(" ")[0] || f.nome} />}
                </span>
              </li>
            ))}
            {regras.registro.map((f, i) => {
              const Icone = ICONE_DA_REGRA[f.regra];
              return (
                <li key={i} className="flex items-start gap-3 px-4 py-3 text-body-sm">
                  <Icone aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                  <p className="min-w-0 flex-1">
                    <Link
                      href={`/painel/anuncio/${id}/quadro?candidato=${f.perfil_id}`}
                      className="text-label underline-offset-2 hover:underline"
                    >
                      {f.nome}
                    </Link>{" "}
                    {textoDoFeito(f, nomesDasProprias)}
                  </p>
                  <span className="shrink-0 text-caption text-ink-muted">{tempoRelativo(f.feito_em, agora)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Sem as Automações personalizadas: as 5 prontas são grátis (liga e desliga, com o texto e os prazos do Publike);
 * montar as suas regras abre com os 15 dias grátis ou a assinatura. Nada é imposto: tudo começa desligado.
 */
function OfertaSobMedida({ estado }: { estado: EstadoRecurso }) {
  const acabou = estado.experimentou && estado.fim_experimento ? dataCurta(estado.fim_experimento) : null;
  return (
    <section
      aria-labelledby="sob-medida"
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h3 id="sob-medida" className="flex flex-wrap items-center gap-2 text-label">
          Monte as suas regras
          <Selo variante="novo">Novo</Selo>
        </h3>
        <p className="text-body-sm text-ink-muted">
          {acabou
            ? `Seus ${DIAS_GRATIS} dias das Automações personalizadas acabaram em ${acabou}. As suas regras ficam guardadas e voltam quando você assinar.`
            : "As 5 prontas são grátis. Com as Automações personalizadas, você dispensa sozinho quem não tem o obrigatório, adianta quem combina e manda a mensagem certa em cada etapa, em todas as vagas."}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2">
        {estado.pode_experimentar ? (
          <BotaoExperimentar recurso="automacoes" acao="experimentar" tamanho="sm" />
        ) : estado.pode_assinar ? (
          <BotaoAssinar recurso="automacoes" tamanho="sm" variante="secundario" novo={false} />
        ) : estado.quer_continuar ? (
          <span className="text-body-sm text-cerrado-text">A gente fala com você em breve.</span>
        ) : estado.experimentou ? (
          <BotaoExperimentar recurso="automacoes" acao="continuar" tamanho="sm" />
        ) : null}
      </div>
    </section>
  );
}
