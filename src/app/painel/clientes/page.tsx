import { Building2, Lock, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { ChipFiltro } from "@/components/painel/fluxo";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import type { Cliente, NumerosDoCliente } from "@/lib/clientes";
import { MODO_DEMO } from "@/lib/config";
import { TIPOS_CONTA } from "@/lib/constantes";
import { listarMeusAnuncios, listarMeusCandidatos, obterMeuPerfil } from "@/lib/dados";
import { formatarLugar, plural, primeiro } from "@/lib/formato";
import { clientesDasVagas, listarMeusClientes, numerosDosClientes } from "@/lib/servidor/clientes";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Clientes" };

/** Sem acento e em minúsculas, para a busca pelo nome. */
const simples = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const SEM_NUMEROS: NumerosDoCliente = { vagas: 0, noAr: 0, candidatos: 0, responder: 0, contratados: 0 };

export default function Clientes({ searchParams }: PageProps<"/painel/clientes">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/clientes">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const sp = await searchParams;
  const usuario = await exigirUsuario("/painel/clientes");
  const perfil = await obterMeuPerfil();
  if (perfil?.tipo !== "agencia") return <SoParaAgencia tipo={perfil?.tipo ?? null} />;

  const [clientes, anuncios, candidatos, clienteDe] = await Promise.all([
    listarMeusClientes(),
    listarMeusAnuncios(),
    listarMeusCandidatos(),
    clientesDasVagas(usuario.id),
  ]);
  const agora = await agoraDaRequisicao();
  if (!clientes) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para carregar os clientes agora">
        Tente de novo em instantes. Enquanto isso, as vagas continuam em “Minhas vagas”.
      </Aviso>
    );
  }
  const numeros = numerosDosClientes(
    clienteDe,
    anuncios.filter((a) => a.tipo === "vaga"),
    candidatos,
    agora,
  );

  const naLista = clientes.filter((c) => !c.arquivado_em);
  const arquivados = clientes.filter((c) => c.arquivado_em);
  const verArquivados = primeiro(sp.arquivados) === "1" && arquivados.length > 0;
  const busca = (primeiro(sp.q) ?? "").trim().slice(0, 60);
  const procurado = simples(busca);
  const soDigitos = busca.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const lista = (verArquivados ? arquivados : naLista).filter(
    (c) =>
      !procurado ||
      simples(c.nome).includes(procurado) ||
      (soDigitos.length >= 4 && (c.cnpj ?? "").includes(soDigitos)) ||
      simples(c.responsavel ?? "").includes(procurado),
  );
  const link = (mudar: { arquivados?: boolean }) => {
    const q = new URLSearchParams();
    if (mudar.arquivados ?? verArquivados) q.set("arquivados", "1");
    if (busca) q.set("q", busca);
    const s = q.toString();
    return `/painel/clientes${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-5">
      {primeiro(sp.excluido) === "1" && <Aviso tipo="sucesso" titulo="Cliente excluído." />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-h2">Clientes</h2>
          <p className="mt-1 text-body text-ink-muted">
            As empresas para quem você seleciona. Ao publicar, é só escolher o cliente: o nome e o endereço já vêm na
            vaga. CNPJ, contato e anotações ficam só com você.
          </p>
        </div>
        {clientes.length > 0 && (
          <BotaoLink href="/painel/clientes/novo" tamanho="sm">
            <Plus aria-hidden />
            Adicionar cliente
          </BotaoLink>
        )}
      </div>

      {clientes.length === 0 ? (
        <Vazio
          icone={Building2}
          titulo="Nenhum cliente ainda"
          acao={<BotaoLink href="/painel/clientes/novo">Adicionar cliente</BotaoLink>}
        >
          Cadastre as empresas para quem você seleciona. Depois, ao publicar, escolha o cliente: o nome e o endereço já
          vêm prontos, e você vê as vagas e os candidatos de cada um. Ao publicar para uma empresa nova, ela também
          entra aqui.
        </Vazio>
      ) : (
        <>
          {(clientes.length > 6 || busca) && (
            // busca pelo nome, CNPJ ou contato (formulário simples: funciona sem JavaScript)
            <form role="search" action="/painel/clientes" className="flex flex-col gap-1.5 sm:max-w-sm">
              <label htmlFor="busca-cliente" className="text-label">
                Procurar cliente
              </label>
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
                />
                <input
                  id="busca-cliente"
                  name="q"
                  type="search"
                  defaultValue={busca}
                  placeholder="Nome, CNPJ ou contato"
                  className={`${classesEntrada} pl-9`}
                />
              </div>
              {verArquivados && <input type="hidden" name="arquivados" value="1" />}
            </form>
          )}
          {arquivados.length > 0 && (
            <nav aria-label="Filtrar clientes" className="flex flex-wrap gap-2">
              <ChipFiltro
                href={link({ arquivados: false })}
                ativo={!verArquivados}
                nome="Na lista"
                numero={naLista.length}
              />
              <ChipFiltro
                href={link({ arquivados: !verArquivados })}
                ativo={verArquivados}
                nome="Arquivados"
                numero={arquivados.length}
              />
            </nav>
          )}
          {lista.length === 0 ? (
            <p className="rounded-md bg-surface-300 px-4 py-3 text-body-sm text-ink">
              {busca ? `Nenhum cliente com “${busca}”.` : "Nenhum cliente aqui."}{" "}
              <Link href="/painel/clientes" className="font-semibold underline underline-offset-2">
                Ver todos
              </Link>
            </p>
          ) : (
            <ul aria-label="Lista de clientes" className="grid gap-4 lg:grid-cols-2">
              {lista.map((c) => (
                <CartaoCliente key={c.id} c={c} n={numeros.get(c.id) ?? SEM_NUMEROS} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function CartaoCliente({ c, n }: { c: Cliente; n: NumerosDoCliente }) {
  const lugar = c.bairro || c.cidade ? formatarLugar(c.bairro, c.cidade ?? "Goiânia") : null;
  const base = `/painel/candidatos?cliente=${c.id}`;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-300 text-ink">
          <Building2 aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-h3 break-words">
            <Link href={`/painel/clientes/${c.id}`} className="underline-offset-2 hover:underline">
              {c.nome}
            </Link>
          </h3>
          {(lugar || c.responsavel) && (
            <p className="text-body-sm text-ink-muted">{[lugar, c.responsavel].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        {c.confidencial && (
          <Selo variante="contorno" title="As vagas novas deste cliente saem como “Empresa confidencial”">
            <Lock aria-hidden />
            Confidencial
          </Selo>
        )}
      </div>
      {n.vagas === 0 ? (
        <p className="text-body-sm text-ink-muted">Nenhuma vaga ainda.</p>
      ) : (
        <ul aria-label={`Números de ${c.nome}`} className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm">
          <li>
            <Link href={`/painel/anuncios?tipo=vaga&cliente=${c.id}`} className="underline-offset-2 hover:underline">
              {plural(n.noAr, "vaga no ar", "vagas no ar")}
            </Link>
            {n.vagas > n.noAr && <span className="text-ink-muted"> de {n.vagas}</span>}
          </li>
          <li>
            <Link href={base} className="underline-offset-2 hover:underline">
              {plural(n.candidatos, "candidato", "candidatos")}
            </Link>
          </li>
          {n.responder > 0 && (
            <li>
              <Link
                href={`${base}&situacao=responder`}
                className="font-semibold text-terra-text underline-offset-2 hover:underline"
              >
                {n.responder} para responder
              </Link>
            </li>
          )}
          {n.contratados > 0 && (
            <li>
              <Link href={`${base}&etapa=contratado`} className="text-cerrado-text underline-offset-2 hover:underline">
                {plural(n.contratados, "contratado", "contratados")}
              </Link>
            </li>
          )}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
        {!c.arquivado_em && (
          <BotaoLink href={`/publicar?cliente=${c.id}`} tamanho="sm">
            <Plus aria-hidden />
            Publicar vaga
          </BotaoLink>
        )}
        <BotaoLink href={`/painel/clientes/${c.id}`} tamanho="sm" variante="fantasma">
          Abrir ficha
        </BotaoLink>
      </div>
    </li>
  );
}

/** Quem não é agência: explica e leva ao perfil. */
function SoParaAgencia({ tipo }: { tipo: string | null }) {
  const nome = tipo ? TIPOS_CONTA[tipo as keyof typeof TIPOS_CONTA]?.minusculo : null;
  return (
    <Vazio
      icone={Building2}
      titulo="Clientes é para agência de emprego e RH"
      acao={<BotaoLink href="/perfil">Abrir o perfil</BotaoLink>}
    >
      {nome ? `Sua conta é de ${nome}. ` : ""}Se você seleciona pessoas para outras empresas, mude o tipo da conta para
      Agência / RH no perfil, com o CNPJ da agência. Aí cada vaga diz para qual cliente é.
    </Vazio>
  );
}
