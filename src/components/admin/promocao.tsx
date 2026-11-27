"use client";

import { Gift, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  buscarContasDaPromocao,
  liberarPromocao,
  tirarPromocao,
  type ContaAchada,
} from "@/lib/acoes/admin-recursos-pagos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

// A promoção de lançamento em Admin › Recursos pagos (migração 20270918120000): achar a conta, escolher os recursos e
// até quando. A conta vê "Promoção de lançamento até…" em cada recurso e recebe o aviso no sino; 3 dias antes do fim,
// outro aviso.

const RECURSOS = [
  { id: "copiloto", nome: "Triagem com IA" },
  { id: "testes", nome: "Teste Prático" },
  { id: "video", nome: "Entrevista em vídeo" },
  { id: "automacoes", nome: "Automações" },
  { id: "salarios", nome: "Consulta de salários" },
  // migração 20271015120000
  { id: "agenda", nome: "Entrevistas pelo WhatsApp" },
  // migração 20270918140000
  { id: "visoes", nome: "Visões das vagas" },
  { id: "contato_no_convite", nome: "Contato no convite" },
];

const TIPO: Record<string, string> = {
  comercio: "comércio",
  empresa: "empresa",
  agencia: "agência",
};

/** A data de hoje + n dias, em Goiânia ("2026-12-23"). */
function diaDaqui(n: number) {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function LiberarPromocao() {
  const { rodar, pendente, mensagem } = useAcao();
  const [busca, setBusca] = useState("");
  const [achadas, setAchadas] = useState<ContaAchada[]>([]);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [conta, setConta] = useState<ContaAchada | null>(null);
  const [recursos, setRecursos] = useState<string[]>(["copiloto"]);
  const [ate, setAte] = useState(() => diaDaqui(30));

  useEffect(() => {
    if (conta) return;
    const q = busca.trim();
    // com menos de 2 letras, a lista some (o render confere o tamanho)
    if (q.length < 2) return;
    let vale = true;
    const t = setTimeout(async () => {
      const r = await buscarContasDaPromocao(q);
      if (!vale) return;
      if (r.ok) {
        setAchadas(r.contas);
        setErroBusca(null);
      } else setErroBusca(r.erro);
    }, 300);
    return () => {
      vale = false;
      clearTimeout(t);
    };
  }, [busca, conta]);

  // os recursos que a conta escolhida ainda não tem (com "Tudo", vão todos de uma vez)
  const livres = RECURSOS.map((r) => r.id).filter((id) => !conta?.ja_tem?.includes(id));
  const marcar = (id: string) =>
    setRecursos((rs) =>
      rs.includes(id) ? rs.filter((r) => r !== id) : [...rs, id],
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="promocao-conta" className="text-label">
          Conta
        </label>
        {conta ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-300 px-3 py-2 text-body-sm">
            <span className="font-semibold">{conta.nome}</span>
            <span className="text-ink-muted">
              {[TIPO[conta.tipo] ?? conta.tipo, conta.email]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <Botao
              tamanho="sm"
              variante="fantasma"
              className="ml-auto"
              onClick={() => {
                setConta(null);
                setBusca("");
              }}
            >
              <X aria-hidden />
              Trocar
            </Botao>
          </div>
        ) : (
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
            />
            <input
              id="promocao-conta"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome da empresa, CNPJ ou e-mail"
              autoComplete="off"
              className={`${classesEntrada} pl-9`}
            />
          </div>
        )}
        {!conta && erroBusca && (
          <p className="text-body-sm text-danger">{erroBusca}</p>
        )}
        {!conta && busca.trim().length >= 2 && achadas.length > 0 && (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {achadas.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    setConta(a);
                    // o que ela já tem sai da escolha; marca o primeiro que falta
                    const falta = RECURSOS.find(
                      (r) => !(a.ja_tem ?? []).includes(r.id),
                    );
                    setRecursos(falta ? [falta.id] : []);
                  }}
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-body-sm hover:bg-surface-300"
                >
                  <span className="font-semibold">{a.nome}</span>
                  <span className="text-caption text-ink-muted">
                    {[TIPO[a.tipo] ?? a.tipo, a.email, a.cnpj]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {(a.ja_tem ?? []).length > 0 && (
                    <span className="text-caption text-ink-muted">
                      Já tem:{" "}
                      {RECURSOS.filter((r) => a.ja_tem?.includes(r.id))
                        .map((r) => r.nome)
                        .join(", ")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label">Recursos</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {/* "Tudo": marca (ou desmarca) todos os que a conta ainda não tem */}
          <label className="flex items-center gap-2 text-body-sm font-semibold">
            <input
              type="checkbox"
              checked={livres.length > 0 && livres.every((r) => recursos.includes(r))}
              disabled={!livres.length}
              onChange={(e) => setRecursos(e.target.checked ? livres : [])}
              className="size-4"
            />
            Tudo
          </label>
          {RECURSOS.map((r) => {
            const jaTem = Boolean(conta?.ja_tem?.includes(r.id));
            return (
              <label
                key={r.id}
                className={`flex items-center gap-2 text-body-sm ${jaTem ? "text-ink-muted" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={!jaTem && recursos.includes(r.id)}
                  disabled={jaTem}
                  onChange={() => marcar(r.id)}
                  className="size-4"
                />
                {r.nome}
                {jaTem && <span className="text-caption">(já tem)</span>}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="promocao-ate" className="text-label">
          Até
        </label>
        <input
          id="promocao-ate"
          type="date"
          value={ate}
          min={diaDaqui(1)}
          max={diaDaqui(90)}
          onChange={(e) => setAte(e.target.value)}
          className={`${classesEntrada} max-w-48`}
        />
        <p className="text-body-sm text-ink-muted">
          Vale até o fim desse dia. No máximo 90 dias.
        </p>
      </div>

      <div className="flex flex-col items-start gap-2">
        <Botao
          variante="primario"
          disabled={
            pendente ||
            !conta ||
            !recursos.some((r) => !conta.ja_tem?.includes(r)) ||
            !ate
          }
          onClick={() =>
            conta &&
            rodar(
              () =>
                liberarPromocao(
                  conta.id,
                  recursos.filter((r) => !conta.ja_tem?.includes(r)),
                  ate,
                ),
              (r) => {
                if (r.ok) {
                  setConta(null);
                  setBusca("");
                }
              },
            )
          }
        >
          <Gift aria-hidden />
          Liberar na promoção
        </Botao>
        {mensagem}
      </div>
    </div>
  );
}

export function TirarPromocao({
  contaId,
  recurso,
}: {
  contaId: string;
  recurso: string;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [certeza, setCerteza] = useState(false);
  return (
    <span className="flex flex-col items-start gap-1">
      {certeza ? (
        <span className="flex flex-wrap gap-1">
          <Botao
            tamanho="sm"
            variante="secundario"
            disabled={pendente}
            onClick={() => rodar(() => tirarPromocao(contaId, recurso))}
          >
            Sim, acabar agora
          </Botao>
          <Botao
            tamanho="sm"
            variante="fantasma"
            disabled={pendente}
            onClick={() => setCerteza(false)}
          >
            Não
          </Botao>
        </span>
      ) : (
        <Botao
          tamanho="sm"
          variante="fantasma"
          onClick={() => setCerteza(true)}
        >
          Acabar agora
        </Botao>
      )}
      {mensagem}
    </span>
  );
}
