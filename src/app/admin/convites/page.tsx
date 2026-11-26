import { Building2, FileUp, HeartHandshake, ImageIcon, List, Megaphone, Store, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  EnvioPeloWhatsappOficial,
  ImportarConvites,
  ImportarPorImagens,
  ListaConvites,
  type SituacaoConvitesWhatsapp,
} from "@/components/admin/convites";
import { Divulgar } from "@/components/admin/divulgar";
import { ContatosDeDivulgar } from "@/components/admin/divulgar-contatos";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { ListaDaReceitaAdmin } from "@/components/admin/listas-da-receita";
import { ManterContato } from "@/components/admin/manter-contato";
import { Secao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import type { Convite } from "@/lib/convites";
import { primeiro } from "@/lib/formato";
import { urlDosEmails } from "@/lib/servidor/ambiente";
import { empresasParaContato } from "@/lib/servidor/manter-contato";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Convites" };

// sub-abas: a lista, importar pelas imagens dos anúncios e importar pelo arquivo
const ABAS = [
  { id: "lista", nome: "Convidados", icone: List },
  // quem veio do convite e publicou (migração 20270810120000)
  { id: "contato", nome: "Manter contato", icone: HeartHandshake },
  // a imagem e as mensagens do publicar pelo WhatsApp, para contabilidades e RH (23/11/2026)
  { id: "divulgar", nome: "Divulgar", icone: Megaphone },
  { id: "imagens", nome: "Importar pelas imagens", icone: ImageIcon },
  { id: "arquivo", nome: "Importar arquivo", icone: FileUp },
  // a base da Receita (migração 20270604120000)
  { id: "abriram", nome: "Abriram perto", icone: Store },
  { id: "agencias", nome: "Agências de Goiás", icone: Building2 },
  { id: "prestadores", nome: "Prestadores MEI", icone: Wrench },
] as const;
type Aba = (typeof ABAS)[number]["id"];

export default function Convites({ searchParams }: PageProps<"/admin/convites">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {searchParams.then((sp) => {
        const pedida = primeiro(sp.aba);
        const aba: Aba = ABAS.some((a) => a.id === pedida) ? (pedida as Aba) : "lista";
        const texto = (k: string) => primeiro(sp[k]) ?? undefined;
        return (
          <Conteudo
            aba={aba}
            sp={{
              cidade: texto("cidade"),
              dias: texto("dias"),
              oficio: texto("oficio"),
              pagina: texto("pagina"),
              publico: texto("publico"),
              mostrar: texto("mostrar"),
              // da lista da Receita: abre a lista já no convite (o "Já convidada")
              busca: texto("busca"),
            }}
          />
        );
      })}
    </Suspense>
  );
}

function SubAbas({ ativa, total }: { ativa: Aba; total: number | null }) {
  return (
    <nav aria-label="Convites" className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {ABAS.map(({ id, nome, icone: Icone }) => {
        const atual = id === ativa;
        return (
          <Link
            key={id}
            href={id === "lista" ? "/admin/convites" : `/admin/convites?aba=${id}`}
            scroll={false}
            aria-current={atual ? "page" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-pill border px-3.5 text-label transition-colors ${
              atual
                ? "border-ink bg-ink text-surface-100"
                : "border-line bg-surface-300 text-ink hover:border-line-strong"
            }`}
          >
            <Icone aria-hidden className="size-4" />
            {nome}
            {id === "lista" && total != null && <span className="tabular-nums opacity-70">{total}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Todos os convites, de 1.000 em 1.000 (o banco devolve no máximo 1.000 por pedido). Antes era um pedido só, com
 * `limit(1000)` dos mais antigos: com 1.072 convites, os 72 mais novos (as agências de 24/11/2026) sumiam da lista.
 */
async function todosOsConvites(c: Awaited<ReturnType<typeof exigirAdminLocal>>) {
  const POR_VEZ = 1000;
  const linhas: unknown[] = [];
  for (let de = 0; de < 20_000; de += POR_VEZ) {
    const { data, error } = await c
      .from("convites")
      .select("*")
      .order("criado_em")
      .order("nome")
      .order("id")
      .range(de, de + POR_VEZ - 1);
    if (error) return { data: null, error };
    linhas.push(...(data ?? []));
    if (!data || data.length < POR_VEZ) break;
  }
  return { data: linhas, error: null };
}

async function Conteudo({ aba, sp }: { aba: Aba; sp: Record<string, string | undefined> }) {
  const c = await exigirAdminLocal();
  const [{ data, error }, agora, emailDoDia, peloWhatsapp] = await Promise.all([
    todosOsConvites(c),
    agoraDaRequisicao(),
    // os convites por e-mail de hoje e o limite (migração 20270913120000; sem ela, nada)
    c.rpc("admin_convites_email").then((r) => (r.error ? null : (r.data as unknown as { hoje: number; por_dia: number }))),
    // o envio pelo WhatsApp oficial (migração 20271011120000; sem ela, nada)
    c.rpc("admin_convites_whatsapp").then((r) => (r.error ? null : (r.data as unknown as SituacaoConvitesWhatsapp))),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <SubAbas ativa={aba} total={error ? null : (data?.length ?? 0)} />
      {aba === "lista" && (
        <Secao
          titulo="Convites"
          descricao="Empresas anunciando vagas e prestadores anunciando serviços em outros lugares. Mande o convite pelo WhatsApp ou e-mail: o link leva a vaga (ou a vitrine de serviços) pronta e, quando a pessoa publica por ele, o convite vira Autorizou sozinho. Respondeu “sim” sem abrir o link? Publique por ela daqui. Em cada convite, escolha a mensagem: “Pelo Publike”, “Vagas da Gupy” (para quem já recebe os candidatos lá: a candidatura continua na Gupy, e a equipe publica) ou “Retomar a conversa”, que vem sugerida para quem já está como Enviei."
        >
          {error ? (
            <Aviso tipo="erro" titulo="Não deu para ler os convites">
              Confira se as migrações dos convites já rodaram no Supabase.
            </Aviso>
          ) : (
            <>
              {peloWhatsapp && <EnvioPeloWhatsappOficial s={peloWhatsapp} />}
              <ListaConvites
              convites={(data ?? []) as unknown as Convite[]}
              agora={agora}
              site={urlDosEmails() ?? "https://publike.org"}
              emailDoDia={emailDoDia}
              buscaInicial={sp.busca}
            />
            </>
          )}
        </Secao>
      )}
      {aba === "contato" && (
        <Secao
          titulo="Manter contato"
          descricao="As empresas que vieram dos convites e já publicaram. Cada uma tem a mensagem de hoje: com vaga no ar, pede a próxima; com a vaga saindo do ar, pergunta se contratou ou quer renovar; sem vaga no ar, pergunta por que não publicou de novo, com respostas numeradas. Abra no WhatsApp, mande e marque o que a empresa respondeu: os motivos se somam no topo. Depois do contato, a empresa volta para a lista em 30 dias."
        >
          <ContatoDasEmpresas c={c} agora={agora} />
        </Secao>
      )}
      {aba === "divulgar" && (
        <Secao
          titulo="Divulgar"
          descricao="A imagem e as mensagens prontas do publicar pelo WhatsApp, para mandar a contabilidades, empresas de gestão de pessoas e quem mais indica vagas. O link do WhatsApp já abre a conversa com “Quero publicar uma vaga pelo WhatsApp”."
        >
          <Divulgar />
        </Secao>
      )}
      {aba === "divulgar" && (
        <Secao titulo="Para quem mandar" descricao="As contabilidades e as empresas de gestão de pessoas das cidades do Publike.">
          <ContatosDeDivulgar c={c} sp={sp} />
        </Secao>
      )}
      {aba === "imagens" && (
        <Secao
          id="importar-imagens"
          titulo="Importar pelas imagens dos anúncios"
          descricao="Viu vagas ou serviços anunciados nas redes? Salve as imagens dos anúncios e escolha aqui: a IA lê quem anunciou, o contato e a vaga (ou o serviço), e o convite já vai pronto."
        >
          <ImportarPorImagens />
        </Secao>
      )}
      {(aba === "abriram" || aba === "agencias" || aba === "prestadores") && (
        <Secao titulo={ABAS.find((a) => a.id === aba)!.nome}>
          <ListaDaReceitaAdmin c={c} lista={aba} sp={sp} />
        </Secao>
      )}
      {aba === "arquivo" && (
        <Secao
          id="importar"
          titulo="Importar pelo arquivo"
          descricao="Transforme a lista em arquivo pelo modelo e importe aqui. Dá para importar quantas vezes quiser."
        >
          <ImportarConvites />
        </Secao>
      )}
    </div>
  );
}

async function ContatoDasEmpresas({ c, agora }: { c: Awaited<ReturnType<typeof exigirAdminLocal>>; agora: number }) {
  const r = await empresasParaContato(c, agora);
  if (!r)
    return (
      <Aviso tipo="erro" titulo="Não deu para ler as empresas">
        Tente de novo em instantes.
      </Aviso>
    );
  return (
    <div className="flex flex-col gap-4">
      {r.semMigracao && (
        <Aviso tipo="alerta" titulo="Falta a migração do contato">
          Rode a migração 20270810120000_convites_manter_contato no Supabase para guardar o contato e as respostas.
        </Aviso>
      )}
      <ManterContato empresas={r.empresas} agora={agora} />
    </div>
  );
}
