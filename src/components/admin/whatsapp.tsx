"use client";

import { RefreshCw, Send, Smartphone } from "lucide-react";
import { useState, useTransition } from "react";
import {
  conferirModelosAgora,
  conferirNumeroAgora,
  mandarTesteWhatsapp,
  salvarWhatsapp,
  type NumeroDaMeta,
} from "@/lib/acoes/whatsapp-admin";
import { classesBotao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { TIPOS_WHATSAPP } from "@/lib/whatsapp-tipos";

// As partes de Admin › WhatsApp que mexem (claude/plano-whatsapp-oficial.md).

function Resposta({ r }: { r: { ok: boolean; texto: string } | null }) {
  if (!r) return null;
  return (
    <p role={r.ok ? "status" : "alert"} className={`text-body-sm ${r.ok ? "text-cerrado-text" : "text-danger"}`}>
      {r.texto}
    </p>
  );
}

export function ConfigWhatsapp({
  inicial,
}: {
  inicial: {
    ativo: boolean;
    para_todos: boolean;
    numeros_teste: string[];
    limite_dia: number;
    por_conta_dia: number;
    tipos_desligados: string[];
  };
}) {
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [paraTodos, setParaTodos] = useState(inicial.para_todos);
  const [numeros, setNumeros] = useState(inicial.numeros_teste.join("\n"));
  const [limite, setLimite] = useState(String(inicial.limite_dia));
  const [porConta, setPorConta] = useState(String(inicial.por_conta_dia));
  const [ligados, setLigados] = useState(
    () => new Set(TIPOS_WHATSAPP.map((t) => t.tipo).filter((t) => !inicial.tipos_desligados.includes(t))),
  );
  const [pendente, iniciar] = useTransition();
  const [resposta, setResposta] = useState<{ ok: boolean; texto: string } | null>(null);

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
            <span className="block text-body-sm text-ink-muted">
              As telas deixam de dizer “começam em breve”.
            </span>
          </span>
        </label>
      </fieldset>

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

      <div className="flex flex-wrap gap-4">
        <label className="flex w-40 flex-col gap-1.5">
          <span className="text-label text-ink">Limite por dia</span>
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
          <span className="text-label text-ink">Por conta por dia</span>
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
      <p className="-mt-3 max-w-2xl text-body-sm text-ink-muted">
        Quem contrata pode receber o dobro do limite por conta (os candidatos de várias vagas). A Meta começa permitindo
        250 pessoas por dia e sobe sozinha com a qualidade. Os avisos saem das 8h às 21h.
      </p>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-label text-ink">Avisos que saem pelo WhatsApp</legend>
        {TIPOS_WHATSAPP.map((t) => (
          <label key={t.tipo} className="flex min-h-10 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={ligados.has(t.tipo)}
              onChange={(e) =>
                setLigados((atual) => {
                  const novo = new Set(atual);
                  if (e.target.checked) novo.add(t.tipo);
                  else novo.delete(t.tipo);
                  return novo;
                })
              }
              className="size-5 shrink-0 accent-[var(--pk-ink)]"
            />
            <span className="text-body text-ink">{t.nome}</span>
            <span className="text-body-sm text-ink-muted">{t.para}</span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pendente} className={classesBotao("primario")}>
          {pendente ? "Salvando…" : "Salvar"}
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
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={pendente}
        className={classesBotao("secundario")}
        onClick={() => iniciar(async () => setNumero(await conferirNumeroAgora()))}
      >
        <Smartphone aria-hidden />
        {pendente ? "Conferindo…" : "Conferir o número na Meta"}
      </button>
      {numero &&
        (numero.ok ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
            <dt className="text-ink-muted">Número</dt>
            <dd className="text-ink">{numero.display_phone_number ?? "—"}</dd>
            <dt className="text-ink-muted">Nome que aparece</dt>
            <dd className="text-ink">
              {numero.verified_name ?? "—"}
              {numero.name_status && numero.name_status !== "APPROVED" && ` (nome ${numero.name_status.toLowerCase()})`}
            </dd>
            <dt className="text-ink-muted">Qualidade</dt>
            <dd className="text-ink">{QUALIDADE[numero.quality_rating ?? ""] ?? numero.quality_rating ?? "—"}</dd>
            <dt className="text-ink-muted">Limite</dt>
            <dd className="text-ink">{LIMITE[numero.messaging_limit_tier ?? ""] ?? numero.messaging_limit_tier ?? "—"}</dd>
          </dl>
        ) : (
          <Resposta r={{ ok: false, texto: numero.erro ?? "A Meta não respondeu." }} />
        ))}
    </div>
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
