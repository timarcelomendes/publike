import { Building2, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { AcoesDoPedido } from "@/components/pedidos/acoes-pedido";
import { CartaoPedido } from "@/components/pedidos/cartao-pedido";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { classesChip } from "@/components/painel/fluxo";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { listarMeusAnuncios, obterMeuPerfil } from "@/lib/dados";
import { primeiro } from "@/lib/formato";
import { diasUteisDepois, DIAS_UTEIS_DO_PRAZO } from "@/lib/pedidos-do-cliente";
import { listarMeusClientes } from "@/lib/servidor/clientes";
import { pedidosDaAgencia } from "@/lib/servidor/pedidos-do-cliente";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Pedidos dos clientes" };

// Pedidos dos clientes (só agência; migração 20270307120000): o que cada cliente pediu pelo link dele, com o aceite e
// o prazo ("Finalistas até"), a vaga ligada e o andamento. Os novos primeiro.

export default function PedidosDosClientes({ searchParams }: PageProps<"/painel/pedidos">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

const FILTROS = [
  { id: "abertos", nome: "Em andamento" },
  { id: "todos", nome: "Todos" },
] as const;

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/pedidos">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/pedidos");
  const sp = await searchParams;
  const perfil = await obterMeuPerfil();
  if (perfil?.tipo !== "agencia") {
    return (
      <Vazio
        icone={Building2}
        titulo="Pedidos dos clientes é para agência de emprego e RH"
        acao={<BotaoLink href="/painel">Voltar para Hoje</BotaoLink>}
      >
        O cliente da agência pede a vaga por um link, sem conta, e acompanha o prazo.
      </Vazio>
    );
  }
  const cliente = primeiro(sp.cliente) ?? null;
  const ver = primeiro(sp.ver) === "todos" ? "todos" : "abertos";
  const aberto = primeiro(sp.pedido) ?? null;
  const [dados, anuncios, clientes, agora] = await Promise.all([
    pedidosDaAgencia(cliente),
    listarMeusAnuncios().catch(() => []),
    listarMeusClientes(),
    agoraDaRequisicao(),
  ]);
  if (!dados) {
    return (
      <Aviso tipo="info" titulo="Os pedidos dos clientes ainda não estão disponíveis">
        Tente de novo mais tarde.
      </Aviso>
    );
  }
  const vagas = anuncios
    .filter((a) => a.tipo === "vaga" && a.status === "ativo" && new Date(a.expira_em).getTime() > agora)
    .map((a) => ({ id: a.id, titulo: a.titulo }));
  const lista = dados.pedidos.filter(
    (p) => ver === "todos" || ["recebido", "em_selecao", "finalistas"].includes(p.situacao) || p.id === aberto,
  );
  const novos = dados.pedidos.filter((p) => p.situacao === "recebido").length;
  const prazo = diasUteisDepois(dados.hoje, DIAS_UTEIS_DO_PRAZO);
  const nomeCliente = cliente ? clientes?.find((c) => c.id === cliente)?.nome : null;
  const href = (mudar: { ver?: string; cliente?: string | null }) => {
    const q = new URLSearchParams();
    const c = mudar.cliente === undefined ? cliente : mudar.cliente;
    const v = mudar.ver ?? ver;
    if (c) q.set("cliente", c);
    if (v === "todos") q.set("ver", "todos");
    const s = q.toString();
    return `/painel/pedidos${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina
        titulo="Pedidos dos clientes"
        selo={<Selo variante="novo">Novo</Selo>}
        descricao={
          <>
            Cada cliente tem um link, sem conta, para pedir vagas e acompanhar o prazo. Copie o link na ficha do
            cliente, em{" "}
            <Link href="/painel/clientes" className="underline underline-offset-2">
              Clientes
            </Link>
            .
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <Link key={f.id} href={href({ ver: f.id })} aria-current={ver === f.id ? "page" : undefined} className={classesChip(ver === f.id)}>
            {f.nome}
            {f.id === "abertos" && novos > 0 && <span className="tabular-nums opacity-70">{novos} novos</span>}
          </Link>
        ))}
        {nomeCliente && (
          <Link href={href({ cliente: null })} className={classesChip(true)}>
            {nomeCliente} ✕
          </Link>
        )}
      </div>
      {lista.length === 0 ? (
        <Vazio
          icone={Inbox}
          titulo={ver === "todos" ? "Nenhum pedido ainda" : "Nenhum pedido em andamento"}
          acao={<BotaoLink href="/painel/clientes">Copiar o link de um cliente</BotaoLink>}
        >
          Mande o link ao cliente: o pedido dele chega aqui, no sino e por e-mail.
        </Vazio>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((p) => {
            const doCliente = dados.noPrazo.get(p.cliente_id ?? "");
            return (
              <CartaoPedido
                key={p.id}
                p={p}
                hoje={dados.hoje}
                site={SITE_URL}
                lado="agencia"
                destaque={p.id === aberto || p.situacao === "recebido"}
                acoes={
                  <>
                    <AcoesDoPedido p={p} prazoSugerido={prazo} hoje={dados.hoje} vagas={vagas} />
                    {!cliente && doCliente && doCliente.total > 0 && (
                      <p className="text-body-sm text-ink-muted">
                        {p.cliente}: {doCliente.noPrazo} de {doCliente.total} no prazo em 90 dias.{" "}
                        <Link href={href({ cliente: p.cliente_id })} className="underline underline-offset-2">
                          Só os deste cliente
                        </Link>
                      </p>
                    )}
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
