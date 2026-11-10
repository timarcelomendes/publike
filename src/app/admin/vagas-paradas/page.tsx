import { Clock, MessageCircle, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao } from "@/components/admin/ui";
import { Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { HORAS_PARADA, mensagemDaVagaParada, vagasParadas } from "@/lib/admin/vagas-paradas";
import { formatarTelefone, plural, rotuloConta, tempoRelativo } from "@/lib/formato";
import { urlDosEmails } from "@/lib/servidor/ambiente";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";
import { MAX_VAGAS_DO_DIA } from "@/lib/vagas-do-dia";

export const metadata: Metadata = { title: "Vagas paradas" };

// As vagas no ar há mais de 24 h sem nenhuma candidatura (claude/plano-crescimento-empresas.md, parte 3): para o
// atendimento à mão. Pôr nas Vagas do dia e mandar a dica para a empresa pelo WhatsApp do admin.

export default function VagasParadas() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const c = await exigirAdminLocal();
  const agora = await agoraDaRequisicao();
  const vagas = await vagasParadas(c, agora);
  const site = urlDosEmails() ?? "https://publike.org";
  const todas = vagas.slice(0, MAX_VAGAS_DO_DIA).map((v) => v.id);

  return (
    <Secao
      titulo="Vagas paradas"
      descricao={`Vagas no ar há mais de ${HORAS_PARADA} horas sem nenhuma candidatura, a mais antiga primeiro. A empresa que não recebe ninguém não volta: ponha a vaga nas Vagas do dia e mande a dica pelo seu WhatsApp. A primeira curtida tira a vaga daqui.`}
      acoes={
        <Link href="/admin/anuncios?status=ativo&tipo=vaga" className="text-label underline underline-offset-2">
          Ver todas as vagas no ar
        </Link>
      }
    >
      {vagas.length === 0 ? (
        <Vazio icone={Sparkles} titulo="Nenhuma vaga parada">
          Toda vaga no ar há mais de {HORAS_PARADA} horas já tem candidato.
        </Vazio>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
              <Selo variante="novo">Novo</Selo>
              {plural(vagas.length, "vaga sem candidato", "vagas sem candidato")}.
            </p>
            <BotaoLink href={`/admin/vagas-do-dia?v=${todas.join(",")}`} tamanho="sm">
              Pôr {todas.length === 1 ? "esta" : `as ${todas.length}`} nas Vagas do dia
            </BotaoLink>
          </div>
          <ul className="flex flex-col gap-4">
            {vagas.map((v) => {
              const mensagem = mensagemDaVagaParada(v, site, agora);
              const zap = v.conta.whatsapp?.replace(/\D/g, "") ?? "";
              return (
                <li key={v.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="flex flex-col">
                      <Link href={`/anuncio/${v.id}`} className="text-label underline-offset-2 hover:underline">
                        {v.titulo}
                      </Link>
                      <span className="text-caption text-ink-muted">
                        <Link href={`/admin/usuarios/${v.conta.id}`} className="underline-offset-2 hover:underline">
                          {v.conta.nome}
                        </Link>
                        {` · ${rotuloConta(v.conta.tipo)}`}
                        {v.lugar && ` · ${v.lugar}`}
                        {v.conta.whatsapp ? ` · WhatsApp ${formatarTelefone(v.conta.whatsapp)}` : " · sem WhatsApp"}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-body-sm text-ink-muted">
                      <Clock aria-hidden className="size-4" />
                      no ar {tempoRelativo(v.criadoEm, agora)} · {plural(v.visitas, "visita", "visitas")}
                    </span>
                  </div>
                  {v.dicas.length > 0 ? (
                    <ul className="flex flex-col gap-1 text-body-sm">
                      {v.dicas.map((d) => (
                        <li key={d.chave}>
                          <span className="font-semibold">{d.titulo}.</span> {d.dica}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-body-sm text-ink-muted">A vaga está completa: falta divulgar.</p>
                  )}
                  <details className="group">
                    <summary className="cursor-pointer text-body-sm font-semibold underline-offset-2 hover:underline">
                      Ver a mensagem para a empresa
                    </summary>
                    <p className="mt-2 rounded-md border border-line bg-surface-100 p-3 text-body-sm whitespace-pre-wrap">
                      {mensagem}
                    </p>
                  </details>
                  <div className="flex flex-wrap gap-2">
                    {zap.length >= 12 && (
                      <BotaoLink
                        href={`https://wa.me/${zap}?text=${encodeURIComponent(mensagem)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        tamanho="sm"
                        variante="primario"
                      >
                        <MessageCircle aria-hidden />
                        Mandar a dica no WhatsApp
                      </BotaoLink>
                    )}
                    <BotaoLink href={`/admin/vagas-do-dia?v=${v.id}`} tamanho="sm">
                      Pôr nas Vagas do dia
                    </BotaoLink>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Secao>
  );
}
