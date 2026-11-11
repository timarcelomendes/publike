import { Check, CreditCard } from "lucide-react";
import Link from "next/link";
import { Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { formatarMoeda } from "@/lib/formato";
import {
  ehPlanoPorFaixa,
  MESES,
  NOME_PRODUTO,
  O_PRODUTO,
  podeAssinarPacote,
  substituidas,
  travamAssinar,
  type Assinatura,
  type Ciclo,
  type PagamentosDaConta,
  type PlanoPorFaixa,
  type Produto,
} from "@/lib/pagamentos";
import type { RecursosPagos } from "@/lib/recursos-pagos";

// Os cartões de /painel/planos lado a lado (11/11/2026): o Grátis e as faixas numa linha só no computador (4 colunas
// com o Plano Empresa, 3 com o Plano Agência), sem o quarto cair para baixo. Cada cartão diz só o que muda de uma faixa
// para outra (as vagas no ar, o preço, os recrutadores da agência e o botão); o que todo plano traz fica uma vez,
// embaixo, em "Em todos os planos".

export const GRATIS = [
  "Até 20 vagas no ar ao mesmo tempo",
  "Candidatos, quadro e mensagens",
  "Equipe sem limite de pessoas",
  "Página de carreiras com 10 vagas publicadas",
];

export const DOS_PLANOS = [
  "Triagem com IA",
  "Teste Prático",
  "Entrevista em vídeo: a gravada sem limite e a ao vivo pelo Publike (10, 20 ou 30 por mês, pela faixa)",
  "Automações personalizadas",
  "Consulta de salários",
  "Página de carreiras, sem esperar as 10 vagas",
  "Mutirão de contratação: um dia de entrevistas com horários",
  "Convite automático para quem combina com a vaga",
  "Mapa de talentos: quantas pessoas de cada função moram perto",
];

export const SO_DA_AGENCIA = [
  "Finalistas com a marca da agência",
  "Relatório por cliente",
  "Garantia acompanhada com o cliente",
  "Dossiê de cada finalista",
];

export const vagas = (n: number) => (n === 1 ? "1 vaga" : `${n} vagas`);

export function preco(pag: PagamentosDaConta | null, p: Produto, ciclo: Ciclo) {
  return pag?.planos.find((x) => x.recurso === p && x.ciclo === ciclo) ?? null;
}

/** As entrevistas ao vivo por mês de cada faixa (migração 20270420120000), para o cartão. */
const AO_VIVO: Partial<Record<Produto, number>> = {
  empresa_5: 10,
  empresa_20: 20,
  empresa_50: 30,
  agencia_15: 20,
  agencia_200: 30,
  completo: 30,
};

function Lista({ itens, titulo, colunas = false }: { itens: string[]; titulo?: string; colunas?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {titulo && <p className="text-body-sm font-semibold">{titulo}</p>}
      <ul className={`text-body-sm ${colunas ? "grid gap-x-8 gap-y-2 sm:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-1.5"}`}>
        {itens.map((t) => (
          <li key={t} className="flex gap-2">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "o Teste Prático e a Consulta de salários" */
function juntar(nomes: string[]) {
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : (nomes[0] ?? "");
}

/** O aviso de quem assina um recurso que o plano já inclui: não precisa cancelar antes. */
export function quandoValer(substitui: Assinatura[], fim = true) {
  const muitas = substitui.length > 1;
  return `Já inclui ${juntar(substitui.map((x) => O_PRODUTO[x.recurso]))}, que você assina: quando o plano começar a valer, ${
    muitas ? "essas assinaturas são canceladas sozinhas" : "essa assinatura é cancelada sozinha"
  }.${fim ? " Não precisa cancelar antes." : ""}`;
}

/** A linha do selo, com a mesma altura em todos os cartões: assim os nomes e os preços ficam alinhados. */
function LinhaDoSelo({ children }: { children?: React.ReactNode }) {
  // no celular, um embaixo do outro, a linha vazia só abriria um buraco
  return <div className={`items-center md:flex md:min-h-6 ${children ? "flex min-h-6" : "hidden"}`}>{children}</div>;
}

function CartaoGratis({ atual, agencia, compacto }: { atual: boolean; agencia: boolean; compacto: boolean }) {
  return (
    <article className={`flex h-full flex-col gap-4 rounded-lg border border-line bg-surface-200 ${compacto ? "p-5" : "p-5 sm:p-6"}`}>
      <LinhaDoSelo>{atual && <Selo variante="contorno">Seu plano</Selo>}</LinhaDoSelo>
      <div>
        <h3 className="text-h3">Grátis</h3>
        <p className="text-body-sm text-ink-muted">até 20 vagas no ar</p>
      </div>
      <p>
        <span className={`${compacto ? "text-h2" : "text-h1"} tabular-nums`}>R$ 0</span>
        <span className="block text-body-sm text-ink-muted">para sempre</span>
      </p>
      <Lista itens={agencia ? [...GRATIS.slice(1), "Clientes, pedidos e finalistas por link"] : GRATIS.slice(1)} />
    </article>
  );
}

function CartaoPlano({
  p,
  pag,
  recursos,
  ciclo,
  noAr,
  cabe,
  meu,
  agencia,
  cruza,
  substitui,
  compacto,
}: {
  p: Produto;
  pag: PagamentosDaConta;
  recursos: RecursosPagos | null;
  ciclo: Ciclo;
  noAr: number;
  cabe: boolean;
  meu: Assinatura | null;
  agencia: boolean;
  /** uma assinatura que trava este plano (travamAssinar: cancela antes) */
  cruza: Assinatura | null;
  /** as assinaturas que o plano substitui sozinho: param de cobrar quando ele começar a valer */
  substitui: Assinatura[];
  /** quatro cartões na linha: letra do preço menor, para caber */
  compacto: boolean;
}) {
  const mensal = preco(pag, p, "MONTHLY");
  const escolhido = preco(pag, p, ciclo) ?? mensal;
  if (!mensal || !escolhido) return null;
  const limite = mensal.limite_vagas ?? null;
  const pequeno = limite != null && noAr > limite;
  const ehMeu = meu?.recurso === p;
  const porMes = escolhido.valor / MESES[escolhido.ciclo];
  const desconto = escolhido.ciclo !== "MONTHLY" ? Math.round((1 - porMes / mensal.valor) * 100) : 0;
  const trinta = preco(pag, p, "AVULSO");
  // a assinatura de plano por faixa de hoje, numa faixa menor da mesma família: muda pagando a diferença
  const subir =
    meu &&
    ehPlanoPorFaixa(meu.recurso) &&
    meu.situacao === "ativa" &&
    limite != null &&
    String(meu.recurso).split("_")[0] === String(p).split("_")[0] &&
    (Number(String(meu.recurso).split("_")[1]) || 0) < limite;
  const linkCiclo = escolhido.ciclo === "QUARTERLY" ? "&ciclo=3" : escolhido.ciclo === "YEARLY" ? "&ciclo=12" : "";
  const recrutadores = p === "agencia_15" ? 3 : p === "agencia_200" ? 10 : null;
  const podeAssinar = !meu && !pequeno && podeAssinarPacote(pag, recursos, p as Parameters<typeof podeAssinarPacote>[2]);
  const nome = p === "completo" ? "Plano Completo" : agencia ? "Plano Agência" : "Plano Empresa";
  const destaque = ehMeu || (cabe && !meu);
  const aoVivo = AO_VIVO[p];

  return (
    <article
      className={`flex h-full flex-col gap-4 rounded-lg bg-surface-200 ${compacto ? "p-5" : "p-5 sm:p-6"} ${
        destaque ? "border-2 border-ink shadow-card" : "border border-line"
      } ${pequeno ? "opacity-70" : ""}`}
    >
      <LinhaDoSelo>
        {ehMeu ? (
          <Selo variante="match">Seu plano</Selo>
        ) : cabe && !meu ? (
          <Selo variante="aviso">Cabe nas suas vagas</Selo>
        ) : null}
      </LinhaDoSelo>
      <div>
        <h3 className="text-h3">{nome}</h3>
        {limite != null && <p className="text-body-sm text-ink-muted">até {vagas(limite)} no ar</p>}
      </div>
      {escolhido.ciclo === "QUARTERLY" || escolhido.ciclo === "YEARLY" ? (
        <p>
          <span className={`${compacto ? "text-h2" : "text-h1"} tabular-nums`}>{formatarMoeda(escolhido.valor)}</span>
          <span className="block text-body-sm text-ink-muted">
            {escolhido.ciclo === "YEARLY" ? "por ano" : "a cada 3 meses"}:{" "}
            {formatarMoeda(Math.round(porMes * 100) / 100)} por mês
            {desconto > 0 ? `, ${desconto}% a menos` : ""}
          </span>
        </p>
      ) : (
        <p>
          <span className={`${compacto ? "text-h2" : "text-h1"} tabular-nums`}>{formatarMoeda(porMes)}</span>
          <span className="block text-body-sm text-ink-muted">por mês, no cartão ou no Pix</span>
        </p>
      )}
      <Lista
        itens={[
          "Tudo do Grátis e todas as ferramentas dos planos",
          ...(aoVivo ? [`${aoVivo} entrevistas ao vivo por mês`] : []),
          ...(recrutadores ? [`Até ${recrutadores} recrutadores usando`] : []),
          ...(agencia && p !== "completo" ? ["As ferramentas só da agência"] : []),
        ]}
      />
      <div className="mt-auto border-t border-line pt-4">
        {ehMeu ? (
          <BotaoLink href="/painel/assinatura" variante="secundario" tamanho="sm">
            Ver a assinatura
          </BotaoLink>
        ) : pequeno ? (
          <p className="text-body-sm text-ink-muted">Você tem {vagas(noAr)} no ar: a faixa de cima cabe melhor.</p>
        ) : podeAssinar ? (
          <div className="flex flex-col items-start gap-2">
            <BotaoLink
              href={`/painel/assinar?recurso=${p}${linkCiclo}`}
              variante={cabe ? "primario" : "secundario"}
              tamanho="sm"
            >
              <CreditCard aria-hidden />
              Assinar
            </BotaoLink>
            {substitui.length > 0 && (
              <p className="text-body-sm text-ink-muted">
                {quandoValer(substitui)}
              </p>
            )}
            {trinta && !substitui.length && (
              <Link
                href={`/painel/assinar?recurso=${p}&trinta=1`}
                className="text-body-sm text-terra-text underline underline-offset-2"
              >
                Ou só por 30 dias, sem renovar: {formatarMoeda(trinta.valor)}
              </Link>
            )}
          </div>
        ) : subir ? (
          <BotaoLink href={`/painel/assinar?recurso=${p}&mudar=1`} variante="secundario" tamanho="sm">
            Mudar para esta faixa
          </BotaoLink>
        ) : meu ? (
          <p className="text-body-sm text-ink-muted">
            Para trocar de plano, cancele {NOME_PRODUTO[meu.recurso]} em{" "}
            <Link href="/painel/assinatura" className="underline underline-offset-2">
              Assinatura
            </Link>
            : o que já foi pago continua valendo.
          </p>
        ) : cruza ? (
          <p className="text-body-sm text-ink-muted">
            Você assina {O_PRODUTO[cruza.recurso]}, que não vale junto com este plano. Para trocar, cancele em{" "}
            <Link href="/painel/assinatura" className="underline underline-offset-2">
              Assinatura
            </Link>{" "}
            e volte aqui: o que já foi pago continua valendo.
          </p>
        ) : (
          <p className="text-body-sm text-ink-muted">Os recursos do plano já estão liberados na sua conta, sem prazo.</p>
        )}
      </div>
    </article>
  );
}

/** O Grátis e as faixas, lado a lado, e embaixo o que todo plano traz. */
export function GradeDePlanos({
  faixas,
  pag,
  recursos,
  ciclo,
  noAr,
  cabe,
  meuPlano,
  agencia,
  agenciaNoGratis,
  valendo,
}: {
  faixas: Produto[];
  pag: PagamentosDaConta;
  recursos: RecursosPagos | null;
  ciclo: Ciclo;
  noAr: number;
  cabe: PlanoPorFaixa | null;
  meuPlano: Assinatura | null;
  agencia: boolean;
  /** o Grátis com o que a agência tem de graça (clientes, pedidos e finalistas) */
  agenciaNoGratis: boolean;
  valendo: Assinatura[];
}) {
  const cartoes = faixas.length + 1;
  // 4 cartões (o Grátis e as 3 faixas do Plano Empresa): 2 por linha no tablet, os 4 juntos a partir de 1280 px
  const compacto = cartoes >= 4;
  const grade =
    cartoes >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : cartoes === 3 ? "md:grid-cols-3" : cartoes === 2 ? "md:grid-cols-2" : "";
  return (
    <div className="flex flex-col gap-4">
      <ul className={`grid gap-4 ${grade}`}>
        <li>
          <CartaoGratis atual={!meuPlano} agencia={agenciaNoGratis} compacto={compacto} />
        </li>
        {faixas.map((p) => (
          <li key={p}>
            <CartaoPlano
              p={p}
              pag={pag}
              recursos={recursos}
              ciclo={ciclo}
              noAr={noAr}
              cabe={cabe === p || (p === "completo" && !cabe)}
              meu={meuPlano}
              agencia={agencia}
              compacto={compacto}
              cruza={
                [...travamAssinar(valendo, p)].sort(
                  (a, b) => Number(b.situacao === "ativa") - Number(a.situacao === "ativa"),
                )[0] ?? null
              }
              substitui={substituidas(valendo, p)}
            />
          </li>
        ))}
      </ul>
      {faixas.length > 0 && (
        <section
          aria-labelledby="em-todos"
          className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 sm:p-6"
        >
          <h3 id="em-todos" className="text-label">
            Em todos os planos, além do Grátis
          </h3>
          <Lista itens={DOS_PLANOS} colunas />
          {agencia && <Lista titulo="Só no Plano Agência:" itens={SO_DA_AGENCIA} colunas />}
        </section>
      )}
    </div>
  );
}
