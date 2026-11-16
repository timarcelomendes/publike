import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Numero, Secao, Situacao } from "@/components/admin/ui";
import { ConferirModelos, ConferirNumero, ConfigWhatsapp, MandarTeste } from "@/components/admin/whatsapp";
import { Aviso, Selo, type VarianteSelo } from "@/components/ui/basicos";
import { formatarDataHora, formatarNumero } from "@/lib/formato";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { MODELOS, RODAPE_WHATSAPP, situacaoWhatsapp, type SituacaoModelos } from "@/lib/servidor/whatsapp";
import { TARIFA_WHATSAPP_USD, TIPOS_WHATSAPP } from "@/lib/whatsapp-tipos";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "WhatsApp" };

// Admin › WhatsApp (claude/plano-whatsapp-oficial.md; migração 20270619120000): a ligação com a Meta, ligar e o modo de
// teste, os modelos, os números e a mensagem de teste. No computador do dono e, no site no ar, para a equipe publike.org.

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
  };
  aceites: { pessoas: number; empresas: number; pararam_7_dias: number };
  pendentes: number;
  semana: {
    entraram: number;
    enviadas: number;
    entregues: number;
    lidas: number;
    respondidas: number;
    falharam: number;
    descartadas: number;
    cobradas: number;
  };
  por_tipo: { tipo: string; enviadas: number; lidas: number; respondidas: number }[];
  motivos: { situacao: string; motivo: string | null; quantas: number }[];
  respostas: { tipo: string; resposta: string; quantas: number }[];
  cobradas_30_dias: number;
  enviadas_no_mes: number;
  estimativa: Record<string, { todos: number; aceitaram: number }>;
};


const STATUS: Record<string, { nome: string; variante: VarianteSelo }> = {
  APPROVED: { nome: "Aprovado", variante: "match" },
  PENDING: { nome: "Em análise", variante: "aviso" },
  IN_APPEAL: { nome: "Em recurso", variante: "aviso" },
  REJECTED: { nome: "Recusado", variante: "perigo" },
  PAUSED: { nome: "Pausado", variante: "perigo" },
  DISABLED: { nome: "Desligado", variante: "perigo" },
  ERRO: { nome: "Erro ao cadastrar", variante: "perigo" },
  FALTA: { nome: "Falta cadastrar", variante: "contorno" },
};

const RESPOSTAS: Record<string, string> = {
  sim: "Sim",
  ainda_nao: "Ainda não",
  desisti: "Desisti",
  comecei: "Comecei",
  nao_deu: "Não deu certo",
  nao: "Não",
};

export default function WhatsappAdmin() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

const pct = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : "—");

async function Conteudo() {
  const admin = await ehAdminLocal();
  if (!admin && !(await possoVerTela("/admin/whatsapp"))) notFound();
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const { data, error } = await c.rpc("admin_whatsapp");
  // sem a migração, a ligação com a Meta (que não usa o banco) já funciona
  const r = error || !data ? null : (data as unknown as Resumo);
  const s = situacaoWhatsapp();
  const ligacaoPronta = s.token && s.numero && s.conta && s.segredo && s.webhook;
  // Admin aberto no computador (16/11/2026: "aqui ele olha local?"): as linhas conferem o .env.local, não a Vercel
  const local = !process.env.VERCEL;
  const enderecoWebhook = local ? "https://publike.org/api/whatsapp/webhook" : s.enderecoWebhook;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2">WhatsApp</h1>
        <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
          O WhatsApp oficial do Publike manda os avisos que destravam a contratação e as perguntas com botões. A resposta
          do botão entra no Publike sem a pessoa abrir o site. Ele nunca entra na conversa entre empresa e candidato. Só
          recebe quem marcou “Receber pelo WhatsApp”, e todo aviso termina com “{RODAPE_WHATSAPP}”.
        </p>
      </div>

      <Secao
        titulo="Ligação com a Meta"
        descricao="As chaves ficam na Vercel (Settings › Environment Variables), nunca aqui. Depois de pôr ou trocar, faça um novo deploy."
      >
        {local && (
          <Aviso tipo="alerta" titulo="Este é o Admin do seu computador">
            As linhas abaixo conferem o .env.local deste computador, não a Vercel. Para ver as chaves do site no ar e
            mandar o teste de verdade, abra{" "}
            <a href="https://publike.org/admin/whatsapp" className="underline underline-offset-2">
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

      {r ? (
        <Partes r={r} s={s} />
      ) : (
        <Aviso tipo="alerta" titulo="Rode a migração do WhatsApp">
          Falta a migração 20270619120000_whatsapp_oficial.sql neste banco. A ligação com a Meta (acima) já funciona; o
          envio, os modelos e os números aparecem depois dela.
        </Aviso>
      )}
    </div>
  );
}

function Partes({ r, s }: { r: Resumo; s: ReturnType<typeof situacaoWhatsapp> }) {
  const w = r.semana;
  const nomeDoTipo = (t: string) => TIPOS_WHATSAPP.find((x) => x.tipo === t)?.nome ?? t;
  return (
    <>
      <Secao
        titulo="Configuração de envios"
        descricao={
          r.config.ativo
            ? r.config.para_todos
              ? "Ligado para todos que aceitaram."
              : "Ligado só para os números de teste."
            : "Desligado: nada sai pelo WhatsApp."
        }
      >
        <ConfigWhatsapp
          inicial={r.config}
          estimativa={r.estimativa ?? {}}
          enviadasNoMes={r.enviadas_no_mes ?? 0}
        />
      </Secao>

      <Secao
        titulo="Modelos na Meta"
        descricao={
          <>
            Toda mensagem que o Publike começa precisa de um modelo aprovado pela Meta (categoria utilidade). Com as chaves
            na Vercel e o envio ligado, o Publike cadastra os que faltam e confere a aprovação a cada 30 minutos; o aviso
            espera até o modelo ser aprovado (no máximo um dia).
            {r.config.modelos_conferidos_em && ` Conferidos em ${formatarDataHora(r.config.modelos_conferidos_em)}.`}
          </>
        }
        acoes={s.token && s.conta ? <ConferirModelos /> : undefined}
      >
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-100">
          {MODELOS.map((m) => {
            const st = r.config.modelos?.[m.nome];
            const info = STATUS[st?.status ?? "FALTA"] ?? { nome: st?.status ?? "—", variante: "contorno" as const };
            return (
              <li key={m.nome} className="flex flex-col gap-1.5 p-4">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-label break-all text-ink">{m.nome}</span>
                  <Selo variante={info.variante}>{info.nome}</Selo>
                  {st?.categoria && st.categoria !== "UTILITY" && (
                    <Selo variante="perigo" title="A Meta mudou a categoria: a mensagem fica mais cara">
                      {st.categoria}
                    </Selo>
                  )}
                </p>
                <p className="text-body-sm text-ink-muted">
                  {m.para}: {m.quando}
                </p>
                <p className="text-body-sm text-ink">{m.corpo}</p>
                <p className="text-body-sm text-ink-muted">Botões: {m.botoes.map((b) => b.texto).join(" · ")}</p>
                {st?.motivo && <p className="text-body-sm text-danger">{st.motivo}</p>}
              </li>
            );
          })}
        </ul>
      </Secao>

      <Secao titulo="Últimos 7 dias" descricao={`${formatarNumero(r.pendentes)} na fila agora.`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Numero rotulo="Enviadas" valor={w.enviadas} detalhe={`de ${formatarNumero(w.entraram)} que entraram na fila`} />
          <Numero rotulo="Entregues" valor={w.entregues} detalhe={`${pct(w.entregues, w.enviadas)} das enviadas`} />
          <Numero rotulo="Lidas" valor={w.lidas} detalhe={`${pct(w.lidas, w.entregues)} das entregues`} />
          <Numero rotulo="Respostas nos botões" valor={w.respondidas} />
          <Numero rotulo="Falharam" valor={w.falharam} alerta={w.falharam > 0} />
          <Numero rotulo="Descartadas" valor={w.descartadas} detalhe="viu no Publike, limite, modo de teste" />
          <Numero
            rotulo="Aceites valendo"
            valor={r.aceites.pessoas + r.aceites.empresas}
            detalhe={`${formatarNumero(r.aceites.pessoas)} pessoas, ${formatarNumero(r.aceites.empresas)} de quem contrata`}
          />
          <Numero rotulo="Pararam pelo WhatsApp" valor={r.aceites.pararam_7_dias} alerta={r.aceites.pararam_7_dias > 0} />
        </div>
        <p className="text-body-sm text-ink-muted">
          Custo estimado nos últimos 30 dias: {formatarNumero(r.cobradas_30_dias)} mensagens cobradas, cerca de US${" "}
          {(r.cobradas_30_dias * TARIFA_WHATSAPP_USD).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
          (US$ 0,0068 cada, a tarifa de utilidade no Brasil). A conta oficial é a da Meta.
        </p>
        {r.por_tipo.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-label text-ink">Por aviso (30 dias)</h3>
            <ul className="flex flex-col gap-1 text-body-sm">
              {r.por_tipo.map((t) => (
                <li key={t.tipo} className="flex flex-wrap justify-between gap-2">
                  <span className="text-ink">{nomeDoTipo(t.tipo)}</span>
                  <span className="text-ink-muted tabular-nums">
                    {formatarNumero(t.enviadas)} enviadas, {pct(t.lidas, t.enviadas)} lidas
                    {t.respondidas > 0 && `, ${formatarNumero(t.respondidas)} respostas`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {r.respostas.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-label text-ink">As respostas dos botões (30 dias)</h3>
            <ul className="flex flex-col gap-1 text-body-sm">
              {r.respostas.map((x) => (
                <li key={`${x.tipo}-${x.resposta}`} className="flex flex-wrap justify-between gap-2">
                  <span className="text-ink">
                    {nomeDoTipo(x.tipo)}: {RESPOSTAS[x.resposta] ?? x.resposta}
                  </span>
                  <span className="text-ink-muted tabular-nums">{formatarNumero(x.quantas)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {r.motivos.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-label text-ink">Por que não saíram</h3>
            <ul className="flex flex-col gap-1 text-body-sm">
              {r.motivos.map((x, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2">
                  <span className={x.situacao === "falhou" ? "text-danger" : "text-ink"}>{x.motivo ?? "—"}</span>
                  <span className="text-ink-muted tabular-nums">{formatarNumero(x.quantas)}</span>
                </li>
              ))}
            </ul>
          </div>
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
    </>
  );
}
