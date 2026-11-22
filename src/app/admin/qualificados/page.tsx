import type { Metadata } from "next";
import { Suspense } from "react";
import { CompararAtividades } from "@/components/admin/comparar-atividades";
import { CompararLeitura } from "@/components/admin/comparar-leitura";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { salvarConfigAtividades, salvarConfigLeitura, salvarModoCurriculoWhatsapp } from "@/lib/acoes/admin-qualificados";
import { PERGUNTAS_DE_SEMPRE, TEXTOS_DO_CURRICULO } from "@/lib/curriculo-pelo-whatsapp";
import { formatarDataCurta, formatarNumero, primeiro } from "@/lib/formato";
import { MODELOS_IA } from "@/lib/ia/openai";
import { MODELO_DA_LEITURA, MODELOS_DA_COMPARACAO } from "@/lib/servidor/leitura-curriculo";
import { MODELO_DAS_ATIVIDADES, MODELOS_DA_COMPARACAO_DAS_ATIVIDADES } from "@/lib/servidor/atividades-da-vaga";
import { exigirAdminLocal } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Qualificados" };

// Currículos qualificados, etapa 1 (migração 20270826120000; claude/plano-curriculos-qualificados.md). A leitura do
// currículo pela IA (ligar e o modelo), a comparação Sonnet x Opus e os qualificados por função e cidade: o termômetro
// para a etapa 2 (a "Lista pronta" para agências, quando uma função passar de 20 a 30 prontos na região).

type Linha = { cbo: string; nome: string; cidade: string | null; prontos: number; treinamento: number; total: number };
type DadosDasAtividades = {
  config: { ligado: boolean; modelo: string | null; atualizado_em: string };
  lidos: number;
  por_resultado: Partial<Record<"sim" | "parte" | "nao" | "sem", number>>;
};
type Dados = {
  config: { ligado: boolean; modelo: string | null; atualizado_em: string };
  em_talentos: number;
  lidos: number;
  nota_media: number | null;
  funcoes: Linha[];
};

const ERROS: Record<string, string> = {
  fora: "O admin só funciona com a sua conta de admin.",
  salvar: "Não deu para salvar. Tente de novo.",
};

export default function Qualificados({ searchParams }: PageProps<"/admin/qualificados">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/qualificados">["searchParams"] }) {
  const c = await exigirAdminLocal();
  const sp = await searchParams;
  const [{ data, error }, ativ, cvw] = await Promise.all([
    c.rpc("admin_qualificados"),
    c.rpc("admin_atividades"),
    c.rpc("admin_curriculo_whatsapp"),
  ]);
  if (error)
    return (
      <Aviso tipo="erro" titulo="Sem os dados">
        {error.code === "PGRST202" ? "Rode a migração 20270826120000_leitura_do_curriculo.sql primeiro." : error.message}
      </Aviso>
    );
  const d = data as unknown as Dados;
  const erro = primeiro(sp.erro);
  const modelos = MODELOS_DA_COMPARACAO.map((id) => MODELOS_IA.find((m) => m.id === id)!).map((m) => ({
    id: m.id,
    nome: m.nome,
    preco: m.preco,
  }));
  const modeloAtual = d.config.modelo ?? MODELO_DA_LEITURA;
  // as atividades da vaga (migração 20270831120000); sem a migração, a parte não aparece
  const at = ativ.error ? null : (ativ.data as unknown as DadosDasAtividades);
  // o currículo pelo WhatsApp (migração 20270902120000); sem a migração, a parte não aparece
  const cw = cvw.error
    ? null
    : (cvw.data as unknown as { modo: string; montados: number; conversas: number; abertos: number; ultimos_7_dias: number });
  const modelosDasAtividades = MODELOS_DA_COMPARACAO_DAS_ATIVIDADES.map((id) => MODELOS_IA.find((m) => m.id === id)!);

  return (
    <div className="flex flex-col gap-6">
      {erro && <Aviso tipo="erro">{ERROS[erro] ?? ERROS.salvar}</Aviso>}
      {primeiro(sp.salvo) === "1" && <Aviso tipo="sucesso" titulo="Salvo." />}

      <Secao
        titulo="Leitura do currículo"
        descricao={
          <>
            A IA lê cada currículo de Talentos e diz para que trabalho a pessoa serve: até 3 funções, cada uma “pronto
            para assumir” ou “precisa de treinamento”. Quem publica uma vaga vê, em Talentos, as pessoas prontas para a
            função da vaga, e a Triagem com IA lê essas pessoas primeiro. A pessoa vê as funções e dicas para melhorar o
            currículo. A IA não vê nome, foto, bairro nem contato, e lê de novo quando o currículo muda.
          </>
        }
      >
        <form action={salvarConfigLeitura} className="flex flex-wrap items-end gap-4 rounded-md border border-line p-4">
          <label className="flex items-center gap-2 text-label">
            <input type="checkbox" name="ligado" defaultChecked={d.config.ligado} className="size-5" />
            Ler os currículos sozinho
          </label>
          <label className="flex flex-col gap-1 text-body-sm">
            Modelo
            <select
              name="modelo"
              defaultValue={modeloAtual}
              className="min-h-11 rounded-md border border-line-strong bg-surface-200 px-3 text-body"
            >
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome} (US$ {m.preco.entrada} / {m.preco.saida} por milhão)
                </option>
              ))}
            </select>
          </label>
          <Botao type="submit" variante="secundario">
            Salvar
          </Botao>
          <p className="basis-full text-caption text-ink-muted">
            {d.config.ligado
              ? `Ligado: uns 3 currículos por rodada das filas. Alterado em ${formatarDataCurta(d.config.atualizado_em)}.`
              : "Desligado: nada é lido. Compare os modelos abaixo antes de ligar."}
          </p>
        </form>
        <p className="text-body-sm">
          {formatarNumero(d.lidos)} de {formatarNumero(d.em_talentos)} currículos de Talentos lidos
          {d.nota_media != null && ` · nota média ${d.nota_media}`}.
        </p>
      </Secao>

      {at && (
        <div id="atividades" className="scroll-mt-32">
          <Secao
            titulo="Atividades da vaga"
            descricao={
              <>
                O % de combina conta o tempo na mesma função (6 meses valem menos que 5 anos). Ligado, a IA também lê a
                vaga e o que a pessoa fazia nesses trabalhos e diz se fazia as mesmas atividades: outras atividades fazem o
                trabalho contar como função parecida, e “em parte” tira 20% do tempo. Só os pares que mudam a nota (quem
                se candidatou ou está em Talentos e tem trabalho na mesma função), primeiro os candidatos. Compare os dois
                modelos antes de ligar.
              </>
            }
          >
            <form action={salvarConfigAtividades} className="flex flex-wrap items-end gap-4 rounded-md border border-line p-4">
              <label className="flex items-center gap-2 text-label">
                <input type="checkbox" name="ligado" defaultChecked={at.config.ligado} className="size-5" />
                Comparar as atividades sozinho
              </label>
              <label className="flex flex-col gap-1 text-body-sm">
                Modelo
                <select
                  name="modelo"
                  defaultValue={at.config.modelo ?? MODELO_DAS_ATIVIDADES}
                  className="min-h-11 rounded-md border border-line-strong bg-surface-200 px-3 text-body"
                >
                  {modelosDasAtividades.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome} (US$ {m.preco.entrada} / {m.preco.saida} por milhão)
                    </option>
                  ))}
                </select>
              </label>
              <Botao type="submit" variante="secundario">
                Salvar
              </Botao>
              <p className="basis-full text-caption text-ink-muted">
                {at.config.ligado
                  ? `Ligado: uns 6 pares por rodada das filas. Alterado em ${formatarDataCurta(at.config.atualizado_em)}.`
                  : "Desligado: só o tempo conta. Compare os modelos abaixo antes de ligar."}
              </p>
            </form>
            <p className="text-body-sm">
              {formatarNumero(at.lidos)} pares lidos
              {at.lidos > 0 &&
                `: ${formatarNumero(at.por_resultado.sim ?? 0)} com as mesmas atividades, ${formatarNumero(at.por_resultado.parte ?? 0)} em parte, ${formatarNumero(at.por_resultado.nao ?? 0)} com outras e ${formatarNumero(at.por_resultado.sem ?? 0)} sem como comparar`}
              .
            </p>
            <CompararAtividades modelos={modelosDasAtividades.map((m) => ({ id: m.id, nome: m.nome }))} />
          </Secao>
        </div>
      )}

      {cw && (
        <div id="curriculo-whatsapp" className="scroll-mt-32">
          <Secao
            titulo="Currículo pelo WhatsApp"
            descricao={
              <>
                Quem procura trabalho monta o currículo conversando no atendimento do WhatsApp: conta o que faz (escrito ou
                em áudio), responde 3 perguntas de recrutador que a IA escreve sobre o que a pessoa contou, depois estudo,
                cursos, CNH e horário. A IA monta o currículo só com o que foi dito e manda a prévia com o botão “Conferir e
                salvar”, que abre o formulário do site já preenchido (o link vale 7 dias). Começa pelo botão “Montar meu
                currículo” (em “Procuro emprego”), por quem escreve “currículo” ou pelo convite depois das vagas. Usa o
                modelo de “Ler currículo e vaga” (Admin › IA).
              </>
            }
          >
            <form action={salvarModoCurriculoWhatsapp} className="flex flex-wrap items-end gap-4 rounded-md border border-line p-4">
              <label className="flex flex-col gap-1 text-body-sm">
                Quem recebe
                <select
                  name="modo"
                  defaultValue={cw.modo}
                  className="min-h-11 rounded-md border border-line-strong bg-surface-200 px-3 text-body"
                >
                  <option value="desligado">Ninguém (desligado)</option>
                  <option value="teste">Só os números de teste (Admin › WhatsApp)</option>
                  <option value="todos">Todos</option>
                </select>
              </label>
              <Botao type="submit" variante="secundario">
                Salvar
              </Botao>
            </form>
            <p className="text-body-sm">
              {formatarNumero(cw.montados)} currículos montados em {formatarNumero(cw.conversas)} conversas ·{" "}
              {formatarNumero(cw.abertos)} abertos no site · {formatarNumero(cw.ultimos_7_dias)} nos últimos 7 dias.
            </p>
            <details className="rounded-md border border-line p-4">
              <summary className="cursor-pointer text-label">Os textos da conversa</summary>
              <div className="mt-3 flex flex-col gap-3 text-body-sm whitespace-pre-line">
                <p>{TEXTOS_DO_CURRICULO.passo1}</p>
                <p>{TEXTOS_DO_CURRICULO.passo2(PERGUNTAS_DE_SEMPRE)}</p>
                <p>{TEXTOS_DO_CURRICULO.passo3}</p>
                <p>{TEXTOS_DO_CURRICULO.previa("(a prévia do currículo)")}</p>
                <p>{TEXTOS_DO_CURRICULO.convite}</p>
              </div>
            </details>
          </Secao>
        </div>
      )}

      <Secao
        titulo="Sonnet x Opus"
        descricao="Os dois modelos leem os mesmos currículos. Os cartões com borda laranja são os que discordam nas funções, no nível ou na nota (15 pontos ou mais). Nada é guardado; as chamadas contam em Admin › IA."
      >
        <CompararLeitura modelos={modelos} />
      </Secao>

      <Secao
        titulo="Qualificados por função e cidade"
        descricao="Só os currículos visíveis em Talentos, já lidos. Quando uma função passar de 20 a 30 prontos numa região, é hora da Lista pronta para agências (etapa 2)."
      >
        {d.funcoes.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Nenhum currículo lido ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="text-left text-caption text-ink-muted">
                <tr>
                  <th className="py-2 pr-4 font-normal">Função</th>
                  <th className="py-2 pr-4 font-normal">Cidade</th>
                  <th className="py-2 pr-4 font-normal">Prontos</th>
                  <th className="py-2 font-normal">Com treinamento</th>
                </tr>
              </thead>
              <tbody>
                {d.funcoes.map((f) => (
                  <tr key={`${f.cbo}-${f.cidade}`} className="border-t border-line">
                    <td className="py-2 pr-4">
                      {f.nome} <span className="text-caption text-ink-muted">{f.cbo}</span>
                    </td>
                    <td className="py-2 pr-4 text-ink-muted">{f.cidade ?? "—"}</td>
                    <td className="py-2 pr-4 tabular-nums">{f.prontos}</td>
                    <td className="py-2 tabular-nums">{f.treinamento}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </div>
  );
}
