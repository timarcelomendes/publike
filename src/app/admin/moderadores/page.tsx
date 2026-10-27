import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TirarDaModeracao } from "@/components/admin/acoes-conta";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { BotaoPainelNoSite, FormNovoModerador } from "@/components/admin/moderadores";
import { Secao } from "@/components/admin/ui";
import { Avatar, Selo } from "@/components/ui/basicos";
import { contasDoPainelNoSite, listarModeradores } from "@/lib/admin/dados";
import { tempoRelativo } from "@/lib/formato";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Moderadores" };

export default function Moderadores() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const c = await exigirAdminLocal();
  const [lista, agora, doPainel] = await Promise.all([
    listarModeradores(c),
    agoraDaRequisicao(),
    contasDoPainelNoSite(c),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Quem modera"
        descricao="Moderadores entram no site com o login deles e veem só Anúncios e Denúncias, em /admin. Contas, e-mails, IA e chaves ficam só com você, neste computador."
      >
        {lista.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Ninguém por enquanto. Você cuida de tudo daqui.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {lista.map((m) => (
              <li key={m.perfil_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar nome={m.nome} foto={m.foto} tamanho={40} />
                  <div className="flex min-w-0 flex-col">
                    <Link href={`/admin/usuarios/${m.perfil_id}`} className="truncate text-label underline-offset-2 hover:underline">
                      {m.nome}
                    </Link>
                    <span className="truncate text-body-sm text-ink-muted">
                      {m.email} · desde {tempoRelativo(m.criado_em, agora)}
                    </span>
                  </div>
                </div>
                <TirarDaModeracao usuarioId={m.perfil_id} curto />
              </li>
            ))}
          </ul>
        )}
      </Secao>
      <Secao titulo="Adicionar moderador">
        <FormNovoModerador />
      </Secao>
      {doPainel && (
        <Secao
          id="painel-no-site"
          titulo="Painel no site"
          descricao="Os números do Painel (sem nomes, sem mensagens e sem botões) em publike.org/equipe, com o login da pessoa. Só aparecem aqui as contas com e-mail de login @publike.org confirmado."
        >
          {doPainel.length === 0 ? (
            <p className="text-body-sm text-ink-muted">
              Nenhuma conta com e-mail @publike.org ainda. A pessoa entra no Publike com esse e-mail e aparece aqui.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {doPainel.map((p) => (
                <li key={p.usuario_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-label">{p.nome ?? p.email}</span>
                      {p.liberado && <Selo variante="match">Vê o Painel</Selo>}
                    </span>
                    <span className="truncate text-body-sm text-ink-muted">
                      {p.email}
                      {p.ultimo_acesso && ` · entrou ${tempoRelativo(p.ultimo_acesso, agora)}`}
                    </span>
                  </div>
                  <BotaoPainelNoSite usuarioId={p.usuario_id} liberado={p.liberado} />
                </li>
              ))}
            </ul>
          )}
        </Secao>
      )}
    </div>
  );
}
