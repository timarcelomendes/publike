import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { FunilDoPublicar } from "@/components/admin/funil-publicar";
import { MetricasDeProduto } from "@/components/admin/metricas-produto";
import { NumerosDoPainel, NumerosDoPainelEmbaixo } from "@/components/admin/numeros-do-painel";
import { NumerosDoTesteApp } from "@/components/admin/numeros-teste-app";
import { BotaoResumoIA } from "@/components/admin/resumo-ia";
import { SaudeDoSite } from "@/components/admin/saude";
import { Secao, Situacao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import {
  acessosDoSite,
  configDoSite,
  funilDoPublicar,
  listarChavesServidor,
  metricasDeProduto,
  motivosDeEncerramento,
  respostasNovasDaEquipe,
  numerosDeHoje,
  numerosDoPainel,
  numerosDoTesteApp,
  presencaNoSite,
  registroDaEquipe,
  saudeDoSite,
  tempoNasPaginas,
  ultimoResumo,
} from "@/lib/admin/dados";
import { descreverAcao } from "@/lib/admin/textos";
import { TESTE_FECHADO } from "@/lib/android";
import { ehModerador, possoVerPainelNoSite } from "@/lib/dados";
import { plural, tempoRelativo } from "@/lib/formato";
import { situacaoFilas } from "@/lib/servidor/filas";
import { itensPagamentos, situacaoPagamentos, type ItemPagamento } from "@/lib/servidor/situacao-pagamentos";
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
    // no site publicado, quem a equipe liberou vê os números em /equipe
    if (await possoVerPainelNoSite()) redirect("/equipe");
    notFound();
  }
  const c = criarClienteAdmin();
  const [
    n,
    acessos,
    config,
    resumo,
    registro,
    chaves,
    agora,
    saude,
    encerramentos,
    respostas,
    testeApp,
    presenca,
    metricas,
    tempo,
    funil,
    pagamentos,
  ] = await Promise.all([
    numerosDoPainel(c),
    acessosDoSite(c),
    configDoSite(c),
    ultimoResumo(c),
    registroDaEquipe(c, 10),
    listarChavesServidor(c),
    agoraDaRequisicao(),
    saudeDoSite(c),
    motivosDeEncerramento(c),
    respostasNovasDaEquipe(c),
    TESTE_FECHADO ? numerosDoTesteApp(c) : Promise.resolve(null),
    presencaNoSite(c),
    metricasDeProduto(c),
    tempoNasPaginas(c),
    funilDoPublicar(c),
    situacaoPagamentos(c),
  ]);
  const hoje = await numerosDeHoje(c, n, agora);
  const filas = situacaoFilas();
  const temChave = chaves.length > 0;
  const faltando =
    !temChave || !filas.smtp || !filas.enderecoEmails || (config.ia_moderacao && !filas.ia) || config.avisos_para.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {saude && <SaudeDoSite saude={saude} agora={agora} />}
      <PagamentosNoPainel itens={itensPagamentos(pagamentos)} />
      {respostas && respostas.length > 0 && (
        <Secao
          titulo="Responderam a equipe"
          descricao="Respostas às mensagens da equipe que ninguém abriu ainda. Abrir a conta marca como vistas."
        >
          <ul className="flex flex-col divide-y divide-line">
            {respostas.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-2.5 text-body-sm">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/admin/usuarios/${r.conta_id}`} className="text-label underline underline-offset-2">
                    {r.nome ?? "Conta sem nome"}
                  </Link>
                  <span className="text-ink-muted">
                    sobre “{r.assunto}” · {tempoRelativo(r.criado_em, agora)}
                  </span>
                </span>
                <span className="line-clamp-3 whitespace-pre-line">{r.texto}</span>
              </li>
            ))}
          </ul>
        </Secao>
      )}
      {faltando && (
        <Secao titulo="Falta configurar" descricao="O site funciona sem isso, mas os e-mails e a IA só rodam com tudo pronto.">
          <div className="flex flex-col gap-2">
            <Situacao ok={Boolean(filas.smtp)}>
              E-mail no servidor (SMTP_SERVIDOR, SMTP_USUARIO, SMTP_SENHA e SMTP_REMETENTE).{" "}
              <Link href="/admin/emails?aba=configuracoes" className="underline">Ver e-mails</Link>
            </Situacao>
            <Situacao ok={Boolean(filas.enderecoEmails)}>
              Endereço do site no ar para os links dos e-mails (PUBLIKE_URL_PUBLICA no seu computador).{" "}
              <Link href="/admin/emails?aba=configuracoes" className="underline">Ver e-mails</Link>
            </Situacao>
            <Situacao ok={temChave}>
              Chave do servidor, para o site publicado mandar e-mails e rodar a IA.{" "}
              <Link href="/admin/chaves" className="underline">Ver chaves</Link>
            </Situacao>
            <Situacao ok={config.avisos_para.length > 0}>
              Quem recebe os avisos da equipe (denúncia, cadastro, anúncio tirado do ar).{" "}
              <Link href="/admin/emails?aba=configuracoes#configuracoes" className="underline">Escolher</Link>
            </Situacao>
            {config.ia_moderacao && (
              <Situacao ok={filas.ia}>
                Chave da IA no servidor (OPENAI_API_KEY ou ANTHROPIC_API_KEY).{" "}
                <Link href="/admin/ia" className="underline">Ver IA</Link>
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

      <NumerosDoPainel n={n} hoje={hoje} acessos={acessos} presenca={presenca} links />

      {metricas && <MetricasDeProduto m={metricas} tempo={tempo} />}

      {testeApp && <NumerosDoTesteApp linhas={testeApp} />}

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

      {funil && <FunilDoPublicar funil={funil} />}
      <NumerosDoPainelEmbaixo n={n} encerramentos={encerramentos} />

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

/** Os pagamentos no Painel: tudo em ordem numa linha; o que falta, item por item (o resto em Pagamentos). */
function PagamentosNoPainel({ itens }: { itens: ItemPagamento[] }) {
  const faltam = itens.filter((i) => !i.ok);
  return (
    <Secao
      titulo="Pagamentos"
      acoes={
        <Link href="/admin/pagamentos" className="text-label underline underline-offset-2">
          Ver pagamentos
        </Link>
      }
    >
      {faltam.length === 0 ? (
        <Situacao ok>Tudo ok: o site no ar fala com o Asaas e os avisos estão chegando.</Situacao>
      ) : (
        <div className="flex flex-col gap-2">
          {faltam.map((i) => (
            <Situacao key={i.texto} ok={false}>
              {i.texto}
            </Situacao>
          ))}
        </div>
      )}
    </Secao>
  );
}
