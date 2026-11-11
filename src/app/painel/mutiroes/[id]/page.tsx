import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CancelarMutirao } from "@/components/mutirao/cancelar";
import { ChamarParaMutirao } from "@/components/mutirao/chamar";
import { DiaDoMutirao } from "@/components/mutirao/dia";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { diaDoMutirao as nomeDoDia, horaCurta } from "@/lib/mutirao";
import { diaBr } from "@/lib/pagamentos";
import { diaDoMutirao, meusMutiroes } from "@/lib/servidor/mutirao";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Mutirão", robots: { index: false } };

// Um mutirão (migração 20270417120000): o resumo, chamar quem curtiu as vagas e o dia, por horário, com Chegou e
// Faltou. Funciona no celular, na recepção, e imprime a lista.

export default function PaginaMutirao({ params }: PageProps<"/painel/mutiroes/[id]">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/painel/mutiroes/[id]">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { id } = await params;
  await exigirUsuario(`/painel/mutiroes/${id}`);
  const [lista, dia, agora] = await Promise.all([meusMutiroes(), diaDoMutirao(id), agoraDaRequisicao()]);
  const m = lista?.find((x) => x.id === id);
  if (!m || !dia) notFound();
  const passou = m.dia < diaBr(new Date(agora));
  const aberto = m.situacao === "aberto" && !passou;
  const livres = dia.horarios.reduce((t, h) => t + Math.max(0, h.lugares - h.ocupados), 0);

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina
        voltar={{ href: "/painel/mutiroes", nome: "Mutirão de contratação" }}
        titulo={`Mutirão: ${nomeDoDia(m.dia)}, das ${horaCurta(m.inicio)} às ${horaCurta(m.fim)}`}
        descricao={
          <>
            <p className="flex items-center gap-1.5">
              <MapPin aria-hidden className="size-4 shrink-0" />
              {m.local}
            </p>
            <p className="text-body-sm">
              {m.vagas.map((v) => v.titulo).join(", ")} · uma entrevista a cada {m.intervalo} minutos,{" "}
              {m.por_horario === 1 ? "1 pessoa" : `${m.por_horario} pessoas`} por horário
              {m.trazer ? ` · trazer: ${m.trazer}` : ""}
            </p>
          </>
        }
      />

      {m.situacao === "cancelado" && <Aviso tipo="info" titulo="Este mutirão foi cancelado" />}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        {[
          ["Chamados", m.resumo.chamados],
          ["Com horário", m.resumo.escolheram],
          ["Vieram", m.resumo.vieram],
          ["Contratados", m.resumo.contratados],
        ].map(([rotulo, n]) => (
          <div key={rotulo} className="flex flex-col gap-0.5 bg-surface-200 p-4">
            <dt className="text-body-sm text-ink-muted">{rotulo}</dt>
            <dd className="text-h2 tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>

      {aberto && (
        <section aria-labelledby="chamar" className="flex flex-col gap-3 print:hidden">
          <div>
            <h3 id="chamar" className="text-h3">
              Chamar
            </h3>
            <p className="mt-1 text-body-sm text-ink-muted">
              Quem curtiu as vagas do mutirão. Ainda há {livres === 1 ? "1 lugar" : `${livres} lugares`} no dia.
            </p>
          </div>
          <ChamarParaMutirao mutirao={m.id} pessoas={dia.para_chamar} />
        </section>
      )}

      <section aria-labelledby="o-dia" className="flex flex-col gap-3">
        <h3 id="o-dia" className="text-h3">
          O dia
        </h3>
        <DiaDoMutirao pessoas={dia.pessoas} />
      </section>

      {aberto && <CancelarMutirao id={m.id} />}
    </div>
  );
}
