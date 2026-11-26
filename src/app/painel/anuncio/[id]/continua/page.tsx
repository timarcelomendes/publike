import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LinkVoltar } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { RenovarOuPreencher } from "@/components/painel/renovar-vaga";
import { SoComSupabase } from "@/components/so-com-supabase";
import { MODO_DEMO } from "@/lib/config";
import { plural, tempoRelativo } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "A vaga ainda está aberta?" };

// Para onde leva a pergunta "Sua vaga ainda está aberta?" (migração 20271003120000; 25/11/2026, Marcelo: "Vagas
// antigas e com várias curtidas, ter uma maneira de questionar a empresa"): "Sim, continua aberta" em um toque, ou
// "Já preenchi", com o "Quem você contratou?". Quem perguntou recebe a resposta.

export default function VagaContinua({ params }: PageProps<"/painel/anuncio/[id]/continua">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      {params.then(({ id }) => (
        <Conteudo id={id} />
      ))}
    </Suspense>
  );
}

const DIA = 24 * 3600 * 1000;

async function Conteudo({ id }: { id: string }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/continua`);
  const supabase = await criarClienteServidor();
  const [{ data: a }, { data: situacao }] = await Promise.all([
    supabase
      .from("anuncios")
      .select("id, titulo, tipo, status, criado_em, expira_em, preenchida_em, prazo_dias, autor_id")
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("situacao_da_vaga_continua", { p_anuncio: id }),
  ]);
  if (!a || a.autor_id !== usuario.id || a.tipo !== "vaga") notFound();
  const agora = await agoraDaRequisicao();
  const s = (situacao ?? null) as {
    curtidas?: number;
    pedidos?: number;
    confirmada_em?: string | null;
  } | null;
  const noAr = a.status === "ativo" && Date.parse(a.expira_em) > agora;
  const dias = Math.max(1, Math.round((agora - Date.parse(a.criado_em)) / DIA));
  const curtidas = Number(s?.curtidas ?? 0);
  const pedidos = Number(s?.pedidos ?? 0);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <LinkVoltar href="/painel/anuncios?tipo=vaga">Suas vagas</LinkVoltar>
      <div className="flex flex-col gap-1">
        <h1 className="text-h2">{a.titulo}</h1>
        {a.preenchida_em ? (
          <p className="text-body text-ink-muted">Você marcou esta vaga como preenchida.</p>
        ) : !noAr ? (
          <p className="text-body text-ink-muted">
            Esta vaga saiu do ar.{" "}
            <Link href={`/painel/anuncio/${a.id}/renovar`} className="underline underline-offset-2">
              Renovar a vaga
            </Link>
          </p>
        ) : (
          <p className="text-body text-ink-muted">
            No ar há {plural(dias, "dia", "dias")}
            {curtidas > 0 ? `, com ${plural(curtidas, "candidatura", "candidaturas")}` : ""}.
            {pedidos > 0 &&
              ` ${pedidos === 1 ? "Uma pessoa perguntou" : `${pedidos} pessoas perguntaram`} se a vaga continua aberta.`}{" "}
            Quem procura trabalho vê no cartão da vaga quando você confirma.
            {s?.confirmada_em && ` Você confirmou ${tempoRelativo(s.confirmada_em, agora)}.`}
          </p>
        )}
      </div>
      {noAr && !a.preenchida_em && <RenovarOuPreencher id={a.id} prazoDias={a.prazo_dias ?? 30} noAr continua />}
    </div>
  );
}
