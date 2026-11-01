import { ArrowLeft, UserX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { contasApagadas } from "@/lib/admin/dados";
import { MOTIVOS_SAIDA, quantoDurou } from "@/lib/conta-apagada";
import { formatarNumero, rotuloConta } from "@/lib/formato";
import { dataHora } from "@/lib/planilha";
import { exigirAdminLocal } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Contas apagadas" };

// As contas apagadas nos últimos 90 dias (migração 20270113120000): quem apagou, quanto durou e por quê, sem nome
// nem contato.

export default function ContasApagadas() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const c = await exigirAdminLocal();
  const lista = await contasApagadas(c, 90);
  const voltar = (
    <Link
      href="/admin/usuarios"
      className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink"
    >
      <ArrowLeft aria-hidden className="size-4" />
      Usuários
    </Link>
  );
  if (!lista) {
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <Aviso tipo="alerta" titulo="Ainda não disponível">
          Rode a migração 20270113120000_contas_apagadas no banco.
        </Aviso>
      </div>
    );
  }
  const pelaPessoa = lista.filter((a) => a.por === "pessoa");
  // por que saíram: o motivo escolhido (o texto antes dos dois-pontos)
  const porMotivo = MOTIVOS_SAIDA.map((m) => ({
    nome: m.nome,
    n: pelaPessoa.filter((a) => a.motivo === m.nome || a.motivo?.startsWith(`${m.nome}:`)).length,
  })).filter((m) => m.n > 0);
  const semMotivo = pelaPessoa.filter((a) => !a.motivo).length;

  return (
    <div className="flex flex-col gap-5">
      {voltar}
      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-h2">
          Contas apagadas
          <Selo variante="novo">Novo</Selo>
        </h2>
        <p className="mt-1 text-body text-ink-muted">
          Nos últimos 90 dias: {formatarNumero(pelaPessoa.length)} pela própria pessoa e{" "}
          {formatarNumero(lista.length - pelaPessoa.length)} pela equipe. Nome e contato não ficam guardados.
        </p>
      </div>
      {pelaPessoa.length > 0 && (
        <section
          aria-labelledby="motivos"
          className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4"
        >
          <h3 id="motivos" className="text-label">
            Por que saíram
          </h3>
          <ul className="flex flex-wrap gap-2">
            {porMotivo.map((m) => (
              <li key={m.nome}>
                <Selo variante="contorno">
                  {m.nome}: {m.n}
                </Selo>
              </li>
            ))}
            {semMotivo > 0 && (
              <li>
                <Selo variante="contorno">Não disseram: {semMotivo}</Selo>
              </li>
            )}
          </ul>
        </section>
      )}
      {lista.length === 0 ? (
        <Vazio icone={UserX} titulo="Nenhuma conta apagada nos últimos 90 dias">
          Quando alguém apagar a conta, aparece aqui.
        </Vazio>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
          {lista.map((a) => {
            const durou = quantoDurou(a.criada_em, a.apagada_em);
            return (
              <li key={a.id} className="flex flex-col gap-1 px-4 py-3 text-body-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/usuarios/${a.id}`} className="text-label underline-offset-2 hover:underline">
                    {dataHora(a.apagada_em)}
                  </Link>
                  <Selo variante={a.por === "pessoa" ? "neutro" : "aviso"}>
                    {a.por === "pessoa" ? "Pela pessoa" : "Pela equipe"}
                  </Selo>
                  <span className="text-ink-muted">
                    {[a.tipo ? rotuloConta(a.tipo) : "Sem perfil", a.cidade, durou ? `durou ${durou}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </p>
                {a.por === "pessoa" && <p>{a.motivo ?? <span className="text-ink-muted">Não disse o motivo.</span>}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
