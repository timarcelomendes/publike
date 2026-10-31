import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Container, Esqueleto, Selo, Vazio } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { tempoRelativo } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import { faixaDoTeste, NOME_FAIXA, textoDoResultado } from "@/lib/testes";

export const metadata: Metadata = { title: "Meus testes", robots: { index: false } };

// Os testes que as vagas pediram para a pessoa: os pendentes primeiro (o aviso "teste_pedido" abre aqui).

export default function MeusTestes() {
  return (
    <Container className="max-w-2xl py-8">
      <h1 className="text-h2 sm:text-h1">Meus testes</h1>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        Os testes que as vagas pediram para você. Só quem publicou a vaga vê o resultado.
      </p>
      <Suspense fallback={<Esqueleto className="h-64 w-full rounded-lg" />}>
        <Conteudo />
      </Suspense>
    </Container>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/testes");
  const supabase = await criarClienteServidor();
  const [{ data, error }, agora] = await Promise.all([supabase.rpc("minhas_avaliacoes"), agoraDaRequisicao()]);
  if (error) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para carregar os testes agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  if (!data?.length) {
    return (
      <Vazio icone={ClipboardCheck} titulo="Nenhum teste por aqui">
        Quando uma vaga que você curtiu pedir um teste, ele aparece aqui e no sino.
      </Vazio>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {data.map((t) => (
        <li key={t.id}>
          <Link
            href={`/testes/${t.id}`}
            className="flex flex-col gap-1 rounded-lg border border-line bg-surface-200 p-4 hover:bg-surface-300"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-label">{t.titulo}</span>
              {t.status === "feita" ? (
                <Selo variante="match">Feito</Selo>
              ) : t.vencida ? (
                <Selo variante="contorno">Prazo acabou</Selo>
              ) : (
                <Selo variante="aviso">Para fazer</Selo>
              )}
            </span>
            <span className="text-body-sm text-ink-muted">
              {t.empresa} · {t.vaga}
            </span>
            <span className="text-body-sm text-ink-muted">
              {t.status === "feita"
                ? `${textoDoResultado(t.tipo, t.pontos, t.maximo)} · ${NOME_FAIXA[faixaDoTeste(t.tipo, t.pontos, t.maximo) ?? "dentro"].toLowerCase()} · feito ${tempoRelativo(t.feita_em!, agora)}`
                : t.vencida
                  ? "O prazo acabou."
                  : `Faça até ${new Date(t.prazo).toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}.`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
