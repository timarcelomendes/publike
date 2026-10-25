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
import { modoPadrao } from "@/lib/modo-painel";
import { obterIntencao } from "@/lib/servidor/intencao";
import { modosMarcados, modosNoBanco } from "@/lib/servidor/modo";
import { meuResponsavel } from "@/lib/servidor/responsavel";
import { vapidPublica } from "@/lib/servidor/ambiente";
import { AtivarNotificacoes } from "@/components/notificacoes-celular";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { cidadeDaVisita } from "@/lib/servidor/cidade";

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
  const [perfil, pendente, contaAuth, marcados, comModos, intencao, visita, responsavel] = await Promise.all([
    obterMeuPerfil(),
    aceitePendente(),
    // o e-mail novo que ainda espera confirmação (só o Supabase sabe)
    criarClienteServidor().then((c) => c.auth.getUser()),
    modosMarcados(),
    modosNoBanco(),
    obterIntencao().catch(() => null),
    // perfil novo: a cidade já vem marcada (a de onde a pessoa disse que mora ou a do endereço de internet)
    cidadeDaVisita(),
    // empresa, comércio e agência: quem responde pela conta (e se o nome vai nas conversas e nos recados)
    meuResponsavel(),
  ]);
  // "O que você quer fazer no Publike?": o que a conta marcou; conta nova, pelo tipo e pelo que
  // disse que quer fazer. Banco sem a migração: a pergunta não aparece (não teria onde guardar).
  const modos = comModos ? (marcados ?? [modoPadrao(perfil?.tipo, intencao)]) : undefined;
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
            modos={modos}
            responsavel={responsavel}
          />
        )}
      </>
    );
  }

  const completar = primeiro(sp.completar) === "1" || !perfil;
  // currículo é só de pessoa (comércio, empresa e agência contratam)
  const comCurriculo = Boolean(perfil && perfil.tipo === "pessoa" && (!marcados || marcados.includes("trabalhar")));
  // a página é longa: um atalho para cada parte (só no perfil já feito; no "completar", o formulário é curto)
  const partes = completar
    ? []
    : [
        { href: "#perfil-dados", nome: "Perfil" },
        { href: "#perfil-contato", nome: "Contato e avisos" },
        {
          href: "#perfil-sobre",
          nome:
            perfil?.tipo === "pessoa"
              ? "Sobre você"
              : perfil?.tipo === "agencia"
                ? "Sobre a agência"
                : "Sobre o negócio",
        },
        ...(comCurriculo ? [{ href: "#perfil-curriculo", nome: "Currículo" }] : []),
        { href: "#perfil-conta", nome: "Conta" },
      ];

  return (
    <>
      {partes.length > 0 && (
        <nav
          aria-label="Partes do perfil"
          className="sticky top-16 z-30 -mx-4 mb-6 border-b border-line bg-surface-100/95 px-4 py-2 backdrop-blur-md sm:mx-0 sm:rounded-pill sm:border sm:px-2"
        >
          <ul className="sem-barra flex gap-1 overflow-x-auto">
            {partes.map((p) => (
              <li key={p.href} className="shrink-0">
                <a
                  href={p.href}
                  className="inline-flex min-h-9 items-center rounded-pill px-3 text-label whitespace-nowrap text-ink-muted transition-colors hover:bg-surface-300 hover:text-ink"
                >
                  {p.nome}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <FormPerfil
        perfil={perfil}
        usuarioId={usuario.id}
        telefone={usuario.telefone}
        email={usuario.email}
        nomeSugerido={usuario.nome}
        cidadePadrao={visita.cidade}
        completar={completar}
        pedirAceite={pendente}
        proximo={proximo}
        modos={modos}
        responsavel={responsavel}
      />
      {/* os avisos do sino também no celular (cada aparelho liga o seu) */}
      {!completar && vapidPublica() && (
        <div className="mt-8">
          <AtivarNotificacoes vapid={vapidPublica() ?? ""} jeito="cartao" />
        </div>
      )}
      {/* o currículo: para quem procura trabalho (ou ainda não marcou o que faz) */}
      {comCurriculo && (
        <Link
          id="perfil-curriculo"
          href="/perfil/curriculo"
          className="mt-8 flex scroll-mt-32 items-center gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card hover:border-line-strong"
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
        <h2 id="perfil-conta" className="mt-10 -mb-4 scroll-mt-32 text-h3">
          Conta
        </h2>
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
