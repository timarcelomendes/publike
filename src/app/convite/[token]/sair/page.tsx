import type { Metadata } from "next";
import { Suspense } from "react";
import { SairDosConvites } from "@/components/sair-dos-convites";
import { Container } from "@/components/ui/basicos";

export const metadata: Metadata = { title: "Não receber mais", robots: { index: false, follow: false } };

// O "não quero receber" dos convites da base da Receita (migração 20270608120000).
export default function SairDosConvitesPagina({ params }: PageProps<"/convite/[token]/sair">) {
  return (
    <Container className="max-w-xl py-10">
      <h1 className="text-h2">Não receber mais mensagens do Publike</h1>
      <p className="mt-3 text-body text-ink-muted">
        Achamos o contato de vocês nos dados abertos do CNPJ que a Receita Federal publica. Usamos só para convidar a
        publicar vagas de graça no Publike. Se não quiserem receber mais, toque no botão: o CNPJ sai das nossas listas.
      </p>
      <div className="mt-6">
        {/* o token vem do endereço: dentro do Suspense (a página não é gerada antes) */}
        <Suspense fallback={null}>
          <Botao params={params} />
        </Suspense>
      </div>
    </Container>
  );
}

async function Botao({ params }: { params: PageProps<"/convite/[token]/sair">["params"] }) {
  const { token } = await params;
  return <SairDosConvites token={token} />;
}
