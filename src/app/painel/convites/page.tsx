import type { Metadata } from "next";
import { Suspense } from "react";
import { ConviteDaVaga, type VagaComConvite } from "@/components/convite-automatico/vaga";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Convite automático", robots: { index: false } };

// Atrair › Convite automático (migração 20270418120000; claude/plano-convite-automatico-30-dias-e-anual.md,
// parte 4): as vagas no ar, cada uma com o liga e desliga e o recado. O aviso de quem combina continua grátis.

export default function PaginaConviteAutomatico() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/convites");
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("meus_convites_automaticos");
  const d = (data ?? null) as { liberado: boolean; vagas: VagaComConvite[] } | null;

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina
        titulo="Convite automático"
        descricao="Quando chega um currículo que combina com uma vaga (70% ou mais, na mesma área), o convite vai na hora, com o seu recado. É o convite de sempre: sem o seu contato, e a pessoa decide se curte a vaga."
      />
      {error || !d ? (
        <Aviso tipo="info" titulo="O convite automático ainda não está ligado">
          Logo você vai poder usar por aqui.
        </Aviso>
      ) : (
        <>
          {!d.liberado && (
            <Aviso tipo="info" titulo="O convite automático vem nos planos">
              <span className="flex flex-col items-start gap-2">
                <span>
                  Sem plano, você continua recebendo de graça o aviso de quem combina (até 3 por dia) e convida com um
                  toque em Talentos.
                </span>
                <BotaoLink href="/painel/planos" tamanho="sm">
                  Ver os planos
                </BotaoLink>
              </span>
            </Aviso>
          )}
          {d.vagas.length === 0 ? (
            <p className="text-body text-ink-muted">Você não tem vaga no ar agora.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
              {d.vagas.map((v) => (
                <ConviteDaVaga key={v.id} v={v} liberado={d.liberado} />
              ))}
            </ul>
          )}
          <section aria-labelledby="regras-convite" className="flex flex-col gap-2 border-t border-line pt-5">
            <h3 id="regras-convite" className="text-label">
              Para não incomodar quem procura
            </h3>
            <ul className="grid gap-x-8 gap-y-2 text-body-sm text-ink-muted md:grid-cols-2">
              <li>Cada pessoa recebe no máximo 2 convites automáticos por semana, somando todas as empresas.</li>
              <li>Só quem deixou o currículo visível, na região da vaga, e não curtiu nem foi convidado.</li>
              <li>Os automáticos contam no limite de convites do dia da sua conta.</li>
              <li>Quem não quer, desliga em Preferências.</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
