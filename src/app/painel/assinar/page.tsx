import { ChevronRight, ClipboardCheck, Layers, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
  ehProduto,
  NOME_PRODUTO,
  podeAssinarCombo,
  recursosDo,
  type PagamentosDaConta,
  type Produto,
} from "@/lib/pagamentos";
import { pagamentosDaConta } from "@/lib/servidor/faturas";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Assinar", robots: { index: false } };

// Assinar o Copiloto, os Testes Publike ou o combo dos dois (claude/plano-checkout-asaas.md): o plano, cartão ou Pix e os dados
// da nota. Com ?troca=1, só o cartão novo da assinatura que já vale.

const ICONE: Record<Produto, typeof Sparkles> = { copiloto: Sparkles, testes: ClipboardCheck, combo: Layers };
const FAZ: Record<Produto, string> = {
  copiloto: "A IA que lê os currículos contra o que a vaga pede e mostra quem combina.",
  testes: "Testes na vaga, feitos pelo celular, com o resultado no quadro.",
  combo: "O Copiloto e os Testes Publike numa assinatura só, por menos que os dois separados.",
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
  const [pag, recursos, perfil] = await Promise.all([
    pagamentosDaConta(),
    recursosPagos(),
    obterMeuPerfil().catch(() => null),
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

  // nos recursos separados, o convite para o combo (quando está à venda e sai mais em conta)
  const combo = !troca && produto !== "combo" && podeAssinarCombo(pag, recursos) ? planoDoCombo(pag) : null;

  const cabecalho = (
    <div className="flex flex-col gap-2">
      <span className="flex size-10 items-center justify-center rounded-pill bg-terra-soft">
        <Icone aria-hidden className="size-5 text-terra-text" />
      </span>
      <h2 className="text-h2">
        {troca ? `Trocar o cartão do ${NOME_PRODUTO[produto]}` : `Assinar o ${NOME_PRODUTO[produto]}`}
      </h2>
      <p className="text-body text-ink-muted">{FAZ[produto]}</p>
    </div>
  );

  let corpo;
  if (!pag?.pode) {
    corpo = (
      <Aviso tipo="info" titulo="A assinatura ainda não está aberta">
        {pag?.tipo === "pessoa"
          ? "O Copiloto e os Testes Publike são para contas de comércio, empresa ou agência."
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
            : `O ${NOME_PRODUTO[produto]} já está liberado para a sua conta`
        }
      >
        Não há nada a pagar.
      </Aviso>
    );
  } else if (ativa && !troca) {
    corpo = (
      <Aviso tipo="sucesso" titulo={`Você já assina o ${NOME_PRODUTO[produto]}`}>
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
      <Aviso tipo="info" titulo={`Você assina o ${NOME_PRODUTO[conflito.recurso]}`}>
        <span className="flex flex-col items-start gap-2">
          <span>
            {produto === "combo"
              ? "Para passar para o combo, cancele essa assinatura em Assinatura. O que já foi pago continua valendo, e o combo começa a cobrar quando ele acabar."
              : `O combo já inclui o ${NOME_PRODUTO[produto]}.`}
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
      <Aviso tipo="info" titulo={`O ${NOME_PRODUTO[produto]} ainda não está à venda`}>
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
        }}
      />
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {cabecalho}
      {combo && combo.economia > 0 && (
        <Link
          href="/painel/assinar?recurso=combo"
          className="flex items-center gap-3 rounded-lg border border-line-strong bg-surface-200 p-4 shadow-card hover:bg-surface-300"
        >
          <Layers aria-hidden className="size-6 shrink-0 text-terra-text" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2 text-label">
              Leve os dois no combo
              <Selo variante="novo">Novo</Selo>
            </span>
            <span className="text-body-sm text-ink-muted">
              Copiloto e Testes Publike por {formatarMoeda(combo.valor)} por mês, em vez de{" "}
              {formatarMoeda(combo.separados)}.
            </span>
          </span>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
        </Link>
      )}
      {corpo}
      {!troca && <OutraOpcao produto={produto} />}
    </div>
  );
}

const LINK = "font-semibold text-terra-text underline underline-offset-2";

/** No pé da tela, o convite para o outro recurso (ou para o combo), dito pelo que ele resolve. */
function OutraOpcao({ produto }: { produto: Produto }) {
  const para = (p: Produto, texto: string) => (
    <Link href={`/painel/assinar?recurso=${p}`} className={LINK}>
      {texto}
    </Link>
  );
  return (
    <p className="text-body-sm text-ink-muted">
      {produto === "copiloto" ? (
        <>
          Quer saber quem sabe antes da entrevista? Conheça os {para("testes", "Testes Publike")} ou leve{" "}
          {para("combo", "os dois no combo")} e pague menos.
        </>
      ) : produto === "testes" ? (
        <>
          Quer que a IA ache quem combina com a sua vaga? Conheça o {para("copiloto", "Copiloto")} ou leve{" "}
          {para("combo", "os dois no combo")} e pague menos.
        </>
      ) : (
        <>
          Prefere começar com um só? Assine só o {para("copiloto", "Copiloto")} ou só os{" "}
          {para("testes", "Testes Publike")}.
        </>
      )}
    </p>
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
