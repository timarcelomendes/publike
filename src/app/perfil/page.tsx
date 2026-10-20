import { ChevronRight, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExcluirConta, FormPerfil } from "@/components/form-perfil";
import { SoComSupabase } from "@/components/so-com-supabase";
import { TrocarEmail } from "@/components/trocar-email";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { aceitePendente, obterMeuPerfil } from "@/lib/dados";
import { PAPEIS_EQUIPE } from "@/lib/equipe";
import { caminhoSeguro, primeiro } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = {
  title: "Meu perfil",
  robots: { index: false },
};

export default function PaginaPerfil({ searchParams }: PageProps<"/perfil">) {
  return (
    <Container className="max-w-2xl py-8">
      <h1 className="text-h2 sm:text-h1">Meu perfil</h1>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        É o que quem publica vê quando você curte um anúncio.
      </p>
      <Suspense fallback={<Esqueleto className="h-[48rem] w-full rounded-lg" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/perfil">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const sp = await searchParams;
  const usuario = await exigirUsuario("/perfil");
  const [perfil, pendente, contaAuth] = await Promise.all([
    obterMeuPerfil(),
    aceitePendente(),
    // o e-mail novo que ainda espera confirmação (só o Supabase sabe)
    criarClienteServidor().then((c) => c.auth.getUser()),
  ]);
  const conta = contaAuth.data.user;
  const proximo = caminhoSeguro(primeiro(sp.next), "");

  // quem é da equipe de uma agência e age por ela: o perfil é o da agência
  if (usuario.papel !== "dono") {
    const papel = PAPEIS_EQUIPE[usuario.papel];
    return (
      <>
        <Aviso tipo="info" className="mb-6" titulo={`Você está agindo pela ${perfil?.nome ?? "agência"}`}>
          <p>
            Este é o perfil da agência. Você é {papel.nome.toLowerCase()} na equipe
            {usuario.papel === "recrutador" ? ": só quem administra muda o perfil da agência." : "."}
          </p>
          <p className="mt-2">
            Para mudar os seus dados (nome, celular, currículo), troque para a sua conta no menu do painel.
          </p>
          {perfil && (
            <p className="mt-2">
              <Link href={`/perfil/${perfil.id}`} className="text-label underline">
                Ver como o perfil da agência aparece
              </Link>
            </p>
          )}
        </Aviso>
        {usuario.papel === "admin" && perfil && (
          <FormPerfil
            perfil={perfil}
            usuarioId={usuario.id}
            telefone={null}
            email={null}
            completar={false}
            pedirAceite={pendente}
            proximo={proximo}
          />
        )}
      </>
    );
  }

  return (
    <>
      <FormPerfil
        perfil={perfil}
        usuarioId={usuario.id}
        telefone={usuario.telefone}
        email={usuario.email}
        nomeSugerido={usuario.nome}
        completar={primeiro(sp.completar) === "1" || !perfil}
        pedirAceite={pendente}
        proximo={proximo}
      />
      {perfil && (
        <Link
          href="/perfil/curriculo"
          className="mt-8 flex items-center gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card hover:border-line-strong"
        >
          <FileText aria-hidden className="size-6 shrink-0 text-terra-text" />
          <span className="min-w-0 flex-1">
            <span className="block text-h3">Meu currículo</span>
            <span className="block text-body-sm text-ink-muted">
              Para vagas com carteira e estágio. Só vê quem anunciou uma vaga que você curtiu.
            </span>
          </span>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
        </Link>
      )}
      {perfil && (
        <TrocarEmail
          atual={conta?.email || usuario.email}
          pendente={conta?.new_email || null}
          confirmado={primeiro(sp.email) === "confirmado"}
        />
      )}
      {perfil && <ExcluirConta />}
    </>
  );
}
