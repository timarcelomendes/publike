import { ClipboardCheck, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SeloCortesia } from "@/components/selo-cortesia";
import { SoComSupabase } from "@/components/so-com-supabase";
import { comVaga, vagaDaVolta, VoltarParaVaga } from "@/components/testes/voltar-para-vaga";
import { Aviso } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { bibliotecaDeTestes } from "@/lib/servidor/testes";
import { exigirUsuario } from "@/lib/sessao";
import { NAO_E_PSICOLOGICO } from "@/lib/testes";

export const metadata: Metadata = { title: "Testes Publike" };

// A biblioteca de testes (migração 20261204120000): os da Publike e os da casa. Na vaga, em Testes da vaga.

export default function Testes({ searchParams }: PageProps<"/painel/testes">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

function Linha({
  href,
  titulo,
  descricao,
  questoes,
  extra,
}: {
  href: string;
  titulo: string;
  descricao: string | null;
  questoes: number;
  extra?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex flex-col gap-0.5 rounded-lg border border-line bg-surface-200 p-4 hover:bg-surface-300"
      >
        <span className="text-label">{titulo}</span>
        <span className="text-body-sm text-ink-muted">
          {questoes} {questoes === 1 ? "questão" : "questões"}
          {extra ? ` · ${extra}` : ""}
          {descricao ? ` · ${descricao}` : ""}
        </span>
      </Link>
    </li>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/testes">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const sp = await searchParams;
  const usuario = await exigirUsuario("/painel/testes");
  // veio dos testes de uma vaga: a volta para ela, e os links daqui levam a vaga junto
  const [biblioteca, vaga] = await Promise.all([bibliotecaDeTestes(), vagaDaVolta(sp.vaga, usuario.id)]);
  if (biblioteca === null) {
    return (
      <Aviso tipo="alerta" titulo="Os testes ainda não estão disponíveis">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  const publike = biblioteca.filter((m) => !m.da_casa);
  const casa = biblioteca.filter((m) => m.da_casa);
  return (
    <div className="flex flex-col gap-6">
      {vaga && <VoltarParaVaga vaga={vaga} />}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-h2">Testes Publike</h2>
          <SeloCortesia />
        </div>
        <p className="text-body text-ink-muted">
          Ponha um teste na vaga e quem curtir faz pelo celular. Você vê o resultado no quadro de cada vaga, em Testes.
        </p>
      </div>

      <section aria-labelledby="titulo-publike" className="flex flex-col gap-3">
        <h3 id="titulo-publike" className="flex items-center gap-2 text-h3">
          <ClipboardCheck aria-hidden className="size-5 text-ink-muted" />
          Da Publike
        </h3>
        {publike.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {publike.map((m) => (
              <Linha
                key={m.id}
                href={comVaga(`/painel/testes/${m.id}`, vaga)}
                titulo={m.titulo}
                descricao={m.descricao}
                questoes={m.questoes}
                extra={m.tipo === "situacoes" ? "por competência" : "acertos de 0 a 10"}
              />
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-ink-muted">Os testes da Publike estão em revisão e aparecem aqui em breve.</p>
        )}
      </section>

      <section aria-labelledby="titulo-casa" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="titulo-casa" className="text-h3">
            Da sua empresa
          </h3>
          <BotaoLink href={comVaga("/painel/testes/novo", vaga)} tamanho="sm">
            <Plus aria-hidden />
            Criar teste
          </BotaoLink>
        </div>
        {casa.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {casa.map((m) => (
              <Linha
                key={m.id}
                href={comVaga(`/painel/testes/${m.id}`, vaga)}
                titulo={m.titulo}
                descricao={m.descricao}
                questoes={m.questoes}
              />
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-ink-muted">
            Crie as perguntas que só a sua empresa sabe fazer: o cardápio da casa, o produto que vocês vendem.
          </p>
        )}
      </section>
      <p className="text-body-sm text-ink-muted">{NAO_E_PSICOLOGICO}</p>
    </div>
  );
}
