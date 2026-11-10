import { Eye } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { BotaoImprimir } from "@/components/finalistas/resposta-cliente";
import { RelatorioDoCliente } from "@/components/relatorio/relatorio-do-cliente";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { lerRelatorio } from "@/lib/relatorio-cliente";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Relatório de seleção", robots: { index: false, follow: false } };

// O relatório que a agência manda ao cliente (sem conta, pelo link; migração 20270409120000): os últimos 90 dias,
// com a marca da agência. Dá para imprimir ou salvar em PDF.

export default function RelatorioPeloLink({ params }: PageProps<"/relatorio/[token]">) {
  return (
    <Container className="max-w-4xl py-8" data-imprimir>
      <Suspense fallback={<Esqueleto className="h-96 w-full rounded-lg" />}>
        {params.then(({ token }) => (
          <Conteudo token={token} />
        ))}
      </Suspense>
    </Container>
  );
}

async function Conteudo({ token }: { token: string }) {
  const naoVale = (
    <Aviso tipo="alerta" titulo="Este link não vale">
      Confira se copiou o link inteiro ou peça um novo para quem mandou.
    </Aviso>
  );
  if (MODO_DEMO || !/^[0-9a-f]{64}$/.test(token)) return naoVale;
  const { data, error } = await (await criarClienteServidor()).rpc("relatorio_por_link", { p_token: token });
  if (error) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para abrir o relatório agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  const r = lerRelatorio(data);
  if (!r) return naoVale;
  if (!r.liberado) {
    return (
      <Aviso tipo="alerta" titulo="Este relatório não está disponível">
        Fale com {r.agencia.nome || "quem mandou o link"} para receber os números da seleção.
      </Aviso>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {r.previa && (
        <p data-nao-imprimir className="flex items-start gap-2 rounded-md bg-surface-300 px-4 py-3 text-body-sm">
          <Eye aria-hidden className="mt-0.5 size-4 shrink-0" />
          Você está vendo como o cliente vê. A sua abertura não conta.
        </p>
      )}
      <div className="flex justify-end" data-nao-imprimir>
        <BotaoImprimir />
      </div>
      <RelatorioDoCliente r={r} />
    </div>
  );
}
