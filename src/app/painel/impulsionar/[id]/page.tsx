import { Rocket } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormAssinar } from "@/components/pagamentos/form-assinar";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { CancelarImpulso, ImpulsionarSemPagar } from "@/components/painel/impulso/acoes";
import { AjustesDoImpulso, type DiaDoAjuste } from "@/components/painel/impulso/ajustes";
import { NumerosDoImpulso, type DiaDoImpulso, type TotaisDoImpulso } from "@/components/painel/impulso/numeros";
import { PreviaDoAnuncio } from "@/components/painel/impulso/previa";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { formatarMoeda, primeiro } from "@/lib/formato";
import type { VagaDoImpulso } from "@/lib/impulso";
import { meuEnderecoDeCobranca, pagamentosDaConta } from "@/lib/servidor/faturas";
import { googleAdsLigado } from "@/lib/servidor/google-ads-api";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Impulsionar no Google", robots: { index: false } };

// O impulso da vaga (claude/plano-impulsionar-vaga.md; migração 20270423120000): a vaga anunciada no Google para quem
// está perto, por 7 ou 15 dias, com o relatório no fim. Tudo automático: pagou, o robô cria o anúncio; aprovou, os dias
// contam; acabou, chega o relatório. Dentro do Publike nada muda (regra de 24/10).

type Impulso = {
  id: string;
  situacao: "pago" | "em_revisao" | "no_ar" | "encerrado" | "credito" | "devolvido";
  origem: "compra" | "credito" | "cortesia" | "admin";
  dias: number;
  valor: number;
  verba: number;
  gasto: number;
  /** na campanha de várias vagas do cliente (pelo admin), quantas vagas dividem a verba */
  campanha_vagas?: number | null;
  motivo: string | null;
  criado_em: string;
  aprovado_em: string | null;
  ate: string | null;
  encerrado_em: string | null;
  pausar: boolean;
  totais: TotaisDoImpulso;
  por_dia: DiaDoImpulso[];
  /** o ajuste diário, em beta (migração 20270509120000; antes dela, não vem) */
  ajustes?: DiaDoAjuste[];
};

/** A verba que o cliente vê: a da vaga ou, na campanha de várias vagas dele, a de todas juntas. */
function rotuloDaVerba(i: Impulso) {
  return i.campanha_vagas && i.campanha_vagas > 1 ? `Verba das suas ${i.campanha_vagas} vagas no Google` : undefined;
}

type DoImpulso = {
  vaga: VagaDoImpulso & { status: string; preenchida: boolean };
  motivo: string | null;
  pode_pagar: boolean;
  precos: { dias: number; valor: number; verba: number }[];
  credito: number;
  cortesia: { dias: number } | null;
  raio: number | null;
  impulsos: Impulso[];
  compra_pendente: { id: string; situacao: string; dias: number; cobranca: string | null } | null;
  /** o ajuste diário ligado (migração 20270509120000) */
  ajuste_ligado?: boolean;
};

const VALENDO = new Set(["pago", "em_revisao", "no_ar"]);

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

export default function PaginaImpulsionar({ params, searchParams }: PageProps<"/painel/impulsionar/[id]">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: PageProps<"/painel/impulsionar/[id]">["params"];
  searchParams: PageProps<"/painel/impulsionar/[id]">["searchParams"];
}) {
  if (MODO_DEMO) return <SoComSupabase />;
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  await exigirUsuario(`/painel/impulsionar/${id}`);
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("impulso_da_vaga", { p_anuncio: id });
  const cabecalho = (
    <CabecalhoDaPagina
      voltar={{ href: `/painel/anuncio/${id}`, nome: "Vaga" }}
      titulo="Impulsionar no Google"
      selo={<Selo variante="novo">Novo</Selo>}
      descricao="Sua vaga anunciada no Google para quem procura emprego perto dela, por 7 ou 15 dias. No fim, você recebe quantos viram, clicaram e curtiram. Dentro do Publike nada muda: a vaga aparece para todos do mesmo jeito."
    />
  );
  if (error) {
    return (
      <div className="flex flex-col gap-6">
        {cabecalho}
        <Aviso tipo="info" titulo="O impulso ainda não está ligado">
          Logo você vai poder impulsionar a vaga por aqui.
        </Aviso>
      </div>
    );
  }
  const d = data as unknown as DoImpulso | null;
  if (!d) notFound();

  const valendo = d.impulsos.find((i) => VALENDO.has(i.situacao)) ?? null;
  const anteriores = d.impulsos.filter((i) => i !== valendo);
  const cartao = primeiro(sp.cartao);

  return (
    <div className="flex flex-col gap-6">
      {cabecalho}
      {cartao === "ok" && !valendo && (
        <Aviso tipo="sucesso" titulo="Cartão recebido">
          Assim que o pagamento for confirmado, o anúncio vai para o Google sozinho. Pode levar alguns minutos.
        </Aviso>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="flex min-w-0 flex-col gap-6">
          {valendo ? (
            <ImpulsoValendo i={valendo} ajuste={Boolean(d.ajuste_ligado)} />
          ) : d.compra_pendente ? (
            <Aviso tipo="info" titulo="Esperando o pagamento">
              <span className="flex flex-col items-start gap-2">
                <span>
                  O impulso de {d.compra_pendente.dias} dias começa assim que o pagamento for confirmado.
                </span>
                {d.compra_pendente.cobranca && (
                  <BotaoLink href={`/painel/faturas/${d.compra_pendente.cobranca}?pix=1`} tamanho="sm">
                    Ver o Pix
                  </BotaoLink>
                )}
              </span>
            </Aviso>
          ) : (
            <Oferta d={d} />
          )}
          {anteriores.length > 0 && (
            <section aria-labelledby="anteriores" className="flex flex-col gap-3">
              <h3 id="anteriores" className="text-h3">
                Impulsos anteriores
              </h3>
              <ul className="flex flex-col gap-4">
                {anteriores.map((i) => (
                  <li key={i.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
                    <p className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-label">
                        {i.dias} dias · {dataCurta(i.criado_em)}
                        {i.encerrado_em ? ` a ${dataCurta(i.encerrado_em)}` : ""}
                      </span>
                      <SeloDaSituacao i={i} />
                    </p>
                    {i.motivo && i.situacao !== "encerrado" && <p className="text-body-sm text-ink-muted">{i.motivo}</p>}
                    {i.aprovado_em && (
                      <NumerosDoImpulso
                        totais={i.totais}
                        porDia={i.por_dia}
                        verba={i.verba}
                        gasto={i.gasto}
                        rotuloDaVerba={rotuloDaVerba(i)}
                      />
                    )}
                    <AjustesDoImpulso ajustes={i.ajustes ?? []} noAr={false} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="flex flex-col gap-6 xl:sticky xl:top-24">
          <section aria-labelledby="previa" className="flex flex-col gap-3">
            <h3 id="previa" className="text-h3">
              Como o anúncio sai
            </h3>
            <PreviaDoAnuncio vaga={d.vaga} raio={d.raio} />
          </section>
          <section aria-labelledby="como" className="flex flex-col gap-3">
            <h3 id="como" className="text-h3">
              Como funciona
            </h3>
            <ol className="flex flex-col gap-2.5 text-body-sm">
              {[
                "Você escolhe 7 ou 15 dias e paga no Pix ou no cartão.",
                "O Publike cria o anúncio no Google, com a função, o salário e o bairro da vaga.",
                "O Google revisa em até 1 dia útil. Aprovou, os dias começam a contar.",
                "Quem pesquisa a função perto da vaga vê o anúncio e abre a vaga no Publike.",
                ...(d.ajuste_ligado
                  ? ["Toda manhã, o ajuste diário (beta) acerta a verba, o lance, as buscas e o raio pelos números do dia anterior."]
                  : []),
                "No fim, chega o relatório: quantos viram, clicaram e curtiram.",
              ].map((passo, n) => (
                <li key={passo} className="flex gap-3">
                  <span
                    aria-hidden
                    className="grid size-6 shrink-0 place-items-center rounded-pill bg-surface-300 text-caption font-bold"
                  >
                    {n + 1}
                  </span>
                  <span className="pt-0.5">{passo}</span>
                </li>
              ))}
            </ol>
            <p className="text-body-sm text-ink-muted">
              O anúncio aparece só pelo lugar e pelo que a pessoa pesquisou, nunca por idade ou sexo. Se a vaga fechar
              antes do fim, o anúncio para sozinho e os dias que faltam viram crédito para outra vaga, por 90 dias.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SeloDaSituacao({ i }: { i: Impulso }) {
  const [variante, nome] =
    i.situacao === "no_ar"
      ? (["match", "No ar no Google"] as const)
      : i.situacao === "em_revisao"
        ? (["aviso", "Em revisão no Google"] as const)
        : i.situacao === "pago"
          ? (["aviso", "Indo para o Google"] as const)
          : i.situacao === "encerrado"
            ? (["contorno", "Terminou"] as const)
            : i.situacao === "credito"
              ? (["contorno", "Virou crédito"] as const)
              : (["contorno", "Cancelado"] as const);
  return <Selo variante={variante}>{nome}</Selo>;
}

function ImpulsoValendo({ i, ajuste }: { i: Impulso; ajuste: boolean }) {
  const texto =
    i.situacao === "no_ar" && i.ate
      ? `A vaga aparece no Google para quem procura perto até ${dataCurta(i.ate)}. Os números do dia chegam na manhã seguinte.`
      : i.situacao === "em_revisao"
        ? "O anúncio já está no Google, esperando a revisão, que leva até 1 dia útil. Os dias começam a contar quando for aprovado."
        : "O anúncio está sendo criado no Google. Leva alguns minutos.";
  return (
    <section
      aria-labelledby="valendo"
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id="valendo" className="flex flex-wrap items-center gap-2 text-h3">
            <Rocket aria-hidden className="size-5 text-terra-text" />
            Impulso de {i.dias} dias
          </h3>
          <p className="max-w-2xl text-body-sm text-ink-muted">{texto}</p>
        </div>
        <SeloDaSituacao i={i} />
      </div>
      {i.situacao === "no_ar" ? (
        <>
          <NumerosDoImpulso
            totais={i.totais}
            porDia={i.por_dia}
            verba={i.verba}
            gasto={i.gasto}
            rotuloDaVerba={rotuloDaVerba(i)}
          />
          {(ajuste || (i.ajustes?.length ?? 0) > 0) && <AjustesDoImpulso ajustes={i.ajustes ?? []} noAr />}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-body-sm text-ink-muted">
            Ainda dá para desistir:{" "}
            {i.origem === "compra"
              ? `os ${formatarMoeda(i.valor)} voltam para você.`
              : i.origem === "credito"
                ? "os dias voltam como crédito."
                : i.origem === "admin"
                  ? "este impulso é cortesia do Publike, sem custo para você."
                  : "o impulso grátis fica disponível de novo."}
          </p>
          <div>
            <CancelarImpulso id={i.id} origem={i.origem} />
          </div>
        </div>
      )}
    </section>
  );
}

async function Oferta({ d }: { d: DoImpulso }) {
  if (d.motivo) {
    return (
      <Aviso tipo="info" titulo="Esta vaga não pode ser impulsionada agora">
        {d.motivo}
      </Aviso>
    );
  }
  if (!googleAdsLigado() || (d.precos.length === 0 && !d.cortesia && d.credito === 0)) {
    return (
      <Aviso tipo="info" titulo="O impulso chega em breve">
        Assim que estiver à venda, você impulsiona a vaga por aqui.
      </Aviso>
    );
  }
  return (
    <section aria-labelledby="impulsionar" className="flex flex-col gap-5">
      <h3 id="impulsionar" className="text-h3">
        Impulsionar “{d.vaga.titulo}”
      </h3>
      {d.cortesia && (
        <div className="flex flex-col gap-3 rounded-lg border border-cerrado-text/40 bg-cerrado/10 p-4 sm:p-5">
          <p className="text-body">
            <strong>O primeiro é por nossa conta.</strong> Sua vaga está sem candidatos há alguns dias: impulsione por{" "}
            {d.cortesia.dias} dias sem pagar nada e veja como funciona.
          </p>
          <ImpulsionarSemPagar anuncio={d.vaga.id} jeito="cortesia" dias={d.cortesia.dias} />
        </div>
      )}
      {d.credito > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
          <p className="text-body">
            Você tem <strong>{d.credito} {d.credito === 1 ? "dia" : "dias"} de crédito</strong>, de um impulso que
            parou porque a vaga fechou.
          </p>
          <ImpulsionarSemPagar anuncio={d.vaga.id} jeito="credito" dias={d.credito} />
        </div>
      )}
      {d.precos.length > 0 &&
        (d.pode_pagar ? <FormularioDoImpulso d={d} /> : (
          <Aviso tipo="info" titulo="Os pagamentos ainda não estão abertos para a sua conta">
            Logo você vai poder pagar o impulso por aqui.
          </Aviso>
        ))}
    </section>
  );
}

async function FormularioDoImpulso({ d }: { d: DoImpulso }) {
  const [pag, perfil, cobranca] = await Promise.all([
    pagamentosDaConta(),
    obterMeuPerfil().catch(() => null),
    meuEnderecoDeCobranca(),
  ]);
  return (
    <div className="max-w-3xl">
      <FormAssinar
        recurso="completo"
        planos={[]}
        primeiro={null}
        modo={{ tipo: "impulso", anuncio: d.vaga.id, opcoes: d.precos }}
        inicial={{
          documento: pag?.cliente?.cpf_cnpj ?? perfil?.cnpj ?? "",
          nome: pag?.cliente?.nome ?? perfil?.nome ?? "",
          email: pag?.cliente?.email ?? perfil?.email ?? "",
          telefone: cobranca?.telefone ?? perfil?.whatsapp ?? "",
          endereco: cobranca?.endereco ?? null,
        }}
      />
    </div>
  );
}
