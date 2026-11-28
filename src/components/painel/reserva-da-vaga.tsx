import { Hourglass } from "lucide-react";
import {
  chamadasDaReserva,
  listarCurriculosDosInteressados,
  listarInteressados,
} from "@/lib/dados";
import { sempreAbertaDaVaga } from "@/lib/servidor/comeca-ja";
import { ChamarDaReserva } from "./chamar-da-reserva";

/**
 * O banco de reserva da vaga sempre aberta (migração 20271017120000; claude/plano-concentrar-contratacoes.md, parte 3).
 * Quem entra fica aqui, fora dos candidatos; quando abrir a vaga de verdade, a empresa toca em "Preciso de N agora"
 * e o Publike pergunta às N primeiras se ainda têm interesse. Quem confirma vira candidato em Novos.
 * A ordem: quem tem currículo primeiro, depois quem entrou mais recente (o interesse mais fresco).
 */
export async function ReservaDaVaga({ anuncioId }: { anuncioId: string }) {
  if (!(await sempreAbertaDaVaga(anuncioId))) return null;
  const [reserva, chamadas, curriculos] = await Promise.all([
    listarInteressados(anuncioId, { reserva: true }).catch(() => []),
    chamadasDaReserva(anuncioId),
    listarCurriculosDosInteressados(anuncioId).catch(() => new Map()),
  ]);
  const ordem = [...reserva].sort(
    (a, b) =>
      Number(curriculos.has(b.perfil_id)) -
        Number(curriculos.has(a.perfil_id)) ||
      b.curtido_em.localeCompare(a.curtido_em),
  );
  const naoChamados = ordem.filter((p) => !chamadas.has(p.perfil_id));
  // na lista, quem ainda não foi chamado vem antes
  const lista = [...naoChamados, ...ordem.filter((p) => chamadas.has(p.perfil_id))];
  const chamados = ordem.length - naoChamados.length;

  return (
    <section
      aria-labelledby="titulo-reserva"
      className="rounded-2xl border border-line bg-surface-100 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <Hourglass
          aria-hidden
          className="mt-0.5 size-5 shrink-0 text-ink-muted"
        />
        <div className="min-w-0 flex-1">
          <h3 id="titulo-reserva" className="text-h3">
            Banco de reserva: {ordem.length}{" "}
            {ordem.length === 1 ? "pessoa" : "pessoas"}
          </h3>
          <p className="mt-1 text-body-sm text-ink-muted">
            {ordem.length === 0
              ? "Esta vaga fica sempre aberta. Quem se interessar entra aqui, e você chama quando precisar contratar."
              : chamados > 0
                ? `Você já chamou ${chamados}. Quem confirmar o interesse aparece em Novos.`
                : "Quando abrir a vaga, chame as primeiras: o Publike pergunta se ainda têm interesse, e quem confirmar aparece em Novos."}
          </p>
        </div>
      </div>

      {ordem.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-line">
          {lista.slice(0, 8).map((p) => (
            <li
              key={p.perfil_id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2"
            >
              <span className="font-semibold">{p.nome}</span>
              <span className="text-body-sm text-ink-muted">
                {[p.bairro, p.cidade].filter(Boolean).join(", ")}
                {curriculos.has(p.perfil_id) ? ", com currículo" : ""}
                {chamadas.has(p.perfil_id) ? ", chamada" : ""}
              </span>
            </li>
          ))}
          {ordem.length > 8 && (
            <li className="py-2 text-body-sm text-ink-muted">
              E mais {ordem.length - 8} na reserva.
            </li>
          )}
        </ul>
      )}

      {naoChamados.length > 0 && (
        <ChamarDaReserva
          anuncioId={anuncioId}
          ordem={naoChamados.slice(0, 30).map((p) => p.perfil_id)}
        />
      )}
    </section>
  );
}
