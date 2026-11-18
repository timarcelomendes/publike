import { Check, ClipboardCheck, CreditCard, Sparkles, Video, Workflow } from "lucide-react";
import { O_PRODUTO, type Produto } from "@/lib/pagamentos";
import {
  dataCurta,
  diaQueRenova,
  DIAS_GRATIS,
  diasRestantes,
  NOME_RECURSO,
  type EstadoRecurso,
  type GratisDoMes,
  type RecursoPago,
} from "@/lib/recursos-pagos";
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
    titulo: "Teste Prático: confirme que a pessoa sabe fazer",
    texto:
      "Currículo bonito não diz se a pessoa sabe fazer. O teste diz. O teste da Publike que combina com a vaga já é grátis; com o Teste Prático completo, você escolhe os testes e cria os seus.",
    itens: [
      "Até 3 testes por vaga: caixa, atendimento, vendas, cozinha, estoque e mais",
      "Testes da sua empresa, com as perguntas que só vocês sabem fazer",
      "Mandar o teste para quem você quiser, mesmo depois de a pessoa se candidatar",
      "O candidato faz pelo celular, e o resultado aparece no quadro da vaga",
    ],
  },
  video: {
    titulo: "Entrevista em vídeo: confirme que a pessoa sabe fazer",
    texto:
      "Currículo bonito não diz se a pessoa sabe fazer. A Entrevista em vídeo traz as duas opções, no mesmo recurso: gravada, em que o candidato responde pelo celular quando puder e a IA transcreve e resume, e ao vivo, numa chamada dentro do Publike. Quem decide é você.",
    itens: [
      "Gravada: você escolhe de 2 a 6 perguntas, com sugestões pela vaga",
      "Gravada: o candidato grava pelo celular, e a IA transcreve e resume cada resposta",
      "Ao vivo: a chamada dentro do Publike, com um toque, sem Zoom, Meet nem instalar nada",
      "A gravada sem limite; ao vivo, até 10 por mês (nos planos, 10, 20 ou 30, pela faixa)",
    ],
  },
  automacoes: {
    titulo: "Automações personalizadas: monte as suas regras",
    texto:
      "As 5 automações prontas já são grátis em toda vaga. Com as personalizadas, você diz quando o Publike age, para quem e o que ele faz.",
    itens: [
      "Dispensar sozinho quem não tem o obrigatório, pela resposta, pela distância ou pelo que combina",
      "Adiantar quem combina: mover para Em análise, chamar para a entrevista ou pedir o teste",
      "A mensagem certa em cada etapa, do seu jeito e na hora que você escolher",
      "Avisar você ou alguém da equipe quando algo acontece",
      "As mesmas regras em todas as vagas, ou nas de um cliente, com a prévia de quem elas pegariam",
    ],
  },
};

const ICONE_RECURSO: Record<RecursoPago, typeof Sparkles> = {
  copiloto: Sparkles,
  testes: ClipboardCheck,
  video: Video,
  automacoes: Workflow,
};

/** Assinar o recurso (claude/plano-checkout-asaas.md): cartão ou Pix, em /painel/assinar. */
export function BotaoAssinar({
  recurso,
  variante = "primario",
  tamanho = "md",
  novo = true,
}: {
  recurso: Produto;
  variante?: "primario" | "secundario";
  tamanho?: "md" | "sm";
  /** o selo "Novo" ao lado (na faixa dos dias grátis, a aba já mostra os dias: sem o selo) */
  novo?: boolean;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <BotaoLink href={`/painel/assinar?recurso=${recurso}`} variante={variante} tamanho={tamanho}>
        <CreditCard aria-hidden />
        {recurso === "combo" ? "Assinar o combo" : `Assinar ${O_PRODUTO[recurso]}`}
      </BotaoLink>
      {novo && <Selo variante="novo">Novo</Selo>}
    </span>
  );
}

/**
 * Para quem ainda não tem o recurso. `estado` null: antes da migração (sem botão). Vai embaixo do cabeçalho da tela
 * (o título da tela é o h2; o da oferta, h3), numa largura de ler bem.
 */
export function OfertaRecurso({ recurso, estado }: { recurso: RecursoPago; estado: EstadoRecurso | null }) {
  const o = OFERTA[recurso];
  const Icone = ICONE_RECURSO[recurso];
  const acabou = estado?.experimentou && estado.fim_experimento ? dataCurta(estado.fim_experimento) : null;
  return (
    <section
      aria-labelledby={`oferta-${recurso}`}
      className="flex max-w-3xl flex-col gap-4 rounded-lg border border-line-strong bg-surface-200 p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-10 items-center justify-center rounded-pill bg-terra-soft">
          <Icone aria-hidden className="size-5 text-terra-text" />
        </span>
        {/* depois dos 15 dias (ou sem eles), a marca não promete mais os dias grátis */}
        <SeloCortesia texto={estado && !estado.pode_experimentar ? "Recurso pago" : undefined} />
      </div>
      <h3 id={`oferta-${recurso}`} className="text-h3">
        {o.titulo}
      </h3>
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

/** O que a assinatura soma ao grátis do mês, numa linha. */
const SEM_LIMITE: Record<"copiloto" | "video", string> = {
  copiloto: "Com a assinatura, a IA lê todos os candidatos e busca em Talentos.",
  video: "Com a assinatura, gravadas sem limite, até 10 ao vivo por mês e o pedido a todo novo candidato.",
};

/** "a IA leu 3 de 5 candidatos", "2 de 5 entrevistas gravadas e 0 de 1 ao vivo": o que a conta usou no mês. */
function usoDoGratis(recurso: "copiloto" | "video", g: GratisDoMes): string {
  const usados = Math.min(g.usados, g.limite);
  if (recurso === "copiloto") {
    return `a IA leu ${usados} de ${g.limite} ${g.limite === 1 ? "candidato" : "candidatos"}`;
  }
  return [
    g.limite > 0 && `${usados} de ${g.limite} ${g.limite === 1 ? "entrevista gravada" : "entrevistas gravadas"}`,
    g.aoVivo && g.aoVivo.limite > 0 && `${Math.min(g.aoVivo.usados, g.aoVivo.limite)} de ${g.aoVivo.limite} ao vivo`,
  ]
    .filter(Boolean)
    .join(" e ");
}

/**
 * O grátis de cada mês (migração 20270730120000), no alto da Triagem com IA e da Entrevista em vídeo de quem não
 * tem o recurso: o que já usou, quando renova e o que a assinatura (ou os 15 dias) soma. A barra é do principal
 * (os candidatos lidos, as gravadas pedidas).
 */
export function FaixaGratis({
  recurso,
  gratis,
  estado,
}: {
  recurso: "copiloto" | "video";
  gratis: GratisDoMes;
  estado: EstadoRecurso | null | undefined;
}) {
  const acabou = gratis.limite > 0 && gratis.usados >= gratis.limite;
  const renova = gratis.renovaEm ? ` Renova em ${diaQueRenova(gratis.renovaEm)}.` : "";
  const parte = gratis.limite > 0 ? Math.min(1, gratis.usados / gratis.limite) : 0;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-md border border-line bg-surface-300 px-4 py-3"
    >
      <div className="flex min-w-0 flex-1 basis-72 flex-col gap-2">
        <p className="text-body-sm">
          <span className="text-label">Grátis neste mês: {usoDoGratis(recurso, gratis)}.</span>
          <span className="text-ink-muted">
            {renova} {SEM_LIMITE[recurso]}
          </span>
        </p>
        {gratis.limite > 0 && (
          <span aria-hidden className="block h-1.5 w-full max-w-xs overflow-hidden rounded-pill bg-line">
            <span
              className={`block h-full rounded-pill ${acabou ? "bg-terra" : "bg-cerrado"}`}
              style={{ width: `${Math.round(parte * 100)}%` }}
            />
          </span>
        )}
      </div>
      {estado?.pode_experimentar ? (
        <BotaoExperimentar recurso={recurso} acao="experimentar" tamanho="sm" />
      ) : estado?.pode_assinar ? (
        <BotaoAssinar recurso={recurso} tamanho="sm" variante={acabou ? "primario" : "secundario"} novo={false} />
      ) : estado?.experimentou && !estado.quer_continuar ? (
        <BotaoExperimentar recurso={recurso} acao="continuar" tamanho="sm" />
      ) : null}
    </div>
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
  // uma faixa baixa: a aba já mostra os dias que faltam, e o trabalho da tela vem logo abaixo
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-line bg-surface-300 px-4 py-2.5"
    >
      <p className="text-body-sm">
        <span className="text-label">Dias grátis até {dataCurta(estado.ate)}</span>
        <span className="text-ink-muted">
          {" "}
          ({n === 1 ? "falta 1" : `faltam ${n}`}). Depois, o que você fez fica guardado.
        </span>
      </p>
      {estado.pode_assinar ? (
        <BotaoAssinar recurso={recurso} tamanho="sm" variante="secundario" novo={false} />
      ) : estado.quer_continuar ? (
        <span className="text-label">Você já pediu para continuar. A gente fala com você.</span>
      ) : (
        <BotaoExperimentar recurso={recurso} acao="continuar" tamanho="sm" />
      )}
    </div>
  );
}
