import { ChevronRight, Workflow } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SuasRegras } from "@/components/automacoes/suas-regras";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { FaixaExperimento, OfertaRecurso } from "@/components/recurso-pago";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { recursosPagos } from "@/lib/dados";
import { equipeDaConta } from "@/lib/servidor/equipe";
import { regrasDaConta } from "@/lib/servidor/regras-tela";
import { bibliotecaDeTestes } from "@/lib/servidor/testes";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Automações" };

// As automações de todas as vagas (claude/plano-regras-personalizadas.md): as suas regras (Automações
// personalizadas, migração 20270115120000), os modelos e as vagas, cada uma com as 5 prontas e grátis.

export default function Automacoes() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/painel/automacoes");
  const [recursos, agora, supabase, regras, testes, equipe] = await Promise.all([
    recursosPagos(),
    agoraDaRequisicao(),
    criarClienteServidor(),
    regrasDaConta(),
    bibliotecaDeTestes(),
    equipeDaConta().catch(() => null),
  ]);
  const estado = recursos?.automacoes.indisponivel ? null : (recursos?.automacoes ?? null);
  const { data: vagas } = await supabase
    .from("anuncios")
    .select("id, titulo, status, expira_em")
    .eq("autor_id", usuario.id)
    .eq("tipo", "vaga")
    .order("criado_em", { ascending: false })
    .limit(100);
  const todas = vagas ?? [];
  const noAr = todas.filter((v) => v.status === "ativo" && new Date(v.expira_em).getTime() > agora);
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina
        titulo="Automações"
        selo={<Selo variante="novo">Novo</Selo>}
        descricao="O Publike faz sozinho o que você faria à mão. As 5 prontas são grátis e ficam em cada vaga. Com as Automações personalizadas, você monta as suas regras: quando algo acontece, se a pessoa atende o que você escolher, o Publike faz o que você mandar. Tudo começa desligado."
      />
      {estado?.liberado ? (
        <FaixaExperimento recurso="automacoes" estado={estado} agora={agora} />
      ) : (
        <OfertaRecurso recurso="automacoes" estado={estado} />
      )}
      {regras && todas.length > 0 && (
        <SuasRegras
          regras={regras}
          liberado={Boolean(estado?.liberado)}
          vagas={Object.fromEntries(todas.map((v) => [v.id, v.titulo]))}
          testes={Object.fromEntries((testes ?? []).map((t) => [t.id, t.titulo]))}
          equipe={Object.fromEntries((equipe ?? []).map((m) => [m.membro_id, m.nome]))}
        />
      )}
      {noAr.length === 0 ? (
        <Vazio
          icone={Workflow}
          titulo="Nenhuma vaga no ar"
          acao={
            <BotaoLink href="/publicar" tamanho="sm">
              Publicar vaga
            </BotaoLink>
          }
        >
          As automações agem nos candidatos das suas vagas.
        </Vazio>
      ) : (
        <section aria-labelledby="vagas-automacoes" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 id="vagas-automacoes" className="text-h3">
              As prontas, em cada vaga
            </h3>
            <p className="text-body-sm text-ink-muted">
              Confirmar a candidatura, lembrar dos parados, dar o retorno, oferecer os horários livres e marcar a vaga
              como preenchida.
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {noAr.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/painel/anuncio/${v.id}/automacoes`}
                  className="flex items-center gap-3 px-4 py-3 text-label hover:bg-surface-300"
                >
                  <Workflow aria-hidden className="size-5 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1 break-words">{v.titulo}</span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
