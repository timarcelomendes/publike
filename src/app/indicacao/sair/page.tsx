import { MailX } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmarSaidaIndicacao } from "@/components/indicacao/confirmar-saida-indicacao";
import { Container, Esqueleto, Vazio } from "@/components/ui/basicos";
import { primeiro } from "@/lib/formato";
import { CODIGO_INDICACAO_EMAIL } from "@/lib/indicacao-email";

export const metadata: Metadata = { title: "Parar de receber indicações", robots: { index: false } };

// O link do rodapé do e-mail "Fulano indicou uma vaga para você": tira o e-mail da lista, sem precisar de conta.

export default function SairDasIndicacoes({ searchParams }: PageProps<"/indicacao/sair">) {
  return (
    <Container className="max-w-xl py-10">
      <Suspense fallback={<Esqueleto className="h-72 w-full rounded-lg" />}>
        {searchParams.then((sp) => {
          const codigo = (primeiro(sp.c) ?? "").trim();
          return CODIGO_INDICACAO_EMAIL.test(codigo) ? (
            <ConfirmarSaidaIndicacao codigo={codigo} />
          ) : (
            <Vazio icone={MailX} titulo="Este link não vale">Abra de novo pelo link do e-mail.</Vazio>
          );
        })}
      </Suspense>
    </Container>
  );
}
