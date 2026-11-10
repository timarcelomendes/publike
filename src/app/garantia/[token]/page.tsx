import type { Metadata } from "next";
import { Suspense } from "react";
import { ResponderGarantia } from "@/components/garantia/responder";
import { Aviso, Avatar, Container, Esqueleto } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Garantia da contratação", robots: { index: false, follow: false } };

// O cliente da agência responde, sem conta, se a pessoa contratada continua (migração 20270410120000). A pergunta
// chega por e-mail 7 dias antes do fim da garantia, quando a agência tem o Plano Agência.

export default function GarantiaPeloLink({ params }: PageProps<"/garantia/[token]">) {
  return (
    <Container className="max-w-xl py-10">
      <Suspense fallback={<Esqueleto className="h-64 w-full rounded-lg" />}>
        {params.then(({ token }) => (
          <Conteudo token={token} />
        ))}
      </Suspense>
    </Container>
  );
}

type Garantia = {
  agencia: string;
  agencia_foto: string | null;
  cliente: string;
  vaga: string;
  pessoa: string;
  fim: string;
  resposta: "continua" | "saiu" | null;
};

const dataBR = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(
    new Date(`${iso.slice(0, 10)}T12:00:00-03:00`),
  );

async function Conteudo({ token }: { token: string }) {
  const naoVale = (
    <Aviso tipo="alerta" titulo="Este link não vale">
      Confira se copiou o link inteiro do e-mail.
    </Aviso>
  );
  if (MODO_DEMO || !/^[0-9a-f]{64}$/.test(token)) return naoVale;
  const { data, error } = await (await criarClienteServidor()).rpc("garantia_por_link", { p_token: token });
  if (error) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para abrir agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  const g = data as Garantia | null;
  if (!g || typeof g !== "object" || !g.vaga) return naoVale;
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 shadow-card sm:p-7">
      <div className="flex items-center gap-3">
        <Avatar nome={g.agencia} foto={g.agencia_foto} tamanho={44} />
        <div className="min-w-0">
          <p className="text-label">{g.agencia}</p>
          <p className="text-body-sm text-ink-muted">Garantia da contratação</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-h2">{g.pessoa} continua com vocês?</h1>
        <p className="text-body text-ink-muted">
          {g.agencia} contratou {g.pessoa} para a vaga de {g.vaga}, em {g.cliente}. A garantia vai até {dataBR(g.fim)}:
          se a pessoa saiu, a agência cuida da reposição.
        </p>
      </div>
      {g.resposta ? (
        <Aviso tipo="sucesso" titulo="Resposta enviada">
          {g.resposta === "saiu"
            ? `Você avisou que ${g.pessoa} saiu. ${g.agencia} já sabe.`
            : `Você confirmou que ${g.pessoa} continua. Obrigado!`}
        </Aviso>
      ) : (
        <ResponderGarantia token={token} pessoa={g.pessoa} />
      )}
    </section>
  );
}
