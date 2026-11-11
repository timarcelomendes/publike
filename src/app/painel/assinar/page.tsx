import {
  ChevronRight,
  ClipboardCheck,
  HandCoins,
  Layers,
  PackageCheck,
  Palette,
  Sparkles,
  Video,
  Workflow,
} from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { FormAssinar } from "@/components/pagamentos/form-assinar";
import { quandoValer } from "@/components/pagamentos/grade-de-planos";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
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
  ehPlanoPorFaixa,
  ehProduto,
  faixasDeCima,
  jaInclui,
  NOME_PRODUTO,
  O_PRODUTO,
  PACOTES,
  planoDeTrintaDias,
  planoQueCabe,
  podeAssinarPacote,
  recursosDo,
  pagoAteSem,
  substituidas,
  travamAssinar,
  type PagamentosDaConta,
  type PlanoPorFaixa,
  type Produto,
} from "@/lib/pagamentos";
import { meuEnderecoDeCobranca, minhaDiferencaDeFaixa, pagamentosDaConta, pagoNoSandbox } from "@/lib/servidor/faturas";
import { FormMudarSemPagar } from "@/components/pagamentos/mudar-sem-pagar";
import { minhaFaixa, paginaDeCarreirasLiberada } from "@/lib/servidor/pagina-de-carreiras";
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
  carreiras: Palette,
  empresa_5: PackageCheck,
  empresa_20: PackageCheck,
  empresa_50: PackageCheck,
  agencia_15: PackageCheck,
  agencia_200: PackageCheck,
};

const TUDO =
  "Triagem com IA, Teste Prático, Entrevista em vídeo, Automações personalizadas, Consulta de salários e Página de carreiras";
const FAZ: Record<Produto, string> = {
  copiloto: "A IA que lê os currículos contra o que a vaga pede e mostra quem combina.",
  testes: "Testes na vaga, feitos pelo celular, com o resultado no quadro.",
  combo: "A Triagem com IA e o Teste Prático numa assinatura só, por menos que os dois separados.",
  completo:
    "Tudo numa assinatura só: Triagem com IA, Teste Prático, Entrevista em vídeo, Automações personalizadas, Consulta de salários e Página de carreiras, por menos que separados.",
  video: "O candidato grava as respostas pelo celular e a IA resume; e a entrevista ao vivo, sem instalar nada.",
  automacoes:
    "As suas regras: quando algo acontece, se a pessoa atende o que você escolher, o Publike faz o que você mandar.",
  salarios:
    "Consultas sem limite: quanto o mercado paga para cada função, o que as vagas do Publike oferecem e quantos talentos combinam.",
  carreiras:
    "A sua página de vagas com a cara da empresa: a cor da marca, a capa, por que trabalhar aí, os benefícios e um endereço curto. Libera sozinha com 10 vagas publicadas.",
  empresa_5: `Tudo numa assinatura só, para até 5 vagas no ar: ${TUDO}.`,
  empresa_20: `Tudo numa assinatura só, para até 20 vagas no ar: ${TUDO}.`,
  empresa_50: `Tudo numa assinatura só, para até 50 vagas no ar: ${TUDO}.`,
  agencia_15: `Tudo numa assinatura só, para até 15 vagas no ar e 3 recrutadores: ${TUDO}.`,
  agencia_200: `Tudo numa assinatura só, para até 200 vagas no ar e 10 recrutadores: ${TUDO}.`,
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
  // o plano por 30 dias, a troca de faixa e o ciclo já escolhido em Planos (migração 20270416120000)
  const trinta = primeiro(sp.trinta) === "1" && ehPlanoPorFaixa(produto);
  const mudar = primeiro(sp.mudar) === "1" && ehPlanoPorFaixa(produto);
  const cicloPedido = primeiro(sp.ciclo);
  const cicloInicial = cicloPedido === "12" ? "YEARLY" : cicloPedido === "3" ? "QUARTERLY" : null;
  await exigirUsuario(`/painel/assinar?recurso=${produto}`);
  const [pag, recursos, perfil, cobranca, sandbox, faixa] = await Promise.all([
    pagamentosDaConta(),
    recursosPagos(),
    obterMeuPerfil().catch(() => null),
    meuEnderecoDeCobranca(),
    pagoNoSandbox(),
    minhaFaixa(),
  ]);
  // o plano por faixa que cabe na conta (Empresa ou Agência, pela faixa das vagas no ar)
  const plano = planoQueCabe(pag, faixa);
  const limite = ehPlanoPorFaixa(produto)
    ? (pag?.planos.find((p) => p.recurso === produto)?.limite_vagas ?? null)
    : null;
  const passou = limite != null && (faixa?.vagas_no_ar ?? 0) > limite;
  const planos = (pag?.planos ?? []).filter((p) => p.recurso === produto);
  const valendo = (pag?.assinaturas ?? []).filter((a) => a.situacao !== "cancelada");
  const ativa = valendo.find((a) => a.recurso === produto && a.situacao === "ativa");
  // dois produtos que liberam um mesmo recurso (o combo ou o Plano Completo e os separados) não valem juntos
  // (o recurso sozinho ou o combo que o plano inclui não trava: o plano toma o lugar, substituiSozinho)
  const conflito = travamAssinar(valendo, produto)[0];
  const trocadas = troca ? [] : substituidas(valendo, produto);
  // a Página de carreiras: liberada pelas vagas, por cortesia ou por outra assinatura, não precisa assinar
  const semPrazo =
    produto === "carreiras"
      ? !valendo.some((a) => a.recurso === "carreiras") && (await paginaDeCarreirasLiberada())
      : recursosDo(produto).every((r) => r !== "carreiras" && recursos?.[r]?.liberado && !recursos[r].ate);

  // a 1ª cobrança: o fim do teste grátis ou do período já pago (o servidor calcula de novo)
  const hoje = diaBr(new Date());
  // (o que o plano substitui não adia: o plano cobra hoje)
  const dia = diaDaPrimeiraCobranca(produto, pag?.testes_ate, pagoAteSem(pag?.pago_ate, trocadas.map((a) => a.recurso)));
  const primeiraCobranca = dia > hoje ? dia : null;
  // a troca de faixa: a assinatura de plano por faixa que vale e quanto falta pagar até a faixa pedida
  const deCima = faixasDeCima(pag);
  const diferenca =
    mudar && deCima.assinatura && deCima.faixas.some((f) => f.recurso === produto)
      ? await minhaDiferencaDeFaixa(deCima.assinatura.id, produto)
      : null;

  const cabecalho = (
    <CabecalhoDaPagina
      voltar={troca ? { href: "/painel/assinatura", nome: "Assinatura" } : { href: "/painel/planos", nome: "Planos" }}
      titulo={
        troca
          ? `Trocar o cartão ${DO_PRODUTO[produto]}`
          : mudar
            ? `Mudar para ${O_PRODUTO[produto]}`
            : trinta
              ? `${maiuscula(O_PRODUTO[produto])} por 30 dias`
              : `Assinar ${O_PRODUTO[produto]}`
      }
      descricao={
        <>
          <p>{FAZ[produto]}</p>
          {limite != null && faixa && (
            <p className="mt-1 text-body-sm">
              Você tem {faixa.vagas_no_ar === 1 ? "1 vaga" : `${faixa.vagas_no_ar} vagas`} no ar agora. Preço de
              lançamento: quem assina agora mantém este valor enquanto mantiver a assinatura.
            </p>
          )}
        </>
      }
    />
  );

  let corpo;
  const formDados = {
    documento: pag?.cliente?.cpf_cnpj ?? perfil?.cnpj ?? "",
    nome: pag?.cliente?.nome ?? perfil?.nome ?? "",
    email: pag?.cliente?.email ?? perfil?.email ?? "",
    telefone: cobranca?.telefone ?? perfil?.whatsapp ?? "",
    endereco: cobranca?.endereco ?? null,
  };
  if (pag?.pode && mudar) {
    corpo =
      !deCima.assinatura || !diferenca ? (
        <Aviso tipo="info" titulo="Não há faixa para mudar">
          <span className="flex flex-col items-start gap-2">
            <span>A troca de faixa é para quem assina um plano Empresa ou Agência numa faixa menor que esta.</span>
            <BotaoLink href="/painel/planos" tamanho="sm">
              Ver os planos
            </BotaoLink>
          </span>
        </Aviso>
      ) : "erro" in diferenca ? (
        <Aviso tipo="info" titulo="Não deu para mudar de faixa">
          {diferenca.erro}
        </Aviso>
      ) : diferenca.diferenca === 0 ? (
        <FormMudarSemPagar assinatura={deCima.assinatura.id} plano={diferenca.plano_id} produto={produto} />
      ) : (
        <FormAssinar
          key={`faixa-${produto}`}
          recurso={produto}
          planos={(pag.planos ?? []).filter((p) => p.id === diferenca.plano_id)}
          primeiro={null}
          modo={{
            tipo: "faixa",
            assinatura: deCima.assinatura.id,
            diferenca: diferenca.diferenca,
            dias: diferenca.dias,
            ate: diferenca.pago_ate,
            renovacao: diferenca.valor_novo,
          }}
          inicial={formDados}
        />
      );
  } else if (pag?.pode && trinta) {
    const plano30 = planoDeTrintaDias(pag, produto);
    corpo = valendo.length ? (
      <Aviso tipo="info" titulo="A sua assinatura já cobre isso">
        <span className="flex flex-col items-start gap-2">
          <span>Os 30 dias são para quem não assina. Para ter mais vagas no ar, mude de faixa em Assinatura.</span>
          <BotaoLink href="/painel/assinatura" tamanho="sm">
            Ver assinatura
          </BotaoLink>
        </span>
      </Aviso>
    ) : !plano30 ? (
      <Aviso tipo="info" titulo="Os 30 dias ainda não estão à venda">
        Logo você vai poder comprar por aqui.
      </Aviso>
    ) : passou ? (
      <Aviso tipo="info" titulo={`Você tem ${faixa?.vagas_no_ar ?? 0} vagas no ar`}>
        {maiuscula(O_PRODUTO[produto])} vai até {limite} vagas no ar. Escolha a faixa de cima.
      </Aviso>
    ) : (
      <FormAssinar
        key={`trinta-${produto}`}
        recurso={produto}
        planos={[plano30]}
        primeiro={null}
        modo={{ tipo: "trinta" }}
        inicial={formDados}
      />
    );
  } else if (!pag?.pode) {
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
        {produto === "carreiras" ? (
          <span className="flex flex-col items-start gap-2">
            <span>Não há nada a pagar: as suas vagas publicadas ou a sua assinatura já liberam a página.</span>
            <BotaoLink href="/painel/links/pagina" tamanho="sm">
              Montar a página
            </BotaoLink>
          </span>
        ) : (
          "Não há nada a pagar."
        )}
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
  } else if (
    conflito &&
    !troca &&
    ehPlanoPorFaixa(conflito.recurso) &&
    conflito.situacao === "ativa" &&
    faixasDeCima(pag).faixas.some((f) => f.recurso === produto)
  ) {
    // assinar uma faixa maior quando já assina outra: a troca paga só a diferença
    corpo = (
      <Aviso tipo="info" titulo={`Você assina ${O_PRODUTO[conflito.recurso]}`}>
        <span className="flex flex-col items-start gap-2">
          <span>Mude para esta faixa pagando só a diferença dos dias que faltam no período já pago.</span>
          <BotaoLink href={`/painel/assinar?recurso=${produto}&mudar=1`} tamanho="sm">
            Mudar para esta faixa
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
  } else if (passou && !troca) {
    corpo = (
      <Aviso tipo="info" titulo={`Você tem ${faixa?.vagas_no_ar ?? 0} vagas no ar`}>
        <span className="flex flex-col items-start gap-2">
          <span>
            {maiuscula(O_PRODUTO[produto])} vai até {limite} vagas no ar. Publicar nunca trava, mas a assinatura é pela
            faixa em que as suas vagas cabem.
          </span>
          {plano && plano !== produto && (
            <BotaoLink href={`/painel/assinar?recurso=${plano}`} tamanho="sm">
              Ver {NOME_PRODUTO[plano]}
            </BotaoLink>
          )}
        </span>
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
        modo={{ tipo: "assinar", ciclo: cicloInicial }}
        inicial={formDados}
      />
    );
  }

  return (
    // o pagamento: o cabeçalho de sempre e o formulário numa coluna
    <div className="flex flex-col gap-6">
      {cabecalho}
      <div className="flex max-w-2xl flex-col gap-6">
        {sandbox && pag?.pode && (
          // a conta de teste no sandbox (Admin › Pagamentos): o checkout e o Pix são os de teste do Asaas
          <Aviso tipo="alerta" titulo="Conta de teste: pagamento no sandbox">
            Nada é cobrado de verdade. No cartão, use um cartão de teste do Asaas; o Pix é de teste e não paga com o app
            do banco.
          </Aviso>
        )}
        {trocadas.length > 0 && !conflito && !mudar && !trinta && (
          <Aviso tipo="info" titulo="Não precisa cancelar antes">
            {quandoValer(trocadas, false)}
          </Aviso>
        )}
        {corpo}
        {!troca && !mudar && !trinta && (
          <OutraOpcao
            produto={produto}
            pag={pag}
            abertos={Object.fromEntries(PACOTES.map((p) => [p, podeAssinarPacote(pag, recursos, p)]))}
            plano={plano}
          />
        )}
      </div>
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
      "Tudo numa assinatura só: Triagem com IA, Teste Prático, Entrevista em vídeo, Automações personalizadas, Consulta de salários e Página de carreiras, por menos que separados.",
    botao: "Ver o Plano Completo",
  },
  video: {
    titulo: "Entrevista em vídeo",
    texto: "Duas opções: gravada, em que o candidato grava as respostas e a IA resume, ou ao vivo, dentro do Publike.",
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
  carreiras: {
    titulo: "Página de carreiras",
    texto: "As suas vagas num endereço curto, com a cor, a capa e os benefícios da empresa.",
    botao: "Conhecer a Página de carreiras",
  },
  empresa_5: { titulo: "Plano Empresa até 5 vagas", texto: `Tudo junto: ${TUDO}.`, botao: "Conhecer o Plano Empresa" },
  empresa_20: { titulo: "Plano Empresa até 20 vagas", texto: `Tudo junto: ${TUDO}.`, botao: "Conhecer o Plano Empresa" },
  empresa_50: { titulo: "Plano Empresa até 50 vagas", texto: `Tudo junto: ${TUDO}.`, botao: "Conhecer o Plano Empresa" },
  agencia_15: { titulo: "Plano Agência até 15 vagas", texto: `Tudo junto, com 3 recrutadores: ${TUDO}.`, botao: "Conhecer o Plano Agência" },
  agencia_200: {
    titulo: "Plano Agência até 200 vagas",
    texto: `Tudo junto, com 10 recrutadores: ${TUDO}.`,
    botao: "Conhecer o Plano Agência",
  },
};

/**
 * As outras opções de cada tela: nos planos, os recursos separados; nas outras, o plano e mais duas. "completo" aqui é
 * o lugar do plano: vira o plano por faixa que cabe na conta (o Plano Completo saiu de venda, migração 20270407120000).
 */
const OUTRAS: Record<Produto, Produto[]> = {
  empresa_5: ["empresa_20", "copiloto", "testes", "video", "automacoes", "carreiras"],
  empresa_20: ["empresa_50", "copiloto", "testes", "video", "automacoes", "carreiras"],
  empresa_50: ["copiloto", "testes", "video", "automacoes", "carreiras"],
  agencia_15: ["agencia_200", "copiloto", "testes", "video", "automacoes"],
  agencia_200: ["copiloto", "testes", "video", "automacoes"],
  completo: ["copiloto", "testes", "video", "automacoes", "salarios", "carreiras"],
  copiloto: ["completo", "testes", "combo"],
  testes: ["completo", "copiloto", "combo"],
  combo: ["completo", "copiloto", "testes"],
  video: ["completo", "automacoes", "copiloto"],
  automacoes: ["completo", "video", "copiloto"],
  salarios: ["completo", "copiloto", "automacoes"],
  carreiras: ["completo", "salarios", "copiloto"],
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
  plano,
}: {
  produto: Produto;
  pag: PagamentosDaConta | null;
  abertos: Partial<Record<Produto, boolean>>;
  plano: PlanoPorFaixa | null;
}) {
  const mensal = (p: Produto) => pag?.planos.find((x) => x.recurso === p && x.ciclo === "MONTHLY")?.valor ?? null;
  const pacote_ = (p: Produto) => (PACOTES as readonly string[]).includes(p);
  const opcoes = [...new Set(OUTRAS[produto].map((p) => (p === "completo" && plano ? plano : p)))].filter(
    (p) => p !== produto && pag?.planos.some((x) => x.recurso === p) && (pacote_(p) ? abertos[p] === true : true),
  );
  if (!opcoes.length) return null;
  return (
    <section aria-labelledby="outra-opcao" className="flex flex-col gap-3">
      <h3 id="outra-opcao" className="text-h3">
        {produto === "completo" || ehPlanoPorFaixa(produto) ? "Prefere começar com um só?" : "Outras opções"}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {opcoes.map((p) => {
          const o = OFERTA_CURTA[p];
          const Icone = ICONE[p];
          const valor = mensal(p);
          const destaque = p === "completo" || ehPlanoPorFaixa(p);
          const pacote = p === "completo" || p === "combo" || ehPlanoPorFaixa(p) ? economiaDoPacote(pag, p) : null;
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
