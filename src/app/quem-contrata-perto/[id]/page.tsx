import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlguemTeChamou } from "@/components/rota/alguem-te-chamou";
import { BotaoImprimir, ChecklistDaRota } from "@/components/rota/checklist-da-rota";
import { FolhaCurriculo } from "@/components/rota/folha-curriculo";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { SITE_URL } from "@/lib/config";
import { formatarNumero, primeiro } from "@/lib/formato";
import { deslocamentoProvavel } from "@/lib/deslocamento";
import { distanciaCurta, type RotaDoCurriculo } from "@/lib/rota-curriculo";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";
import { bairroDaReceita } from "@/lib/cnpj";

export const metadata: Metadata = { title: "Minhas cópias do currículo", robots: { index: false } };

// Uma rota do currículo (migração 20270605120000): na tela, o checklist ("Entreguei", quem abriu, desligar a página
// do QR); na impressão, a folha da rota (os endereços na ordem) e uma cópia do currículo por lugar, cada uma numa folha.

export default function PaginaDaRota({ params, searchParams }: PageProps<"/quem-contrata-perto/[id]">) {
  return (
    <Suspense
      fallback={
        <Container className="max-w-3xl py-8">
          <Esqueleto className="h-96 w-full rounded-lg" />
        </Container>
      }
    >
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: PageProps<"/quem-contrata-perto/[id]">["params"];
  searchParams: PageProps<"/quem-contrata-perto/[id]">["searchParams"];
}) {
  const { id } = await params;
  await exigirUsuario(`/quem-contrata-perto/${id}`);
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const banco = await criarClienteServidor();
  const { data } = await banco.rpc("minha_rota_curriculo", { p_rota: id });
  if (!data) notFound();
  const rota = data as unknown as RotaDoCurriculo;
  const acabou = primeiro(sp.imprimir) === "1";
  const site = SITE_URL.replace(/\/+$/, "");

  return (
    <div data-imprimir>
      <Container className="max-w-3xl py-8 print:hidden">
        <Link href="/quem-contrata-perto" className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" />
          Quem contrata perto
        </Link>
        <h1 className="mt-1 text-h2">
          {rota.funcao}: {rota.copias.length} {rota.copias.length === 1 ? "lugar" : "lugares"} a até{" "}
          {formatarNumero(rota.raio_km)} km
        </h1>
        {acabou && (
          <Aviso tipo="sucesso" titulo="Cópias prontas" className="mt-4">
            Imprima as cópias: sai primeiro a lista dos endereços, na ordem, e depois uma cópia do currículo para cada
            lugar. No celular, escolha “Salvar como PDF” e imprima numa copiadora.
          </Aviso>
        )}
        {(rota.perguntar || rota.chamou) && (
          <div className="mt-4">
            <AlguemTeChamou rota={rota.id} resposta={rota.chamou ?? null} />
          </div>
        )}
        <div className="mt-4">
          <BotaoImprimir />
        </div>
        <p className="mt-6 text-body-sm text-ink-muted">
          Marque “Entreguei” quando deixar o currículo. Quando alguém escanear o QR code de uma cópia, aparece aqui e no
          seu sino.
        </p>
        <div className="mt-3">
          <ChecklistDaRota copias={rota.copias} />
        </div>
      </Container>

      {/* a impressão: a folha da rota e as cópias, uma por folha */}
      <div className="hidden print:block">
        <section className="break-after-page text-[#1f1a14]">
          <h2 className="text-[22px] font-semibold">
            Onde entregar: {rota.funcao}, até {formatarNumero(rota.raio_km)} km de casa
          </h2>
          <ol className="mt-4 flex flex-col gap-2 text-[14px]">
            {rota.copias.map((c, i) => (
              <li key={c.codigo}>
                <strong>
                  {i + 1}. {c.nome}
                </strong>{" "}
                ({distanciaCurta(c.distancia_m)}
                {c.distancia_m != null && `, ${deslocamentoProvavel(c.distancia_m / 1000).texto}`}): {[c.endereco, c.bairro && bairroDaReceita(c.bairro), c.cidade].filter(Boolean).join(", ")}
              </li>
            ))}
          </ol>
        </section>
        {rota.copias.map((c) => (
          <div key={c.codigo} className="break-after-page">
            <FolhaCurriculo cv={rota.curriculo} para={c.nome} link={`${site}/cv/${c.codigo}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
