import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Numero, Secao } from "@/components/admin/ui";
import { CORES, relatorioDaAderencia, type Contagem, type Cor } from "@/lib/admin/aderencia-antes-e-depois";
import { plural } from "@/lib/formato";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Nota de aderência" };

// A conta de antes e a nova lado a lado nas vagas no ar (11/11/2026, claude/plano-pesos-da-aderencia.md), para
// conferir antes do push. Sai quando a conta nova estiver no ar e conferida (com src/lib/admin/aderencia-de-antes.ts).

const NOME_DA_COR: Record<Cor, string> = {
  verde: "Verde (80% ou mais)",
  amarela: "Amarela (50% a 79%)",
  cinza: "Cinza (abaixo de 50%)",
  sem: "Sem nota",
};

/** "Por que entram" e "Por que saem", lado a lado. */
function Motivos({ entram, saem }: { entram: Contagem[]; saem: Contagem[] }) {
  if (!entram.length && !saem.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[
        { titulo: "Por que entram", lista: entram },
        { titulo: "Por que saem", lista: saem },
      ].map((g) => (
        <div key={g.titulo} className="flex flex-col gap-1">
          <p className="text-label">{g.titulo}</p>
          {g.lista.length ? (
            <ul className="flex flex-col gap-1 text-body-sm">
              {g.lista.map((x) => (
                <li key={x.nome}>
                  {x.nome}: <strong className="tabular-nums">{x.quantas}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-ink-muted">Ninguém.</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function NotaDeAderencia() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const c = await exigirAdminLocal();
  const agora = await agoraDaRequisicao();
  const r = await relatorioDaAderencia(c, agora);
  const { candidaturas: k, talentos: t, combinam: m } = r;

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Nota de aderência: antes e depois"
        descricao="A conta de antes de 11/11/2026 e a nova (claude/plano-pesos-da-aderencia.md), nas vagas no ar e nos currículos de hoje. Sem as perguntas com resposta procurada: as duas contas ficam sem elas. Confira antes de publicar a conta nova."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Numero rotulo="Vagas no ar" valor={r.vagas.total} />
          <Numero rotulo="Candidaturas com currículo" valor={k.total} />
          <Numero rotulo="A nota sobe" valor={k.subiram} />
          <Numero rotulo="A nota desce" valor={k.desceram} />
        </div>
        <ul className="flex flex-col gap-1 text-body-sm">
          {r.vagas.perfis.map((p) => (
            <li key={p.nome}>
              {p.nome}: <strong className="tabular-nums">{p.quantas}</strong>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao
        titulo="A cor da nota das candidaturas"
        descricao="Cada linha é a cor de antes; cada coluna, a cor nova. Fora da diagonal, a candidatura mudou de cor."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-body-sm">
            <thead className="text-caption text-ink-muted">
              <tr>
                <th className="px-2 py-2 font-semibold">Antes ↓ · Depois →</th>
                {CORES.map((cor) => (
                  <th key={cor} className="px-2 py-2 text-right font-semibold">
                    {NOME_DA_COR[cor]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CORES.map((de) => (
                <tr key={de} className="border-t border-line">
                  <td className="px-2 py-2.5 font-semibold">{NOME_DA_COR[de]}</td>
                  {CORES.map((para) => (
                    <td
                      key={para}
                      className={`px-2 py-2.5 text-right tabular-nums ${de === para ? "text-ink-muted" : "font-semibold"}`}
                    >
                      {k.matriz[de][para]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {k.motivos.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-label">Por que mudou de cor</p>
            <ul className="flex flex-col gap-1 text-body-sm">
              {k.motivos.map((x) => (
                <li key={x.nome}>
                  {x.nome}: <strong className="tabular-nums">{x.quantas}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
        {k.maiores.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-body-sm">
              <thead className="text-caption text-ink-muted">
                <tr>
                  <th className="px-2 py-2 font-semibold">Vaga</th>
                  <th className="px-2 py-2 font-semibold">Pessoa</th>
                  <th className="px-2 py-2 text-right font-semibold">Antes</th>
                  <th className="px-2 py-2 text-right font-semibold">Depois</th>
                  <th className="px-2 py-2 font-semibold">Por quê</th>
                </tr>
              </thead>
              <tbody>
                {k.maiores.map((x) => (
                  <tr key={`${x.vagaId}:${x.perfilId}`} className="border-t border-line align-top">
                    <td className="px-2 py-2.5">
                      <Link href={`/anuncio/${x.vagaId}`} className="underline-offset-2 hover:underline">
                        {x.vaga}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5">
                      <Link href={`/admin/usuarios/${x.perfilId}`} className="underline-offset-2 hover:underline">
                        Ver a conta
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{x.antes ?? "—"}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{x.depois ?? "—"}</td>
                    <td className="px-2 py-2.5 text-ink-muted">{x.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <Secao
        titulo="Talentos › Para a sua vaga"
        descricao={`Quem aparece para cada vaga no ar, entre ${plural(t.pessoas, "talento", "talentos")}${r.cortado ? " (os de currículo mais novo)" : ""}. Quem já curtiu a vaga fica de fora, como na tela.`}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Numero rotulo="Aparições antes" valor={t.antes} />
          <Numero rotulo="Aparições depois" valor={t.depois} />
          <Numero rotulo="Entram" valor={t.entram} />
          <Numero rotulo="Saem" valor={t.saem} />
        </div>
        <Motivos entram={t.porQueEntram} saem={t.porQueSaem} />
        {t.vagas.length > 0 && (
          <ul className="flex flex-col gap-1 text-body-sm">
            {t.vagas.map((v) => (
              <li key={v.vagaId}>
                <Link href={`/anuncio/${v.vagaId}`} className="underline-offset-2 hover:underline">
                  {v.vaga}
                </Link>
                : <span className="tabular-nums">{v.antes}</span> → <strong className="tabular-nums">{v.depois}</strong>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao
        titulo="Vagas que combinam"
        descricao="Pares de talento e vaga da região dele com 70% ou mais e sem “Outra área”: são os do aviso de segunda e os do convite automático."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Numero rotulo="Antes" valor={m.antes} />
          <Numero rotulo="Depois" valor={m.depois} />
          <Numero rotulo="Entram" valor={m.entram} />
          <Numero rotulo="Saem" valor={m.saem} />
        </div>
        <Motivos entram={m.porQueEntram} saem={m.porQueSaem} />
      </Secao>
    </div>
  );
}
