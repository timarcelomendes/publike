import { Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { plural } from "@/lib/formato";
import { fonteDaFaixa, nomeDaRegiao, reaisDaFaixa } from "@/lib/salarios";
import {
  curriculoNoMercado,
  type CampoDaMudanca,
  type NivelDaNota,
  type NotaDoCurriculo,
} from "@/lib/servidor/curriculo-mercado";
import type { Curriculo } from "@/lib/tipos";

/** Os níveis da nota, com o começo e o fim de cada um (a barra é dividida assim). */
const NIVEIS: { nivel: NivelDaNota; de: number; ate: number }[] = [
  { nivel: "Comece por aqui", de: 0, ate: 40 },
  { nivel: "Quase lá", de: 40, ate: 70 },
  { nivel: "Bom", de: 70, ate: 85 },
  { nivel: "Ótimo", de: 85, ate: 101 },
];

/** Onde a mudança fica no formulário, e o convite (quem já tem só esqueceu de pôr). */
const NO_FORMULARIO: Record<CampoDaMudanca, { href: string; texto: string }> = {
  cnh: { href: "#cnh", texto: "Já tem? Pôr no currículo" },
  escolaridade: { href: "#escolaridade", texto: "Já tem? Pôr no currículo" },
  disponibilidade: { href: "#horarios", texto: "Pode? Marcar no currículo" },
  cursos: { href: "#cursos", texto: "Já fez? Pôr no currículo" },
};

/**
 * "Seu currículo no mercado" (claude/plano-salario-e-curriculo.md, parte 4), no alto de Meu currículo: a nota (só a
 * pessoa vê), a faixa de salário da função, as vagas que combinam e o que abre mais vagas. Sem dados, não aparece.
 */
export async function CurriculoNoMercado({
  pessoa,
  curriculo,
  agora,
  ia,
}: {
  pessoa: { id: string; cidade: string | null; bairro: string | null };
  curriculo: Curriculo;
  agora: number;
  /** a ajuda da IA está ligada: o convite para "Melhorar com a IA" */
  ia: boolean;
}) {
  const m = await curriculoNoMercado(pessoa, curriculo, agora);
  if (!m) return null;
  const { nota, faixa, funcao } = m;
  return (
    <section
      id="mercado"
      aria-labelledby="mercado-titulo"
      className="flex scroll-mt-24 flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="mercado-titulo" className="font-display text-h3">
          Seu currículo no mercado
        </h2>
        <p className="flex items-center gap-1.5 text-body-sm text-ink-muted">
          <Lock aria-hidden className="size-3.5 shrink-0" />
          Só você vê esta parte
        </p>
      </div>

      <Nota nota={nota} funcao={funcao?.nome ?? null} />

      {faixa && funcao && (
        <div className="flex flex-col gap-1 border-t border-line pt-4">
          <h3 className="text-label">Quanto se paga</h3>
          <p className="max-w-prose text-body">
            Para {funcao.nome} em {nomeDaRegiao(faixa.regiao)}, a maioria das contratações com carteira paga de{" "}
            {reaisDaFaixa(faixa.p25)} a {reaisDaFaixa(faixa.p75)} por mês; no meio, {reaisDaFaixa(faixa.p50)}.
          </p>
          <p className="text-body-sm text-ink-muted">{fonteDaFaixa(faixa)}.</p>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <p className="text-body">
          {m.combinam ? (
            <>
              <strong className="font-semibold">
                {m.combinam === 1 ? "1 vaga perto de você combina" : `${m.combinam} vagas perto de você combinam`}
              </strong>{" "}
              com o seu currículo (70% ou mais).{" "}
              <Link href="/?tipo=vaga&ordem=combina" className="text-label underline underline-offset-2">
                Ver as vagas
              </Link>
            </>
          ) : (
            "Nenhuma vaga no ar perto de você combina 70% ou mais com o seu currículo agora."
          )}
        </p>
        {m.mudancas.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-label">O que abre mais vagas</h3>
            <ul className="flex flex-col gap-2">
              {m.mudancas.map((x) => (
                <li key={x.campo} className="rounded-md bg-surface-300 px-4 py-3 text-body-sm">
                  <strong className="font-semibold">{x.texto}</strong>: mais {plural(x.mais, "vaga", "vagas")}
                  {x.pagamMais ? `; elas pagam em média ${reaisDaFaixa(x.pagamMais)} a mais por mês` : ""}.{" "}
                  <a href={NO_FORMULARIO[x.campo].href} className="text-label underline underline-offset-2">
                    {NO_FORMULARIO[x.campo].texto}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {ia && (
        <p className="flex items-start gap-2 border-t border-line pt-4 text-body-sm">
          <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
          <span>
            <a href="#melhorar-com-ia" className="text-label underline underline-offset-2">
              Melhorar com a IA
            </a>
            : a IA lê o seu currículo e sugere textos e perguntas, só quando você pede.
          </span>
        </p>
      )}
    </section>
  );
}

/** A nota com a barra dos níveis e de onde ela vem. */
function Nota({ nota, funcao }: { nota: NotaDoCurriculo; funcao: string | null }) {
  const proximo = NIVEIS.find((n) => n.de > nota.valor);
  const cheio = nota.valor >= 70 ? "bg-cerrado" : "bg-ink";
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-h1 leading-none tabular-nums">{nota.valor}</span>
        <span className="text-body-sm text-ink-muted">de 100</span>
        <span className="text-label">
          {nota.nivel}
          {proximo ? (
            <span className="font-normal text-ink-muted">
              : {proximo.de - nota.valor === 1 ? "falta" : "faltam"}{" "}
              {plural(proximo.de - nota.valor, "ponto", "pontos")} para {proximo.nivel}
            </span>
          ) : null}
        </span>
      </p>
      <div role="img" aria-label={`Nota ${nota.valor} de 100, nível ${nota.nivel}`} className="flex flex-col gap-1.5">
        <div aria-hidden className="flex gap-0.5">
          {NIVEIS.map((n) => {
            const largura = Math.min(n.ate, 100) - n.de;
            const parte = Math.max(0, Math.min(1, (nota.valor - n.de) / largura));
            return (
              <span
                key={n.nivel}
                className="h-2.5 overflow-hidden rounded-pill bg-surface-300"
                style={{ width: `${largura}%` }}
              >
                <span className={`block h-full ${cheio}`} style={{ width: `${parte * 100}%` }} />
              </span>
            );
          })}
        </div>
        <div aria-hidden className="flex gap-0.5 text-[12px] leading-4">
          {NIVEIS.map((n) => (
            <span
              key={n.nivel}
              className={n.nivel === nota.nivel ? "font-semibold text-ink" : "text-ink-muted"}
              style={{ width: `${Math.min(n.ate, 100) - n.de}%` }}
            >
              {n.nivel}
            </span>
          ))}
        </div>
      </div>
      <p className="max-w-prose text-body-sm text-ink-muted">
        {nota.mercado
          ? `Metade da nota é o quanto o currículo está completo (${nota.completo} de 100). A outra metade vem das vagas de ${funcao ?? "a sua função"} perto de você nos últimos 60 dias: você atende tudo o que pedem ${nota.mercado.atende} de ${nota.mercado.vagas}.`
          : funcao
            ? `Ainda há poucas vagas de ${funcao} perto de você para comparar. Por enquanto, a nota é o quanto o currículo está completo.`
            : "Para comparar com as vagas, diga a sua profissão em “O que você faz” (como Auxiliar de cozinha ou Vendedora). Por enquanto, a nota é o quanto o currículo está completo."}
      </p>
    </div>
  );
}
