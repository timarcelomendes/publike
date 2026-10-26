import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FormAvisos } from "@/components/avisos/form-avisos";
import { AtivarNotificacoes } from "@/components/notificacoes-celular";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { vapidPublica } from "@/lib/servidor/ambiente";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Avisos e notificações", robots: { index: false } };

// O que chega no e-mail e no celular, por tipo de aviso (o sino mostra tudo). No menu da conta.

export default function PaginaAvisos() {
  return (
    <Container className="max-w-2xl py-8">
      <h1 className="text-h2 sm:text-h1">Avisos e notificações</h1>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        O sino do Publike mostra todos os avisos. Aqui você escolhe o que chega também no e-mail e no celular.
      </p>
      <Suspense fallback={<Esqueleto className="h-[40rem] w-full rounded-lg" />}>
        <Conteudo />
      </Suspense>
    </Container>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/perfil/avisos");
  const supabase = await criarClienteServidor();
  const [perfil, { data: desligados, error }] = await Promise.all([
    obterMeuPerfil().catch(() => null),
    supabase.rpc("meus_avisos_desligados"),
  ]);
  if (error) {
    console.error(`Publike: falha ao ler os avisos desligados: ${error.message}`);
    return (
      <Aviso tipo="alerta" titulo="Não deu para carregar os avisos agora">
        Tente de novo em instantes. Enquanto isso, o “Receber avisos por e-mail” continua no{" "}
        <Link href="/perfil#perfil-contato" className="font-semibold underline underline-offset-2">
          seu perfil
        </Link>
        .
      </Aviso>
    );
  }
  const vapid = vapidPublica();
  return (
    <div className="flex flex-col gap-8">
      <FormAvisos
        desligados={desligados ?? []}
        empresa={Boolean(perfil && perfil.tipo !== "pessoa")}
        emailsLigados={perfil?.receber_emails ?? true}
        semEmail={!usuario.email}
        pode={usuario.papel === "dono" || usuario.papel === "admin"}
      />
      {/* o celular é por aparelho: cada um liga o seu */}
      {vapid && <AtivarNotificacoes vapid={vapid} jeito="cartao" />}
      <p className="text-body-sm text-ink-muted">
        Os avisos sobre a sua conta e a moderação dos anúncios chegam sempre. As buscas e as empresas que avisam de vaga
        nova ficam em{" "}
        <Link href="/painel/seguindo" className="font-semibold text-ink underline underline-offset-2">
          Avisos e seguindo
        </Link>
        .
      </p>
    </div>
  );
}
