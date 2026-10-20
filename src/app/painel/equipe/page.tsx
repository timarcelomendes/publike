import { Building2, History, Mailbox, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ConviteDaEquipe, ConvidarParaEquipe, MembroDaEquipe } from "@/components/equipe/gerenciar-equipe";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Avatar, Selo, Vazio } from "@/components/ui/basicos";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { administra } from "@/lib/equipe";
import { tempoRelativo } from "@/lib/formato";
import { atividadesDaEquipe, convitesDaEquipe, equipeDaConta } from "@/lib/servidor/equipe";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Equipe", robots: { index: false } };

// A equipe da agência: quem age por ela (cada um com o próprio login), os convites e o que cada
// um fez. Quem administra convida, muda o papel e tira; quem é da equipe pode sair.

export default function Equipe() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/painel/equipe");
  const perfil = await obterMeuPerfil();
  if (perfil?.tipo !== "agencia") {
    return (
      <Vazio icone={Users} titulo="Equipe é para agência de emprego e RH">
        Na agência, cada pessoa da equipe entra com o próprio celular e cuida das vagas e dos candidatos pela agência.
      </Vazio>
    );
  }
  const agora = await agoraDaRequisicao();
  const pode = administra(usuario.papel);
  const [membros, convites, atividades] = await Promise.all([
    equipeDaConta(),
    pode ? convitesDaEquipe(usuario.id, agora) : Promise.resolve([]),
    atividadesDaEquipe(60),
  ]);
  if (!membros || !convites || !atividades) {
    return (
      <Aviso tipo="info" titulo="A equipe ainda não está ligada no Publike">
        Logo dá para convidar a sua equipe por aqui. Enquanto isso, a agência segue funcionando normalmente com o login
        dela.
      </Aviso>
    );
  }
  const agencia = perfil.nome;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-h2">Equipe</h2>
        <p className="mt-1 text-body text-ink-muted">
          Cada pessoa entra com o próprio celular e age pela {agencia}: vagas, candidatos, entrevistas, conversas e
          clientes. O que cada uma faz fica anotado aqui embaixo.
        </p>
      </div>

      {usuario.papel === "recrutador" && (
        <Aviso tipo="info" titulo="Você é recrutador nesta equipe">
          Quem administra a {agencia} convida e tira pessoas e muda o perfil da agência.
        </Aviso>
      )}

      {pode && (
        <section
          aria-labelledby="convidar"
          className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 sm:p-6"
        >
          <h3 id="convidar" className="flex items-center gap-2 text-h3">
            <UserPlus aria-hidden className="size-5 text-ink-muted" />
            Convidar para a equipe
          </h3>
          <ConvidarParaEquipe site={SITE_URL} agencia={agencia} />
        </section>
      )}

      <section aria-labelledby="quem" className="flex flex-col gap-3">
        <h3 id="quem" className="text-h3">
          Quem está na equipe
        </h3>
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
          <li className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
            <Avatar nome={agencia} foto={perfil.foto} tamanho={40} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-label break-words">
                  {agencia}
                  {usuario.papel === "dono" && <span className="font-normal text-ink-muted"> (você)</span>}
                </span>
                <Selo variante="neutro">
                  <Building2 aria-hidden />
                  Conta da agência
                </Selo>
              </p>
              <p className="text-body-sm text-ink-muted">O login da própria agência. Faz tudo.</p>
            </div>
          </li>
          {membros.map((m) => (
            <MembroDaEquipe key={m.membro_id} m={m} podeAdministrar={pode} agenciaId={usuario.id} agora={agora} />
          ))}
        </ul>
        {membros.length === 0 && (
          <p className="text-body-sm text-ink-muted">
            {pode
              ? "Ninguém na equipe ainda. Crie um convite acima e mande o link para cada pessoa."
              : "Ninguém mais na equipe."}
          </p>
        )}
      </section>

      {pode && convites.length > 0 && (
        <section aria-labelledby="convites-equipe" className="flex flex-col gap-3">
          <h3 id="convites-equipe" className="flex items-center gap-2 text-h3">
            <Mailbox aria-hidden className="size-5 text-ink-muted" />
            Convites esperando resposta
          </h3>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {convites.map((c) => (
              <ConviteDaEquipe key={c.id} c={c} site={SITE_URL} agencia={agencia} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="atividades" className="flex flex-col gap-3">
        <h3 id="atividades" className="flex items-center gap-2 text-h3">
          <History aria-hidden className="size-5 text-ink-muted" />O que a equipe fez
        </h3>
        {atividades.length === 0 ? (
          <p className="text-body-sm text-ink-muted">
            Quando a equipe publicar vagas, mover candidatos, marcar entrevistas ou conversar, aparece aqui quem fez o
            quê.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {atividades.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3 text-body-sm">
                <span className="text-label">{a.quem}</span>
                <span className="min-w-0 flex-1 break-words">
                  {a.anuncio_id && a.perfil_id ? (
                    <Link
                      href={`/painel/anuncio/${a.anuncio_id}/quadro?candidato=${a.perfil_id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {a.texto}
                    </Link>
                  ) : a.anuncio_id ? (
                    <Link
                      href={`/painel/anuncio/${a.anuncio_id}/quadro`}
                      className="underline-offset-2 hover:underline"
                    >
                      {a.texto}
                    </Link>
                  ) : (
                    a.texto
                  )}
                </span>
                <span className="text-ink-muted">{tempoRelativo(a.criado_em, agora)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
