import {
  CalendarCheck,
  CircleCheckBig,
  Hourglass,
  ListFilter,
  MailCheck,
  MessageSquareText,
  Reply,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditorAutomacoes } from "@/components/automacoes/editor-automacoes";
import { CabecalhoDaVaga } from "@/components/painel/cabecalho-da-vaga";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo } from "@/components/ui/basicos";
import { textoDoFeito, type RegraFeita } from "@/lib/automacoes";
import { MODO_DEMO } from "@/lib/config";
import { obterAnuncio, obterMeuPerfil } from "@/lib/dados";
import { formatarLugar, tempoRelativo } from "@/lib/formato";
import type { FormatoEntrevista } from "@/lib/recrutamento";
import { automacoesDaVaga } from "@/lib/servidor/automacoes";
import { dailyConfigurado } from "@/lib/servidor/daily";
import { etapasProprias } from "@/lib/servidor/etapas-proprias";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Automações da vaga" };

// As regras da vaga, pelo momento do processo, e o registro do que fizeram (migrações 20270109120000 e
// 20270111120000).

const ICONE_DA_REGRA: Record<RegraFeita, LucideIcon> = {
  recado: MailCheck,
  dispensar: ListFilter,
  triagem: Sparkles,
  mensagem: MessageSquareText,
  horarios: CalendarCheck,
  parado: Hourglass,
  encerrar: Reply,
  preenchida: CircleCheckBig,
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
  const [regras, proprias, perfil, { data: modelos }, agora] = await Promise.all([
    automacoesDaVaga(id),
    etapasProprias(),
    obterMeuPerfil(),
    supabase.from("modelos_mensagem").select("id, nome").order("criado_em"),
    agoraDaRequisicao(),
  ]);
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
        <EditorAutomacoes
          anuncioId={id}
          inicial={regras}
          modelos={modelos ?? []}
          etapasProprias={proprias ?? []}
          formatos={formatos}
          endereco={endereco}
          vaga={anuncio.titulo}
          empresa={perfil?.nome ?? anuncio.autor_nome}
        />
      </div>

      <section aria-labelledby="registro" className="flex max-w-3xl flex-col gap-3">
        <h3 id="registro" className="text-h3">
          O que as automações fizeram
        </h3>
        {regras.registro.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-4 text-body-sm text-ink-muted">
            Nada ainda. Quando uma regra agir, aparece aqui quem foi e o que aconteceu.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
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
