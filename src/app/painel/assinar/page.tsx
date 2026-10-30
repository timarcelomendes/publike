import { ClipboardCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FormAssinar } from "@/components/pagamentos/form-assinar";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil, recursosPagos } from "@/lib/dados";
import { primeiro } from "@/lib/formato";
import { ehRecursoPago, NOME_RECURSO, type RecursoPago } from "@/lib/recursos-pagos";
import { pagamentosDaConta } from "@/lib/servidor/faturas";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Assinar", robots: { index: false } };

// Assinar o Copiloto ou os Testes Publike (claude/plano-checkout-asaas.md): o plano, cartão ou Pix e os dados
// da nota. Com ?troca=1, só o cartão novo da assinatura que já vale.

const ICONE: Record<RecursoPago, typeof Sparkles> = { copiloto: Sparkles, testes: ClipboardCheck };
const FAZ: Record<RecursoPago, string> = {
  copiloto: "A IA que lê os currículos contra o que a vaga pede e mostra quem combina.",
  testes: "Testes na vaga, feitos pelo celular, com o resultado no quadro.",
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
  const recurso: RecursoPago = ehRecursoPago(pedido) ? pedido : "copiloto";
  const troca = primeiro(sp.troca) === "1";
  await exigirUsuario(`/painel/assinar?recurso=${recurso}`);
  const [pag, recursos, perfil] = await Promise.all([
    pagamentosDaConta(),
    recursosPagos(),
    obterMeuPerfil().catch(() => null),
  ]);
  const estado = recursos?.[recurso];
  const Icone = ICONE[recurso];
  const outro: RecursoPago = recurso === "copiloto" ? "testes" : "copiloto";
  const planos = (pag?.planos ?? []).filter((p) => p.recurso === recurso);
  const ativa = pag?.assinaturas.find((a) => a.recurso === recurso && a.situacao === "ativa");

  // a 1ª cobrança: o fim do teste grátis ou do período já pago (o servidor calcula de novo)
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const datas = [pag?.testes_ate?.[recurso], pag?.pago_ate?.[recurso]]
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
  const maior = datas.reduce((m, d) => (d > m ? d : m), hoje);
  const primeiraCobranca = maior > hoje ? maior : null;

  const cabecalho = (
    <div className="flex flex-col gap-2">
      <span className="flex size-10 items-center justify-center rounded-pill bg-terra-soft">
        <Icone aria-hidden className="size-5 text-terra-text" />
      </span>
      <h2 className="text-h2">
        {troca ? `Trocar o cartão do ${NOME_RECURSO[recurso]}` : `Assinar o ${NOME_RECURSO[recurso]}`}
      </h2>
      <p className="text-body text-ink-muted">{FAZ[recurso]}</p>
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
  } else if (estado?.liberado && !estado.ate) {
    corpo = (
      <Aviso tipo="sucesso" titulo={`O ${NOME_RECURSO[recurso]} já está liberado para a sua conta`}>
        Não há nada a pagar.
      </Aviso>
    );
  } else if (ativa && !troca) {
    corpo = (
      <Aviso tipo="sucesso" titulo={`Você já assina o ${NOME_RECURSO[recurso]}`}>
        <span className="flex flex-col items-start gap-2">
          <span>Veja a forma de pagamento, as próximas cobranças e as faturas em Assinatura.</span>
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
      <Aviso tipo="info" titulo={`O ${NOME_RECURSO[recurso]} ainda não está à venda`}>
        Logo você vai poder assinar por aqui.
      </Aviso>
    );
  } else {
    const trocaPlanos = troca && ativa ? planos.filter((p) => p.ciclo === ativa.ciclo) : planos;
    corpo = (
      <FormAssinar
        recurso={recurso}
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
      {corpo}
      {!troca && (
        <p className="text-body-sm text-ink-muted">
          Quer o outro recurso?{" "}
          <Link
            href={`/painel/assinar?recurso=${outro}`}
            className="font-semibold text-terra-text underline underline-offset-2"
          >
            Assinar o {NOME_RECURSO[outro]}
          </Link>
        </p>
      )}
    </div>
  );
}
