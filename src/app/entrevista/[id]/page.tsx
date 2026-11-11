import { CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { SalaDaEntrevista } from "@/components/video/sala-da-entrevista";
import type { ParaEntrar } from "@/lib/acoes/entrevista-ao-vivo";
import { MODO_DEMO } from "@/lib/config";
import { dataDaEntrevista } from "@/lib/recrutamento";
import { dailyConfigurado } from "@/lib/servidor/daily";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Entrevista", robots: { index: false } };

// A entrevista ao vivo pelo Publike (migração 20270106120000): só o candidato e a conta da vaga entram, de 15
// minutos antes até 2 horas depois. A chamada é a da Daily, num quadro dentro da página.

export default function PaginaEntrevista({ params }: PageProps<"/entrevista/[id]">) {
  return (
    <Container className="max-w-4xl py-6">
      <Suspense fallback={<Esqueleto className="h-96 w-full rounded-lg" />}>
        <Conteudo params={params} />
      </Suspense>
    </Container>
  );
}

function hora(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

async function Conteudo({ params }: { params: PageProps<"/entrevista/[id]">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  await exigirUsuario(`/entrevista/${id}`);
  const { data, error } = await (await criarClienteServidor()).rpc("entrevista_para_entrar", { p_id: id });
  if (error || !data) notFound();
  const e = data as unknown as ParaEntrar;
  const agora = await agoraDaRequisicao();
  const comQuem = e.papel === "empresa" ? e.candidato : e.empresa;
  const voltar = e.papel === "empresa" ? `/painel/anuncio/${e.anuncio_id}/quadro` : `/anuncio/${e.anuncio_id}`;
  const aberta = ["marcada", "confirmada", "remarcar"].includes(e.situacao);
  const antes = agora < new Date(e.abre_em).getTime();
  const depois = agora > new Date(e.fecha_em).getTime();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-body-sm text-ink-muted">{e.vaga}</p>
        <h1 className="mt-1 text-h2">Entrevista com {comQuem}</h1>
        <p className="mt-1 inline-flex items-center gap-1.5 text-body text-ink-muted">
          <CalendarClock aria-hidden className="size-4" />
          {dataDaEntrevista(e.quando)}
        </p>
      </div>
      {e.formato !== "publike" ? (
        <Aviso tipo="info" titulo="Esta entrevista não é pelo Publike">
          Veja como ela vai ser na{" "}
          <Link href={voltar} className="text-label underline">
            {e.papel === "empresa" ? "ficha do candidato" : "página da vaga"}
          </Link>
          .
        </Aviso>
      ) : !aberta ? (
        <Aviso tipo="alerta" titulo="Esta entrevista não está mais marcada">
          <Link href={voltar} className="text-label underline">
            Voltar
          </Link>
        </Aviso>
      ) : !dailyConfigurado() ? (
        <Aviso tipo="alerta" titulo="A chamada de vídeo não está disponível agora">
          Tente de novo em instantes.
        </Aviso>
      ) : depois ? (
        <Aviso tipo="info" titulo="A entrevista já passou">
          <Link href={voltar} className="text-label underline">
            Voltar
          </Link>
        </Aviso>
      ) : antes ? (
        <Aviso tipo="info" titulo={`A sala abre às ${hora(e.abre_em)}`}>
          Volte até 10 minutos antes do horário: a sala abre nessa hora e fecha 15 minutos depois do fim marcado. Use o celular ou o computador, com a câmera e o microfone liberados.
        </Aviso>
      ) : (
        <SalaDaEntrevista id={e.id} />
      )}
    </div>
  );
}
