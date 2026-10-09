import { Flag, Heart, Mail, Megaphone, MessageCircleHeart, ShieldAlert, UserRound, UserX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { GraficoDias, Ranking } from "@/components/admin/grafico";
import { BotaoResumoIA } from "@/components/admin/resumo-ia";
import { Numero, Secao, Situacao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import { categoria } from "@/lib/constantes";
import { configDoSite, listarChavesServidor, numerosDoPainel, registroDaEquipe, ultimoResumo } from "@/lib/admin/dados";
import { descreverAcao } from "@/lib/admin/textos";
import { ehModerador } from "@/lib/dados";
import { formatarNumero, plural, tempoRelativo } from "@/lib/formato";
import { situacaoFilas } from "@/lib/servidor/filas";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Painel" };

export default function PainelAdmin() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (!(await ehAdminLocal())) {
    if (await ehModerador()) redirect("/admin/denuncias");
    notFound();
  }
  const c = criarClienteAdmin();
  const [n, config, resumo, registro, chaves, agora] = await Promise.all([
    numerosDoPainel(c),
    configDoSite(c),
    ultimoResumo(c),
    registroDaEquipe(c, 10),
    listarChavesServidor(c),
    agoraDaRequisicao(),
  ]);
  const filas = situacaoFilas();
  const temChave = chaves.length > 0;
  const faltando =
    !temChave || !filas.smtp || !filas.enderecoEmails || (config.ia_moderacao && !filas.ia) || config.avisos_para.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {faltando && (
        <Secao titulo="Falta configurar" descricao="O site funciona sem isso, mas os e-mails e a IA só rodam com tudo pronto.">
          <div className="flex flex-col gap-2">
            <Situacao ok={Boolean(filas.smtp)}>
              E-mail no servidor (SMTP_SERVIDOR, SMTP_USUARIO, SMTP_SENHA e SMTP_REMETENTE).{" "}
              <Link href="/admin/emails" className="underline">Ver e-mails</Link>
            </Situacao>
            <Situacao ok={Boolean(filas.enderecoEmails)}>
              Endereço do site no ar para os links dos e-mails (PUBLIKE_URL_PUBLICA no seu computador).{" "}
              <Link href="/admin/emails" className="underline">Ver e-mails</Link>
            </Situacao>
            <Situacao ok={temChave}>
              Chave do servidor, para o site publicado mandar e-mails e rodar a IA.{" "}
              <Link href="/admin/chaves" className="underline">Ver chaves</Link>
            </Situacao>
            <Situacao ok={config.avisos_para.length > 0}>
              Quem recebe os avisos da equipe (denúncia, cadastro, anúncio tirado do ar).{" "}
              <Link href="/admin/emails#configuracoes" className="underline">Escolher</Link>
            </Situacao>
            {config.ia_moderacao && (
              <Situacao ok={filas.ia}>
                Chave da IA no servidor (OPENAI_API_KEY). <Link href="/admin/ia" className="underline">Ver IA</Link>
              </Situacao>
            )}
          </div>
        </Secao>
      )}

      {n.perfis.agencias_a_verificar > 0 && (
        <Aviso
          tipo="info"
          titulo={`${plural(n.perfis.agencias_a_verificar, "agência espera", "agências esperam")} a conferência do CNPJ`}
        >
          Verificada, a agência pode ter mais vagas no ar.{" "}
          <Link href="/admin/usuarios?filtro=agencias_a_verificar" className="underline">
            Conferir agora
          </Link>
        </Aviso>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero
          rotulo="Contas"
          icone={UserRound}
          valor={n.contas}
          detalhe={`+${formatarNumero(n.contas_7d)} em 7 dias`}
          href="/admin/usuarios"
        />
        <Numero
          rotulo="Anúncios no ar"
          icone={Megaphone}
          valor={n.anuncios.no_ar}
          detalhe={`${plural(n.anuncios.vagas_no_ar, "vaga", "vagas")} · ${plural(n.anuncios.servicos_no_ar, "serviço", "serviços")}`}
          href="/admin/anuncios?status=ativo"
        />
        <Numero
          rotulo="Curtidas em 7 dias"
          icone={Heart}
          valor={n.curtidas.novas_7d}
          detalhe={`${formatarNumero(n.curtidas.total)} no total`}
        />
        <Numero
          rotulo="Matches em 7 dias"
          icone={MessageCircleHeart}
          valor={n.curtidas.matches_7d}
          detalhe={`${formatarNumero(n.curtidas.matches)} no total`}
        />
        <Numero
          rotulo="Denúncias abertas"
          icone={Flag}
          valor={n.denuncias_abertas}
          detalhe={`${plural(n.denuncias_7d, "chegou", "chegaram")} em 7 dias`}
          href="/admin/denuncias"
          alerta={n.denuncias_abertas > 0}
        />
        <Numero
          rotulo="Em análise"
          icone={ShieldAlert}
          valor={n.anuncios.em_analise}
          detalhe={`IA reteve ${formatarNumero(n.ia.retidos_7d)} em 7 dias`}
          href="/admin/anuncios?status=em_analise"
          alerta={n.anuncios.em_analise > 0}
        />
        <Numero
          rotulo="Contas suspensas"
          icone={UserX}
          valor={n.suspensos + n.banidos}
          detalhe={`${plural(n.banidos, "banida", "banidas")} de vez`}
          href="/admin/usuarios?filtro=suspensos"
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
          href="/admin/emails"
          alerta={n.emails.falhas_7d > 0}
        />
      </div>

      {config.ia_resumo && (
        <Secao
          titulo="Resumo da IA"
          descricao={
            resumo
              ? `Últimos ${resumo.dias} dias. Gerado ${tempoRelativo(resumo.criado_em, agora)}.`
              : "A IA lê os números da semana e escreve o que aconteceu, os sinais de alerta e o que fazer."
          }
          acoes={<BotaoResumoIA temResumo={Boolean(resumo)} />}
        >
          {resumo ? (
            <div className="flex flex-col gap-1.5 text-body whitespace-pre-line">{resumo.texto}</div>
          ) : (
            <p className="text-body-sm text-ink-muted">Ainda não há resumo. Custa menos de um centavo por resumo.</p>
          )}
        </Secao>
      )}

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

      <Secao titulo="O que a equipe fez por último">
        {registro.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Nada por enquanto.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {registro.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-body-sm">
                <span>
                  <strong className="font-semibold">{r.quem}</strong> {descreverAcao(r.acao)}{" "}
                  {r.rotulo && <span className="text-ink">“{r.rotulo}”</span>}
                </span>
                <span className="text-ink-muted">{tempoRelativo(r.criado_em, agora)}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}
