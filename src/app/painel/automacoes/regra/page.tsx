import { Workflow } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MontarRegra } from "@/components/automacoes/montar-regra";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { lerRegra, modeloPeloSlug, type RegraMontada } from "@/lib/regras";
import { contextoDasRegras } from "@/lib/servidor/regras-tela";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Regra das automações" };

// Montar ou mudar uma regra das Automações personalizadas (claude/plano-regras-personalizadas.md). Abre vazia, de
// um modelo (?modelo=) ou uma regra que já existe (?id=); ?vaga= já escolhe a vaga e é para onde volta.

export default function PaginaDaRegra({ searchParams }: PageProps<"/painel/automacoes/regra">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      {searchParams.then((sp) => (
        <Conteudo sp={sp} />
      ))}
    </Suspense>
  );
}

async function Conteudo({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/painel/automacoes/regra");
  const um = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const id = um("id") && UUID.test(um("id") as string) ? (um("id") as string) : null;
  const vagaPedida = um("vaga") && UUID.test(um("vaga") as string) ? (um("vaga") as string) : null;
  const perfil = await obterMeuPerfil();
  const ctx = await contextoDasRegras(usuario.id, perfil?.tipo === "agencia");
  if (!ctx.vagas.length) {
    return (
      <Vazio
        icone={Workflow}
        titulo="Publique uma vaga primeiro"
        acao={
          <BotaoLink href="/publicar" tamanho="sm">
            Publicar vaga
          </BotaoLink>
        }
      >
        As regras agem nos candidatos das suas vagas.
      </Vazio>
    );
  }
  const vaga = vagaPedida && ctx.vagas.some((v) => v.id === vagaPedida) ? vagaPedida : null;
  let inicial: RegraMontada;
  if (id) {
    const { data } = await (await criarClienteServidor()).from("regras").select("*").eq("id", id).maybeSingle();
    const r = lerRegra(data);
    if (!r) notFound();
    inicial = r;
  } else {
    const modelo = modeloPeloSlug(um("modelo"));
    const anuncio = vaga ?? ctx.vagas[0].id;
    const base: RegraMontada = modelo
      ? modelo.regra({ perguntas: ctx.perguntas[anuncio] ?? [] })
      : {
          nome: "",
          gatilho: { tipo: "candidatou" },
          condicoes: [],
          acoes: [{ tipo: "mover", etapa: "analise" }],
          vale_em: "vaga",
        };
    inicial = { ...base, anuncio_id: base.vale_em === "vaga" ? anuncio : null, modelo: modelo?.slug ?? null };
    // a entrevista presencial começa no endereço da vaga
    inicial.acoes = inicial.acoes.map((a) =>
      a.tipo === "horarios" && !a.local ? { ...a, local: ctx.endereco || null } : a,
    );
  }
  const voltar = vaga ? `/painel/anuncio/${vaga}/automacoes` : "/painel/automacoes";
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina
        voltar={{ href: voltar, nome: vaga ? "Automações da vaga" : "Automações" }}
        titulo={id ? "Mudar a regra" : "Nova regra"}
        selo={<Selo variante="novo">Novo</Selo>}
        descricao="Escolha quando ela age, para quem e o que o Publike faz. Cada regra age uma vez por pessoa, e tudo fica anotado, com Desfazer."
      />
      {/* um formulário: numa coluna de ler bem */}
      <div className="max-w-3xl">
        <MontarRegra id={id} inicial={inicial} ctx={ctx} voltar={voltar} />
      </div>
    </div>
  );
}
