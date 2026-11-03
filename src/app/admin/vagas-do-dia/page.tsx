import { CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Filtros, linkCom, Secao } from "@/components/admin/ui";
import { CarrosselDoInstagram } from "@/components/instagram/carrossel";
import { Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { primeiro } from "@/lib/formato";
import { urlDosEmails } from "@/lib/servidor/ambiente";
import { vagasEscolhidas, vagasNovasNoAr } from "@/lib/servidor/vagas-do-dia";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";
import {
  diaPorExtenso,
  lerIdsDoDia,
  linkDaBio,
  linkDoFimDosStories,
  linkDoStory,
  ordenarVagasDoDia,
  PERIODOS_DO_DIA,
  VAGAS_MARCADAS,
} from "@/lib/vagas-do-dia";

export const metadata: Metadata = { title: "Vagas do dia" };

const BASE = "/admin/vagas-do-dia";

export default function PaginaVagasDoDia({ searchParams }: PageProps<"/admin/vagas-do-dia">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/vagas-do-dia">["searchParams"] }) {
  const c = await exigirAdminLocal();
  const sp = await searchParams;
  const periodo = PERIODOS_DO_DIA.find((p) => p.valor === primeiro(sp.periodo)) ?? PERIODOS_DO_DIA[0];
  const agora = await agoraDaRequisicao();
  const agoraIso = new Date(agora).toISOString();
  const desde = new Date(agora - periodo.horas * 3600 * 1000).toISOString();
  const novas = ordenarVagasDoDia(await vagasNovasNoAr(c, desde, agoraIso));
  // as escolhidas no endereço (?v=) que são de antes do período continuam na lista
  const pedidas = lerIdsDoDia(primeiro(sp.v));
  const deAntes = pedidas.filter((id) => !novas.some((v) => v.id === id));
  const candidatas = [...novas, ...(deAntes.length ? await vagasEscolhidas(c, deAntes, agoraIso) : [])];
  const iniciais = pedidas.length
    ? pedidas.filter((id) => candidatas.some((v) => v.id === id))
    : novas.slice(0, VAGAS_MARCADAS).map((v) => v.id);
  const outrosPeriodos = PERIODOS_DO_DIA.filter((p) => p.horas > periodo.horas);
  const site = urlDosEmails() ?? "https://publike.org";
  const [antes, depois] = linkDoStory(site, "@").split("@");

  return (
    <Secao
      titulo="Vagas do dia"
      descricao={
        <>
          O post do Instagram de cada dia, feito pelo site com as vagas novas no ar: o carrossel do feed, um story por
          vaga e a legenda. Escolha e ponha na ordem; as imagens mudam junto. Vaga de pessoa física sai sem o nome de
          quem publicou.
        </>
      }
    >
      <Filtros
        rotulo="Publicadas nas"
        opcoes={PERIODOS_DO_DIA.map((p) => ({ valor: p.valor, nome: p.nome }))}
        atual={periodo.valor}
        link={(v) => linkCom(BASE, {}, { periodo: v === "24h" ? null : v })}
      />
      {candidatas.length === 0 ? (
        <Vazio
          icone={CalendarClock}
          titulo={`Nenhuma vaga nova ${periodo.valor === "24h" ? "nas últimas 24 horas" : `em ${periodo.nome}`}`}
          acao={
            outrosPeriodos.length > 0 ? (
              <BotaoLink href={linkCom(BASE, {}, { periodo: outrosPeriodos[0].valor })} scroll={false}>
                Ver as de {outrosPeriodos[0].nome}
              </BotaoLink>
            ) : undefined
          }
        >
          Só entram vagas no ar: ativas, sem “vaga preenchida” e dentro do prazo.
        </Vazio>
      ) : (
        <CarrosselDoInstagram
          candidatas={candidatas}
          iniciais={iniciais}
          dia={diaPorExtenso(agora)}
          agora={agora}
          rotas={{ imagens: `${BASE}/imagem`, baixar: `${BASE}/baixar` }}
          links={{ bio: linkDaBio(site), story: [antes!, depois!], fimDosStories: linkDoFimDosStories(site) }}
          ajudaDaBio="Basta pôr uma vez. Quem criar a conta por ele aparece em Admin › Campanhas como instagram:bio; pelos stories, como instagram:stories."
        />
      )}
    </Secao>
  );
}
