import { ChevronRight, ClipboardCheck, Layers, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { FormAssinar } from "@/components/pagamentos/form-assinar";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil, recursosPagos } from "@/lib/dados";
import { formatarMoeda, primeiro } from "@/lib/formato";
import {
  diaBr,
  diaDaPrimeiraCobranca,
  DO_PRODUTO,
  ehProduto,
  NOME_PRODUTO,
  O_PRODUTO,
  podeAssinarCombo,
  recursosDo,
  type PagamentosDaConta,
  type Produto,
} from "@/lib/pagamentos";
import { meuEnderecoDeCobranca, pagamentosDaConta } from "@/lib/servidor/faturas";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Assinar", robots: { index: false } };

// Assinar a Triagem com IA, o Teste Prático ou o combo dos dois (claude/plano-checkout-asaas.md): o plano, cartão ou Pix e os dados
// da nota. Com ?troca=1, só o cartão novo da assinatura que já vale.

const ICONE: Record<Produto, typeof Sparkles> = { copiloto: Sparkles, testes: ClipboardCheck, combo: Layers };
const FAZ: Record<Produto, string> = {
  copiloto: "A IA que lê os currículos contra o que a vaga pede e mostra quem combina.",
  testes: "Testes na vaga, feitos pelo celular, com o resultado no quadro.",
  combo: "A Triagem com IA e o Teste Prático numa assinatura só, por menos que os dois separados.",
};

export default function Assinar({ searchParams }: PageProps<"/painel/assinar">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/assinar">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const sp = await searchParams;
  const pedido = primeiro(sp.recurso);
  const produto: Produto = ehProduto(pedido) ? pedido : "copiloto";
  const troca = primeiro(sp.troca) === "1";
  await exigirUsuario(`/painel/assinar?recurso=${produto}`);
  const [pag, recursos, perfil, cobranca] = await Promise.all([
    pagamentosDaConta(),
    recursosPagos(),
    obterMeuPerfil().catch(() => null),
    meuEnderecoDeCobranca(),
  ]);
  const Icone = ICONE[produto];
  const planos = (pag?.planos ?? []).filter((p) => p.recurso === produto);
  const valendo = (pag?.assinaturas ?? []).filter((a) => a.situacao !== "cancelada");
  const ativa = valendo.find((a) => a.recurso === produto && a.situacao === "ativa");
  // o combo e os recursos separados não valem juntos
  const conflito =
    produto === "combo" ? valendo.find((a) => a.recurso !== "combo") : valendo.find((a) => a.recurso === "combo");
  const semPrazo = recursosDo(produto).every((r) => recursos?.[r].liberado && !recursos[r].ate);

  // a 1ª cobrança: o fim do teste grátis ou do período já pago (o servidor calcula de novo)
  const hoje = diaBr(new Date());
  const dia = diaDaPrimeiraCobranca(produto, pag?.testes_ate, pag?.pago_ate);
  const primeiraCobranca = dia > hoje ? dia : null;

  const cabecalho = (
    <div className="flex flex-col gap-2">
      <span className="flex size-10 items-center justify-center rounded-pill bg-terra-soft">
        <Icone aria-hidden className="size-5 text-terra-text" />
      </span>
      <h2 className="text-h2">{troca ? `Trocar o cartão ${DO_PRODUTO[produto]}` : `Assinar ${O_PRODUTO[produto]}`}</h2>
      <p className="text-body text-ink-muted">{FAZ[produto]}</p>
    </div>
  );

  let corpo;
  if (!pag?.pode) {
    corpo = (
      <Aviso tipo="info" titulo="A assinatura ainda não está aberta">
        {pag?.tipo === "pessoa"
          ? "A Triagem com IA e o Teste Prático são para contas de comércio, empresa ou agência."
          : "Logo você vai poder assinar por aqui. Enquanto isso, fale com o Publike."}
      </Aviso>
    );
  } else if (semPrazo) {
    corpo = (
      <Aviso
        tipo="sucesso"
        titulo={
          produto === "combo"
            ? "Os dois já estão liberados para a sua conta"
            : `${NOME_PRODUTO[produto]}: já liberado para a sua conta`
        }
      >
        Não há nada a pagar.
      </Aviso>
    );
  } else if (ativa && !troca) {
    corpo = (
      <Aviso tipo="sucesso" titulo={`Você já assina ${O_PRODUTO[produto]}`}>
        <span className="flex flex-col items-start gap-2">
          <span>Veja a forma de pagamento, as próximas cobranças e as faturas em Assinatura.</span>
          <BotaoLink href="/painel/assinatura" tamanho="sm">
            Ver assinatura
          </BotaoLink>
        </span>
      </Aviso>
    );
  } else if (conflito && !troca) {
    corpo = (
      <Aviso tipo="info" titulo={`Você assina ${O_PRODUTO[conflito.recurso]}`}>
        <span className="flex flex-col items-start gap-2">
          <span>
            {produto === "combo"
              ? "Para passar para o combo, cancele essa assinatura em Assinatura. O que já foi pago continua valendo, e o combo começa a cobrar quando ele acabar."
              : `O combo já inclui ${O_PRODUTO[produto]}.`}
          </span>
          <BotaoLink href="/painel/assinatura" tamanho="sm">
            Ver assinatura
          </BotaoLink>
        </span>
      </Aviso>
    );
  } else if (troca && !ativa) {
    corpo = <Aviso tipo="info" titulo="Não há assinatura para trocar o cartão" />;
  } else if (planos.length === 0) {
    corpo = (
      <Aviso tipo="info" titulo={`${NOME_PRODUTO[produto]}: ainda não está à venda`}>
        Logo você vai poder assinar por aqui.
      </Aviso>
    );
  } else {
    const trocaPlanos = troca && ativa ? planos.filter((p) => p.ciclo === ativa.ciclo) : planos;
    corpo = (
      <FormAssinar
        // trocar de produto pelo link (Copiloto → combo) começa o formulário de novo, com os planos dele
        key={`${produto}-${troca}`}
        recurso={produto}
        planos={trocaPlanos.length ? trocaPlanos : planos}
        primeiro={primeiraCobranca}
        troca={troca}
        inicial={{
          documento: pag.cliente?.cpf_cnpj ?? perfil?.cnpj ?? "",
          nome: pag.cliente?.nome ?? perfil?.nome ?? "",
          email: pag.cliente?.email ?? perfil?.email ?? "",
          telefone: cobranca?.telefone ?? perfil?.whatsapp ?? "",
          endereco: cobranca?.endereco ?? null,
        }}
      />
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {cabecalho}
      {corpo}
      {!troca && <OutraOpcao produto={produto} pag={pag} comboAberto={podeAssinarCombo(pag, recursos)} />}
    </div>
  );
}

const OFERTA_CURTA: Record<Produto, { titulo: string; texto: string; botao: string }> = {
  copiloto: {
    titulo: "Triagem com IA",
    texto: "A IA lê os currículos e mostra quem combina com a vaga, com a prova de cada ponto.",
    botao: "Conhecer a Triagem",
  },
  testes: {
    titulo: "Teste Prático",
    texto: "Saiba quem sabe o serviço antes da entrevista: o candidato faz o teste pelo celular.",
    botao: "Conhecer o Teste Prático",
  },
  combo: {
    titulo: "Os dois no combo",
    texto: "Triagem com IA e Teste Prático numa assinatura só, por menos que os dois separados.",
    botao: "Ver o combo",
  },
};

/** No pé da tela, o convite para o outro recurso e para o combo (ou, no combo, para um só), com o preço. */
function OutraOpcao({
  produto,
  pag,
  comboAberto,
}: {
  produto: Produto;
  pag: PagamentosDaConta | null;
  /** o combo pode ser assinado agora (sem assinatura valendo) */
  comboAberto: boolean;
}) {
  const mensal = (p: Produto) => pag?.planos.find((x) => x.recurso === p && x.ciclo === "MONTHLY")?.valor ?? null;
  const ordem: Produto[] =
    produto === "combo" ? ["copiloto", "testes"] : [produto === "copiloto" ? "testes" : "copiloto", "combo"];
  const opcoes = ordem.filter((p) => pag?.planos.some((x) => x.recurso === p) && (p !== "combo" || comboAberto));
  if (!opcoes.length) return null;
  const combo = planoDoCombo(pag);
  return (
    <section aria-labelledby="outra-opcao" className="flex flex-col gap-3">
      <h3 id="outra-opcao" className="text-h3">
        {produto === "combo" ? "Prefere começar com um só?" : "Contrate melhor com os dois"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {opcoes.map((p) => {
          const o = OFERTA_CURTA[p];
          const Icone = ICONE[p];
          const valor = mensal(p);
          return (
            <div
              key={p}
              className={`flex flex-col gap-3 rounded-lg border bg-surface-200 p-5 shadow-card ${
                p === "combo" ? "border-terra" : "border-line-strong"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-terra-soft">
                  <Icone aria-hidden className="size-5 text-terra-text" />
                </span>
                {p === "combo" && combo && combo.economia > 0 && (
                  <Selo variante="novo">Economize {formatarMoeda(Math.round(combo.economia * 100) / 100)}</Selo>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-label">{o.titulo}</p>
                <p className="text-body-sm text-ink-muted">{o.texto}</p>
              </div>
              {valor != null && (
                <p className="text-h3 tabular-nums">
                  {formatarMoeda(valor)} <span className="text-body-sm font-normal text-ink-muted">por mês</span>
                </p>
              )}
              <BotaoLink
                href={`/painel/assinar?recurso=${p}`}
                variante="secundario"
                tamanho="sm"
                className="mt-auto self-start"
              >
                {o.botao}
                <ChevronRight aria-hidden />
              </BotaoLink>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** O combo mensal e quanto os dois mensais custam separados (sem o mensal dos dois, sem comparação). */
function planoDoCombo(pag: PagamentosDaConta | null) {
  const mensal = (r: Produto) => pag?.planos.find((p) => p.recurso === r && p.ciclo === "MONTHLY")?.valor;
  const valor = mensal("combo");
  const c = mensal("copiloto");
  const t = mensal("testes");
  if (valor == null || c == null || t == null) return null;
  return { valor, separados: c + t, economia: c + t - valor };
}
