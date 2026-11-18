import type { Metadata } from "next";
import { Suspense } from "react";
import { AbrirNotaDoEndereco } from "@/components/admin/abrir-nota";
import { dataCurta, NotaQueAbre, TextoTecnico } from "@/components/admin/documentacao";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Busca, Filtros, linkCom, Secao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import { bateComBusca, descreverCron, type NotaTecnica, type SecaoTecnica } from "@/lib/documentacao";
import { formatarNumero, primeiro } from "@/lib/formato";
import { documentacaoTecnica, type DocumentacaoTecnica } from "@/lib/servidor/documentacao";
import { exigirAdminLocal } from "@/lib/supabase/admin";

// A Documentação técnica (18/11/2026, Marcelo: "reúna tudo de informação técnica e crie uma opção no admin para eu
// revisitar"): as notas técnicas do projeto (AGENTS.md), o que cada migração do banco fez e os robôs e tarefas que
// rodam sozinhos. Lida dos arquivos do projeto a cada abertura: fica em dia sem ninguém mexer aqui. Só no computador do
// dono, como o resto do admin.

export const metadata: Metadata = { title: "Documentação técnica" };

const ABAS = [
  { valor: "notas", nome: "Notas técnicas" },
  { valor: "banco", nome: "Banco" },
  { valor: "robos", nome: "Robôs e tarefas" },
] as const;
type Aba = (typeof ABAS)[number]["valor"];

const RECENTES = 15;

export default function Documentacao({ searchParams }: PageProps<"/admin/documentacao">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/documentacao">["searchParams"] }) {
  await exigirAdminLocal();
  const sp = await searchParams;
  const pedida = primeiro(sp.aba);
  const aba: Aba = ABAS.find((a) => a.valor === pedida)?.valor ?? "notas";
  const busca = (primeiro(sp.q) ?? "").trim().slice(0, 100);
  const doc = await documentacaoTecnica();

  const achadas = filtrar(doc, busca);
  const numeros: Record<Aba, number> = {
    notas: achadas.notas.length,
    banco: achadas.migracoes.length,
    robos: achadas.robos.length + achadas.crons.length + achadas.tarefas.length,
  };

  return (
    <div className="flex flex-col gap-6">
      <AbrirNotaDoEndereco />
      <Secao
        titulo="Documentação técnica"
        descricao={
          <>
            Tudo o que o projeto escreve sobre si, lido dos arquivos deste computador a cada vez que a página abre: as
            notas técnicas de cada parte do Publike, o que cada migração fez no banco e os robôs que rodam sozinhos.
            Cada mudança no código atualiza esses arquivos, então aqui fica sempre em dia. Os planos citados
            (<code>claude/…</code>) ficam no Projeto do Publike no Claude.
          </>
        }
      >
        <Busca
          acao="/admin/documentacao"
          valor={busca}
          placeholder="Buscar em tudo: whatsapp, impulso, origem, currículo…"
          ocultos={{ aba: aba === "notas" ? null : aba }}
        />
        <Filtros
          rotulo="Parte da documentação"
          opcoes={ABAS.map((a) => ({ valor: a.valor, nome: a.nome, numero: numeros[a.valor] }))}
          atual={aba}
          link={(v) => linkCom("/admin/documentacao", { q: busca || null }, { aba: v === "notas" ? null : v })}
        />
        {doc.faltou.length > 0 && (
          <Aviso tipo="alerta" titulo="Faltou ler uma parte">
            Não achei {doc.faltou.join(", ")} na pasta do projeto. A página precisa abrir pelo admin deste computador, na
            pasta do Publike.
          </Aviso>
        )}
      </Secao>

      {aba === "notas" &&
        (busca ? (
          <NotasAchadas secoes={doc.secoes} notas={achadas.notas} busca={busca} />
        ) : (
          <TodasAsNotas secoes={doc.secoes} />
        ))}
      {aba === "banco" && <Migracoes migracoes={achadas.migracoes} busca={busca} total={doc.migracoes.length} />}
      {aba === "robos" && <Robos achadas={achadas} busca={busca} />}
    </div>
  );
}

function filtrar(doc: DocumentacaoTecnica, busca: string) {
  const notas = doc.secoes.flatMap((s) => s.notas);
  return {
    notas: notas.filter((n) => bateComBusca(`${n.secao} ${n.linhas.join(" ")}`, busca)),
    migracoes: doc.migracoes.filter((m) => bateComBusca(`${m.arquivo} ${m.descricao.join(" ")}`, busca)),
    robos: doc.robos.filter((r) => bateComBusca(`${r.nome} ${r.arquivo} ${r.descricao.join(" ")}`, busca)),
    crons: doc.cronsDaVercel.filter((c) => bateComBusca(c.caminho, busca)),
    tarefas: doc.tarefas.filter((t) => bateComBusca(`${t.funcao} ${t.descricao.join(" ")}`, busca)),
  };
}

/** Sem busca: o que mudou por último, o índice das seções e as seções com as notas fechadas. */
function TodasAsNotas({ secoes }: { secoes: SecaoTecnica[] }) {
  const recentes = secoes
    .flatMap((s) => s.notas)
    .filter((n) => n.data)
    .sort((a, b) => ((b.data as string) > (a.data as string) ? 1 : (b.data as string) < (a.data as string) ? -1 : 0))
    .slice(0, RECENTES);
  return (
    <>
      <Secao titulo="Mudou por último" descricao="As notas com as datas mais novas. Toque para abrir a nota.">
        <ul className="flex flex-col divide-y divide-line">
          {recentes.map((n) => (
            <li key={n.id} className="flex items-baseline gap-3 py-2">
              <span className="w-24 shrink-0 text-body-sm text-ink-muted tabular-nums">{dataCurta(n.data)}</span>
              <span className="min-w-0 text-body-sm">
                <a href={`#${n.id}`} className="font-semibold underline underline-offset-2">
                  <TextoTecnico texto={n.titulo} />
                </a>
                <span className="text-ink-muted"> · {tituloCurtoDaSecao(n.secao)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao titulo="Seções" descricao="As partes do Publike, na ordem das notas técnicas.">
        <ul className="flex flex-wrap gap-2">
          {secoes.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-line bg-surface-200 px-3 text-body-sm hover:bg-surface-300"
              >
                {tituloCurtoDaSecao(s.titulo)}
                <span className="text-ink-muted tabular-nums">{s.notas.length}</span>
              </a>
            </li>
          ))}
        </ul>
      </Secao>

      {secoes.map((s) => (
        <section
          key={s.id}
          id={s.id}
          aria-labelledby={`${s.id}-titulo`}
          className="flex scroll-mt-24 flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 sm:p-6"
        >
          <h2 id={`${s.id}-titulo`} className="text-h3">
            <TextoTecnico texto={s.titulo} />
          </h2>
          {s.intro.map((p, i) => (
            <p key={i} className="max-w-3xl text-body-sm text-ink-muted">
              <TextoTecnico texto={p} />
            </p>
          ))}
          <div className="flex flex-col gap-2">
            {s.notas.map((n) => (
              <NotaQueAbre key={n.id} nota={n} aberta={false} busca="" />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** "Pagamentos pelo Asaas (30/10/2026; claude/plano-checkout-asaas.md)" → "Pagamentos pelo Asaas". */
function tituloCurtoDaSecao(titulo: string) {
  const corte = titulo.search(/\s\(/);
  return (corte > 3 ? titulo.slice(0, corte) : titulo).replace(/`/g, "");
}

/** Com busca: só as notas que têm as palavras, abertas, por seção. */
function NotasAchadas({ secoes, notas, busca }: { secoes: SecaoTecnica[]; notas: NotaTecnica[]; busca: string }) {
  if (!notas.length) {
    return (
      <p className="rounded-lg border border-dashed border-line-strong p-6 text-body">
        Nenhuma nota técnica com “{busca}”. Tente outra palavra ou veja as abas Banco e Robôs e tarefas.
      </p>
    );
  }
  const porSecao = secoes
    .map((s) => ({ secao: s, notas: notas.filter((n) => n.secao === s.titulo) }))
    .filter((g) => g.notas.length);
  return (
    <>
      <p className="text-body-sm text-ink-muted">
        {notas.length === 1 ? "1 nota" : `${formatarNumero(notas.length)} notas`} com “{busca}”.
      </p>
      {porSecao.map(({ secao, notas: daSecao }) => (
        <section
          key={secao.id}
          aria-labelledby={`${secao.id}-titulo`}
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 sm:p-6"
        >
          <h2 id={`${secao.id}-titulo`} className="text-h3">
            <TextoTecnico texto={tituloCurtoDaSecao(secao.titulo)} />
          </h2>
          <div className="flex flex-col gap-2">
            {daSecao.map((n) => (
              <NotaQueAbre key={n.id} nota={n} aberta busca={busca} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** As migrações, da mais nova para a mais velha: o título e a data do comentário do começo de cada uma. */
function Migracoes({
  migracoes,
  busca,
  total,
}: {
  migracoes: DocumentacaoTecnica["migracoes"];
  busca: string;
  total: number;
}) {
  return (
    <Secao
      titulo="O que cada migração fez no banco"
      descricao={
        <>
          {formatarNumero(total)} migrações em <code>supabase/migrations</code>, da mais nova para a mais velha. O
          número do arquivo é a ordem em que rodam (não é a data); a data é a do texto de cada uma. Antes de mudar o
          banco de produção, o CI confere que todas rodam num banco novo, e a tarefa &quot;Banco em produção&quot;
          confere toda hora se a produção está igual.
        </>
      }
    >
      {busca && (
        <p className="text-body-sm text-ink-muted">
          {migracoes.length === 1 ? "1 migração" : `${formatarNumero(migracoes.length)} migrações`} com “{busca}”.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {migracoes.map((m) => (
          <details key={m.arquivo} open={Boolean(busca) && migracoes.length <= 10} className="group rounded-md border border-line bg-surface-100">
            <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="w-24 shrink-0 text-body-sm text-ink-muted tabular-nums">{dataCurta(m.data) ?? "—"}</span>
              <span className="min-w-0 flex-1 text-label">
                <TextoTecnico texto={m.titulo} busca={busca} />
              </span>
              <code className="text-caption text-ink-muted break-all">{m.arquivo}</code>
            </summary>
            <div className="border-t border-line px-4 py-3 text-body-sm leading-relaxed whitespace-pre-line">
              {m.descricao.map((linha, i) => (
                <span key={i}>
                  <TextoTecnico texto={linha} busca={busca} />
                  {"\n"}
                </span>
              ))}
            </div>
          </details>
        ))}
      </div>
    </Secao>
  );
}

/** Os robôs do GitHub, os horários da Vercel e as tarefas das filas, na ordem em que rodam. */
function Robos({ achadas, busca }: { achadas: ReturnType<typeof filtrar>; busca: string }) {
  return (
    <>
      <Secao
        titulo="No GitHub (Actions)"
        descricao="Tarefas que rodam sozinhas nos horários abaixo (no horário de Brasília) ou a cada push. As que têm “Rodar na hora” rodam também pelo botão Run workflow, em GitHub › Actions."
      >
        {achadas.robos.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Nenhuma com “{busca}”.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {achadas.robos.map((r) => (
              <article key={r.arquivo} className="rounded-md border border-line bg-surface-100 p-4">
                <h3 className="flex flex-wrap items-baseline gap-x-3 text-label">
                  <TextoTecnico texto={r.nome} busca={busca} />
                  <code className="text-caption font-normal text-ink-muted">.github/workflows/{r.arquivo}</code>
                </h3>
                <p className="mt-1 text-body-sm">
                  {r.horarios.length
                    ? r.horarios.map((h) => descreverCron(h)).join("; ")
                    : r.aCadaPush
                      ? "A cada push e pull request"
                      : "Sem horário próprio"}
                  {r.naHora && <span className="text-ink-muted"> · Rodar na hora pelo Run workflow</span>}
                </p>
                {r.descricao.length > 0 && (
                  <div className="mt-2 text-body-sm leading-relaxed whitespace-pre-line text-ink-muted">
                    {r.descricao.map((linha, i) => (
                      <span key={i}>
                        <TextoTecnico texto={linha} busca={busca} />
                        {"\n"}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Secao>

      <Secao titulo="Na Vercel (Cron)" descricao="As rotas do site que a Vercel chama sozinha (vercel.json), no horário de Brasília.">
        {achadas.crons.length === 0 ? (
          <p className="text-body-sm text-ink-muted">{busca ? `Nenhuma com “${busca}”.` : "Nenhuma."}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {achadas.crons.map((c) => (
              <li key={c.caminho} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-body-sm">
                <code>
                  <TextoTecnico texto={c.caminho} busca={busca} />
                </code>
                <span className="text-ink-muted">{descreverCron(c.horario)}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao
        titulo="As tarefas das filas"
        descricao={
          <>
            O cron-job.org chama <code>/api/filas</code> a cada minuto (Admin › Chaves), e a tarefa &quot;Filas do
            site&quot; do GitHub fica de reserva e de alarme. As tarefas rodam uma de cada vez, nesta ordem; passou de 40
            segundos, o resto fica para o minuto seguinte. O texto de cada uma é o comentário do código.
          </>
        }
      >
        {achadas.tarefas.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Nenhuma com “{busca}”.</p>
        ) : (
          <ol className="flex list-decimal flex-col gap-2 pl-6 text-body-sm marker:text-ink-muted">
            {achadas.tarefas.map((t) => (
              <li key={t.funcao} value={t.ordem} className="pl-1">
                <code className="font-semibold">
                  <TextoTecnico texto={t.funcao} busca={busca} />
                </code>
                {t.descricao.length > 0 && (
                  <span className="text-ink-muted">
                    {": "}
                    <TextoTecnico texto={t.descricao.join(" ")} busca={busca} />
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Secao>
    </>
  );
}
