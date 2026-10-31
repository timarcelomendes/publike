import { Check, ClipboardCheck, CreditCard, Sparkles } from "lucide-react";
import { O_PRODUTO, type Produto } from "@/lib/pagamentos";
import { dataCurta, DIAS_GRATIS, diasRestantes, NOME_RECURSO, type EstadoRecurso, type RecursoPago } from "@/lib/recursos-pagos";
import { BotaoExperimentar } from "./botao-experimentar";
import { SeloCortesia } from "./selo-cortesia";
import { Aviso, Selo } from "./ui/basicos";
import { BotaoLink } from "./ui/botao";

// A Triagem com IA e o Teste Prático são pagos, com 15 dias grátis (migração 20261215120000): a oferta, para
// quem ainda não tem o recurso, e a faixa dos dias que faltam, para quem está experimentando.

const OFERTA: Record<RecursoPago, { titulo: string; texto: string; itens: string[] }> = {
  copiloto: {
    titulo: "Triagem com IA: ache quem combina com a sua vaga",
    texto:
      "A IA lê os currículos dos candidatos e de Talentos contra o que a vaga pede, e mostra o trecho do currículo que prova cada ponto. Quem decide é você.",
    itens: [
      "A IA sugere os critérios da vaga, e você ajusta",
      "Lê cada candidato e os currículos de quem mora perto",
      "Mostra o trecho do currículo que prova cada critério",
      "Você convida quem combina com um toque",
    ],
  },
  testes: {
    titulo: "Teste Prático: saiba quem sabe o serviço antes da entrevista",
    texto:
      "O teste da Publike que combina com a vaga já é grátis. Com o Teste Prático completo, você escolhe os testes e cria os seus.",
    itens: [
      "Até 3 testes por vaga: caixa, atendimento, vendas, cozinha, estoque e mais",
      "Testes da sua empresa, com as perguntas que só vocês sabem fazer",
      "Mandar o teste para quem você quiser, mesmo depois de a pessoa se candidatar",
      "O candidato faz pelo celular, e o resultado aparece no quadro da vaga",
    ],
  },
};

/** Assinar o recurso (claude/plano-checkout-asaas.md): cartão ou Pix, em /painel/assinar. */
export function BotaoAssinar({
  recurso,
  variante = "primario",
  tamanho = "md",
}: {
  recurso: Produto;
  variante?: "primario" | "secundario";
  tamanho?: "md" | "sm";
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <BotaoLink href={`/painel/assinar?recurso=${recurso}`} variante={variante} tamanho={tamanho}>
        <CreditCard aria-hidden />
        {recurso === "combo" ? "Assinar o combo" : `Assinar ${O_PRODUTO[recurso]}`}
      </BotaoLink>
      <Selo variante="novo">Novo</Selo>
    </span>
  );
}

/** Para quem ainda não tem o recurso. `estado` null: antes da migração (sem botão). */
export function OfertaRecurso({ recurso, estado }: { recurso: RecursoPago; estado: EstadoRecurso | null }) {
  const o = OFERTA[recurso];
  const Icone = recurso === "copiloto" ? Sparkles : ClipboardCheck;
  const acabou = estado?.experimentou && estado.fim_experimento ? dataCurta(estado.fim_experimento) : null;
  return (
    <section
      aria-labelledby={`oferta-${recurso}`}
      className="flex flex-col gap-4 rounded-lg border border-line-strong bg-surface-200 p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-10 items-center justify-center rounded-pill bg-terra-soft">
          <Icone aria-hidden className="size-5 text-terra-text" />
        </span>
        <SeloCortesia />
      </div>
      <h2 id={`oferta-${recurso}`} className="text-h2">
        {o.titulo}
      </h2>
      <p className="text-body text-ink-muted">{o.texto}</p>
      <ul className="flex flex-col gap-2">
        {o.itens.map((t) => (
          <li key={t} className="flex gap-2 text-body">
            <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-cerrado-text" />
            {t}
          </li>
        ))}
      </ul>
      {!estado ? (
        <p className="text-body-sm text-ink-muted">{NOME_RECURSO[recurso]} é um recurso pago. Fale com o Publike para liberar.</p>
      ) : estado.pode_experimentar ? (
        <div className="flex flex-col gap-2">
          <BotaoExperimentar recurso={recurso} acao="experimentar" />
          <p className="text-body-sm text-ink-muted">
            Recurso pago. Abre na hora, sem cartão e sem compromisso. No {DIAS_GRATIS + 1}º dia, ele fecha sozinho.
          </p>
          {estado.pode_assinar && (
            <div className="mt-1">
              <BotaoAssinar recurso={recurso} variante="secundario" />
            </div>
          )}
        </div>
      ) : estado.pode_assinar ? (
        <div className="flex flex-col gap-2">
          {acabou && (
            <p className="text-body">
              Seus {DIAS_GRATIS} dias grátis acabaram em {acabou}. O que você fez continua guardado.
            </p>
          )}
          <BotaoAssinar recurso={recurso} />
          <p className="text-body-sm text-ink-muted">Cartão ou Pix, mensal ou a cada 3 meses. Cancele quando quiser.</p>
        </div>
      ) : acabou ? (
        <div className="flex flex-col gap-2">
          <p className="text-body">Seus {DIAS_GRATIS} dias grátis acabaram em {acabou}. O que você fez continua guardado.</p>
          {estado.quer_continuar ? (
            <p className="text-label text-cerrado-text">Recebemos seu pedido. A gente fala com você em breve.</p>
          ) : (
            <BotaoExperimentar recurso={recurso} acao="continuar" />
          )}
        </div>
      ) : (
        <p className="text-body-sm text-ink-muted">
          Os {DIAS_GRATIS} dias grátis são para contas de comércio, empresa ou agência.
        </p>
      )}
    </section>
  );
}

/** Para quem está nos 15 dias: quantos faltam, e o "Quero continuar" já à mão. */
export function FaixaExperimento({
  recurso,
  estado,
  agora,
}: {
  recurso: RecursoPago;
  estado: EstadoRecurso | null | undefined;
  agora: number;
}) {
  if (!estado?.liberado || !estado.ate) return null;
  const noTeste = Boolean(estado.fim_experimento && new Date(estado.fim_experimento).getTime() > agora);
  if (estado.assinante) {
    // no teste grátis, a assinatura já feita; depois, nada (a conta paga)
    if (!noTeste || !estado.fim_experimento) return null;
    return (
      <Aviso tipo="sucesso" titulo="Assinatura feita">
        Os dias grátis vão até {dataCurta(estado.fim_experimento)}; a primeira cobrança vem nesse dia.
      </Aviso>
    );
  }
  if (!noTeste) {
    // a assinatura cancelada: vale até o fim do que foi pago
    return (
      <Aviso tipo="info" titulo={`${NOME_RECURSO[recurso]}: vai até ${dataCurta(estado.ate)}`}>
        <span className="flex flex-col items-start gap-2">
          <span>A assinatura foi cancelada. Depois dessa data, o que você fez fica guardado.</span>
          {estado.pode_assinar && <BotaoAssinar recurso={recurso} tamanho="sm" variante="secundario" />}
        </span>
      </Aviso>
    );
  }
  const n = diasRestantes(estado.ate, agora);
  return (
    <Aviso tipo="info" titulo={`Dias grátis: ${n === 1 ? "falta 1" : `faltam ${n}`}`}>
      <span className="flex flex-col items-start gap-2">
        <span>Vai até {dataCurta(estado.ate)}. Depois, o recurso fecha, e o que você fez fica guardado.</span>
        {estado.pode_assinar ? (
          <BotaoAssinar recurso={recurso} tamanho="sm" />
        ) : estado.quer_continuar ? (
          <span className="text-label">Você já pediu para continuar. A gente fala com você.</span>
        ) : (
          <BotaoExperimentar recurso={recurso} acao="continuar" tamanho="sm" />
        )}
      </span>
    </Aviso>
  );
}
