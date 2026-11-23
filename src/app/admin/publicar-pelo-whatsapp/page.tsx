import { MessageCircle, ScanText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Barras, Ranking } from "@/components/admin/grafico";
import { Filtros, linkCom, Numero, Secao, Situacao } from "@/components/admin/ui";
import { ConfigVagasPeloWhatsapp } from "@/components/admin/vagas-pelo-whatsapp";
import { PublicarAquiWhatsapp } from "@/components/admin/publicar-aqui-whatsapp";
import { Aviso, Selo, Vazio, type VarianteSelo } from "@/components/ui/basicos";
import { formatarDataHora, plural, primeiro } from "@/lib/formato";
import { iaConfigurada } from "@/lib/ia/openai";
import { contatoDasVagasPeloWhatsapp } from "@/lib/servidor/numero-do-publike";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { TEXTO_PRONTO_DO_WHATSAPP } from "@/lib/vagas-pelo-whatsapp";

export const metadata: Metadata = { title: "Publicar pelo WhatsApp" };

// Admin › Publicar pelo WhatsApp (19/11/2026; migração 20270806120000; claude/plano-vagas-novas.md, item 3). Marcelo:
// "tem que ser bem completo e fácil.. e mostrar indicadores e permitir personalização do recurso". O caminho de cada
// vaga (a mensagem lida, o link aberto, a vaga publicada, a conta nova, o aceite dos avisos), o que chegou que não era
// vaga, e os ajustes: o recurso e cada parte dele, os limites e os textos das respostas, com a prévia. No computador do
// dono e, no site no ar, para a equipe publike.org.

const PERIODOS = [
  { valor: "7", nome: "7 dias" },
  { valor: "30", nome: "30 dias" },
  { valor: "90", nome: "90 dias" },
] as const;
type Periodo = (typeof PERIODOS)[number]["valor"];

type Resumo = {
  dias: number;
  config: {
    whatsapp_ligado: boolean;
    atendimento_ligado: boolean;
    ligado: boolean;
    fotos: boolean;
    pdf: boolean;
    texto: boolean;
    por_mensagem: number;
    leituras_dia: number;
    confirmar: boolean;
    oferecer_avisos: boolean;
    no_site: boolean;
    textos: Record<string, string>;
  };
  numeros: {
    leituras: number;
    com_vaga: number;
    servico: number;
    curriculo: number;
    golpe: number;
    outro: number;
    falhou: number;
    limite: number;
    fotos: number;
    pdfs: number;
    textos: number;
    numeros: number;
    segundos: number | null;
  };
  vagas: {
    lidas: number;
    abertas: number;
    publicadas: number;
    contas: number;
    contas_novas: number;
    confirmadas: number;
    minutos: number | null;
  };
  aceites: number;
  por_dia: { dia: string; leituras: number; vagas: number; publicadas: number }[];
  ultimas: {
    id: string;
    criado_em: string;
    empresa: string | null;
    titulo: string | null;
    ordem: number;
    aberta_em: string | null;
    publicada_em: string | null;
    anuncio_id: string | null;
    conta_id: string | null;
    conversa: string;
    numero: string;
  }[];
  sem_vaga: { criado_em: string; fonte: string; resultado: string; motivo: string | null; conversa: string }[];
};

const RESULTADO: Record<string, { nome: string; variante: VarianteSelo }> = {
  vaga: { nome: "Vaga", variante: "match" },
  servico: { nome: "Serviço", variante: "contorno" },
  curriculo: { nome: "Currículo", variante: "contorno" },
  golpe: { nome: "Parece golpe", variante: "perigo" },
  outro: { nome: "Não era vaga", variante: "contorno" },
  falhou: { nome: "Não deu para ler", variante: "perigo" },
  limite: { nome: "Limite do dia", variante: "aviso" },
  grande: { nome: "Grande demais", variante: "aviso" },
};
const FONTE: Record<string, string> = { foto: "Foto", pdf: "PDF", texto: "Texto" };

const pct = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : "—");
const conversaNoAdmin = (c: string) => `/admin/whatsapp?aba=conversas&c=${encodeURIComponent(c)}`;
const decimal = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export default function PublicarPeloWhatsapp({ searchParams }: PageProps<"/admin/publicar-pelo-whatsapp">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {searchParams.then((sp) => {
        const p = primeiro(sp.periodo);
        const periodo: Periodo = PERIODOS.some((x) => x.valor === p) ? (p as Periodo) : "30";
        return <Conteudo periodo={periodo} />;
      })}
    </Suspense>
  );
}

async function Conteudo({ periodo }: { periodo: Periodo }) {
  const admin = await ehAdminLocal();
  if (!admin && !(await possoVerTela("/admin/publicar-pelo-whatsapp"))) notFound();
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const [{ data, error }, contato, aqui] = await Promise.all([
    c.rpc("admin_whatsapp_vagas", { p_dias: Number(periodo) }),
    contatoDasVagasPeloWhatsapp(),
    // publicar aqui mesmo (migração 20270914120000; sem ela, null: o controle não aparece)
    c.rpc("admin_whatsapp_publicar_aqui").then(({ data: d, error: e }) => (e ? null : Boolean(d))),
  ]);
  if (error || !data) {
    return (
      <Aviso tipo="alerta" titulo="Rode a migração do Publicar pelo WhatsApp">
        Falta a migração 20270806120000_publicar_pelo_whatsapp.sql neste banco.
      </Aviso>
    );
  }
  const r = data as unknown as Resumo;
  const cfg = r.config;
  const n = r.numeros;
  const v = r.vagas;
  const ia = iaConfigurada();
  const roda = cfg.whatsapp_ligado && cfg.atendimento_ligado && cfg.ligado && ia;
  const le = [cfg.fotos && "fotos", cfg.pdf && "PDF", cfg.texto && "texto"].filter(Boolean) as string[];
  const nomePeriodo = PERIODOS.find((x) => x.valor === periodo)?.nome ?? `${r.dias} dias`;
  const diasDoGrafico = r.por_dia.map((d) => d.dia);
  const naoEraVaga = n.servico + n.curriculo + n.golpe + n.outro;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-h2">Publicar pelo WhatsApp</h1>
          <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
            A empresa manda para o número do Publike a foto do anúncio, o PDF ou o texto da vaga. A IA lê e a resposta
            traz o resumo com o botão “Conferir e publicar”, que abre o publicar já preenchido. Depois de publicar, o
            WhatsApp avisa que a vaga está no ar e oferece mandar os candidatos por lá.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Situacao ok={roda}>
            {!cfg.ligado
              ? "Desligado: a foto de vaga recebe a resposta de antes (publicar pelo site)"
              : roda
                ? `Ligado: lê ${le.length ? le.join(", ").replace(/, ([^,]*)$/, " e $1") : "nada (marque fotos, PDF ou texto)"}, até ${plural(cfg.por_mensagem, "vaga", "vagas")} por mensagem`
                : "Ligado, mas não roda: veja o que falta ao lado"}
          </Situacao>
          {!cfg.whatsapp_ligado && <Situacao ok={false}>O WhatsApp está desligado (Admin › WhatsApp)</Situacao>}
          {cfg.whatsapp_ligado && !cfg.atendimento_ligado && (
            <Situacao ok={false}>O atendimento está desligado (Admin › WhatsApp › Atendimento)</Situacao>
          )}
          {!ia && <Situacao ok={false}>Falta a chave da IA no servidor (Admin › IA)</Situacao>}
          <Situacao ok={Boolean(contato)}>
            {contato
              ? `No site: “Prefere pelo WhatsApp?” com o ${contato.exibicao}`
              : cfg.no_site
                ? "No site: ainda não aparece (sem o número da Meta neste servidor)"
                : "No site: desligado"}
          </Situacao>
        </div>
      </header>

      {contato && roda && (
        <Aviso tipo="info" titulo="Para ver funcionando">
          <p>
            Mande a foto de uma vaga (um cartaz, um post, um print) para o{" "}
            <a
              href={`https://wa.me/${contato.numero}?text=${encodeURIComponent(TEXTO_PRONTO_DO_WHATSAPP)}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {contato.exibicao}
            </a>
            . A resposta chega em uns 15 segundos, e a leitura aparece aqui embaixo.
          </p>
        </Aviso>
      )}

      <Filtros
        rotulo="Período"
        opcoes={PERIODOS.map((x) => ({ valor: x.valor, nome: x.nome }))}
        atual={periodo}
        link={(valor) => linkCom("/admin/publicar-pelo-whatsapp", {}, { periodo: valor === "30" ? null : valor })}
      />

      <Secao
        titulo="O caminho da vaga"
        descricao={`Nos últimos ${nomePeriodo}: da mensagem lida à vaga no ar. Cada anúncio pode trazer mais de uma vaga.`}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Numero
            rotulo="Mensagens lidas"
            valor={n.leituras}
            detalhe={plural(n.numeros, "número", "números")}
          />
          <Numero rotulo="Vagas preparadas" valor={v.lidas} detalhe={`em ${plural(n.com_vaga, "anúncio", "anúncios")}`} />
          <Numero rotulo="Abriram o link" valor={v.abertas} detalhe={`${pct(v.abertas, v.lidas)} das vagas`} />
          <Numero rotulo="Publicadas" valor={v.publicadas} detalhe={`${pct(v.publicadas, v.lidas)} das vagas`} />
          <Numero
            rotulo="Contas novas"
            valor={v.contas_novas}
            detalhe={`de ${plural(v.contas, "conta que publicou", "contas que publicaram")}`}
          />
          <Numero rotulo="Aceitaram os avisos" valor={r.aceites} detalhe="pelo botão do WhatsApp" />
        </div>
        <p className="text-body-sm text-ink-muted">
          {n.segundos != null
            ? `Cada leitura leva em geral ${n.segundos < 1 ? "menos de 1 s" : `${decimal(n.segundos)} s`}`
            : "Nenhuma leitura ainda"}
          {v.minutos != null
            ? ` · da mensagem à vaga no ar, em geral ${v.minutos < 1 ? "menos de 1 minuto" : plural(v.minutos, "minuto", "minutos")}`
            : ""}
          {v.confirmadas > 0 ? ` · ${plural(v.confirmadas, "aviso", "avisos")} de “está no ar” pelo WhatsApp` : ""}
          {n.limite > 0 ? ` · ${plural(n.limite, "vez", "vezes")} no limite do dia ou grande demais` : ""}
        </p>
      </Secao>

      {r.por_dia.length > 0 && (
        <Secao titulo="Por dia" descricao="No horário de Brasília.">
          <div className="grid gap-6 md:grid-cols-3">
            <Barras
              titulo="Mensagens lidas"
              valores={r.por_dia.map((d) => d.leituras)}
              dias={diasDoGrafico}
              periodo={plural(r.por_dia.length, "dia", "dias")}
            />
            <Barras
              titulo="Vagas preparadas"
              valores={r.por_dia.map((d) => d.vagas)}
              dias={diasDoGrafico}
              periodo={plural(r.por_dia.length, "dia", "dias")}
            />
            <Barras
              titulo="Publicadas"
              valores={r.por_dia.map((d) => d.publicadas)}
              dias={diasDoGrafico}
              periodo={plural(r.por_dia.length, "dia", "dias")}
            />
          </div>
        </Secao>
      )}

      <Secao
        titulo="O que chegou"
        descricao={
          naoEraVaga > 0
            ? `${plural(naoEraVaga, "mensagem não era vaga", "mensagens não eram vaga")}: cada uma recebeu a resposta do seu caso (o currículo, a vitrine de serviço, o aviso de golpe).`
            : "O que a IA achou em cada mensagem, e de onde veio."
        }
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-label">O que era</p>
            {n.leituras + n.limite === 0 ? (
              <p className="text-body-sm text-ink-muted">Nada ainda.</p>
            ) : (
              <Ranking
                itens={[
                  { nome: "Vaga", n: n.com_vaga },
                  { nome: "Serviço", n: n.servico },
                  { nome: "Currículo", n: n.curriculo },
                  { nome: "Parece golpe", n: n.golpe },
                  { nome: "Outra coisa", n: n.outro },
                  { nome: "Não deu para ler", n: n.falhou },
                  { nome: "Limite ou grande demais", n: n.limite },
                ].filter((x) => x.n > 0)}
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-label">De onde veio</p>
            {n.leituras === 0 ? (
              <p className="text-body-sm text-ink-muted">Nada ainda.</p>
            ) : (
              <Ranking
                itens={[
                  { nome: "Foto", n: n.fotos },
                  { nome: "PDF", n: n.pdfs },
                  { nome: "Texto", n: n.textos },
                ].filter((x) => x.n > 0)}
              />
            )}
          </div>
        </div>
      </Secao>

      <Secao titulo="As últimas vagas" descricao="As 30 mais novas, de qualquer data. O número aparece só em parte.">
        {r.ultimas.length === 0 ? (
          <Vazio icone={ScanText} titulo="Nenhuma vaga ainda">
            Quando uma empresa mandar a vaga pelo WhatsApp, ela aparece aqui com o caminho até o ar.
          </Vazio>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {r.ultimas.map((u) => {
              const st: { nome: string; variante: VarianteSelo } = u.publicada_em
                ? { nome: "Publicada", variante: "match" }
                : u.aberta_em
                  ? { nome: "Abriu o link", variante: "matchContorno" }
                  : { nome: "Preparada", variante: "contorno" };
              return (
                <li key={u.id} className="grid gap-x-4 gap-y-1.5 py-2.5 text-body-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-label text-ink">{u.titulo || "Vaga sem título"}</span>
                    <span className="text-ink-muted">
                      {[u.empresa, u.numero, u.ordem > 1 ? `${u.ordem}ª do anúncio` : null].filter(Boolean).join(" · ")}
                    </span>
                    <span className="flex flex-wrap gap-x-3">
                      <Link href={conversaNoAdmin(u.conversa)} className="underline underline-offset-2">
                        Ver a conversa
                      </Link>
                      {u.anuncio_id && (
                        <Link href={`/anuncio/${u.anuncio_id}`} className="underline underline-offset-2">
                          Ver a vaga
                        </Link>
                      )}
                      {admin && u.conta_id && (
                        <Link href={`/admin/usuarios/${u.conta_id}`} className="underline underline-offset-2">
                          Ver a conta
                        </Link>
                      )}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-col sm:items-end sm:text-right">
                    <Selo variante={st.variante}>{st.nome}</Selo>
                    <span className="text-ink-muted tabular-nums">{formatarDataHora(u.criado_em)}</span>
                    {u.aberta_em && !u.publicada_em && (
                      <span className="text-ink-muted tabular-nums">abriu o link em {formatarDataHora(u.aberta_em)}</span>
                    )}
                    {u.publicada_em && (
                      <span className="text-ink-muted tabular-nums">no ar em {formatarDataHora(u.publicada_em)}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>

      {r.sem_vaga.length > 0 && (
        <Secao
          titulo="Quando não era vaga"
          descricao="As 15 mais novas: o que a IA achou e por quê. Se alguma era vaga de verdade, ajuste o texto da resposta ou fale com a empresa pela conversa."
        >
          <ul className="flex flex-col divide-y divide-line">
            {r.sem_vaga.map((s, i) => {
              const st = RESULTADO[s.resultado] ?? { nome: s.resultado, variante: "contorno" as const };
              return (
                <li
                  key={`${s.criado_em}-${i}`}
                  className="grid gap-x-4 gap-y-1.5 py-2.5 text-body-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <span className="flex min-w-0 max-w-xl flex-col gap-0.5">
                    <span className="text-ink">{s.motivo || "Sem motivo"}</span>
                    <span className="text-ink-muted">
                      {FONTE[s.fonte] ?? s.fonte} ·{" "}
                      <Link href={conversaNoAdmin(s.conversa)} className="underline underline-offset-2">
                        Ver a conversa
                      </Link>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-col sm:items-end sm:text-right">
                    <Selo variante={st.variante}>{st.nome}</Selo>
                    <span className="text-ink-muted tabular-nums">{formatarDataHora(s.criado_em)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Secao>
      )}

      <Secao
        titulo="Os ajustes"
        descricao="O recurso nasce ligado. Cada mudança vale para a próxima mensagem que chegar."
        acoes={
          <Link href="/admin/whatsapp?aba=conversas" className="inline-flex items-center gap-1.5 text-body-sm underline underline-offset-2">
            <MessageCircle aria-hidden className="size-4" />
            As conversas
          </Link>
        }
      >
        <ConfigVagasPeloWhatsapp
          inicial={{
            ligado: cfg.ligado,
            fotos: cfg.fotos,
            pdf: cfg.pdf,
            texto: cfg.texto,
            por_mensagem: cfg.por_mensagem,
            leituras_dia: cfg.leituras_dia,
            confirmar: cfg.confirmar,
            oferecer_avisos: cfg.oferecer_avisos,
            no_site: cfg.no_site,
            textos: cfg.textos ?? {},
          }}
        />
        {aqui !== null && <PublicarAquiWhatsapp ligado={aqui} />}
      </Secao>
    </div>
  );
}
