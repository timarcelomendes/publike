import { Megaphone, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FolhaCurriculo } from "@/components/rota/folha-curriculo";
import { Container, Esqueleto } from "@/components/ui/basicos";
import { classesBotao } from "@/components/ui/botao";
import { linkWhatsApp } from "@/lib/formato";
import type { CurriculoImpresso } from "@/lib/rota-curriculo";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Currículo", robots: { index: false, follow: false } };

// A página do QR code da cópia do currículo (claude/plano-base-de-empresas-da-receita.md, parte 2; migração
// 20270605120000): o dono do comércio vê o currículo como está no papel, chama no WhatsApp e, se precisa de mais gente,
// publica a vaga grátis. A abertura conta para a pessoa (o robô que gera a prévia do link não conta).

const ROBO = /bot|crawl|spider|preview|whatsapp|facebookexternalhit|telegram|slack|discord|curl|wget/i;

export default function CopiaDoCurriculo({ params }: PageProps<"/cv/[codigo]">) {
  return (
    <Container className="max-w-3xl py-6 sm:py-10">
      <Suspense fallback={<Esqueleto className="h-[40rem] w-full rounded-lg" />}>
        <Conteudo params={params} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ params }: { params: PageProps<"/cv/[codigo]">["params"] }) {
  const { codigo } = await params;
  if (!/^[a-z0-9]{10}$/.test(codigo)) notFound();
  const agente = (await headers()).get("user-agent") ?? "";
  const banco = await criarClienteServidor();
  const { data } = await banco.rpc("abrir_copia_curriculo", { p_codigo: codigo, p_contar: !ROBO.test(agente) });
  if (!data) notFound();
  const copia = data as unknown as { desligada: boolean; para?: string; cnpj?: string; curriculo?: CurriculoImpresso; funcao?: string };
  if (copia.desligada || !copia.curriculo) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-h2">Este currículo não está mais disponível</h1>
        <p className="text-body text-ink-muted">A pessoa desligou a página desta cópia.</p>
        <Publique />
      </div>
    );
  }
  const cv = copia.curriculo;
  const whatsapp = cv.whatsapp?.replace(/\D/g, "") ?? "";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-body-sm text-ink-muted">Currículo deixado em {copia.para}</p>
        <h1 className="text-h2">{cv.nome}</h1>
      </div>
      {whatsapp.length >= 10 && (
        <a
          href={linkWhatsApp(`55${whatsapp}`, `Oi, ${cv.nome.split(" ")[0]}! Vi o seu currículo que você deixou aqui no ${copia.para}.`)}
          className={`${classesBotao("primario")} self-start`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle aria-hidden />
          Chamar no WhatsApp
        </a>
      )}
      <div className="overflow-hidden rounded-lg border border-line shadow-raised">
        <FolhaCurriculo cv={cv} para={copia.para ?? ""} />
      </div>
      <Publique />
    </div>
  );
}

function Publique() {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line-strong bg-surface-200 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-h3">
        <Megaphone aria-hidden className="size-5" />
        Precisa de mais gente?
      </h2>
      <p className="text-body text-ink-muted">
        Publique a sua vaga grátis no Publike: os candidatos do bairro chegam no seu WhatsApp. Com o CNPJ ou o nome da
        empresa, o endereço já vem preenchido.
      </p>
      <Link href="/publicar" className={`${classesBotao("primario")} self-start`}>
        Publicar vaga grátis
      </Link>
    </section>
  );
}
