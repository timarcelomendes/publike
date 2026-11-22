import type { Metadata } from "next";
import { Suspense } from "react";
import { CompararLeitura } from "@/components/admin/comparar-leitura";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { salvarConfigLeitura } from "@/lib/acoes/admin-qualificados";
import { formatarDataCurta, formatarNumero, primeiro } from "@/lib/formato";
import { MODELOS_IA } from "@/lib/ia/openai";
import { MODELO_DA_LEITURA, MODELOS_DA_COMPARACAO } from "@/lib/servidor/leitura-curriculo";
import { exigirAdminLocal } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Qualificados" };

// Currículos qualificados, etapa 1 (migração 20270826120000; claude/plano-curriculos-qualificados.md). A leitura do
// currículo pela IA (ligar e o modelo), a comparação Sonnet x Opus e os qualificados por função e cidade: o termômetro
// para a etapa 2 (a "Lista pronta" para agências, quando uma função passar de 20 a 30 prontos na região).

type Linha = { cbo: string; nome: string; cidade: string | null; prontos: number; treinamento: number; total: number };
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
  const { data, error } = await c.rpc("admin_qualificados");
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
