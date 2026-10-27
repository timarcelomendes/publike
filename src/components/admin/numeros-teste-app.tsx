import { Secao } from "@/components/admin/ui";
import { formatarNumero } from "@/lib/formato";
import {
  EVENTOS_TESTE_APP,
  NOMES_EVENTOS_TESTE_APP,
  NOMES_ORIGENS_TESTE_APP,
  ORIGENS_TESTE_APP,
} from "@/lib/teste-app";

type Linha = { evento: string; origem: string; total: number; hoje: number };

const DIAS = 30;

/**
 * O teste do app na Play: quantos abriram /testar-app e quantos tocaram em cada passo, nos últimos 30 dias,
 * sem saber quem. O número que vale para o Google (testadores que aceitaram e instalaram) fica na Play Console.
 */
export function NumerosDoTesteApp({ linhas }: { linhas: Linha[] }) {
  const soma = (evento: string, campo: "total" | "hoje" = "total") =>
    linhas.filter((l) => l.evento === evento).reduce((n, l) => n + l[campo], 0);
  const abriram = soma("abriu");
  const origens = ORIGENS_TESTE_APP.map((o) => ({
    o,
    n: linhas.find((l) => l.evento === "abriu" && l.origem === o)?.total ?? 0,
  })).filter((x) => x.n > 0);
  return (
    <Secao
      titulo="Teste do app no Google Play"
      descricao={`A página /testar-app nos últimos ${DIAS} dias, sem saber quem. Quem de fato aceitou e instalou fica na Play Console (Teste fechado).`}
    >
      {abriram === 0 && soma("whatsapp") === 0 ? (
        <p className="text-body-sm text-ink-muted">Ninguém abriu a página ainda.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {EVENTOS_TESTE_APP.map((e) => {
              const n = soma(e);
              const hoje = soma(e, "hoje");
              return (
                <li key={e} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-body-sm">
                  <span>{NOMES_EVENTOS_TESTE_APP[e]}</span>
                  <span className="text-right tabular-nums">
                    <strong className="font-semibold">{formatarNumero(n)}</strong>
                    {hoje > 0 && <span className="text-ink-muted"> · {formatarNumero(hoje)} hoje</span>}
                  </span>
                  {e !== "abriu" && e !== "whatsapp" && (
                    <span aria-hidden className="col-span-2 h-2 overflow-hidden rounded-pill bg-surface-300">
                      <span
                        className="block h-full rounded-pill bg-cerrado"
                        style={{ width: `${abriram ? Math.min(100, (n / abriram) * 100) : 0}%` }}
                      />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {origens.length > 0 && (
            <p className="text-body-sm text-ink-muted">
              Vieram de:{" "}
              {origens.map(({ o, n }, i) => (
                <span key={o}>
                  {i > 0 && ", "}
                  {NOMES_ORIGENS_TESTE_APP[o]} ({formatarNumero(n)})
                </span>
              ))}
              .
            </p>
          )}
        </div>
      )}
    </Secao>
  );
}
