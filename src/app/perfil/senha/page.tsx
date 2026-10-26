import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SenhaDeAcesso } from "@/components/senha-de-acesso";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Container, Esqueleto } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Senha de acesso", robots: { index: false } };

// Onde o "Esqueci a senha" chega (o link do e-mail já entra na conta) e onde a senha é criada ou
// trocada fora do perfil. A senha é opcional: o link no e-mail continua valendo.

export default function PaginaSenha() {
  return (
    <Container className="max-w-2xl py-8">
      <h1 className="text-h2 sm:text-h1">Senha de acesso</h1>
      <Suspense fallback={<Esqueleto className="mt-8 h-80 w-full rounded-lg" />}>
        <Conteudo />
      </Suspense>
      <p className="mt-6 text-body-sm text-ink-muted">
        <Link href="/perfil" className="underline">
          Voltar para Meu perfil
        </Link>
      </p>
    </Container>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/perfil/senha");
  const { data } = await (await criarClienteServidor()).auth.getUser();
  const conta = data.user;
  return <SenhaDeAcesso email={conta?.email || null} temSenha={conta?.user_metadata?.tem_senha === true} destaque />;
}
