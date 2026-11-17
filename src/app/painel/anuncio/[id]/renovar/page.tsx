import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LinkVoltar } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { RenovarOuPreencher } from "@/components/painel/renovar-vaga";
import { SoComSupabase } from "@/components/so-com-supabase";
import { MODO_DEMO } from "@/lib/config";
import { formatarData } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Renovar a vaga" };

// Para onde levam os avisos do vencimento (migração 20270529120000; 15/11/2026, Marcelo: "Eles precisam receber
// notificações antes para lembrarem e no ato e depois de 7 dias para renovar"): a vaga, quando sai (ou saiu) do ar,
// "Renovar" em um toque e "Já preenchi", com o "Quem você contratou?".

export default function RenovarVaga({ params }: PageProps<"/painel/anuncio/[id]/renovar">) {
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
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/renovar`);
  const { data: a } = await (await criarClienteServidor())
    .from("anuncios")
    .select("id, titulo, tipo, status, expira_em, preenchida_em, prazo_dias, autor_id")
    .eq("id", id)
    .maybeSingle();
  if (!a || a.autor_id !== usuario.id || a.tipo !== "vaga") notFound();
  const agora = await agoraDaRequisicao();
  const venceu = a.status === "expirado" || Date.parse(a.expira_em) <= agora;
  const situacao = a.preenchida_em
    ? "Você marcou esta vaga como preenchida."
    : a.status === "removido"
      ? "Esta vaga foi removida pela moderação do Publike."
      : a.status === "em_analise"
        ? "Esta vaga está com a moderação do Publike."
        : a.status === "encerrado"
          ? "Esta vaga foi encerrada."
          : venceu
            ? `Saiu do ar em ${formatarData(a.expira_em)}: o prazo acabou.`
            : `Fica no ar até ${formatarData(a.expira_em)}.`;
  const podeRenovar = !a.preenchida_em && ["ativo", "pausado", "encerrado", "expirado"].includes(a.status);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <LinkVoltar href="/painel/anuncios?tipo=vaga">Suas vagas</LinkVoltar>
      <div className="flex flex-col gap-1">
        <h1 className="text-h2">{a.titulo}</h1>
        <p className="text-body text-ink-muted">{situacao}</p>
      </div>
      {podeRenovar ? (
        <RenovarOuPreencher
          id={a.id}
          prazoDias={a.prazo_dias ?? 30}
          noAr={a.status === "ativo" && !venceu}
        />
      ) : (
        <p className="text-body-sm text-ink-muted">Não há nada para renovar nesta vaga.</p>
      )}
    </div>
  );
}
