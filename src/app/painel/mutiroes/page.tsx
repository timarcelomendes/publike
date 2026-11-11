import { CalendarDays, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FormCriarMutirao } from "@/components/mutirao/form-criar";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { diaDoMutirao, horaCurta, type Mutirao } from "@/lib/mutirao";
import { diaBr } from "@/lib/pagamentos";
import { meusMutiroes, minhasVagasNoAr, situacaoDoMutirao } from "@/lib/servidor/mutirao";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Mutirão de contratação", robots: { index: false } };

// O mutirão de contratação (migração 20270417120000; claude/plano-convite-automatico-30-dias-e-anual.md, parte 3):
// os mutirões da conta, com o resumo, e o criar. Só com plano; o primeiro é grátis para experimentar.

export default function PaginaMutiroes() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/mutiroes");
  const [situacao, mutiroes, vagas, agora] = await Promise.all([
    situacaoDoMutirao(),
    meusMutiroes(),
    minhasVagasNoAr(),
    agoraDaRequisicao(),
  ]);
  const hoje = diaBr(new Date(agora));
  const proximos = (mutiroes ?? []).filter((m) => m.dia >= hoje && m.situacao === "aberto");
  const antigos = (mutiroes ?? []).filter((m) => !(m.dia >= hoje && m.situacao === "aberto"));

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina
        titulo="Mutirão de contratação"
        descricao="Um dia de entrevistas em sequência, para contratar várias pessoas de uma vez. Você chama quem curtiu as vagas, cada pessoa escolhe um horário com lugar e recebe o lembrete na véspera. No dia, marque quem chegou."
      />

      {!situacao || mutiroes === null ? (
        <Aviso tipo="info" titulo="O mutirão ainda não está ligado">
          Logo você vai poder criar por aqui.
        </Aviso>
      ) : !situacao.pode ? (
        <Aviso tipo="info" titulo="O mutirão é para quem contrata" />
      ) : (
        <>
          {proximos.length > 0 && <Lista titulo="Próximos" mutiroes={proximos} />}
          {/* o formulário numa coluna de ler bem; as listas usam a largura toda */}
          <section aria-labelledby="criar" className="flex max-w-3xl flex-col gap-3">
            <h3 id="criar" className="text-h3">
              Criar um mutirão
            </h3>
            {situacao.liberado ? (
              <>
                {!situacao.plano && situacao.primeiro && (
                  <p className="text-body-sm text-ink-muted">
                    O primeiro é grátis, para experimentar. Depois, o mutirão vem nos planos.
                  </p>
                )}
                <FormCriarMutirao vagas={vagas} hoje={hoje} enderecoPadrao="" />
              </>
            ) : (
              <Aviso tipo="info" titulo="O mutirão vem nos planos">
                <span className="flex flex-col items-start gap-2">
                  <span>
                    O seu primeiro mutirão foi grátis. Para criar outro, escolha um plano: por mês, por ano ou só por 30
                    dias, sem renovar.
                  </span>
                  <BotaoLink href="/painel/planos" tamanho="sm">
                    Ver os planos
                  </BotaoLink>
                </span>
              </Aviso>
            )}
          </section>
          {antigos.length > 0 && <Lista titulo="Anteriores" mutiroes={antigos} />}
        </>
      )}
    </div>
  );
}

function Lista({ titulo, mutiroes }: { titulo: string; mutiroes: Mutirao[] }) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-3">
      <h3 className="text-h3">{titulo}</h3>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
        {mutiroes.map((m) => (
          <li key={m.id} className="flex flex-col gap-2 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <Link href={`/painel/mutiroes/${m.id}`} className="text-label hover:underline">
                <CalendarDays aria-hidden className="mr-1.5 inline size-4 align-[-2px] text-ink-muted" />
                {diaDoMutirao(m.dia)}, das {horaCurta(m.inicio)} às {horaCurta(m.fim)}
              </Link>
              {m.situacao === "cancelado" && <Selo variante="contorno">Cancelado</Selo>}
            </div>
            <p className="text-body-sm text-ink-muted">{m.vagas.map((v) => v.titulo).join(", ")}</p>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm">
              <span className="flex items-center gap-1.5">
                <Users aria-hidden className="size-4 text-ink-muted" />
                {m.resumo.chamados} chamados
              </span>
              <span>{m.resumo.escolheram} com horário</span>
              <span>{m.resumo.vieram} vieram</span>
              <span>{m.resumo.contratados} contratados</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
