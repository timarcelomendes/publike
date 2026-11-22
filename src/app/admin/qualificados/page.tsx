import type { Metadata } from "next";
import { Suspense } from "react";
import { CompararAtividades } from "@/components/admin/comparar-atividades";
import { CompararLeitura } from "@/components/admin/comparar-leitura";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import {
  mandarCurriculoDaSemanaAgora,
  refazerPerguntasDaFuncao,
  salvarConfigAtividades,
  salvarCurriculoDaSemana,
  salvarConfigLeitura,
  salvarModoCurriculoWhatsapp,
} from "@/lib/acoes/admin-qualificados";
import { ocupacao } from "@/lib/cbo";
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
  // as perguntas de recrutador guardadas por função (migração 20270903120000; sem ela, nenhuma)
  const { data: perguntasDasFuncoes } = await c.rpc("admin_perguntas_das_funcoes");
  // o currículo na semana (migração 20270904120000; sem ela, a parte não aparece)
  const semana = await c.rpc("admin_curriculo_semana");
  const cs = semana.error
    ? null
    : (semana.data as unknown as {
        ligado: boolean;
        novidades: number;
        receberiam: number;
        com_movimento: number;
        por_dica: Record<string, number>;
        exemplos: string[];
        avisados_7_dias: number;
      });
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
      {primeiro(sp.mandados) !== undefined && (
        <Aviso tipo="sucesso" titulo={`As novidades do currículo: ${primeiro(sp.mandados)} avisos mandados agora.`} />
      )}

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

      {cs && (
        <div id="curriculo-semana" className="scroll-mt-32">
          <Secao
            titulo="As novidades do currículo"
            descricao={
              <>
                Sempre que juntar {cs.novidades} novidades desde o último aviso (empresas que abriram o currículo e convites
                para vaga), quem tem currículo recebe no sino, no celular e por e-mail quantas foram, com uma dica: a
                experiência que não diz o que a pessoa fazia (“toque em Contar falando”), o currículo parado há mais de 45
                dias (“Ainda está procurando? Mudou de trabalho?”) ou a primeira coisa a melhorar da leitura. No máximo um
                por dia, das 9h às 20h. Sem novidade, só a dica, no máximo a cada 4 semanas. O e-mail é o modelo “As
                novidades do currículo” (Admin › E-mails).
              </>
            }
          >
            <form action={salvarCurriculoDaSemana} className="flex flex-wrap items-end gap-4 rounded-md border border-line p-4">
              <label className="flex flex-col gap-1 text-body-sm">
                Avisar a cada
                <input
                  type="number"
                  name="novidades"
                  min={1}
                  max={20}
                  defaultValue={cs.novidades}
                  className="min-h-11 w-24 rounded-md border border-line-strong bg-surface-200 px-3 text-body"
                />
                <span className="text-ink-muted">novidades</span>
              </label>
              <label className="flex flex-col gap-1 text-body-sm">
                Envio
                <select
                  name="ligado"
                  defaultValue={cs.ligado ? "1" : "0"}
                  className="min-h-11 rounded-md border border-line-strong bg-surface-200 px-3 text-body"
                >
                  <option value="0">Desligado</option>
                  <option value="1">Ligado</option>
                </select>
              </label>
              <Botao type="submit" variante="secundario">
                Salvar
              </Botao>
            </form>
            <p className="text-body-sm">
              Agora receberiam {formatarNumero(cs.receberiam)} pessoas ({formatarNumero(cs.com_movimento)} com{" "}
              {cs.novidades} novidades ou mais) · {formatarNumero(cs.avisados_7_dias)} avisos nos últimos 7 dias. Dicas:{" "}
              {Object.entries(cs.por_dica)
                .map(([d, n]) => `${{ sem_descricao: "contar o que fazia", parado: "ainda procurando", melhorar: "melhorar", nenhuma: "nenhuma" }[d] ?? d}: ${n}`)
                .join(" · ") || "nenhuma"}
              .
            </p>
            {cs.exemplos.length > 0 && (
              <details className="rounded-md border border-line p-4">
                <summary className="cursor-pointer text-label">Como ficam os avisos (exemplos, sem o nome)</summary>
                <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-body-sm">
                  {cs.exemplos.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </details>
            )}
            <form action={mandarCurriculoDaSemanaAgora}>
              <Botao type="submit" variante="secundario" disabled={!cs.receberiam}>
                Mandar agora para {formatarNumero(Math.min(cs.receberiam, 100))} pessoas
              </Botao>
            </form>
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
                em áudio), responde 3 perguntas de recrutador que a IA escreve sobre o que a pessoa contou (uma por mensagem, com as opções em botões quando cabem), depois estudo,
                cursos, CNH e horário. A IA monta o currículo só com o que foi dito e manda a prévia com o botão “Conferir e
                salvar”, que abre o formulário do site já preenchido (o link vale 7 dias). Depois da prévia, a pessoa
                escreve “cartão” (a imagem para os grupos e o status) ou “PDF” (uma página para imprimir, com o nome e o
                número do WhatsApp). Começa por quem escreve “currículo” ou pela pergunta separada, uns 10 minutos depois
                das vagas, para quem não tem currículo pelo número (uma vez por conversa, das 8h às 21h). Usa o modelo de
                “Ler currículo e vaga” (Admin › IA).
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
                <p>{`${TEXTOS_DO_CURRICULO.perguntaDoPasso2(1, "Na lanchonete, quantos lanches saíam por dia, mais ou menos?", true)}\n[Até 50 por dia] [De 50 a 150] [Mais de 150]`}</p>
                <p>{TEXTOS_DO_CURRICULO.perguntaDoPasso2(2, PERGUNTAS_DE_SEMPRE[0], false)}</p>
                <p>{TEXTOS_DO_CURRICULO.passo3}</p>
                <p>{TEXTOS_DO_CURRICULO.previa("(a prévia do currículo)")}</p>
                <p>{TEXTOS_DO_CURRICULO.cartao}</p>
                <p>{TEXTOS_DO_CURRICULO.pdf}</p>
                <p>{`${TEXTOS_DO_CURRICULO.pergunta}\n[Montar meu currículo] [Agora não]`}</p>
              </div>
            </details>
            <details className="rounded-md border border-line p-4">
              <summary className="cursor-pointer text-label">
                As perguntas de recrutador por função ({formatarNumero(perguntasDasFuncoes?.length ?? 0)})
              </summary>
              <div className="mt-3 flex flex-col gap-4 text-body-sm">
                <p className="text-ink-muted">
                  Tiradas das vagas do Publike de cada função com 3 vagas ou mais em 120 dias, pelo robô das filas (com o
                  currículo pelo WhatsApp ligado). A conversa usa as da função que a pessoa contou como base; sem elas, a IA
                  escreve sozinha. “Refazer” apaga e o robô faz de novo na próxima rodada.
                </p>
                {(perguntasDasFuncoes ?? []).map((f) => (
                  <div key={f.cbo} className="flex flex-col gap-2 rounded-md bg-surface-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-label">
                        {ocupacao(f.cbo)?.nome ?? f.cbo} · {formatarNumero(f.vagas)} vagas
                      </span>
                      <form action={refazerPerguntasDaFuncao}>
                        <input type="hidden" name="cbo" value={f.cbo} />
                        <Botao type="submit" variante="secundario">
                          Refazer
                        </Botao>
                      </form>
                    </div>
                    <ul className="list-disc pl-5">
                      {(f.perguntas as unknown as { pergunta: string; exemplo: string }[]).map((q) => (
                        <li key={q.pergunta}>
                          {q.pergunta} {q.exemplo && <em className="text-ink-muted">Ex.: {q.exemplo}</em>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
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
