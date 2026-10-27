import type { Metadata } from "next";
import { Suspense } from "react";
import { FormComunicado } from "@/components/admin/comunicados";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import { comunicadosMandados } from "@/lib/admin/dados";
import { MODELOS_COMUNICADO, nomeDoPublico } from "@/lib/comunicados";
import { formatarDataHora, primeiro } from "@/lib/formato";
import { exigirAdminLocal } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Comunicados" };

// Admin › Comunicados: um aviso no sino para um público (todas as contas, pessoas, empresas, agências ou pelo
// aparelho), com o histórico do que já saiu. ?modelo= abre um comunicado pronto (o convite do teste do app).

export default function Comunicados({ searchParams }: PageProps<"/admin/comunicados">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {searchParams.then((sp) => (
        <Conteudo modelo={primeiro(sp.modelo) ?? null} />
      ))}
    </Suspense>
  );
}

async function Conteudo({ modelo }: { modelo: string | null }) {
  const c = await exigirAdminLocal();
  const mandados = await comunicadosMandados(c);
  const inicial = modelo ? (MODELOS_COMUNICADO[modelo] ?? null) : null;
  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Novo comunicado"
        descricao="Um aviso no sino das contas do público, da equipe do Publike. Bom para novidades e convites (como o teste do app no Android)."
      >
        {mandados === null ? (
          <Aviso tipo="erro" titulo="Falta a migração">
            Rode a migração 20261129120000_comunicados.sql no Supabase.
          </Aviso>
        ) : (
          <FormComunicado key={modelo ?? "novo"} inicial={inicial} />
        )}
      </Secao>

      <Secao titulo="Já mandados">
        {!mandados || mandados.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Nenhum comunicado ainda.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {mandados.map((m) => (
              <li key={m.id} className="flex flex-col gap-1 py-3 text-body-sm">
                <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-label">{nomeDoPublico(m.publico)}</span>
                  <span className="text-ink-muted">
                    {formatarDataHora(m.criado_em)} · {m.total === 1 ? "1 conta" : `${m.total} contas`}
                  </span>
                </span>
                <span>{m.texto}</span>
                {m.link && <span className="text-ink-muted">Leva para {m.link}</span>}
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}
