import { ChevronRight, ClipboardCheck, HandCoins, Layers, PackageCheck, Sparkles, Video, Workflow } from "lucide-react";
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
  economiaDoPacote,
  ehProduto,
  jaInclui,
  NOME_PRODUTO,
  O_PRODUTO,
  podeAssinarPacote,
  recursosDo,
  seCruzam,
  type PagamentosDaConta,
  type Produto,
} from "@/lib/pagamentos";
import { meuEnderecoDeCobranca, pagamentosDaConta, pagoNoSandbox } from "@/lib/servidor/faturas";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Assinar", robots: { index: false } };

// Assinar um recurso, o combo (Triagem + Teste Prático) ou o Plano Completo (os quatro), claude/plano-checkout-asaas.md:
// o plano, cartão ou Pix e os dados da nota. Com ?troca=1, só o cartão novo da assinatura que já vale.

const ICONE: Record<Produto, typeof Sparkles> = {
  copiloto: Sparkles,
  testes: ClipboardCheck,
  combo: Layers,
  completo: PackageCheck,
  video: Video,
  automacoes: Workflow,
  salarios: HandCoins,
};
const FAZ: Record<Produto, string> = {
  copiloto: "A IA que lê os currículos contra o que a vaga pede e mostra quem combina.",
  testes: "Testes na vaga, feitos pelo celular, com o resultado no quadro.",
  combo: "A Triagem com IA e o Teste Prático numa assinatura só, por menos que os dois separados.",
  completo:
    "Tudo numa assinatura só: Triagem com IA, Teste Prático, Entrevista em vídeo, Automações personalizadas e Consulta de salários, por menos que separados.",
  video: "O candidato grava as respostas pelo celular e a IA resume; e a entrevista ao vivo, sem instalar nada.",
  automacoes:
    "As suas regras: quando algo acontece, se a pessoa atende o que você escolher, o Publike faz o que você mandar.",
  salarios:
    "Consultas sem limite: quanto o mercado paga para cada função, o que as vagas do Publike oferecem e quantos talentos combinam.",
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
  const [pag, recursos, perfil, cobranca, sandbox] = await Promise.all([
    pagamentosDaConta(),
    recursosPagos(),
    obterMeuPerfil().catch(() => null),
    meuEnderecoDeCobranca(),
    pagoNoSandbox(),
  ]);
  const Icone = ICONE[produto];
  const planos = (pag?.planos ?? []).filter((p) => p.recurso === produto);
  const valendo = (pag?.assinaturas ?? []).filter((a) => a.situacao !== "cancelada");
  const ativa = valendo.find((a) => a.recurso === produto && a.situacao === "ativa");
  // dois produtos que liberam um mesmo recurso (o combo ou o Plano Completo e os separados) não valem juntos
  const conflito = valendo.find((a) => a.recurso !== produto && seCruzam(a.recurso, produto));
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
            : produto === "completo"
              ? "Todos já estão liberados para a sua conta"
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
            {jaInclui(conflito.recurso, produto)
              ? `${maiuscula(O_PRODUTO[conflito.recurso])} já inclui ${O_PRODUTO[produto]}.`
              : `Para passar para ${O_PRODUTO[produto]}, cancele essa assinatura em Assinatura. O que já foi pago continua valendo, e ${O_PRODUTO[produto]} começa a cobrar quando ele acabar.`}
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
      {sandbox && pag?.pode && (
        // a conta de teste no sandbox (Admin › Pagamentos): o checkout e o Pix são os de teste do Asaas
        <Aviso tipo="alerta" titulo="Conta de teste: pagamento no sandbox">
          Nada é cobrado de verdade. No cartão, use um cartão de teste do Asaas; o Pix é de teste e não paga com o app
          do banco.
        </Aviso>
      )}
      {corpo}
      {!troca && (
        <OutraOpcao
          produto={produto}
          pag={pag}
          abertos={{
            completo: podeAssinarPacote(pag, recursos, "completo"),
            combo: podeAssinarPacote(pag, recursos, "combo"),
          }}
        />
      )}
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
  completo: {
    titulo: "Plano Completo",
    texto:
      "Tudo numa assinatura só: Triagem com IA, Teste Prático, Entrevista em vídeo, Automações personalizadas e Consulta de salários, por menos que separados.",
    botao: "Ver o Plano Completo",
  },
  video: {
    titulo: "Entrevista em vídeo",
    texto: "Ouça todos os candidatos sem marcar horário: eles gravam as respostas e a IA resume.",
    botao: "Conhecer a Entrevista em vídeo",
  },
  automacoes: {
    titulo: "Automações personalizadas",
    texto: "Monte as suas regras: dispense quem não tem o obrigatório e adiante quem combina, sozinho.",
    botao: "Conhecer as Automações personalizadas",
  },
  salarios: {
    titulo: "Consulta de salários",
    texto: "Quanto o mercado paga para cada função, com a fonte, e quanto oferecer para fechar rápido. Sem limite.",
    botao: "Conhecer a Consulta de salários",
  },
};

/** As outras opções de cada tela: no Plano Completo, os recursos separados; nas outras, o Plano Completo e mais duas. */
const OUTRAS: Record<Produto, Produto[]> = {
  completo: ["copiloto", "testes", "video", "automacoes", "salarios"],
  copiloto: ["completo", "testes", "combo"],
  testes: ["completo", "copiloto", "combo"],
  combo: ["completo", "copiloto", "testes"],
  video: ["completo", "automacoes", "copiloto"],
  automacoes: ["completo", "video", "copiloto"],
  salarios: ["completo", "copiloto", "automacoes"],
};

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * No pé da tela, as outras opções com o preço: o Plano Completo em destaque, na largura toda, com quanto economiza;
 * o combo e os recursos separados embaixo. Um pacote só aparece quando dá para assinar agora (sem assinatura que se
 * cruze com ele).
 */
function OutraOpcao({
  produto,
  pag,
  abertos,
}: {
  produto: Produto;
  pag: PagamentosDaConta | null;
  abertos: { completo: boolean; combo: boolean };
}) {
  const mensal = (p: Produto) => pag?.planos.find((x) => x.recurso === p && x.ciclo === "MONTHLY")?.valor ?? null;
  const opcoes = OUTRAS[produto].filter(
    (p) => pag?.planos.some((x) => x.recurso === p) && (p === "completo" || p === "combo" ? abertos[p] : true),
  );
  if (!opcoes.length) return null;
  return (
    <section aria-labelledby="outra-opcao" className="flex flex-col gap-3">
      <h3 id="outra-opcao" className="text-h3">
        {produto === "completo" ? "Prefere começar com um só?" : "Outras opções"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {opcoes.map((p) => {
          const o = OFERTA_CURTA[p];
          const Icone = ICONE[p];
          const valor = mensal(p);
          const destaque = p === "completo";
          const pacote = p === "completo" || p === "combo" ? economiaDoPacote(pag, p) : null;
          return (
            <div
              key={p}
              className={`flex flex-col gap-3 rounded-lg border bg-surface-200 p-5 shadow-card ${
                destaque ? "border-terra sm:col-span-2" : "border-line-strong"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-terra-soft">
                  <Icone aria-hidden className="size-5 text-terra-text" />
                </span>
                <span className="flex flex-wrap justify-end gap-1.5">
                  {pacote && pacote.economia > 0 && (
                    <Selo variante="match">Economize {formatarMoeda(pacote.economia)} por mês</Selo>
                  )}
                  {destaque && <Selo variante="novo">Novo</Selo>}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-label">{o.titulo}</p>
                <p className="text-body-sm text-ink-muted">{o.texto}</p>
              </div>
              {valor != null && (
                <p className="text-h3 tabular-nums">
                  {formatarMoeda(valor)} <span className="text-body-sm font-normal text-ink-muted">por mês</span>
                  {pacote && pacote.economia > 0 && (
                    <span className="ml-2 text-body-sm font-normal text-ink-muted line-through">
                      {formatarMoeda(pacote.separados)}
                    </span>
                  )}
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
