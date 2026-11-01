import { CalendarClock, Columns3 } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EditorEtapas, EditorHorarios } from "@/components/etapas/editores";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { etapasProprias, horariosLivres } from "@/lib/servidor/etapas-proprias";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Etapas e horários" };

// As etapas próprias do quadro e os horários livres para entrevista (migração 20270108120000).

export default function EtapasEHorarios() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/painel/etapas");
  const [perfil, etapas, faixas] = await Promise.all([obterMeuPerfil(), etapasProprias(), horariosLivres()]);
  if (!perfil || perfil.tipo === "pessoa") {
    return <Aviso tipo="info" titulo="Etapas e horários são para quem contrata" />;
  }
  if (!etapas || !faixas) {
    return (
      <Aviso tipo="alerta" titulo="Ainda não disponível">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  const administra = usuario.papel === "dono" || usuario.papel === "admin";
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-h2">
          Etapas e horários
          <Selo variante="novo">Novo</Selo>
        </h2>
        <p className="mt-1 text-body text-ink-muted">O jeito da sua empresa de contratar, em todas as vagas.</p>
      </div>
      <section
        aria-labelledby="etapas"
        className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5"
      >
        <h3 id="etapas" className="flex items-center gap-2 text-h3">
          <Columns3 aria-hidden className="size-5 text-ink-muted" />
          Etapas do quadro
        </h3>
        <p className="text-body-sm text-ink-muted">
          Crie etapas suas, como “Entrevista RH”, “Teste técnico” ou “Proposta”. Cada uma vira uma coluna no quadro,
          logo depois da etapa que você escolher. O candidato continua vendo a etapa de sempre.
        </p>
        {administra ? (
          <EditorEtapas inicial={etapas} />
        ) : (
          <p className="text-body-sm">Só quem administra a conta muda as etapas.</p>
        )}
      </section>
      <section
        aria-labelledby="horarios"
        className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5"
      >
        <h3 id="horarios" className="flex items-center gap-2 text-h3">
          <CalendarClock aria-hidden className="size-5 text-ink-muted" />
          Horários livres para entrevista
        </h3>
        <p className="text-body-sm text-ink-muted">
          Quando você deixar o candidato escolher o horário, “Usar meus horários livres” preenche os próximos horários
          vagos daqui, sem os que já estão marcados.
        </p>
        <EditorHorarios inicial={faixas} />
      </section>
    </div>
  );
}
