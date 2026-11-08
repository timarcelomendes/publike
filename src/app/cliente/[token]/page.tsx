import { ClipboardList, Send } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CancelarPedido } from "@/components/pedidos/acoes-pedido";
import { CartaoPedido } from "@/components/pedidos/cartao-pedido";
import { PedirVaga } from "@/components/pedidos/pedir-vaga";
import { Aviso, Avatar, Container, Esqueleto } from "@/components/ui/basicos";
import { SITE_URL } from "@/lib/config";
import { formatarLugar } from "@/lib/formato";
import { portalDoCliente } from "@/lib/servidor/pedidos-do-cliente";

export const metadata: Metadata = { title: "Pedidos de vaga", robots: { index: false, follow: false } };

// O link do cliente da agência (sem conta; migração 20270307120000): pedir uma vaga e acompanhar cada pedido, com o
// prazo combinado e o andamento da vaga. Os candidatos só aparecem no link dos finalistas.

export default function LinkDoCliente({ params }: PageProps<"/cliente/[token]">) {
  return (
    <Container className="max-w-3xl py-6 sm:py-8">
      <Suspense fallback={<Esqueleto className="h-96 w-full rounded-lg" />}>
        {params.then(({ token }) => (
          <Conteudo token={token} />
        ))}
      </Suspense>
    </Container>
  );
}

async function Conteudo({ token }: { token: string }) {
  const d = await portalDoCliente(token);
  if (d === "erro") {
    return (
      <Aviso tipo="alerta" titulo="Não deu para abrir agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  if (!d) {
    return (
      <Aviso tipo="alerta" titulo="Este link não vale">
        Confira se copiou o link inteiro ou peça um novo para a agência.
      </Aviso>
    );
  }
  const abertos = d.pedidos.filter((p) => ["recebido", "em_selecao", "finalistas"].includes(p.situacao));
  const fechados = d.pedidos.filter((p) => !abertos.includes(p));
  const local = d.cliente.endereco || d.cliente.bairro ? formatarLugar(d.cliente.bairro, d.cliente.cidade ?? "") : null;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <Avatar nome={d.agencia.nome} foto={d.agencia.foto} tamanho={48} />
        <div className="min-w-0">
          <p className="text-body-sm text-ink-muted">Pedidos de vaga para {d.agencia.nome}</p>
          <h1 className="text-h2 break-words">{d.cliente.nome}</h1>
        </div>
      </header>
      <p className="text-body text-ink-muted">
        Peça uma vaga aqui e acompanhe cada pedido: a agência responde, combina o prazo dos finalistas e o andamento
        aparece nesta página.
      </p>

      {abertos.length > 0 && (
        <section aria-labelledby="em-andamento" className="flex flex-col gap-3">
          <h2 id="em-andamento" className="flex items-center gap-2 text-h3">
            <ClipboardList aria-hidden className="size-5 text-ink-muted" />
            Em andamento
          </h2>
          {abertos.map((p) => (
            <CartaoPedido
              key={p.id}
              p={p}
              hoje={d.hoje}
              site={SITE_URL}
              lado="cliente"
              acoes={
                p.situacao === "recebido" || p.situacao === "em_selecao" ? (
                  <CancelarPedido token={token} pedido={p.id} />
                ) : null
              }
            />
          ))}
        </section>
      )}

      <section
        aria-labelledby="pedir"
        className="flex flex-col gap-4 rounded-lg border-2 border-terra bg-surface-200 p-4 shadow-card sm:p-6"
      >
        <div>
          <h2 id="pedir" className="flex items-center gap-2 text-h3">
            <Send aria-hidden className="size-5 text-terra-text" />
            Pedir uma vaga
          </h2>
          <p className="mt-1 text-body-sm text-ink-muted">
            Só o cargo é obrigatório. Quanto mais você contar, mais rápido a agência acha a pessoa certa.
          </p>
        </div>
        <PedirVaga token={token} local={local} hoje={d.hoje} />
      </section>

      {fechados.length > 0 && (
        <section aria-labelledby="encerrados" className="flex flex-col gap-3">
          <h2 id="encerrados" className="text-h3">
            Pedidos encerrados
          </h2>
          {fechados.map((p) => (
            <CartaoPedido key={p.id} p={p} hoje={d.hoje} site={SITE_URL} lado="cliente" />
          ))}
        </section>
      )}

      <p className="text-body-sm text-ink-muted">
        Este link é só seu: não precisa de senha. Se ele cair em outras mãos, peça à agência para trocar.
      </p>
    </div>
  );
}
