"use client";

import { useEffect } from "react";
import { Container, Simbolo } from "@/components/ui/basicos";
import { Botao, BotaoLink } from "@/components/ui/botao";

export default function Erro({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="flex flex-col items-center py-16 text-center">
      <Simbolo altura={56} />
      <h1 className="mt-6 text-h2 sm:text-h1">Algo deu errado</h1>
      <p className="mt-2 max-w-md text-body text-ink-muted">
        Não conseguimos carregar esta página agora. Tente de novo em instantes.
      </p>
      {error.digest && <p className="mt-2 text-body-sm text-ink-muted">Código: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Botao onClick={() => retry()}>Tentar de novo</Botao>
        <BotaoLink href="/" variante="fantasma">
          Ir para o início
        </BotaoLink>
      </div>
    </Container>
  );
}
