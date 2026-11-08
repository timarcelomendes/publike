import {
  Bell,
  CalendarClock,
  ClipboardList,
  Columns3,
  CreditCard,
  FileSignature,
  Globe,
  MessageSquareText,
  RotateCcw,
  Route,
  UsersRound,
  Workflow,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CaixaConfig } from "@/components/configuracoes/comum";
import { FormularioCandidatura } from "@/components/configuracoes/formulario-candidatura";
import { FormularioContratacao } from "@/components/configuracoes/formulario-contratacao";
import { FormularioProcesso } from "@/components/configuracoes/formulario-processo";
import { ModelosDeMensagem } from "@/components/configuracoes/modelos-de-mensagem";
import { EditorEtapas, EditorHorarios } from "@/components/etapas/editores";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { FormRetorno } from "@/components/painel/retorno";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { primeiro } from "@/lib/formato";
import { etapasProprias, horariosLivres } from "@/lib/servidor/etapas-proprias";
import { padroesDaConta, processoDaConta } from "@/lib/servidor/processo";
import { modelosDaConta } from "@/lib/servidor/quadro";
import { retornoDaConta } from "@/lib/servidor/retorno";
import { exigirUsuario } from "@/lib/sessao";
import { lerPerguntas } from "@/lib/vaga-extra";

export const metadata: Metadata = { title: "Configurações" };

// Configurações de quem contrata (claude/plano-etapas-obrigatorias-e-configuracoes.md): o processo (os jeitos prontos,
// as regras, as etapas próprias e o retorno), o padrão das vagas novas, as entrevistas e mensagens, e a contratação.
// Antes, cada uma ficava num canto (o retorno, numa gaveta do quadro de uma vaga).

const ABAS = [
  { valor: "processo", nome: "Processo" },
  { valor: "candidatura", nome: "Candidatura" },
  { valor: "entrevistas", nome: "Entrevistas e mensagens" },
  { valor: "contratacao", nome: "Contratação" },
] as const;
type Aba = (typeof ABAS)[number]["valor"];

export default function Configuracoes({ searchParams }: PageProps<"/painel/configuracoes">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      {searchParams.then((sp) => {
        const pedida = primeiro(sp.aba);
        const aba: Aba = ABAS.some((a) => a.valor === pedida) ? (pedida as Aba) : "processo";
        return <Conteudo aba={aba} />;
      })}
    </Suspense>
  );
}

const indisponivel = (
  <Aviso tipo="alerta" titulo="Ainda não disponível">
    Tente de novo em instantes.
  </Aviso>
);

async function Conteudo({ aba }: { aba: Aba }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario(`/painel/configuracoes?aba=${aba}`);
  const perfil = await obterMeuPerfil();
  if (!perfil || perfil.tipo === "pessoa") {
    return <Aviso tipo="info" titulo="As configurações são para quem contrata" />;
  }
  const agencia = perfil.tipo === "agencia";
  const administra = usuario.papel === "dono" || usuario.papel === "admin";

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-h2">
          Configurações
          <Selo variante="novo">Novo</Selo>
        </h2>
        <p className="mt-1 text-body text-ink-muted">
          O jeito da sua {agencia ? "agência" : "empresa"} de contratar, em todas as vagas.
          {!administra && " Só quem administra a conta muda; você vê como está."}
        </p>
      </div>
      <nav aria-label="Partes das configurações" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-line">
          {ABAS.map((a) => (
            <li key={a.valor}>
              <Link
                href={`/painel/configuracoes?aba=${a.valor}`}
                aria-current={aba === a.valor ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 px-3 text-label transition-colors ${
                  aba === a.valor ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {a.nome}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {aba === "processo" && <AbaProcesso agencia={agencia} administra={administra} empresa={perfil.nome} />}
      {aba === "candidatura" && <AbaCandidatura />}
      {aba === "entrevistas" && <AbaEntrevistas />}
      {aba === "contratacao" && <AbaContratacao agencia={agencia} />}

      <section aria-labelledby="atalhos" className="flex flex-col gap-2 border-t border-line pt-5">
        <h3 id="atalhos" className="text-label text-ink-muted">
          Também da conta
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {[
            { href: "/painel/equipe", nome: "Equipe", texto: "Quem ajuda a contratar", icone: UsersRound },
            { href: "/painel/automacoes", nome: "Automações", texto: "Regras que agem sozinhas", icone: Workflow },
            { href: "/painel/links", nome: "Página de vagas", texto: "A página e os outros sites", icone: Globe },
            { href: "/perfil/preferencias", nome: "Avisos", texto: "E-mail e celular", icone: Bell },
            { href: "/painel/assinatura", nome: "Assinatura", texto: "Recursos e faturas", icone: CreditCard },
          ].map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="flex min-h-14 items-center gap-3 rounded-md border border-line bg-surface-200 px-4 py-3 hover:bg-surface-300"
              >
                <l.icone aria-hidden className="size-5 shrink-0 text-ink-muted" />
                <span>
                  <span className="block text-label">{l.nome}</span>
                  <span className="block text-body-sm text-ink-muted">{l.texto}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

async function AbaProcesso({ agencia, administra, empresa }: { agencia: boolean; administra: boolean; empresa: string }) {
  const [processo, etapas, retorno] = await Promise.all([processoDaConta(), etapasProprias(), retornoDaConta()]);
  return (
    <>
      <CaixaConfig
        id="processo"
        icone={<Route aria-hidden className="size-5 text-ink-muted" />}
        titulo="O caminho até contratar"
        texto="Escolha um jeito pronto ou ligue só as regras que quiser. Vale para todas as vagas."
      >
        {processo ? <FormularioProcesso inicial={processo} agencia={agencia} /> : indisponivel}
      </CaixaConfig>
      <CaixaConfig
        id="etapas"
        icone={<Columns3 aria-hidden className="size-5 text-ink-muted" />}
        titulo="Etapas do quadro"
        texto="Crie etapas suas, como “Entrevista RH” ou “Teste técnico”. Cada uma vira uma coluna no quadro, logo depois da etapa que você escolher. O candidato continua vendo a etapa de sempre."
      >
        {!etapas ? (
          indisponivel
        ) : administra ? (
          <EditorEtapas inicial={etapas} />
        ) : (
          <p className="text-body-sm">Só quem administra a conta muda as etapas.</p>
        )}
      </CaixaConfig>
      <CaixaConfig
        id="retorno"
        icone={<RotateCcw aria-hidden className="size-5 text-ink-muted" />}
        titulo="Retorno a quem não seguiu"
        texto="A mensagem que a pessoa recebe quando é dispensada ou sai do processo. Vem ligada no Publike."
      >
        {!retorno ? (
          indisponivel
        ) : administra ? (
          <FormRetorno retorno={retorno} exemplo={{ nome: "Ana", vaga: "Atendente", empresa }} />
        ) : (
          <p className="text-body-sm">{retorno.ligado ? "Ligado." : "Desligado."} Só quem administra a conta muda.</p>
        )}
      </CaixaConfig>
    </>
  );
}

async function AbaCandidatura() {
  const padroes = await padroesDaConta();
  const perguntas = padroes ? lerPerguntas(padroes.perguntas) : null;
  return (
    <CaixaConfig
      id="candidatura"
      icone={<ClipboardList aria-hidden className="size-5 text-ink-muted" />}
      titulo="Como as vagas novas começam"
      texto="O formulário de publicar já vem assim. Em cada vaga, dá para mudar."
    >
      {padroes ? (
        <FormularioCandidatura inicial={padroes} perguntas={perguntas?.ok ? perguntas.perguntas : []} />
      ) : (
        indisponivel
      )}
    </CaixaConfig>
  );
}

async function AbaEntrevistas() {
  const [faixas, modelos] = await Promise.all([horariosLivres(), modelosDaConta().catch(() => null)]);
  return (
    <>
      <CaixaConfig
        id="horarios"
        icone={<CalendarClock aria-hidden className="size-5 text-ink-muted" />}
        titulo="Horários livres para entrevista"
        texto="Quando você deixar o candidato escolher o horário, “Usar meus horários livres” preenche os próximos horários vagos daqui, sem os que já estão marcados."
      >
        {faixas ? <EditorHorarios inicial={faixas} /> : indisponivel}
      </CaixaConfig>
      <CaixaConfig
        id="mensagens"
        icone={<MessageSquareText aria-hidden className="size-5 text-ink-muted" />}
        titulo="Mensagens prontas"
        texto="Para mandar a um ou a vários candidatos de uma vez, no quadro e na ficha. As automações de cada vaga também usam."
      >
        {modelos ? <ModelosDeMensagem modelos={modelos} /> : indisponivel}
      </CaixaConfig>
      <p className="text-body-sm text-ink-muted">
        As perguntas que o chat faz no match, a entrevista em vídeo e as mensagens ao mudar de etapa ficam nas Automações
        de cada vaga.
      </p>
    </>
  );
}

async function AbaContratacao({ agencia }: { agencia: boolean }) {
  const padroes = await padroesDaConta();
  return (
    <CaixaConfig
      id="contratacao"
      icone={<FileSignature aria-hidden className="size-5 text-ink-muted" />}
      titulo="A proposta e os documentos"
      texto="Cada proposta nova começa assim, e você ajusta antes de mandar."
    >
      {padroes ? <FormularioContratacao inicial={padroes} agencia={agencia} /> : indisponivel}
    </CaixaConfig>
  );
}
