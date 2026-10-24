import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao } from "@/components/admin/ui";
import { Aviso, Selo } from "@/components/ui/basicos";
import { NOME_DA_ETAPA, NOME_DO_ONDE, type EtapaFalha, type OndeFalha } from "@/lib/falhas";
import { tempoRelativo } from "@/lib/formato";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Falhas" };

const HORA = 3_600_000;

export default function Falhas() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const c = await exigirAdminLocal();
  const [{ data, error }, agora] = await Promise.all([
    c.rpc("admin_listar_falhas", { p_limite: 300 }),
    agoraDaRequisicao(),
  ]);
  const falhas = data ?? [];
  const doSistema = (etapa: string) => etapa !== "validacao";
  const ultimas24 = falhas.filter((f) => agora - Date.parse(f.criado_em) < 24 * HORA);

  return (
    <Secao
      titulo="Falhas na vaga e no currículo"
      descricao="Tudo o que deu errado ao publicar ou editar uma vaga e ao salvar o currículo, inclusive o que só o navegador viu (PDF que não subiu, salvar que não chegou ao servidor). Erro do sistema avisa por e-mail na hora; erro de preenchimento só avisa quando a mesma conta erra 3 vezes em 30 minutos. Fica 90 dias."
    >
      {error ? (
        <Aviso tipo="erro" titulo="Não deu para ler as falhas">
          Confira se a migração 20261104120000_falhas_cadastro.sql já rodou no Supabase.
        </Aviso>
      ) : (
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Vaga · sistema (24 h)", ultimas24.filter((f) => f.onde === "vaga" && doSistema(f.etapa)).length],
                ["Vaga · preenchimento (24 h)", ultimas24.filter((f) => f.onde === "vaga" && !doSistema(f.etapa)).length],
                ["Currículo · sistema (24 h)", ultimas24.filter((f) => f.onde === "curriculo" && doSistema(f.etapa)).length],
                [
                  "Currículo · preenchimento (24 h)",
                  ultimas24.filter((f) => f.onde === "curriculo" && !doSistema(f.etapa)).length,
                ],
              ] as const
            ).map(([rotulo, n]) => (
              <div key={rotulo} className="rounded-md border border-line p-3">
                <dt className="text-body-sm text-ink-muted">{rotulo}</dt>
                <dd className="font-display text-h3">{n}</dd>
              </div>
            ))}
          </dl>

          {falhas.length === 0 ? (
            <Aviso tipo="sucesso" titulo="Nenhuma falha registrada." />
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
              {falhas.map((f) => (
                <li key={f.id} className="flex flex-col gap-1.5 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Selo variante={doSistema(f.etapa) ? "perigo" : "contorno"}>
                      {NOME_DO_ONDE[f.onde as OndeFalha] ?? f.onde} · {NOME_DA_ETAPA[f.etapa as EtapaFalha] ?? f.etapa}
                    </Selo>
                    {f.avisado && <Selo variante="aviso">E-mail enviado</Selo>}
                    <span className="text-body-sm text-ink-muted">{tempoRelativo(f.criado_em, agora)}</span>
                    <span className="text-body-sm text-ink-muted">
                      ·{" "}
                      {f.conta_id ? (
                        <Link href={`/admin/usuarios/${f.conta_id}`} className="underline">
                          {f.conta_nome ?? "conta"}
                          {f.conta_tipo ? ` (${f.conta_tipo})` : ""}
                        </Link>
                      ) : (
                        "sem conta"
                      )}
                    </span>
                    {f.pagina && <span className="text-body-sm text-ink-muted">· {f.pagina}</span>}
                  </div>
                  <p className="text-body">{f.mensagem}</p>
                  {(f.detalhe || f.codigo) && (
                    <p className="font-mono text-body-sm break-words text-ink-muted">
                      {f.codigo && !f.detalhe?.startsWith(f.codigo) ? `${f.codigo} · ` : ""}
                      {f.detalhe}
                    </p>
                  )}
                  {f.navegador && (
                    <details className="text-body-sm text-ink-muted">
                      <summary className="cursor-pointer">Navegador</summary>
                      <p className="break-words">{f.navegador}</p>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Secao>
  );
}
