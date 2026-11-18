import { CircleCheck, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Barras } from "@/components/admin/grafico";
import { Filtros, linkCom, Numero, Secao, Situacao } from "@/components/admin/ui";
import { ConferirModelos, ConferirNumero, ConfigWhatsapp, MandarTeste } from "@/components/admin/whatsapp";
import { Aviso, Selo, Vazio, type VarianteSelo } from "@/components/ui/basicos";
import { formatarData, formatarDataHora, formatarNumero, plural, primeiro } from "@/lib/formato";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import {
  categoriaBloqueia,
  erroPassageiro,
  explicarErro,
  MODELOS,
  RODAPE_WHATSAPP,
  situacaoWhatsapp,
  type SituacaoModelos,
} from "@/lib/servidor/whatsapp";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import {
  custoDasCobradas,
  dolares,
  emDolares,
  horarioWhatsapp,
  nomeDoAvisoWhatsapp,
  parametrosWhatsapp,
  porqueNaoSaiu,
  quemRecebeuWhatsapp,
  RESPOSTAS_WHATSAPP,
  TARIFA_MARKETING_USD,
  TARIFA_WHATSAPP_USD,
  type ParametrosWhatsapp,
} from "@/lib/whatsapp-tipos";

export const metadata: Metadata = { title: "WhatsApp" };

// Admin › WhatsApp (claude/plano-whatsapp-oficial.md; migrações 20270619120000, 20270710120000 e 20270714120000), em
// abas desde 17/11/2026 (Marcelo: "melhore a visão dos resultados, na tela, coloque em abas e exibir os erros, se
// houver" e "e os parâmetros para mudar também"):
//   Resultados  o caminho dos avisos no período (hoje, 7 ou 30 dias), por dia, por aviso, as empresas e agências no
//               mês (contra o limite do mês), os botões e as últimas
//   Erros       o que falhou, o que está parado na fila, os modelos com problema, os limites e a ligação
//   Parâmetros  ligar, para quem, os limites, o horário, os tempos de juntar e espaçar, a validade e os avisos
//   Modelos     os modelos na Meta
//   Ligação e teste  as chaves, o número, o webhook e a mensagem de teste
// No computador do dono e, no site no ar, para a equipe publike.org.

type Resumo = {
  config: {
    ativo: boolean;
    para_todos: boolean;
    numeros_teste: string[];
    limite_dia: number;
    limite_mes: number;
    por_conta_dia: number;
    tipos_desligados: string[];
    modelos: SituacaoModelos;
    modelos_conferidos_em: string | null;
    atualizado_em?: string | null;
  } & Partial<Record<keyof ParametrosWhatsapp, number>>;
  aceites: { pessoas: number; empresas: number; pararam_7_dias: number };
  pendentes: number;
  cobradas_30_dias: number;
  enviadas_no_mes: number;
  estimativa: Record<string, { todos: number; aceitaram: number }>;
  /** quantas pessoas com o WhatsApp ligado desligaram cada aviso (migração 20270711120000) */
  desligados_por_tipo?: Record<string, number>;
  /** quem contrata neste mês: os avisos, o limite e os que ele segurou (migração 20270714120000) */
  quem_contrata_no_mes?: {
    contas: number;
    no_limite: number;
    lista: {
      conta_id: string;
      nome: string | null;
      tipo: string;
      plano: boolean;
      limite: number;
      usadas: number;
      seguradas: number;
    }[];
  };
};

type Contagem = {
  entraram: number;
  enviadas: number;
  entregues: number;
  lidas: number;
  respondidas: number;
  falharam: number;
  descartadas: number;
};

/** admin_whatsapp_resultados (migração 20270710120000) */
type Resultados = {
  desde: string;
  funil: Contagem & { esperando: number; cobradas: number };
  na_fila: number;
  enviadas_24h?: number;
  por_tipo: (Contagem & { tipo: string })[];
  por_dia: { dia: string; entraram: number; enviadas: number; lidas: number; falharam: number }[];
  falhas: { motivo: string; quantas: number; ultima: string; tipos: string[] }[];
  parados: { motivo: string; quantas: number; desde: string }[];
  sem_entrega: number;
  descartes: { motivo: string; quantas: number }[];
  respostas: { tipo: string; resposta: string; quantas: number }[];
  ultimas: {
    id: number;
    criado_em: string;
    tipo: string;
    modelo: string | null;
    situacao: string;
    motivo: string | null;
    resposta: string | null;
    quantos: number;
    enviar_depois_de?: string | null;
    enviada_em: string | null;
    entregue_em: string | null;
    lida_em: string | null;
    conta_id: string;
    conta: string | null;
    conta_tipo: string | null;
  }[];
};

const ABAS = [
  { valor: "resultados", nome: "Resultados" },
  { valor: "erros", nome: "Erros" },
  { valor: "parametros", nome: "Parâmetros" },
  { valor: "modelos", nome: "Modelos" },
  { valor: "ligacao", nome: "Ligação e teste" },
] as const;
type Aba = (typeof ABAS)[number]["valor"];

const PERIODOS = [
  { valor: "hoje", nome: "Hoje", dias: 0 },
  { valor: "7", nome: "7 dias", dias: 7 },
  { valor: "30", nome: "30 dias", dias: 30 },
] as const;
type Periodo = (typeof PERIODOS)[number]["valor"];

const STATUS: Record<string, { nome: string; variante: VarianteSelo; grave: boolean }> = {
  APPROVED: { nome: "Aprovado", variante: "match", grave: false },
  PENDING: { nome: "Em análise", variante: "aviso", grave: false },
  IN_APPEAL: { nome: "Em recurso", variante: "aviso", grave: false },
  REJECTED: { nome: "Recusado", variante: "perigo", grave: true },
  PAUSED: { nome: "Pausado", variante: "perigo", grave: true },
  DISABLED: { nome: "Desligado", variante: "perigo", grave: true },
  ERRO: { nome: "Erro ao cadastrar", variante: "perigo", grave: true },
  FALTA: { nome: "Falta cadastrar", variante: "contorno", grave: false },
};

const SITUACAO: Record<string, { nome: string; variante: VarianteSelo }> = {
  pendente: { nome: "Na fila", variante: "neutro" },
  enviando: { nome: "Enviando", variante: "neutro" },
  enviada: { nome: "Enviada", variante: "contorno" },
  entregue: { nome: "Entregue", variante: "matchContorno" },
  lida: { nome: "Lida", variante: "match" },
  falhou: { nome: "Falhou", variante: "perigo" },
  descartada: { nome: "Não saiu", variante: "contorno" },
};

/** Os avisos com botões de resposta (a coluna Respostas só vale neles). */
const COM_BOTOES = new Set(MODELOS.filter((m) => m.botoes.some((b) => b.tipo === "resposta")).map((m) => m.aviso));

export default function WhatsappAdmin({ searchParams }: PageProps<"/admin/whatsapp">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {searchParams.then((sp) => {
        const pedida = primeiro(sp.aba);
        const aba: Aba = ABAS.some((a) => a.valor === pedida) ? (pedida as Aba) : "resultados";
        const p = primeiro(sp.periodo);
        const periodo: Periodo = PERIODOS.some((x) => x.valor === p) ? (p as Periodo) : "7";
        return <Conteudo aba={aba} periodo={periodo} />;
      })}
    </Suspense>
  );
}

const pct = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : "—");

/** O link desta tela com a aba e o período (o padrão fica fora do endereço). */
const enderecoDa = (aba: Aba, periodo: Periodo) =>
  linkCom("/admin/whatsapp", {}, { aba: aba === "resultados" ? null : aba, periodo: periodo === "7" ? null : periodo });

const FUSO = "America/Sao_Paulo";
const diaDe = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
const horaCurta = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso))
    .replace(",", "");

/** "hoje às 08:01", "ontem às 20:15" ou "16/11 às 09:30", no horário de Brasília. */
const quandoFoi = (iso: string, agora: number) => {
  const h = horaCurta(iso);
  const dia = diaDe(new Date(iso).getTime());
  if (dia === diaDe(agora)) return `hoje às ${h.slice(-5)}`;
  if (dia === diaDe(agora - 86_400_000)) return `ontem às ${h.slice(-5)}`;
  return `${h.slice(0, 5)} às ${h.slice(-5)}`;
};

/** A hora de Brasília agora (0 a 23). */
const horaDeAgora = (agora: number) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", hourCycle: "h23" }).format(agora));

/** O motivo da Meta explicado ("131026: …" vira a frase em português com o código entre parênteses). */
const explicado = (motivo: string) => (/^\d+:/.test(motivo) ? explicarErro(motivo) : motivo);

type ErroWhatsapp = {
  chave: string;
  grave: boolean;
  titulo: string;
  detalhe?: ReactNode;
  quantas?: number;
  quando?: string;
  aba?: Aba;
};

/** Os erros de agora: a ligação, os limites, os modelos dos avisos ligados, o que está parado e o que falhou no período. */
function errosDoWhatsapp(
  r: Resumo,
  res: Resultados | null,
  s: ReturnType<typeof situacaoWhatsapp>,
  local: boolean,
  p: ParametrosWhatsapp,
): ErroWhatsapp[] {
  const cfg = r.config;
  const erros: ErroWhatsapp[] = [];
  // desligado, só o que já aconteceu conta (a ligação, os limites e os modelos não fazem falta)
  const ligado = cfg.ativo;

  // a ligação com a Meta (no computador, as chaves são as do .env.local, não as da Vercel: não conta)
  if (ligado && !local) {
    if (!(s.token && s.numero))
      erros.push({
        chave: "chaves",
        grave: true,
        titulo: "Faltam as chaves da Meta na Vercel: nada sai",
        detalhe: "Sem o WHATSAPP_TOKEN e o WHATSAPP_PHONE_ID, o Publike não manda nenhuma mensagem.",
        aba: "ligacao",
      });
    else if (!(s.segredo && s.webhook))
      erros.push({
        chave: "webhook",
        grave: true,
        titulo: "O webhook não está pronto",
        detalhe: "Sem o WHATSAPP_APP_SECRET e o WHATSAPP_WEBHOOK_TOKEN, a entrega, a leitura e as respostas dos botões não chegam.",
        aba: "ligacao",
      });
    if (s.token && !s.conta)
      erros.push({
        chave: "waba",
        grave: false,
        titulo: "Falta o WHATSAPP_WABA_ID na Vercel",
        detalhe: "Sem ele, o Publike não cadastra nem confere os modelos na Meta.",
        aba: "ligacao",
      });
  }

  // os limites (o teto do gasto)
  const limite = !ligado
    ? null
    : cfg.limite_mes <= 0 || cfg.limite_dia <= 0
      ? { chave: "limite-zero", grave: true, titulo: `O limite ${cfg.limite_mes <= 0 ? "do mês" : "do dia"} está em 0: nada sai` }
      : r.enviadas_no_mes >= cfg.limite_mes
        ? {
            chave: "limite-mes",
            grave: true,
            titulo: `Chegou no limite do mês (${formatarNumero(cfg.limite_mes)} mensagens)`,
            detalhe: "Nada sai até o dia 1º. Para mandar agora, aumente o limite em Parâmetros.",
          }
        : res?.enviadas_24h !== undefined && res.enviadas_24h >= cfg.limite_dia
          ? {
              chave: "limite-dia",
              grave: false,
              titulo: `Chegou no limite do dia (${formatarNumero(cfg.limite_dia)} mensagens em 24 horas)`,
              detalhe: `O resto espera na fila e vence se passar de ${p.validade_horas} horas.`,
            }
          : null;
  if (limite) erros.push({ ...limite, aba: "parametros" });

  // os modelos dos avisos ligados, com os avisos que esperam por eles
  const usados = new Set<string>();
  for (const m of MODELOS) {
    if (!ligado || cfg.tipos_desligados.includes(m.aviso)) continue;
    const st = cfg.modelos?.[m.nome];
    const status = st?.status ?? "FALTA";
    const info = STATUS[status] ?? { nome: status, variante: "contorno" as const, grave: true };
    const esperando = (res?.parados ?? []).filter(
      (x) => x.motivo?.startsWith(`modelo ${m.nome} `) || x.motivo?.startsWith(`a Meta mudou o modelo ${m.nome} `),
    );
    esperando.forEach((x) => usados.add(x.motivo));
    const quantas = esperando.reduce((n, x) => n + x.quantas, 0) || undefined;
    const aviso = `“${nomeDoAvisoWhatsapp(m.aviso, true)}”`;
    if (status !== "APPROVED")
      erros.push({
        chave: `modelo-${m.nome}`,
        grave: info.grave,
        titulo: `O modelo ${m.nome}: ${info.nome.toLowerCase()}`,
        detalhe: (
          <>
            O aviso {aviso} espera na fila até a aprovação (no máximo {p.validade_horas} horas).
            {st?.motivo && <> Motivo da Meta: {st.motivo}.</>}
          </>
        ),
        quantas,
        aba: "modelos",
      });
    else if (categoriaBloqueia(m, st?.categoria))
      erros.push({
        chave: `categoria-${m.nome}`,
        grave: true,
        titulo: `A Meta pôs o modelo ${m.nome} em ${st.categoria}`,
        detalhe: `O aviso ${aviso} não sai: marketing custa umas 9 vezes mais. Desligue o aviso em Parâmetros ou cadastre uma versão nova do modelo.`,
        quantas,
        aba: "modelos",
      });
  }

  if (!res) return erros;

  // parado agora na fila (fora o que espera um modelo, que já entrou acima)
  for (const x of res.parados) {
    if (usados.has(x.motivo)) continue;
    const parado = x.motivo.startsWith("a Meta recusou o envio:");
    erros.push({
      chave: `parado-${x.motivo}`,
      grave: parado,
      titulo: parado
        ? "O envio está parado: a Meta recusou o token ou a conta"
        : erroPassageiro(x.motivo)
          ? "Esperando para tentar de novo"
          : "Parado na fila",
      detalhe: parado ? x.motivo.replace(/^a Meta recusou o envio: /, "") : explicado(x.motivo),
      quantas: x.quantas,
      quando: x.desde,
      aba: parado ? "ligacao" : undefined,
    });
  }

  // o que falhou no período
  for (const x of res.falhas) {
    const tipos = x.tipos.map((t) => nomeDoAvisoWhatsapp(t, true)).join(", ");
    const semConfirmacao = x.motivo === "sem confirmação do envio";
    erros.push({
      chave: `falha-${x.motivo}`,
      grave: true,
      titulo: semConfirmacao ? "O robô caiu no meio do envio" : `Falhou: ${explicado(x.motivo)}`,
      detalhe: (
        <>
          {semConfirmacao && "Para não repetir a mensagem, o aviso não sai de novo. "}
          {erroPassageiro(x.motivo) && "Depois de 3 tentativas. "}
          Avisos: {tipos}.
        </>
      ),
      quantas: x.quantas,
      quando: x.ultima,
    });
  }

  if (res.sem_entrega > 0)
    erros.push({
      chave: "sem-entrega",
      grave: false,
      titulo: "Saíram há mais de 1 hora e a Meta não disse se entregou",
      detalhe: "O webhook pode não estar chegando. Confira o webhook da conta em Ligação e teste.",
      quantas: res.sem_entrega,
      aba: "ligacao",
    });

  const venceram = res.descartes.filter((x) => x.motivo.startsWith("venceu")).reduce((n, x) => n + x.quantas, 0);
  if (venceram > 0)
    erros.push({
      chave: "venceram",
      grave: false,
      titulo: "Venceram na fila",
      detalhe: `Esperaram mais de ${p.validade_horas} horas: fora do horário, no limite do dia ou com o modelo em análise. O horário, os limites e a validade ficam em Parâmetros.`,
      quantas: venceram,
      aba: "parametros",
    });

  return erros.sort((a, b) => Number(b.grave) - Number(a.grave));
}

async function Conteudo({ aba, periodo }: { aba: Aba; periodo: Periodo }) {
  const admin = await ehAdminLocal();
  if (!admin && !(await possoVerTela("/admin/whatsapp"))) notFound();
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const dias = PERIODOS.find((x) => x.valor === periodo)?.dias ?? 7;
  const [resumo, resultados, agora, porModelo] = await Promise.all([
    c.rpc("admin_whatsapp"),
    c.rpc("admin_whatsapp_resultados", { p_dias: dias }),
    agoraDaRequisicao(),
    // as cobradas por modelo, para o custo pela categoria (migração 20270718120000; sem ela, tudo como utilidade)
    c.rpc("admin_whatsapp_cobradas_por_modelo", { p_dias: dias }),
  ]);
  const cobradasPorModelo = porModelo.error || !porModelo.data ? null : (porModelo.data as Record<string, number>);
  // sem a migração 20270619120000, a ligação com a Meta (que não usa o banco) já funciona
  const r = resumo.error || !resumo.data ? null : (resumo.data as unknown as Resumo);
  // sem a migração 20270710120000, os resultados e os erros do período não vêm
  const res = resultados.error || !resultados.data ? null : (resultados.data as unknown as Resultados);
  const s = situacaoWhatsapp();
  // Admin aberto no computador (16/11/2026: "aqui ele olha local?"): as chaves são as do .env.local, não as da Vercel
  const local = !process.env.VERCEL;
  const p = parametrosWhatsapp(r?.config ?? {});
  const erros = r ? errosDoWhatsapp(r, res, s, local, p) : [];
  const graves = erros.filter((e) => e.grave).length;

  const ligados = r ? MODELOS.filter((m) => !r.config.tipos_desligados.includes(m.aviso)) : [];
  const prontos = r
    ? ligados.filter((m) => {
        const st = r.config.modelos?.[m.nome];
        return st?.status === "APPROVED" && !categoriaBloqueia(m, st.categoria);
      }).length
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-h2">WhatsApp</h1>
          <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
            O WhatsApp oficial do Publike manda os avisos que destravam a contratação e as perguntas com botões. A
            resposta do botão entra no Publike sem a pessoa abrir o site. Só recebe quem marcou “Receber pelo WhatsApp”,
            e todo aviso termina com “{RODAPE_WHATSAPP}”.
          </p>
        </div>
        {r && (
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <Situacao ok={r.config.ativo && r.config.para_todos}>
              {!r.config.ativo
                ? "Desligado: nada sai pelo WhatsApp"
                : r.config.para_todos
                  ? `Ligado para todos que aceitaram, ${horarioWhatsapp(p.hora_inicio, p.hora_fim)}`
                  : "Ligado só para os números de teste"}
            </Situacao>
            <Situacao ok={r.aceites.pessoas + r.aceites.empresas > 0}>
              {plural(r.aceites.pessoas + r.aceites.empresas, "conta recebe", "contas recebem")} pelo WhatsApp
            </Situacao>
            <Situacao ok={prontos === ligados.length}>
              {prontos === ligados.length
                ? "Os modelos dos avisos ligados estão aprovados"
                : `${prontos} de ${ligados.length} modelos dos avisos ligados aprovados`}
            </Situacao>
            {/* sem os resultados, os erros do período não foram vistos: não dá para dizer "nenhum" */}
            <Situacao ok={Boolean(res) && erros.length === 0}>
              {erros.length > 0
                ? [
                    graves > 0 && plural(graves, "erro", "erros"),
                    erros.length > graves && plural(erros.length - graves, "ponto de atenção", "pontos de atenção"),
                  ]
                    .filter(Boolean)
                    .join(" e ")
                : res
                  ? "Nenhum erro"
                  : "Erros: falta a migração do banco"}
            </Situacao>
          </div>
        )}
      </header>

      <nav
        aria-label="Partes da tela do WhatsApp"
        className="sem-barra -mx-4 -mt-2 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
      >
        {ABAS.map((a) => {
          const atual = a.valor === aba;
          return (
            <Link
              key={a.valor}
              href={enderecoDa(a.valor, periodo)}
              scroll={false}
              aria-current={atual ? "page" : undefined}
              className={`-mb-px inline-flex min-h-12 shrink-0 items-center gap-1.5 border-b-2 px-3 text-label transition-colors ${
                atual ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {a.nome}
              {a.valor === "erros" && erros.length > 0 && (
                <span
                  className={`min-w-6 rounded-pill px-1.5 text-center text-caption leading-6 tabular-nums ${
                    graves > 0 ? "border border-danger text-danger" : "bg-surface-300 text-ink"
                  }`}
                >
                  {erros.length}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {!r && aba !== "ligacao" ? (
        <Aviso tipo="alerta" titulo="Rode a migração do WhatsApp">
          Falta a migração 20270619120000_whatsapp_oficial.sql neste banco. A ligação com a Meta (em Ligação e teste) já
          funciona; o envio, os modelos e os números aparecem depois dela.
        </Aviso>
      ) : (
        <>
          {aba === "resultados" && r && (
            <AbaResultados
              r={r}
              res={res}
              periodo={periodo}
              agora={agora}
              erros={erros}
              p={p}
              cobradasPorModelo={cobradasPorModelo}
            />
          )}
          {aba === "erros" && r && <AbaErros erros={erros} res={res} periodo={periodo} />}
          {aba === "parametros" && r && <AbaParametros r={r} p={p} />}
          {aba === "modelos" && r && <AbaModelos r={r} p={p} conferir={s.token && s.conta} />}
          {aba === "ligacao" && <AbaLigacao s={s} local={local} />}
        </>
      )}
    </div>
  );
}

function SemResultados() {
  return (
    <Aviso tipo="alerta" titulo="Rode a migração dos resultados do WhatsApp">
      Falta a migração 20270710120000_whatsapp_resultados_e_parametros.sql neste banco: os resultados do período e os
      erros aparecem depois dela.
    </Aviso>
  );
}

function FiltroDoPeriodo({ aba, periodo, res }: { aba: Aba; periodo: Periodo; res: Resultados }) {
  const desde = res.desde ? new Date(res.desde) : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Filtros
        rotulo="Período"
        opcoes={PERIODOS.map((x) => ({ valor: x.valor, nome: x.nome }))}
        atual={periodo}
        link={(v) => enderecoDa(aba, v as Periodo)}
      />
      {desde && (
        <p className="text-body-sm text-ink-muted">
          {periodo === "hoje" ? "Desde a meia-noite" : `Desde ${formatarData(desde.toISOString())}`}
          {" · "}
          {plural(res.na_fila, "aviso na fila agora", "avisos na fila agora")}
        </p>
      )}
    </div>
  );
}

function AbaResultados({
  r,
  res,
  periodo,
  agora,
  erros,
  p,
  cobradasPorModelo,
}: {
  r: Resumo;
  res: Resultados | null;
  periodo: Periodo;
  agora: number;
  erros: ErroWhatsapp[];
  p: ParametrosWhatsapp;
  /** as cobradas no período por modelo (null: sem a migração 20270718120000) */
  cobradasPorModelo: Record<string, number> | null;
}) {
  if (!res) return <SemResultados />;
  const f = res.funil;
  // o custo pela categoria de cada modelo: o convite do pacote é de marketing (umas 9 vezes a utilidade)
  const categorias = Object.fromEntries(Object.entries(r.config.modelos ?? {}).map(([nome, m]) => [nome, m?.categoria]));
  const custo = cobradasPorModelo ? custoDasCobradas(cobradasPorModelo, categorias) : null;
  const graves = erros.filter((e) => e.grave);
  const n = PERIODOS.find((x) => x.valor === periodo)?.dias ?? 7;
  const dias = n > 1 ? Array.from({ length: n }, (_, i) => diaDe(agora - (n - 1 - i) * 86_400_000)) : [];
  const porDia = new Map(res.por_dia.map((d) => [d.dia, d]));
  const serie = (campo: "entraram" | "enviadas" | "lidas") => dias.map((d) => porDia.get(d)?.[campo] ?? 0);
  const respostas = new Map<string, { resposta: string; quantas: number }[]>();
  for (const x of res.respostas) respostas.set(x.tipo, [...(respostas.get(x.tipo) ?? []), x]);

  return (
    <div className="flex flex-col gap-6">
      <FiltroDoPeriodo aba="resultados" periodo={periodo} res={res} />

      {!r.config.ativo && (
        <Aviso tipo="info" titulo="O envio está desligado">
          Nenhum aviso entra na fila. Ligue em Parâmetros.
        </Aviso>
      )}
      {graves.length > 0 && (
        <Aviso tipo="erro" titulo={graves.length === 1 ? graves[0].titulo : plural(graves.length, "erro", "erros")}>
          <p>
            {graves.length > 1 && `${graves[0].titulo}. `}
            <Link href={enderecoDa("erros", periodo)} scroll={false} className="text-ink underline underline-offset-2">
              Ver tudo na aba Erros
            </Link>
          </p>
        </Aviso>
      )}

      <Secao titulo="O caminho dos avisos" descricao="Cada aviso entra na fila, sai pela Meta, é entregue, lido e, nos que têm botões, respondido.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Numero
            rotulo="Entraram na fila"
            valor={f.entraram}
            detalhe={f.esperando > 0 ? `${formatarNumero(f.esperando)} ainda esperando` : undefined}
          />
          <Numero rotulo="Enviadas" valor={f.enviadas} detalhe={`${pct(f.enviadas, f.entraram)} das que entraram`} />
          <Numero rotulo="Entregues" valor={f.entregues} detalhe={`${pct(f.entregues, f.enviadas)} das enviadas`} />
          <Numero rotulo="Lidas" valor={f.lidas} detalhe={`${pct(f.lidas, f.entregues)} das entregues`} />
          <Numero rotulo="Respostas nos botões" valor={f.respondidas} detalhe="nos avisos com botões" />
          <Numero
            rotulo="Falharam"
            valor={f.falharam}
            alerta={f.falharam > 0}
            href={f.falharam > 0 ? enderecoDa("erros", periodo) : undefined}
            detalhe={f.falharam > 0 ? "ver os erros" : undefined}
          />
          <Numero rotulo="Não saíram" valor={f.descartadas} detalhe="pelas regras (abaixo)" />
          <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-200 p-4">
            <span className="text-label text-ink-muted">Custo estimado</span>
            <span className="font-display text-h1 text-ink">
              {custo ? emDolares(custo.usd) : dolares(f.cobradas)}
            </span>
            <span className="text-body-sm text-ink-muted">
              {plural(f.cobradas, "mensagem cobrada", "mensagens cobradas")}
              {custo && custo.marketing > 0
                ? ` (${formatarNumero(custo.marketing)} de marketing a US$ ${TARIFA_MARKETING_USD.toLocaleString("pt-BR", {
                    maximumFractionDigits: 4,
                  })}; o resto a US$ ${TARIFA_WHATSAPP_USD.toLocaleString("pt-BR", { maximumFractionDigits: 4 })})`
                : ` (US$ ${TARIFA_WHATSAPP_USD.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} cada)`}
            </span>
          </div>
        </div>
        <p className="text-body-sm text-ink-muted">
          No mês: {plural(r.enviadas_no_mes, "mensagem enviada", "mensagens enviadas")} de{" "}
          {formatarNumero(r.config.limite_mes)} do limite. A conta oficial é a da Meta (Gerenciador do WhatsApp ›
          Insights).
        </p>
      </Secao>

      {dias.length > 0 && (
        <Secao titulo="Por dia" descricao="Quantos avisos entraram na fila, saíram e foram lidos em cada dia.">
          <div className="grid gap-6 sm:grid-cols-3">
            <Barras titulo="Entraram" valores={serie("entraram")} dias={dias} periodo={`${n} dias`} />
            <Barras titulo="Enviadas" valores={serie("enviadas")} dias={dias} periodo={`${n} dias`} />
            <Barras titulo="Lidas" valores={serie("lidas")} dias={dias} periodo={`${n} dias`} />
          </div>
        </Secao>
      )}

      <Secao titulo="Por aviso">
        {res.por_tipo.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Nenhum aviso entrou na fila neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-body-sm">
              <thead className="text-ink-muted">
                <tr>
                  <th className="py-2 pr-3 font-normal">Aviso</th>
                  <th className="py-2 pr-3 text-right font-normal">Entraram</th>
                  <th className="py-2 pr-3 text-right font-normal">Enviadas</th>
                  <th className="py-2 pr-3 text-right font-normal">Entregues</th>
                  <th className="py-2 pr-3 text-right font-normal">Lidas</th>
                  <th className="py-2 pr-3 text-right font-normal">Respostas</th>
                  <th className="py-2 pr-3 text-right font-normal">Falharam</th>
                  <th className="py-2 text-right font-normal">Não saíram</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {res.por_tipo.map((t) => (
                  <tr key={t.tipo}>
                    <td className="py-2 pr-3 text-ink">{nomeDoAvisoWhatsapp(t.tipo, true)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatarNumero(t.entraram)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatarNumero(t.enviadas)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatarNumero(t.entregues)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatarNumero(t.lidas)}
                      {t.entregues > 0 && <span className="ml-1 text-ink-muted">({pct(t.lidas, t.entregues)})</span>}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {COM_BOTOES.has(t.tipo) ? formatarNumero(t.respondidas) : <span className="text-ink-muted">—</span>}
                    </td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${t.falharam ? "text-danger" : ""}`}>
                      {formatarNumero(t.falharam)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink-muted">{formatarNumero(t.descartadas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {r.quem_contrata_no_mes && <QuemContrataNoMes uso={r.quem_contrata_no_mes} p={p} />}

      {(respostas.size > 0 || res.descartes.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {respostas.size > 0 && (
            <Secao titulo="As respostas dos botões">
              <ul className="flex flex-col gap-3 text-body-sm">
                {[...respostas].map(([tipo, lista]) => (
                  <li key={tipo} className="flex flex-col gap-0.5">
                    <span className="text-label text-ink">{nomeDoAvisoWhatsapp(tipo, true)}</span>
                    <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-ink-muted">
                      {lista.map((x) => (
                        <span key={x.resposta}>
                          {RESPOSTAS_WHATSAPP[x.resposta] ?? x.resposta}:{" "}
                          <span className="text-ink tabular-nums">{formatarNumero(x.quantas)}</span>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </Secao>
          )}
          {res.descartes.length > 0 && (
            <Secao titulo="Por que não saíram" descricao="As regras que seguram a mensagem (não são erros).">
              <ul className="flex flex-col gap-1.5 text-body-sm">
                {res.descartes.map((x) => (
                  <li key={x.motivo} className="grid grid-cols-[1fr_auto] gap-x-3">
                    <span className="text-ink">
                      {porqueNaoSaiu(x.motivo)}
                    </span>
                    <span className="text-ink-muted tabular-nums">{formatarNumero(x.quantas)}</span>
                  </li>
                ))}
              </ul>
            </Secao>
          )}
        </div>
      )}

      {/* para quem foi (a empresa ou o candidato) e quando chegou no celular (18/11/2026, Marcelo: "Quero saber aqui
          quando a empresa ou o candidato recebeu WhatsApp pela a api"); uma linha por mensagem, que cabe no celular */}
      <Secao
        titulo="As últimas mensagens"
        descricao={`As ${formatarNumero(res.ultimas.length)} mais recentes do período: para quem foi (a empresa ou o candidato, pelo nome, nunca o número) e quando chegou no celular.`}
      >
        {res.ultimas.length === 0 ? (
          <Vazio icone={MessageCircle} titulo="Nada neste período">
            Quando um aviso entra na fila do WhatsApp, ele aparece aqui.
          </Vazio>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {res.ultimas.map((m) => (
              <MensagemDaLista key={m.id} m={m} agora={agora} p={p} />
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}

/**
 * Uma das últimas mensagens: o nome de quem recebeu e se é a empresa ou o candidato, o aviso, a situação e a hora que
 * conta (quando chegou no celular e quando leu; antes disso, quando saiu ou quando vai sair).
 */
function MensagemDaLista({ m, agora, p }: { m: Resultados["ultimas"][number]; agora: number; p: ParametrosWhatsapp }) {
  const st = SITUACAO[m.situacao] ?? { nome: m.situacao, variante: "contorno" as const };
  // a Meta manda a entrega e a leitura; quem desligou a confirmação de leitura só manda a entrega
  const recebeu = m.entregue_em ?? m.lida_em;
  const naFila = m.situacao === "pendente" || m.situacao === "enviando";
  const foraDoHorario = horaDeAgora(agora) < p.hora_inicio || horaDeAgora(agora) >= p.hora_fim;
  const [hora, depois] = recebeu
    ? [
        `Recebeu ${quandoFoi(recebeu, agora)}`,
        m.lida_em
          ? diaDe(new Date(m.lida_em).getTime()) === diaDe(new Date(recebeu).getTime())
            ? `leu às ${horaCurta(m.lida_em).slice(-5)}`
            : `leu ${quandoFoi(m.lida_em, agora)}`
          : null,
      ]
    : m.situacao === "enviada" && m.enviada_em
      ? [`Saiu ${quandoFoi(m.enviada_em, agora)}`, "a Meta ainda não confirmou a entrega"]
      : m.situacao === "falhou"
        ? [`Falhou ${quandoFoi(m.enviada_em ?? m.criado_em, agora)}`, null]
        : naFila
          ? [
              m.enviar_depois_de && new Date(m.enviar_depois_de).getTime() > agora
                ? `Sai a partir de ${quandoFoi(m.enviar_depois_de, agora)}`
                : foraDoHorario
                  ? `Sai às ${p.hora_inicio}h`
                  : "Sai na próxima rodada",
              `entrou na fila ${quandoFoi(m.criado_em, agora)}`,
            ]
          : [`Entrou na fila ${quandoFoi(m.criado_em, agora)}`, null];
  const detalhe = m.resposta
    ? `Respondeu: ${RESPOSTAS_WHATSAPP[m.resposta] ?? m.resposta}`
    : m.motivo
      ? m.situacao === "descartada"
        ? porqueNaoSaiu(m.motivo)
        : explicado(m.motivo)
      : null;

  // no celular, uma coluna (quem, o aviso, a situação com a hora, o detalhe); no computador, a situação e a hora à direita
  return (
    <li className="grid gap-x-4 gap-y-1 py-2.5 text-body-sm sm:grid-cols-[minmax(0,1fr)_auto]">
      <span className="min-w-0 break-words">
        <Link href={`/admin/usuarios/${m.conta_id}`} className="text-label text-ink underline-offset-2 hover:underline">
          {m.conta ?? "Conta apagada"}
        </Link>
        <span className="text-ink-muted"> · {quemRecebeuWhatsapp(m.tipo, m.conta_tipo)}</span>
      </span>
      <span className="text-ink">
        {nomeDoAvisoWhatsapp(m.tipo, true)}
        {m.quantos > 1 && <span className="text-ink-muted"> · {formatarNumero(m.quantos)} juntas</span>}
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:col-start-2 sm:row-span-3 sm:row-start-1 sm:flex-col sm:items-end sm:text-right">
        <Selo variante={st.variante}>{st.nome}</Selo>
        <span className="text-ink tabular-nums">
          {hora}
          {depois && <span className="sm:hidden">,</span>}
        </span>
        {depois && <span className="text-ink-muted tabular-nums">{depois}</span>}
      </span>
      {detalhe && (
        <span className={`sm:col-start-1 ${m.situacao === "falhou" ? "text-danger" : "text-ink-muted"}`}>{detalhe}</span>
      )}
    </li>
  );
}

/** As contas de quem contrata neste mês: os avisos que receberam contra o limite do mês (grátis ou plano). */
function QuemContrataNoMes({ uso, p }: { uso: NonNullable<Resumo["quem_contrata_no_mes"]>; p: ParametrosWhatsapp }) {
  return (
    <Secao
      titulo="Empresas e agências neste mês"
      descricao={`Os avisos que cada conta de quem contrata recebeu desde o dia 1º, contra o limite do mês: ${formatarNumero(p.limite_mes_gratis)} no grátis e ${formatarNumero(p.limite_mes_plano)} com plano. Chegou no limite, o aviso fica no sino e no e-mail.`}
    >
      {uso.lista.length === 0 ? (
        <p className="text-body-sm text-ink-muted">Nenhuma conta de quem contrata recebeu aviso neste mês.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-body-sm">
              <thead className="text-ink-muted">
                <tr>
                  <th className="py-2 pr-3 font-normal">Conta</th>
                  <th className="py-2 pr-3 font-normal">Plano</th>
                  <th className="py-2 pr-3 text-right font-normal">Avisos no mês</th>
                  <th className="py-2 text-right font-normal">Segurados pelo limite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {uso.lista.map((c) => (
                  <tr key={c.conta_id}>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/usuarios/${c.conta_id}`} className="text-ink underline-offset-2 hover:underline">
                        {c.nome ?? "Conta apagada"}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <Selo variante={c.plano ? "match" : "contorno"}>{c.plano ? "Plano" : "Grátis"}</Selo>
                    </td>
                    <td
                      className={`py-2 pr-3 text-right tabular-nums ${c.usadas >= c.limite ? "text-terra-text" : "text-ink"}`}
                    >
                      {formatarNumero(c.usadas)} de {formatarNumero(c.limite)}
                    </td>
                    <td className="py-2 text-right text-ink-muted tabular-nums">
                      {c.seguradas > 0 ? formatarNumero(c.seguradas) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-body-sm text-ink-muted">
            {uso.no_limite === 0
              ? "Nenhuma chegou no limite."
              : `${plural(uso.no_limite, "conta chegou", "contas chegaram")} no limite.`}
            {uso.contas > uso.lista.length &&
              ` Aqui estão as ${formatarNumero(uso.lista.length)} que mais receberam, de ${formatarNumero(uso.contas)}.`}
          </p>
        </>
      )}
    </Secao>
  );
}

function AbaErros({ erros, res, periodo }: { erros: ErroWhatsapp[]; res: Resultados | null; periodo: Periodo }) {
  return (
    <div className="flex flex-col gap-6">
      {res ? <FiltroDoPeriodo aba="erros" periodo={periodo} res={res} /> : <SemResultados />}
      {erros.length === 0 && !res ? null : erros.length === 0 ? (
        <Vazio icone={CircleCheck} titulo="Nenhum erro">
          Nada falhou neste período, nada está parado na fila e os modelos dos avisos ligados estão aprovados.
        </Vazio>
      ) : (
        <ul className="flex flex-col gap-3">
          {erros.map((e) => (
            <li
              key={e.chave}
              className={`flex flex-col gap-1.5 rounded-lg border bg-surface-200 p-4 sm:p-5 ${e.grave ? "border-danger" : "border-line"}`}
            >
              <p className="flex items-start gap-2">
                <Selo variante={e.grave ? "perigo" : "aviso"}>{e.grave ? "Erro" : "Atenção"}</Selo>
                <span className="min-w-0 pt-0.5 text-label break-words text-ink">{e.titulo}</span>
              </p>
              {e.detalhe && <p className="max-w-3xl text-body-sm break-words text-ink-muted">{e.detalhe}</p>}
              {(e.quantas !== undefined || e.quando || e.aba) && (
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-ink-muted">
                  {e.quantas !== undefined && (
                    <span className="text-ink tabular-nums">{plural(e.quantas, "mensagem", "mensagens")}</span>
                  )}
                  {e.quando && <span>a última em {formatarDataHora(e.quando)}</span>}
                  {e.aba && (
                    <Link href={enderecoDa(e.aba, periodo)} scroll={false} className="text-ink underline underline-offset-2">
                      Ver em {ABAS.find((a) => a.valor === e.aba)?.nome}
                    </Link>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AbaParametros({ r, p }: { r: Resumo; p: ParametrosWhatsapp }) {
  return (
    <Secao
      titulo="Configuração do envio"
      descricao={
        <>
          Mudou aqui, vale a partir do próximo aviso.
          {r.config.atualizado_em && ` Salvo por último em ${formatarDataHora(r.config.atualizado_em)}.`}
        </>
      }
    >
      <ConfigWhatsapp
        inicial={{
          ativo: r.config.ativo,
          para_todos: r.config.para_todos,
          numeros_teste: r.config.numeros_teste,
          limite_dia: r.config.limite_dia,
          limite_mes: r.config.limite_mes,
          tipos_desligados: r.config.tipos_desligados,
          parametros: p,
        }}
        estimativa={r.estimativa ?? {}}
        enviadasNoMes={r.enviadas_no_mes ?? 0}
        desligadosPorTipo={r.desligados_por_tipo ?? {}}
        quemContrata={r.quem_contrata_no_mes ?? null}
      />
    </Secao>
  );
}

function AbaModelos({ r, p, conferir }: { r: Resumo; p: ParametrosWhatsapp; conferir: boolean }) {
  return (
    <Secao
      titulo="Modelos na Meta"
      descricao={
        <>
          Toda mensagem que o Publike começa precisa de um modelo aprovado pela Meta (de utilidade; o do convite do
          pacote é de marketing, que custa mais). Com as chaves
          na Vercel e o envio ligado, o Publike cadastra os que faltam e confere a aprovação a cada 30 minutos; o aviso
          espera até o modelo ser aprovado (no máximo {p.validade_horas} horas).
          {r.config.modelos_conferidos_em && ` Conferidos em ${formatarDataHora(r.config.modelos_conferidos_em)}.`}
        </>
      }
      acoes={conferir ? <ConferirModelos /> : undefined}
    >
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-100">
        {MODELOS.map((m) => {
          const st = r.config.modelos?.[m.nome];
          const info = STATUS[st?.status ?? "FALTA"] ?? { nome: st?.status ?? "—", variante: "contorno" as const };
          const desligado = r.config.tipos_desligados.includes(m.aviso);
          return (
            <li key={m.nome} className="flex flex-col gap-1.5 p-4">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-label break-all text-ink">{m.nome}</span>
                <Selo variante={info.variante}>{info.nome}</Selo>
                {categoriaBloqueia(m, st?.categoria) ? (
                  <Selo variante="perigo" title="A Meta mudou a categoria: a mensagem fica mais cara e não sai">
                    {st?.categoria}
                  </Selo>
                ) : (
                  m.categoria && (
                    <Selo variante="contorno" title="Modelo de marketing: custa umas 9 vezes a mensagem de utilidade">
                      Marketing
                    </Selo>
                  )
                )}
                {desligado && (
                  <Selo variante="contorno" title="O aviso está desligado em Parâmetros: este modelo não é usado">
                    Aviso desligado
                  </Selo>
                )}
              </p>
              <p className="text-body-sm text-ink-muted">
                {m.para}: {m.aviso === "mensagem" ? `Mensagem nova no chat, sem ler há ${p.mensagem_minutos} minutos` : m.quando}
              </p>
              <p className="text-body-sm text-ink">{m.corpo}</p>
              <p className="text-body-sm text-ink-muted">Botões: {m.botoes.map((b) => b.texto).join(" · ")}</p>
              {st?.motivo && <p className="text-body-sm text-danger">{st.motivo}</p>}
            </li>
          );
        })}
      </ul>
    </Secao>
  );
}

function AbaLigacao({ s, local }: { s: ReturnType<typeof situacaoWhatsapp>; local: boolean }) {
  const ligacaoPronta = s.token && s.numero && s.conta && s.segredo && s.webhook;
  const enderecoWebhook = local ? "https://publike.org/api/whatsapp/webhook" : s.enderecoWebhook;
  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Ligação com a Meta"
        descricao="As chaves ficam na Vercel (Settings › Environment Variables), nunca aqui. Depois de pôr ou trocar, faça um novo deploy."
      >
        {local && (
          <Aviso tipo="alerta" titulo="Este é o Admin do seu computador">
            As linhas abaixo conferem o .env.local deste computador, não a Vercel. Para ver as chaves do site no ar e
            mandar o teste de verdade, abra{" "}
            <a href="https://publike.org/admin/whatsapp?aba=ligacao" className="underline underline-offset-2">
              publike.org/admin/whatsapp
            </a>
            .
          </Aviso>
        )}
        <div className="flex flex-col gap-1.5">
          <Situacao ok={s.token}>WHATSAPP_TOKEN: o token permanente do usuário do sistema</Situacao>
          <Situacao ok={s.numero}>WHATSAPP_PHONE_ID: o ID do número do Publike na API</Situacao>
          <Situacao ok={s.conta}>WHATSAPP_WABA_ID: o ID da conta do WhatsApp Business (para os modelos)</Situacao>
          <Situacao ok={s.segredo}>WHATSAPP_APP_SECRET: a chave secreta do app (confere o webhook)</Situacao>
          <Situacao ok={s.webhook}>WHATSAPP_WEBHOOK_TOKEN: um texto que você inventa (12 letras ou mais)</Situacao>
        </div>
        <p className="text-body-sm text-ink-muted">
          No app da Meta, em WhatsApp › Configuração, o webhook é{" "}
          <code className="rounded-sm bg-surface-300 px-1.5 py-0.5 break-all text-ink">{enderecoWebhook}</code>, com o mesmo
          token do WHATSAPP_WEBHOOK_TOKEN e o campo “messages” marcado.
        </p>
        {s.token && s.numero && <ConferirNumero />}
        {!ligacaoPronta && (
          <p className="text-body-sm text-ink-muted">Sem as chaves, o Publike não manda nada e nada dá erro.</p>
        )}
      </Secao>

      {s.token && s.numero && (
        <Secao
          titulo="Mandar um teste"
          descricao="Manda um aviso do Publike já aprovado, com dados de exemplo (ou, antes da aprovação, o modelo de exemplo da Meta), para conferir que o número e o token funcionam. Com o número de teste da Meta, o destino precisa estar na lista de destinatários dele."
        >
          <MandarTeste />
        </Secao>
      )}
    </div>
  );
}
