import { Secao } from "./ui";

// O funil de quem chega sem conta (claude/plano-home-visitante.md, "Como medir"), no painel do admin: nos últimos
// 7 dias, quantas vezes a home de quem não entrou abriu, os toques nela, as contas criadas e quantas delas já
// curtiram ou publicaram. Serve para comparar a semana antes e a depois de cada mudança na home.

const TOQUES = [
  { chave: "curtir", nome: "Tocaram em Curtir" },
  { chave: "publicar", nome: "Tocaram em Publicar" },
  { chave: "curriculo", nome: "Tocaram em Currículo" },
  { chave: "entrar", nome: "Tocaram em Entrar" },
];

const pct = (n: number, de: number) => (de > 0 ? `${Math.round((100 * n) / de)}%` : "–");

export function FunilDoVisitante({ funil }: { funil: Map<string, number> }) {
  const n = (k: string) => funil.get(k) ?? 0;
  const home = n("home");
  const contas = n("contas");
  return (
    <Secao
      titulo="Quem chega sem conta (7 dias)"
      descricao="A home de quem não entrou: quantas vezes abriu e os toques nela (só a contagem, sem saber quem). E as contas criadas nesses dias, com quantas já curtiram ou publicaram."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <dl className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
            <dt className="text-label">Abriram a home</dt>
            <dd className="text-h3 tabular-nums">{home}</dd>
          </div>
          {TOQUES.map((t) => (
            <div key={t.chave} className="flex items-baseline justify-between gap-3">
              <dt className="text-body-sm">{t.nome}</dt>
              <dd className="text-body-sm tabular-nums">
                <strong className="font-semibold">{n(t.chave)}</strong>{" "}
                <span className="text-ink-muted">· {pct(n(t.chave), home)} das aberturas</span>
              </dd>
            </div>
          ))}
        </dl>
        <dl className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
            <dt className="text-label">Contas criadas</dt>
            <dd className="text-h3 tabular-nums">{contas}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-body-sm">Já curtiram ou pediram um serviço</dt>
            <dd className="text-body-sm tabular-nums">
              <strong className="font-semibold">{n("curtiu")}</strong>{" "}
              <span className="text-ink-muted">· {pct(n("curtiu"), contas)}</span>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-body-sm">Já publicaram</dt>
            <dd className="text-body-sm tabular-nums">
              <strong className="font-semibold">{n("publicou")}</strong>{" "}
              <span className="text-ink-muted">· {pct(n("publicou"), contas)}</span>
            </dd>
          </div>
        </dl>
      </div>
    </Secao>
  );
}
