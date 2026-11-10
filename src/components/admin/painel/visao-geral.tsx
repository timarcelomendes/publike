import { CartaoIndicador, variacaoDeContagem, variacaoDePontos } from "./cartao-indicador";
import { Aviso } from "@/components/ui/basicos";
import type { AcessosSite, MetricasProduto } from "@/lib/admin/dados";
import { FormMeta, FormNumerosDaSemana } from "./form-meta";
import { METAS, progressoDaMeta, valorDoIndicador, type ChaveDaMeta, type Metas } from "@/lib/admin/indicadores";
import { oQueMudou } from "@/lib/admin/o-que-mudou";
import type { Historico, Indicadores, NumerosDoPeriodo, Receita } from "@/lib/admin/painel";
import { formatarMoeda, formatarNumero, plural } from "@/lib/formato";

// A Visão geral do Painel (claude/plano-indicadores-do-admin.md): 6 cartões com a variação contra a semana anterior,
// a meta e as 8 semanas. Nesta versão, os números vêm de admin_metricas_produto e admin_metricas_crescimento; o
// período, os encontros e o caminho chegam com admin_indicadores (parte 2).

const porcento = (n: number, de: number) => (de > 0 ? Math.round((100 * n) / de) : null);

export function VisaoGeral({
  indicadores,
  historico,
  metas,
  numerosSemana,
  m,
  acessos,
  receita,
  admin,
}: {
  indicadores?: Indicadores | null;
  /** as 12 semanas guardadas (sem a equipe); com a equipe, os minigráficos não aparecem */
  historico?: Historico | null;
  metas?: Metas | null;
  /** o e-mail de segunda: ligado, desligado, ou null sem a migração (no admin) */
  numerosSemana?: boolean | null;
  m: MetricasProduto | null | undefined;
  acessos: AcessosSite | null | undefined;
  receita: Receita | null | undefined;
  admin: boolean;
}) {
  if (indicadores) {
    return (
      <VisaoDoPeriodo
        i={indicadores}
        h={indicadores.com_equipe ? null : (historico ?? null)}
        receita={receita}
        admin={admin}
        metas={metas ?? null}
        numerosSemana={numerosSemana}
      />
    );
  }
  if (!m) {
    return (
      <Aviso tipo="info" titulo="Os números da Visão geral ainda não abrem">
        Falta a migração das métricas de produto (20261207120000) neste banco.
      </Aviso>
    );
  }
  const s = m.semanas;
  const agora = s.at(-1);
  const antes = s.at(-2);
  const serie = (f: (x: MetricasProduto["semanas"][number]) => number) => s.map(f);
  const cr = m.crescimento;
  const tres = cr ? porcento(cr.com_3_48h, cr.vagas_48h) : null;
  const deNovo = cr ? porcento(cr.publicaram_de_novo, cr.contas_base) : null;
  const ir = (href: string) => (admin ? href : undefined);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <CartaoIndicador
        estrela
        rotulo="Matches na semana"
        valor={formatarNumero(agora?.matches ?? 0)}
        variacao={variacaoDeContagem(agora?.matches ?? 0, antes?.matches ?? 0)}
        apoio="Quem procura e quem contrata se acharam"
        serie={serie((x) => x.matches)}
        ajuda="As curtidas que viraram match nos últimos 7 dias, contra os 7 antes. Ainda conta o aceite automático da vaga com contato direto."
        href={ir("/admin/matches")}
      />
      <CartaoIndicador
        rotulo="Vagas novas na semana"
        valor={formatarNumero(agora?.vagas ?? 0)}
        variacao={variacaoDeContagem(agora?.vagas ?? 0, antes?.vagas ?? 0)}
        serie={serie((x) => x.vagas)}
        ajuda="As vagas publicadas nos últimos 7 dias, contra os 7 antes. Um dos 3 números de toda segunda."
        href={ir("/admin/anuncios?status=ativo")}
      />
      <CartaoIndicador
        rotulo="Vagas com 3+ candidatos em 48 h"
        valor={tres == null ? "—" : `${tres}%`}
        apoio={
          cr
            ? `${formatarNumero(cr.com_3_48h)} de ${plural(cr.vagas_48h, "vaga", "vagas")} publicadas de 3 a 32 dias atrás`
            : "Falta a migração do crescimento (20270130120000)"
        }
        ajuda="Das vagas publicadas de 3 a 32 dias atrás, a parte que recebeu 3 ou mais candidaturas nas primeiras 48 horas. A meta do plano de crescimento: toda vaga nova com 3 candidatos em 48 horas."
        href={ir("/admin/vagas-paradas")}
      />
      <CartaoIndicador
        rotulo="Empresas que publicaram de novo"
        valor={deNovo == null ? "—" : `${deNovo}%`}
        apoio={
          !cr
            ? "Falta a migração do crescimento (20270130120000)"
            : cr.contas_base === 0
              ? "Ainda sem base: conta as empresas que publicaram há 60 dias ou mais"
              : `${formatarNumero(cr.publicaram_de_novo)} de ${plural(cr.contas_base, "empresa", "empresas")}`
        }
        ajuda="Das empresas que publicaram de 60 a 150 dias atrás, a parte que publicou outra vaga em até 60 dias."
        href={ir("/admin/empresas")}
      />
      <CartaoIndicador
        rotulo="Pessoas ativas na semana"
        valor={formatarNumero(m.ativos.wau)}
        variacao={variacaoDeContagem(agora?.ativos ?? 0, antes?.ativos ?? 0)}
        apoio={`No mês: ${formatarNumero(m.ativos.mau_pessoas)} procuram · ${formatarNumero(m.ativos.mau_empresas)} contratam`}
        serie={serie((x) => x.ativos)}
        ajuda="As contas que entraram no site ou fizeram alguma coisa nos últimos 7 dias (curtir, publicar, responder, mandar mensagem, salvar o currículo)."
      />
      {admin ? (
        <CartaoIndicador
          rotulo="Receita por mês"
          valor={receita ? formatarMoeda(receita.porMes) : "—"}
          apoio={
            receita
              ? `${plural(receita.ativas, "assinatura ativa", "assinaturas ativas")}${
                  receita.atrasadas ? ` · ${receita.atrasadas} em atraso` : " · nenhuma em atraso"
                }`
              : "Falta a migração dos pagamentos"
          }
          ajuda="A soma das assinaturas ativas, com o trimestral dividido por 3 e sem as do sandbox. A mesma conta de Admin › Pagamentos."
          href="/admin/pagamentos"
        />
      ) : (
        <CartaoIndicador
          rotulo="Visitantes por dia"
          valor={acessos ? formatarNumero(acessos.media_7d) : "—"}
          apoio={acessos ? `${formatarNumero(acessos.hoje)} hoje` : undefined}
          ajuda="Pessoas diferentes que abriram o site por dia, na média dos 7 dias inteiros antes de hoje."
        />
      )}
    </div>
  );
}

const ehMatch = (p: NumerosDoPeriodo) => p.matches_gente + p.matches_auto;

/** A Visão geral com admin_indicadores (migração 20270331120000): o período escolhido contra o anterior. */
function VisaoDoPeriodo({
  i,
  h,
  receita,
  admin,
  metas,
  numerosSemana,
}: {
  i: Indicadores;
  h: Historico | null;
  receita: Receita | null | undefined;
  admin: boolean;
  metas: Metas | null;
  numerosSemana?: boolean | null;
}) {
  // a meta de cada cartão: a barra, o texto e, no admin, o "Definir meta"
  const comMeta = (chave: ChaveDaMeta) => {
    const def = METAS.find((x) => x.chave === chave)!;
    const alvo = metas?.[chave];
    const valor = valorDoIndicador(chave, i.atual);
    const p = alvo ? progressoDaMeta(chave, valor, alvo, i.dias) : null;
    return {
      meta: p
        ? def.porcento
          ? { alvo: p.alvo, agora: valor ?? 0, texto: p.texto }
          : { alvo: 100, agora: Math.min(100, p.agora), texto: p.texto }
        : undefined,
      rodape:
        admin && numerosSemana !== null ? (
          <FormMeta indicador={chave} atual={alvo} porcento={def.porcento} />
        ) : undefined,
    };
  };
  // as semanas guardadas viram os minigráficos (a semana sem nenhum dia guardado é lacuna)
  const serie = (f: (s: Historico["semanas"][number]) => number | null | undefined) =>
    h && h.semanas.some((s) => s.dias_guardados > 0)
      ? h.semanas.map((s) => (s.dias_guardados ? (f(s) ?? null) : null))
      : undefined;
  const parteDe = (n?: number, de?: number) => (de ? Math.round((100 * (n ?? 0)) / de) : null);
  const a = i.atual;
  const b = i.antes;
  const ir = (href: string) => (admin ? href : undefined);
  const tresA = porcento(a.vagas_48h_3, a.vagas_48h);
  const tresB = porcento(b.vagas_48h_3, b.vagas_48h);
  const novoA = porcento(a.de_novo, a.de_novo_base);
  const novoB = porcento(b.de_novo, b.de_novo_base);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <CartaoIndicador
          estrela
          serie={serie((s) => s.encontros)}
          {...comMeta("encontros")}
          rotulo="Encontros"
          valor={formatarNumero(a.encontros)}
          variacao={variacaoDeContagem(a.encontros, b.encontros)}
          apoio={`De ${plural(ehMatch(a), "match", "matches")} (${plural(a.matches_auto, "automático", "automáticos")})`}
          ajuda="Matches em que houve contato de verdade: um toque em WhatsApp, telefone ou e-mail, de qualquer lado, ou mensagens de gente dos dois lados no chat (as automáticas não contam). Conta no dia do primeiro contato."
          href={ir("/admin/curtidas")}
        />
        <CartaoIndicador
          serie={serie((s) => s.vagas_novas)}
          {...comMeta("vagas_novas")}
          rotulo="Vagas novas"
          valor={formatarNumero(a.vagas_novas)}
          variacao={variacaoDeContagem(a.vagas_novas, b.vagas_novas)}
          apoio={
            a.vagas_equipe
              ? `${plural(a.vagas_equipe, "publicada", "publicadas")} pela equipe (conta que nunca entrou)`
              : "Nenhuma publicada pela equipe"
          }
          ajuda="As vagas publicadas no período (sem as removidas). As da equipe são as de contas que nunca entraram: a equipe publicou em nome da empresa."
          href={ir("/admin/anuncios")}
        />
        <CartaoIndicador
          serie={serie((s) => parteDe(s.vagas_48h_3, s.vagas_48h))}
          {...comMeta("vagas_3_48h")}
          rotulo="Vagas com 3+ candidatos em 48 h"
          valor={tresA == null ? "—" : `${tresA}%`}
          variacao={variacaoDePontos(tresA, tresB, Math.min(a.vagas_48h, b.vagas_48h))}
          apoio={`${formatarNumero(a.vagas_48h_3)} de ${plural(a.vagas_48h, "vaga", "vagas")} que já tiveram as 48 h`}
          ajuda="Das vagas publicadas no período que já passaram das 48 horas, a parte com 3 ou mais candidaturas nas primeiras 48 horas."
          href={ir("/admin/vagas-paradas")}
        />
        <CartaoIndicador
          serie={serie((s) => parteDe(s.de_novo, s.de_novo_base))}
          {...comMeta("de_novo")}
          rotulo="Empresas que publicaram de novo"
          valor={novoA == null ? "—" : `${novoA}%`}
          variacao={variacaoDePontos(novoA, novoB, Math.min(a.de_novo_base, b.de_novo_base))}
          apoio={
            a.de_novo_base
              ? `${formatarNumero(a.de_novo)} de ${plural(a.de_novo_base, "empresa", "empresas")}, em até 30 dias`
              : "Ainda sem base: entram as empresas cuja primeira vaga completou 30 dias no período"
          }
          ajuda="Das empresas cuja primeira vaga completou 30 dias no período, a parte que publicou outra vaga nesses 30 dias."
          href={ir("/admin/empresas")}
        />
        <CartaoIndicador
          serie={serie((s) => s.ativos)}
          {...comMeta("ativos")}
          rotulo="Pessoas ativas"
          valor={formatarNumero(a.ativos ?? 0)}
          variacao={variacaoDeContagem(a.ativos ?? 0, b.ativos ?? 0)}
          apoio={`${formatarNumero(a.procuram ?? 0)} procuram · ${formatarNumero(a.contratam ?? 0)} contratam`}
          ajuda="As contas diferentes que entraram no site ou fizeram alguma coisa no período (curtir, publicar, responder, mandar mensagem, salvar o currículo)."
        />
        {admin ? (
          <CartaoIndicador
            rotulo="Receita por mês"
            valor={receita ? formatarMoeda(receita.porMes) : "—"}
            apoio={
              receita
                ? `${plural(receita.ativas, "assinatura ativa", "assinaturas ativas")}${
                    receita.atrasadas ? ` · ${receita.atrasadas} em atraso` : " · nenhuma em atraso"
                  }`
                : "Falta a migração dos pagamentos"
            }
            ajuda="A soma das assinaturas ativas agora, com o trimestral dividido por 3 e sem as do sandbox. A mesma conta de Admin › Pagamentos."
            href="/admin?aba=dinheiro"
          />
        ) : (
          <CartaoIndicador
            serie={serie((s) => s.visitantes)}
            rotulo="Visitantes"
            valor={formatarNumero(a.visitantes)}
            variacao={variacaoDeContagem(a.visitantes, b.visitantes)}
            apoio="Pessoas diferentes por dia, somadas"
            ajuda="Quem abriu o site em cada dia do período (a mesma pessoa em 2 dias conta 2 vezes)."
          />
        )}
      </div>
      <Caminho p={a} />
      <OQueMudou i={i} />
      <p className="text-body-sm text-ink-muted">
        Hoje até agora: {plural(i.hoje.contas_novas, "conta nova", "contas novas")} ·{" "}
        {plural(i.hoje.candidaturas, "candidatura", "candidaturas")} · {plural(ehMatch(i.hoje), "match", "matches")} ·{" "}
        {plural(i.hoje.encontros, "encontro", "encontros")}
      </p>
      {admin && numerosSemana != null && (
        <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4">
          <h2 className="text-h3">Os números de segunda por e-mail</h2>
          <p className="text-body-sm text-ink-muted">
            {numerosSemana ? "Ligado. " : "Desligado. "}
            Toda segunda, às 8h, quem recebe os avisos da equipe ganha estes números da semana que passou, com as metas
            e o que mais mudou, e o link para Equipe › Números. O texto fica em Admin › E-mails (Os números da semana).
          </p>
          <FormNumerosDaSemana ligado={numerosSemana} />
        </section>
      )}
    </div>
  );
}

/** O caminho do período: de quem abriu o site até a contratação. */
function Caminho({ p }: { p: NumerosDoPeriodo }) {
  const parte = (n: number, de: number, casas = 0) =>
    de > 0 ? `${((100 * n) / de).toFixed(casas).replace(".", ",")}%` : null;
  const etapas: { nome: string; n: number; nota?: string | null; destaque?: boolean }[] = [
    { nome: "visitantes", n: p.visitantes },
    { nome: "contas novas", n: p.contas_novas, nota: parte(p.contas_novas, p.visitantes, 1) },
    { nome: "ativadas", n: p.ativadas, nota: parte(p.ativadas, p.contas_novas) },
    { nome: "candidaturas", n: p.candidaturas },
    {
      nome: "respondidas",
      n: p.respondidas_gente + p.respondidas_auto,
      nota: parte(p.respondidas_gente + p.respondidas_auto, p.candidaturas),
    },
    { nome: `matches · ${plural(p.matches_auto, "automático", "automáticos")}`, n: ehMatch(p) },
    { nome: "encontros", n: p.encontros, nota: parte(p.encontros, ehMatch(p)), destaque: true },
    { nome: "contratações", n: p.contratacoes },
  ];
  return (
    <section
      aria-labelledby="caminho-titulo"
      className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4"
    >
      <h2 id="caminho-titulo" className="text-h3">
        O caminho do período
      </h2>
      <p className="text-body-sm text-ink-muted">
        De quem abriu o site até a contratação. A porcentagem é a parte da etapa anterior, no mesmo período (não é a
        mesma turma: o funil por turma fica na aba Cadastro).
      </p>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {etapas.map((e) => (
          <li
            key={e.nome}
            className={`flex flex-col rounded-md p-3 ${e.destaque ? "bg-ink text-surface-100" : "bg-surface-100"}`}
          >
            <span className="font-display text-h2 tabular-nums">{formatarNumero(e.n)}</span>
            <span className={`text-body-sm ${e.destaque ? "text-surface-300" : "text-ink-muted"}`}>
              {e.nome}
              {e.nota ? ` · ${e.nota}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** As maiores mudanças do período contra o anterior (as mesmas regras do e-mail de segunda). */
function OQueMudou({ i }: { i: Indicadores }) {
  const linhas = oQueMudou(i.atual, i.antes);
  return (
    <section
      aria-labelledby="mudou-titulo"
      className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4"
    >
      <h2 id="mudou-titulo" className="text-h3">
        O que mudou
      </h2>
      {linhas.length ? (
        <ul className="flex flex-col divide-y divide-line">
          {linhas.map((l) => (
            <li key={l.chave} className="flex gap-3 py-2 text-body-sm">
              <span
                aria-hidden
                className={`font-semibold ${l.sentido === "sobe" ? "text-cerrado-text" : "text-terra-text"}`}
              >
                {l.sentido === "sobe" ? "▲" : "▼"}
              </span>
              <span>{l.texto}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-sm text-ink-muted">
          Nada mudou muito em relação ao período anterior, ou os números ainda são pequenos para comparar (entram só os
          com 10 ou mais nos dois períodos).
        </p>
      )}
    </section>
  );
}
