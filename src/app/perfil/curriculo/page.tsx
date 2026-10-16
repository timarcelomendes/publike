import { ArrowLeft, PartyPopper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CaminhoDaCurtida } from "@/components/caminho-curtida";
import { ApagarCurriculo, FormCurriculo } from "@/components/form-curriculo";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { esperaCurriculo } from "@/lib/constantes";
import { linkDoMeuPdf, listarMinhasCurtidas, obterMeuCurriculo } from "@/lib/dados";
import { caminhoSeguro, primeiro } from "@/lib/formato";
import type { MinhaCurtida } from "@/lib/tipos";
import { exigirPerfilCompleto } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = {
  title: "Meu currículo",
  robots: { index: false },
};

export default function PaginaCurriculo({ searchParams }: PageProps<"/perfil/curriculo">) {
  return (
    <Container className="max-w-2xl py-8">
      <Link href="/perfil" className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Meu perfil
      </Link>
      <h1 className="mt-1 text-h2 sm:text-h1">Meu currículo</h1>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        Para vagas com carteira, estágio e temporárias. Preencha uma vez: quando você curtir uma vaga, quem anunciou vê
        seu currículo junto com o seu perfil.
      </p>
      <Suspense fallback={<Esqueleto className="h-[56rem] w-full rounded-lg" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/perfil/curriculo">["searchParams"] }) {
  const sp = await searchParams;
  const hoje = new Date(await agoraDaRequisicao()).toISOString().slice(0, 7);
  const proximo = caminhoSeguro(primeiro(sp.next), "");

  if (MODO_DEMO) {
    return (
      <>
        <Aviso tipo="alerta" className="mb-6" titulo="Modo demonstração">
          {MENSAGEM_DEMO}
        </Aviso>
        <FormCurriculo
          inicial={null}
          usuarioId="00000000-0000-0000-0000-000000000000"
          linkPdf={null}
          hoje={hoje}
          demo
        />
      </>
    );
  }

  const { usuario } = await exigirPerfilCompleto(
    proximo ? `/perfil/curriculo?next=${encodeURIComponent(proximo)}` : "/perfil/curriculo",
  );
  const [curriculo, curtidas] = await Promise.all([obterMeuCurriculo(), listarMinhasCurtidas().catch(() => [])]);
  const linkPdf = await linkDoMeuPdf(curriculo?.arquivo ?? null);
  // as vagas que já aceitaram a pessoa e só esperam o currículo
  const aceitas = curtidas.filter((c) => c.tipo === "vaga" && esperaCurriculo(c));

  return (
    <>
      {aceitas.length > 0 && <AceitasEsperando aceitas={aceitas} temCurriculo={curriculo !== null} />}
      {primeiro(sp.salvo) === "1" && (
        <Aviso tipo="sucesso" className="mb-6" titulo="Currículo salvo!">
          <p>
            Agora é só curtir as vagas que combinam com você. Quem anunciou vê seu currículo e, se curtir de volta, o
            WhatsApp dos dois aparece.
          </p>
          <p className="mt-3">
            <Link href="/?tipo=vaga" className="text-label underline">
              Ver vagas perto de mim
            </Link>
          </p>
        </Aviso>
      )}
      {primeiro(sp.apagado) === "1" && (
        <Aviso tipo="info" className="mb-6" titulo="Currículo apagado">
          Ninguém mais vê. Se quiser, preencha de novo abaixo.
        </Aviso>
      )}
      <FormCurriculo
        key={curriculo?.atualizado_em ?? "novo"}
        inicial={curriculo}
        usuarioId={usuario.id}
        linkPdf={linkPdf}
        proximo={proximo}
        hoje={hoje}
        rotuloSalvar={aceitas.length ? "Salvar e mandar o currículo" : undefined}
      />
      {curriculo && <ApagarCurriculo />}
    </>
  );
}

/** Quem já aceitou a pessoa e só espera o currículo: salvando aqui, dá match na hora. */
function AceitasEsperando({ aceitas, temCurriculo }: { aceitas: MinhaCurtida[]; temCurriculo: boolean }) {
  const uma = aceitas.length === 1 ? aceitas[0] : null;
  const fazer = temCurriculo ? "confira e salve" : "preencha e salve";
  return (
    <section
      aria-labelledby="aceitas-titulo"
      className="mb-6 flex flex-col gap-3 rounded-lg border-2 border-terra bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <h2 id="aceitas-titulo" className="flex items-center gap-2 font-display text-h3">
        <PartyPopper aria-hidden className="size-5 shrink-0 text-terra-text" />
        {uma ? `${uma.autor_nome} aceitou você!` : `${aceitas.length} vagas aceitaram você!`}
      </h2>
      <p className="text-body-sm">
        {uma ? (
          <>
            Na vaga “{uma.titulo}”. Falta só o seu currículo: {fazer} aqui embaixo e dá match na hora.
          </>
        ) : (
          <>Falta só o seu currículo: {fazer} aqui embaixo e dá match em todas de uma vez.</>
        )}
      </p>
      {uma ? (
        <CaminhoDaCurtida
          situacao="aceita"
          quem={uma.autor_nome}
          className="rounded-md border border-line bg-surface-100 p-3"
        />
      ) : (
        <ul className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-100 p-3 text-body-sm">
          {aceitas.map((c) => (
            <li key={c.anuncio_id}>
              <Link href={`/anuncio/${c.anuncio_id}`} className="font-semibold underline underline-offset-2">
                {c.titulo}
              </Link>{" "}
              <span className="text-ink-muted">· {c.autor_nome}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
