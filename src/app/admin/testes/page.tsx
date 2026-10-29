import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { BotaoPublicarTeste } from "@/components/admin/testes";
import { Secao } from "@/components/admin/ui";
import { Aviso, Selo } from "@/components/ui/basicos";
import { exigirAdminLocal } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Testes" };

// Os testes da Publike (migração 20261204120000): entram como rascunho; aqui o admin revisa e publica.

export default function Testes() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const c = await exigirAdminLocal();
  const [{ data: modelos, error }, { data: uso }] = await Promise.all([
    c.rpc("admin_avaliacoes_modelos"),
    c.rpc("admin_avaliacoes_uso"),
  ]);
  if (error) {
    return (
      <Aviso tipo="alerta" titulo="Rode a migração dos testes">
        Falta a migração 20261204120000_avaliacoes.sql neste banco.
      </Aviso>
    );
  }
  const u = (uso ?? {}) as { da_casa?: number; vagas?: number; pedidas_30d?: number; feitas_30d?: number };
  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Testes da Publike"
        descricao="Recurso pago: cada conta experimenta 15 dias grátis (ou você libera sem prazo em Usuários). Os testes entram como rascunho: abra, revise as questões e publique. Rascunho não aparece para as empresas."
      >
        <ul className="flex flex-col divide-y divide-line">
          {(modelos ?? []).map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/testes/${m.id}`} className="text-label underline">
                    {m.titulo}
                  </Link>
                  <Selo variante={m.publicado ? "match" : "contorno"}>{m.publicado ? "Publicado" : "Rascunho"}</Selo>
                </p>
                <p className="text-body-sm text-ink-muted">
                  {m.questoes} questões · {m.vagas} {m.vagas === 1 ? "vaga" : "vagas"} · {m.feitas} de {m.pedidas}{" "}
                  feitos
                  {m.media != null ? ` · média ${m.media}%` : ""}
                </p>
              </div>
              <BotaoPublicarTeste modeloId={m.id} publicado={m.publicado} />
            </li>
          ))}
        </ul>
      </Secao>
      <Secao titulo="Uso">
        <p className="text-body-sm">
          {u.da_casa ?? 0} testes das empresas · {u.vagas ?? 0} vagas com teste · {u.pedidas_30d ?? 0} pedidos e{" "}
          {u.feitas_30d ?? 0} feitos em 30 dias
        </p>
      </Secao>
    </div>
  );
}
