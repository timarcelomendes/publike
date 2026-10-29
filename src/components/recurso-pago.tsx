import { Check, ClipboardCheck, Sparkles } from "lucide-react";
import { dataCurta, DIAS_GRATIS, diasRestantes, NOME_RECURSO, type EstadoRecurso, type RecursoPago } from "@/lib/recursos-pagos";
import { BotaoExperimentar } from "./botao-experimentar";
import { SeloCortesia } from "./selo-cortesia";
import { Aviso } from "./ui/basicos";

// O Copiloto e os Testes Publike são pagos, com 15 dias grátis (migração 20261215120000): a oferta, para
// quem ainda não tem o recurso, e a faixa dos dias que faltam, para quem está experimentando.

const OFERTA: Record<RecursoPago, { titulo: string; texto: string; itens: string[] }> = {
  copiloto: {
    titulo: "Copiloto: a IA que acha quem combina com a sua vaga",
    texto:
      "Ele lê os currículos dos candidatos e de Talentos contra o que a vaga pede, e mostra o trecho do currículo que prova cada ponto. Quem decide é você.",
    itens: [
      "A IA sugere os critérios da vaga, e você ajusta",
      "Lê cada candidato e os currículos de quem mora perto",
      "Mostra o trecho do currículo que prova cada critério",
      "Você convida quem combina com um toque",
    ],
  },
  testes: {
    titulo: "Testes Publike: saiba quem sabe antes da entrevista",
    texto:
      "Ponha um teste na vaga e quem curtir faz pelo celular. Você vê o resultado de cada candidato no quadro da vaga.",
    itens: [
      "Testes prontos da Publike: caixa, atendimento, vendas, cozinha, estoque e mais",
      "Testes da sua empresa, com as perguntas que só vocês sabem fazer",
      "O candidato faz pelo celular, junto com a candidatura",
      "O resultado aparece no quadro da vaga",
    ],
  },
};

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
        <p className="text-body-sm text-ink-muted">O {NOME_RECURSO[recurso]} é um recurso pago. Fale com o Publike para liberar.</p>
      ) : estado.pode_experimentar ? (
        <div className="flex flex-col gap-2">
          <BotaoExperimentar recurso={recurso} acao="experimentar" />
          <p className="text-body-sm text-ink-muted">
            Recurso pago. Abre na hora, sem cartão e sem compromisso. No {DIAS_GRATIS + 1}º dia, ele fecha sozinho.
          </p>
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
  const n = diasRestantes(estado.ate, agora);
  return (
    <Aviso tipo="info" titulo={`Teste grátis: ${n === 1 ? "falta 1 dia" : `faltam ${n} dias`}`}>
      <span className="flex flex-col items-start gap-2">
        <span>
          Vai até {dataCurta(estado.ate)}. Depois, o {NOME_RECURSO[recurso]} fecha, e o que você fez fica guardado.
        </span>
        {estado.quer_continuar ? (
          <span className="text-label">Você já pediu para continuar. A gente fala com você.</span>
        ) : (
          <BotaoExperimentar recurso={recurso} acao="continuar" tamanho="sm" />
        )}
      </span>
    </Aviso>
  );
}
