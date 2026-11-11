import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ConfirmacaoDeLeitura } from "@/components/avisos/confirmacao-de-leitura";
import { FormAvisos } from "@/components/avisos/form-avisos";
import { AtivarNotificacoes } from "@/components/notificacoes-celular";
import { PreferenciaConviteAutomatico } from "@/components/convite-automatico/preferencia";
import { EscolherAparencia } from "@/components/preferencias/aparencia";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { AceiteWhatsapp } from "@/components/whatsapp/aceite-whatsapp";
import { meuWhatsapp } from "@/lib/acoes/whatsapp";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { vapidPublica } from "@/lib/servidor/ambiente";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Preferências", robots: { index: false } };

// Preferências (claude/plano-preferencias.md; antes "Avisos e notificações", em /perfil/avisos, que leva para cá):
// o que chega no e-mail e no celular (Avisos), por onde chega (Notificações: o celular e o WhatsApp), a confirmação
// de leitura (Conversas) e o tema (Aparência). Uma página só, com o índice no topo. No menu da conta.

export default function PaginaPreferencias() {
  return (
    <Container className="max-w-2xl py-8">
      <h1 className="text-h2 sm:text-h1">Preferências</h1>
      <p className="mt-2 mb-5 text-body text-ink-muted">
        O que chega para você, por onde chega, as conversas e a aparência do site.
      </p>
      <Suspense fallback={<Esqueleto className="h-[40rem] w-full rounded-lg" />}>
        <Conteudo />
      </Suspense>
    </Container>
  );
}

/** Uma parte da página: o título (o índice leva até ele) e o que vem embaixo. */
function Parte({ id, titulo, ajuda, children }: { id: string; titulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`parte-${id}`} className="flex scroll-mt-24 flex-col gap-4">
      <div>
        {/* no celular, menor que o título da página */}
        <h2 id={`parte-${id}`} className="text-h3 sm:text-h2">
          {titulo}
        </h2>
        {ajuda && <p className="mt-1 text-body-sm text-ink-muted">{ajuda}</p>}
      </div>
      {children}
    </section>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/perfil/preferencias");
  const supabase = await criarClienteServidor();
  const [perfil, { data: desligados, error }, whatsapp, leitura, convites] = await Promise.all([
    obterMeuPerfil().catch(() => null),
    supabase.rpc("meus_avisos_desligados"),
    meuWhatsapp(),
    supabase.rpc("minha_confirmacao_de_leitura"),
    // o convite automático (migração 20270418120000): sem a migração, a opção não aparece
    supabase.rpc("recebo_convites_automaticos"),
  ]);
  if (error) console.error(`Publike: falha ao ler os avisos desligados: ${error.message}`);
  const vapid = vapidPublica();
  const pode = usuario.papel === "dono" || usuario.papel === "admin";
  const empresa = Boolean(perfil && perfil.tipo !== "pessoa");
  // sem a migração 20270205120000, a parte Conversas não aparece
  const conversas = !leitura.error;
  const partes = [
    { id: "avisos", nome: "Avisos" },
    { id: "notificacoes", nome: "Notificações" },
    ...(conversas ? [{ id: "conversas", nome: "Conversas" }] : []),
    { id: "aparencia", nome: "Aparência" },
  ];

  return (
    <div className="flex flex-col gap-10">
      <nav aria-label="Partes das preferências">
        <ul className="flex flex-wrap gap-2">
          {partes.map((p) => (
            <li key={p.id}>
              <a
                href={`#${p.id}`}
                className="inline-flex min-h-10 items-center rounded-pill border border-line-strong bg-surface-200 px-4 text-label hover:bg-surface-300"
              >
                {p.nome}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Parte
        id="avisos"
        titulo="Avisos"
        ajuda="O sino do Publike mostra todos os avisos. Aqui você escolhe o que chega também no e-mail e no celular."
      >
        {error ? (
          <Aviso tipo="alerta" titulo="Não deu para carregar os avisos agora">
            Tente de novo em instantes. Enquanto isso, o “Receber avisos por e-mail” continua no{" "}
            <Link href="/perfil#perfil-contato" className="font-semibold underline underline-offset-2">
              seu perfil
            </Link>
            .
          </Aviso>
        ) : (
          <FormAvisos
            desligados={desligados ?? []}
            empresa={empresa}
            emailsLigados={perfil?.receber_emails ?? true}
            semEmail={!usuario.email}
            pode={pode}
          />
        )}
        {!empresa && !convites.error && <PreferenciaConviteAutomatico recebe={convites.data !== false} />}
        <p className="text-body-sm text-ink-muted">
          Os avisos sobre a sua conta e a moderação dos anúncios chegam sempre. As buscas e as empresas que avisam de
          vaga nova ficam em{" "}
          <Link href="/painel/seguindo" className="font-semibold text-ink underline underline-offset-2">
            Avisos e seguindo
          </Link>
          .
        </p>
      </Parte>

      <Parte id="notificacoes" titulo="Notificações" ajuda="Por onde os avisos chegam além do e-mail.">
        {/* o celular é por aparelho: cada um liga o seu */}
        {vapid && <AtivarNotificacoes vapid={vapid} jeito="cartao" />}
        {whatsapp && whatsapp.pode && (
          <section
            aria-labelledby="titulo-whatsapp"
            className="rounded-lg border border-line bg-surface-200 p-4 sm:p-5"
          >
            <h3 id="titulo-whatsapp" className="mb-2 text-h3">
              WhatsApp
            </h3>
            <AceiteWhatsapp
              inicial={whatsapp}
              origem="avisos"
              rotulo={
                empresa
                  ? "Receber os candidatos novos pelo WhatsApp"
                  : "Receber o andamento das candidaturas pelo WhatsApp"
              }
            />
          </section>
        )}
        {!vapid && !(whatsapp && whatsapp.pode) && (
          <p className="text-body-sm text-ink-muted">
            Por enquanto, os avisos chegam pelo sino do Publike e pelo e-mail.
          </p>
        )}
      </Parte>

      {conversas && (
        <Parte id="conversas" titulo="Conversas">
          <ConfirmacaoDeLeitura ligada={leitura.data !== false} pode={pode} />
        </Parte>
      )}

      <Parte id="aparencia" titulo="Aparência">
        <EscolherAparencia />
      </Parte>
    </div>
  );
}
