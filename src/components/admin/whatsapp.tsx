"use client";

import { RefreshCw, Send, Smartphone } from "lucide-react";
import { useState, useTransition } from "react";
import {
  conferirModelosAgora,
  conferirNumeroAgora,
  ligarWebhookAgora,
  mandarTesteWhatsapp,
  registrarNumeroAgora,
  salvarWhatsapp,
  type NumeroDaMeta,
} from "@/lib/acoes/whatsapp-admin";
import { classesBotao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { formatarNumero } from "@/lib/formato";
import { dolares, TIPOS_WHATSAPP } from "@/lib/whatsapp-tipos";

// As partes de Admin › WhatsApp que mexem (claude/plano-whatsapp-oficial.md).

function Resposta({ r }: { r: { ok: boolean; texto: string } | null }) {
  if (!r) return null;
  return (
    <p role={r.ok ? "status" : "alert"} className={`text-body-sm ${r.ok ? "text-cerrado-text" : "text-danger"}`}>
      {r.texto}
    </p>
  );
}

type Estimativa = Record<string, { todos: number; aceitaram: number }>;

export function ConfigWhatsapp({
  inicial,
  estimativa,
  enviadasNoMes,
}: {
  inicial: {
    ativo: boolean;
    para_todos: boolean;
    numeros_teste: string[];
    limite_dia: number;
    limite_mes: number;
    por_conta_dia: number;
    tipos_desligados: string[];
  };
  /** quantos de cada aviso o Publike gerou em 30 dias (de quem já aceitou e de todos) */
  estimativa: Estimativa;
  enviadasNoMes: number;
}) {
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [paraTodos, setParaTodos] = useState(inicial.para_todos);
  const [numeros, setNumeros] = useState(inicial.numeros_teste.join("\n"));
  const [limite, setLimite] = useState(String(inicial.limite_dia));
  const [limiteMes, setLimiteMes] = useState(String(inicial.limite_mes));
  const [porConta, setPorConta] = useState(String(inicial.por_conta_dia));
  const [ligados, setLigados] = useState(
    () => new Set(TIPOS_WHATSAPP.map((t) => t.tipo).filter((t) => !inicial.tipos_desligados.includes(t))),
  );
  const [pendente, iniciar] = useTransition();
  const [resposta, setResposta] = useState<{ ok: boolean; texto: string } | null>(null);

  const est = (t: string) => estimativa[t] ?? { todos: 0, aceitaram: 0 };
  const somaLigados = (campo: "todos" | "aceitaram") =>
    TIPOS_WHATSAPP.filter((t) => ligados.has(t.tipo)).reduce((n, t) => n + est(t.tipo)[campo], 0);
  const teto = Math.max(0, Math.round(Number(limiteMes) || 0));
  const hoje = Math.min(somaLigados("aceitaram"), teto);
  const todos = Math.min(somaLigados("todos"), teto);

  function predefinir(qual: "economico" | "tudo") {
    setLigados(new Set(TIPOS_WHATSAPP.filter((t) => qual === "tudo" || t.economico).map((t) => t.tipo)));
    if (qual === "economico") {
      setLimite("50");
      setLimiteMes("1500");
    }
    setResposta(null);
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setResposta(null);
        iniciar(async () => {
          const r = await salvarWhatsapp({
            ativo,
            paraTodos,
            numerosTeste: numeros,
            limiteDia: Number(limite),
            limiteMes: Number(limiteMes),
            porContaDia: Number(porConta),
            tiposLigados: [...ligados],
          });
          setResposta(r.ok ? { ok: true, texto: r.mensagem ?? "Salvo." } : { ok: false, texto: r.erro });
        });
      }}
    >
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={ativo}
          onChange={(e) => setAtivo(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
        />
        <span>
          <span className="block text-label text-ink">Ligar o envio pelo WhatsApp</span>
          <span className="block text-body-sm text-ink-muted">
            Desligado, nenhum aviso entra na fila nem sai. Ligado, sai só para quem marcou “Receber pelo WhatsApp”.
          </span>
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label text-ink">Para quem</legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            type="radio"
            name="para"
            checked={!paraTodos}
            onChange={() => setParaTodos(false)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
          />
          <span>
            <span className="block text-body text-ink">Só os números de teste</span>
            <span className="block text-body-sm text-ink-muted">
              Os avisos das outras pessoas são descartados (não ficam acumulados para depois).
            </span>
          </span>
        </label>
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            type="radio"
            name="para"
            checked={paraTodos}
            onChange={() => setParaTodos(true)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
          />
          <span>
            <span className="block text-body text-ink">Todos que aceitaram</span>
            <span className="block text-body-sm text-ink-muted">As telas deixam de dizer “começam em breve”.</span>
          </span>
        </label>
      </fieldset>

      {!paraTodos && (
        <label className="flex max-w-md flex-col gap-1.5">
          <span className="text-label text-ink">Números de teste</span>
          <textarea
            value={numeros}
            onChange={(e) => setNumeros(e.target.value)}
            rows={3}
            placeholder={"62 99999-0000\n62 98888-0000"}
            className={classesEntrada}
          />
          <span className="text-body-sm text-ink-muted">
            Um por linha, com DDD. A pessoa também precisa ter marcado “Receber pelo WhatsApp” no Publike.
          </span>
        </label>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-label text-ink">Limites (o teto do gasto)</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex w-40 flex-col gap-1.5">
            <span className="text-body-sm text-ink">Por mês</span>
            <input
              type="number"
              min={0}
              max={1000000}
              value={limiteMes}
              onChange={(e) => setLimiteMes(e.target.value)}
              className={classesEntrada}
            />
          </label>
          <label className="flex w-40 flex-col gap-1.5">
            <span className="text-body-sm text-ink">Por dia</span>
            <input
              type="number"
              min={0}
              max={100000}
              value={limite}
              onChange={(e) => setLimite(e.target.value)}
              className={classesEntrada}
            />
          </label>
          <label className="flex w-40 flex-col gap-1.5">
            <span className="text-body-sm text-ink">Por conta por dia</span>
            <input
              type="number"
              min={1}
              max={20}
              value={porConta}
              onChange={(e) => setPorConta(e.target.value)}
              className={classesEntrada}
            />
          </label>
        </div>
        <p className="max-w-2xl text-body-sm text-ink-muted">
          No máximo {formatarNumero(teto)} mensagens por mês, {dolares(teto)} (US$ 0,0068 cada). Neste mês saíram{" "}
          {formatarNumero(enviadasNoMes)}. Chegando no teto, o envio para até o dia 1º. Quem contrata pode receber o dobro
          do limite por conta. Os avisos saem das 8h às 21h.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label text-ink">Avisos que saem pelo WhatsApp</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={classesBotao("secundario")} onClick={() => predefinir("economico")}>
            Econômico (o que destrava a contratação)
          </button>
          <button type="button" className={classesBotao("secundario")} onClick={() => predefinir("tudo")}>
            Todos os avisos
          </button>
        </div>
        <p className="max-w-2xl text-body-sm text-ink-muted">
          Ao lado de cada aviso: quantos o Publike gerou nos últimos 30 dias para quem já aceitou o WhatsApp e, entre
          parênteses, para todos. O aviso desligado continua no sino, no e-mail e no celular.
        </p>
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-100">
          {TIPOS_WHATSAPP.map((t) => {
            const e = est(t.tipo);
            return (
              <li key={t.tipo}>
                <label className="flex min-h-12 cursor-pointer items-start gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={ligados.has(t.tipo)}
                    onChange={(ev) =>
                      setLigados((atual) => {
                        const novo = new Set(atual);
                        if (ev.target.checked) novo.add(t.tipo);
                        else novo.delete(t.tipo);
                        return novo;
                      })
                    }
                    className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body text-ink">{t.nome}</span>
                    <span className="block text-body-sm text-ink-muted">
                      {t.para}
                      {!t.economico && " · fora do econômico"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-body-sm tabular-nums text-ink-muted">
                    {formatarNumero(e.aceitaram)} ({formatarNumero(e.todos)})
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="max-w-2xl text-body-sm text-ink">
          Com estes avisos, pelos últimos 30 dias: cerca de {formatarNumero(hoje)} mensagens por mês hoje ({dolares(hoje)}
          ) e até {formatarNumero(todos)} ({dolares(todos)}) se todo mundo aceitar, já com o teto do mês. É uma estimativa
          alta: o que a pessoa já viu no Publike e as candidaturas juntas por vaga não saem.
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pendente} className={classesBotao("primario")}>
          {pendente ? "Salvando…" : "Salvar a configuração"}
        </button>
        <Resposta r={resposta} />
      </div>
    </form>
  );
}

export function ConferirModelos() {
  const [pendente, iniciar] = useTransition();
  const [resposta, setResposta] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={pendente}
        className={classesBotao("secundario")}
        onClick={() =>
          iniciar(async () => {
            const r = await conferirModelosAgora();
            setResposta(r.ok ? { ok: true, texto: r.mensagem ?? "Pronto." } : { ok: false, texto: r.erro });
          })
        }
      >
        <RefreshCw aria-hidden />
        {pendente ? "Conferindo…" : "Cadastrar e conferir na Meta"}
      </button>
      <Resposta r={resposta} />
    </div>
  );
}

const QUALIDADE: Record<string, string> = { GREEN: "alta", YELLOW: "média", RED: "baixa", UNKNOWN: "ainda sem nota" };
const LIMITE: Record<string, string> = {
  TIER_50: "50 pessoas por dia",
  TIER_250: "250 pessoas por dia",
  TIER_1K: "1.000 pessoas por dia",
  TIER_10K: "10.000 pessoas por dia",
  TIER_100K: "100.000 pessoas por dia",
  TIER_UNLIMITED: "sem limite",
};

export function ConferirNumero() {
  const [pendente, iniciar] = useTransition();
  const [numero, setNumero] = useState<NumeroDaMeta | null>(null);
  const conferir = () => iniciar(async () => setNumero(await conferirNumeroAgora()));
  const registrado = numero?.platform_type === "CLOUD_API";
  const webhook = numero?.webhook;
  const webhookLigado = Boolean(webhook && "apps" in webhook && webhook.apps.length);
  return (
    <div className="flex flex-col items-start gap-3">
      <button type="button" disabled={pendente} className={classesBotao("secundario")} onClick={conferir}>
        <Smartphone aria-hidden />
        {pendente ? "Conferindo…" : "Conferir o número na Meta"}
      </button>
      {numero &&
        (numero.ok ? (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
              <dt className="text-ink-muted">Número</dt>
              <dd className="text-ink">{numero.display_phone_number ?? "—"}</dd>
              <dt className="text-ink-muted">Nome que aparece</dt>
              <dd className="text-ink">
                {numero.verified_name ?? "—"}
                {numero.name_status && numero.name_status !== "APPROVED" && ` (nome ${numero.name_status.toLowerCase()})`}
              </dd>
              <dt className="text-ink-muted">Na API de nuvem</dt>
              <dd className={registrado || !numero.platform_type ? "text-ink" : "text-danger"}>
                {!numero.platform_type ? "—" : registrado ? "Registrado" : "Falta registrar (abaixo)"}
              </dd>
              <dt className="text-ink-muted">Webhook da conta</dt>
              <dd className={webhookLigado ? "text-ink" : "text-danger"}>
                {!webhook
                  ? "—"
                  : "erro" in webhook
                    ? webhook.erro
                    : webhookLigado
                      ? `Ligado (${webhook.apps.join(", ")})`
                      : "Desligado (ligue abaixo)"}
              </dd>
              <dt className="text-ink-muted">Qualidade</dt>
              <dd className="text-ink">{QUALIDADE[numero.quality_rating ?? ""] ?? numero.quality_rating ?? "—"}</dd>
              <dt className="text-ink-muted">Limite</dt>
              <dd className="text-ink">{LIMITE[numero.messaging_limit_tier ?? ""] ?? numero.messaging_limit_tier ?? "—"}</dd>
            </dl>
            {webhook && "apps" in webhook && !webhookLigado && <LigarWebhook depois={conferir} />}
            {numero.platform_type && !registrado && <RegistrarNumero depois={conferir} />}
          </>
        ) : (
          <Resposta r={{ ok: false, texto: numero.erro ?? "A Meta não respondeu." }} />
        ))}
    </div>
  );
}

function LigarWebhook({ depois }: { depois: () => void }) {
  const [pendente, iniciar] = useTransition();
  const [resposta, setResposta] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={pendente}
        className={classesBotao("primario")}
        onClick={() =>
          iniciar(async () => {
            const r = await ligarWebhookAgora();
            setResposta(r.ok ? { ok: true, texto: r.mensagem ?? "Pronto." } : { ok: false, texto: r.erro });
            if (r.ok) depois();
          })
        }
      >
        {pendente ? "Ligando…" : "Ligar o webhook nesta conta"}
      </button>
      <Resposta r={resposta} />
    </div>
  );
}

function RegistrarNumero({ depois }: { depois: () => void }) {
  const [pin, setPin] = useState("");
  const [pendente, iniciar] = useTransition();
  const [resposta, setResposta] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <form
      className="flex max-w-md flex-col items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setResposta(null);
        iniciar(async () => {
          const r = await registrarNumeroAgora(pin);
          setResposta(r.ok ? { ok: true, texto: r.mensagem ?? "Registrado." } : { ok: false, texto: r.erro });
          if (r.ok) {
            setPin("");
            depois();
          }
        });
      }}
    >
      <label className="flex w-full flex-col gap-1.5">
        <span className="text-label text-ink">Registrar o número na API (PIN de 6 números)</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className={`${classesEntrada} w-40`}
        />
        <span className="text-body-sm text-ink-muted">
          Invente um PIN e guarde: ele vira a confirmação em duas etapas do número (se o número já tem uma, use a mesma).
          A Meta aceita 10 tentativas a cada 3 dias. O Publike não guarda o PIN.
        </span>
      </label>
      <button type="submit" disabled={pendente || pin.length !== 6} className={classesBotao("primario")}>
        {pendente ? "Registrando…" : "Registrar o número"}
      </button>
      <Resposta r={resposta} />
    </form>
  );
}

export function MandarTeste() {
  const [numero, setNumero] = useState("");
  const [pendente, iniciar] = useTransition();
  const [resposta, setResposta] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <form
      className="flex flex-col items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setResposta(null);
        iniciar(async () => {
          const r = await mandarTesteWhatsapp(numero);
          setResposta(r.ok ? { ok: true, texto: r.mensagem ?? "Mandamos." } : { ok: false, texto: r.erro });
        });
      }}
    >
      <label className="flex w-full max-w-xs flex-col gap-1.5">
        <span className="text-label text-ink">Número (da lista de teste)</span>
        <input
          type="tel"
          inputMode="tel"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="62 99999-0000"
          className={classesEntrada}
        />
      </label>
      <button type="submit" disabled={pendente || !numero.trim()} className={classesBotao("secundario")}>
        <Send aria-hidden />
        {pendente ? "Mandando…" : "Mandar a mensagem de teste"}
      </button>
      <Resposta r={resposta} />
    </form>
  );
}
