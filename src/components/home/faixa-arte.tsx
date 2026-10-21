import { ImageUp } from "lucide-react";
import Link from "next/link";
import { iaLigadaNoSite } from "@/lib/dados";
import { Container } from "../ui/basicos";

/**
 * "Tem a arte da vaga? Mande a foto.": leva ao quadro da foto no Publicar (que precisa da
 * conta: quem não entrou passa por Entrar antes). Só com a leitura por IA ligada.
 */
export async function FaixaArte({ logado }: { logado: boolean }) {
  if (!(await iaLigadaNoSite())) return null;
  const destino = "/publicar#arte";
  return (
    <Container className="mt-12 sm:mt-16">
      <section
        aria-labelledby="faixa-arte"
        className="flex flex-col gap-4 rounded-lg bg-ipe p-5 text-on-ipe sm:flex-row sm:items-center sm:gap-8 sm:p-8 lg:rounded-[28px] lg:px-10"
      >
        <span className="hidden size-14 shrink-0 items-center justify-center rounded-md bg-on-ipe/10 sm:flex">
          <ImageUp aria-hidden className="size-7" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="faixa-arte" className="text-h2 sm:text-[32px] sm:leading-[36px]">
            Tem a arte da vaga? Mande a foto.
          </h2>
          <p className="text-body sm:text-body-lg">
            O Publike lê a imagem, preenche a vaga e você só confere. Publicar é grátis.
          </p>
        </div>
        <Link
          href={logado ? destino : `/entrar?next=${encodeURIComponent(destino)}`}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 self-start rounded-md bg-ink px-5 text-label text-surface-100 transition-opacity hover:opacity-90 sm:self-center"
        >
          <ImageUp aria-hidden className="size-4" />
          Publicar pela foto
        </Link>
      </section>
    </Container>
  );
}
