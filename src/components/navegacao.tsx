import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BarraInferiorAtiva } from "./barra-inferior-ativa";
import { BarraInferiorBase } from "./barra-inferior-base";
import { Container, Logo } from "./ui/basicos";

export function BarraInferior() {
  return (
    <Suspense fallback={<BarraInferiorBase ativo={null} />}>
      <BarraInferiorAtiva />
    </Suspense>
  );
}

export function Rodape() {
  const link = "text-ink-muted hover:text-ink hover:underline";
  return (
    <footer className="mt-16 border-t border-line bg-surface-200">
      <Container className="flex flex-col gap-8 py-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo altura={28} />
          <p className="mt-3 text-body-sm text-ink-muted">
            Vagas, freelances e serviços perto de você. De graça, em Goiânia e região.
          </p>
          <p className="mt-3 font-display text-h3">Publicou, curtiu, trabalhou.</p>
        </div>
        <nav aria-label="Rodapé" className="grid grid-cols-2 gap-x-10 gap-y-3 text-body-sm">
          <Link href="/?tipo=vaga" className={link}>
            Vagas
          </Link>
          <Link href="/como-funciona" className={link}>
            Como funciona
          </Link>
          <Link href="/?tipo=servico" className={link}>
            Serviços
          </Link>
          <Link href="/como-funciona#seguranca" className={link}>
            Dicas de segurança
          </Link>
          <Link href="/publicar" className={link}>
            Publicar grátis
          </Link>
          <Link href="/painel/servicos" className={link}>
            Oferecer meus serviços
          </Link>
          <Link href="/privacidade" className={link}>
            Privacidade e regras
          </Link>
        </nav>
      </Container>
      <Container className="border-t border-line py-4 text-body-sm text-ink-muted">
        Feito em Goiânia. Grátis para quem trabalha, para o comércio e para quem presta serviço.
      </Container>
    </footer>
  );
}

export function AvisoDemo() {
  return (
    <div className="border-b border-line bg-ipe text-on-ipe">
      <Container className="flex items-start gap-2 py-2 text-body-sm sm:items-center">
        <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 sm:mt-0" />
        <p>
          <strong>Modo demonstração.</strong> Os anúncios são exemplos e nada é salvo. Para publicar de verdade, conecte
          o Supabase (passo a passo no README).
        </p>
      </Container>
    </div>
  );
}
