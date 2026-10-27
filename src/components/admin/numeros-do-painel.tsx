import { Flag, Heart, Mail, Megaphone, MessageCircleHeart, ShieldAlert, UserRound, UserX } from "lucide-react";
import { AcessosDoSite } from "./acessos";
import { GraficoDias, Ranking } from "./grafico";
import { Numero, Secao } from "./ui";
import type { AcessosSite, NumerosPainel } from "@/lib/admin/dados";
import { categoria } from "@/lib/constantes";
import { MOTIVOS_ENCERRAMENTO, type MotivoEncerramento } from "@/lib/encerramento";
import { formatarNumero, plural } from "@/lib/formato";

export type NumerosDeHoje = { contas: number; anuncios: number; curtidas: number; matches: number };
export type Encerramento = { tipo: string; motivo: string; total: number };

/** Os números de hoje (desde a meia-noite em Goiânia), tirados do resumo, com os matches à parte. */
export function deHoje(n: NumerosPainel, matches: number, agora: number): NumerosDeHoje {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(agora));
  const d = n.por_dia.find((x) => x.dia === dia) ?? { contas: 0, anuncios: 0, curtidas: 0 };
  return { contas: d.contas, anuncios: d.anuncios, curtidas: d.curtidas, matches };
}

/**
 * A parte de cima do Painel, só leitura: os cartões e quem abriu o site. No admin (`links`) os cartões levam
 * às listas; no site (/equipe) não levam a nada.
 */
export function NumerosDoPainel({
  n,
  hoje,
  acessos,
  links,
}: {
  n: NumerosPainel;
  hoje: NumerosDeHoje;
  acessos: AcessosSite | null;
  links: boolean;
}) {
  const ir = (href: string) => (links ? href : undefined);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero
          rotulo="Contas"
          icone={UserRound}
          valor={n.contas}
          hoje={hoje.contas}
          detalhe={`+${formatarNumero(n.contas_7d)} em 7 dias`}
          href={ir("/admin/usuarios")}
        />
        <Numero
          rotulo="Anúncios no ar"
          icone={Megaphone}
          valor={n.anuncios.no_ar}
          hoje={hoje.anuncios}
          textoHoje="publicados hoje"
          detalhe={`${plural(n.anuncios.vagas_no_ar, "vaga", "vagas")} · ${plural(n.anuncios.servicos_no_ar, "serviço", "serviços")}`}
          href={ir("/admin/anuncios?status=ativo")}
        />
        <Numero
          rotulo="Curtidas em 7 dias"
          icone={Heart}
          valor={n.curtidas.novas_7d}
          hoje={hoje.curtidas}
          detalhe={`${formatarNumero(n.curtidas.total)} no total`}
        />
        <Numero
          rotulo="Matches em 7 dias"
          icone={MessageCircleHeart}
          valor={n.curtidas.matches_7d}
          hoje={hoje.matches}
          detalhe={`${formatarNumero(n.curtidas.matches)} no total`}
          href={ir("/admin/matches")}
        />
        <Numero
          rotulo="Denúncias abertas"
          icone={Flag}
          valor={n.denuncias_abertas}
          detalhe={`${plural(n.denuncias_7d, "chegou", "chegaram")} em 7 dias`}
          href={ir("/admin/denuncias")}
          alerta={n.denuncias_abertas > 0}
        />
        <Numero
          rotulo="Em análise"
          icone={ShieldAlert}
          valor={n.anuncios.em_analise}
          detalhe={`IA reteve ${formatarNumero(n.ia.retidos_7d)} em 7 dias`}
          href={ir("/admin/anuncios?status=em_analise")}
          alerta={n.anuncios.em_analise > 0}
        />
        <Numero
          rotulo="Contas suspensas"
          icone={UserX}
          valor={n.suspensos + n.banidos}
          detalhe={`${plural(n.banidos, "banida", "banidas")} de vez`}
          href={ir("/admin/usuarios?filtro=suspensos")}
        />
        <Numero
          rotulo="E-mails em 7 dias"
          icone={Mail}
          valor={n.emails.enviados_7d}
          detalhe={
            n.emails.falhas_7d
              ? `${formatarNumero(n.emails.falhas_7d)} com falha`
              : `${formatarNumero(n.emails.na_fila)} na fila`
          }
          href={ir("/admin/emails")}
          alerta={n.emails.falhas_7d > 0}
        />
      </div>

      <Secao
        titulo="Quem abriu o site"
        descricao="Pessoas diferentes por dia. Hoje se compara com ontem até a mesma hora."
      >
        <AcessosDoSite acessos={acessos} />
      </Secao>
    </>
  );
}

/** A parte de baixo do Painel: os 30 dias, categorias e bairros, por que encerraram e as contas. */
export function NumerosDoPainelEmbaixo({
  n,
  encerramentos,
}: {
  n: NumerosPainel;
  encerramentos: Encerramento[] | null;
}) {
  return (
    <>
      <Secao titulo="Últimos 30 dias">
        <GraficoDias dias={n.por_dia} />
      </Secao>

      <div className="grid gap-6 lg:grid-cols-2">
        <Secao titulo="Categorias com mais anúncios no ar">
          <Ranking itens={n.categorias.map((c) => ({ nome: categoria(c.nome).nome, n: c.n }))} />
        </Secao>
        <Secao titulo="Bairros com mais anúncios no ar">
          <Ranking itens={n.bairros} />
        </Secao>
      </div>

      {encerramentos && (
        <Secao
          titulo="Por que encerraram"
          descricao="Últimos 30 dias, pela pergunta (opcional) do Encerrar. Vagas e serviços juntos."
        >
          {encerramentos.length ? (
            <Ranking
              itens={encerramentos.map((e) => ({
                nome: `${MOTIVOS_ENCERRAMENTO[e.motivo as MotivoEncerramento] ?? e.motivo}${e.tipo === "servico" ? " (serviço)" : ""}`,
                n: e.total,
              }))}
            />
          ) : (
            <p className="text-body-sm text-ink-muted">Ninguém respondeu ainda.</p>
          )}
        </Secao>
      )}

      <Secao titulo="Contas">
        <dl className="grid grid-cols-2 gap-3 text-body-sm sm:grid-cols-4 lg:grid-cols-7">
          {[
            ["Pessoas", n.perfis.pessoa],
            ["Comércios", n.perfis.comercio],
            ["Empresas", n.perfis.empresa],
            ["Agências", n.perfis.agencia ?? 0],
            ["Verificadas", n.perfis.verificados],
            ["Sem perfil", n.sem_perfil],
            ["Entraram em 7 dias", n.acessos_7d],
          ].map(([rotulo, valor]) => (
            <div key={rotulo} className="flex flex-col">
              <dt className="text-ink-muted">{rotulo}</dt>
              <dd className="font-display text-h3">{formatarNumero(Number(valor))}</dd>
            </div>
          ))}
        </dl>
      </Secao>
    </>
  );
}
