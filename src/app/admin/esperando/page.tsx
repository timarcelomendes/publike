import { Hourglass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AvisarEmpresa } from "@/components/admin/avisar-empresa";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao } from "@/components/admin/ui";
import { Selo, Vazio } from "@/components/ui/basicos";
import { type EmpresaEsperando, empresasComGenteEsperando, type PessoaEsperando } from "@/lib/admin/dados";
import { formatarTelefone, plural, primeiro, rotuloConta, tempoRelativo } from "@/lib/formato";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Esperando" };

// As empresas com gente esperando nas vagas no ar: quem curtiu e espera o aceite e quem deu match e ainda
// não recebeu mensagem. Para o admin avisar a empresa pelo próprio WhatsApp (a mensagem sai pronta, com
// o link para responder). A espera mais antiga primeiro.

export default function Esperando({ searchParams }: PageProps<"/admin/esperando">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

/** Os filtros da espera: todas, ou só quem curtiu e espera o aceite há mais de N horas (o que o Painel conta). */
const ESPERAS = [24, 48, 72];

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/esperando">["searchParams"] }) {
  const c = await exigirAdminLocal();
  const agora = await agoraDaRequisicao();
  const pedido = Number(primeiro((await searchParams).mais_de));
  const horas = ESPERAS.includes(pedido) ? pedido : null;
  const todas = await empresasComGenteEsperando(c, agora);
  // com o filtro: só quem curtiu há mais de N horas (e as empresas delas); o "deram match sem mensagem" fica de fora
  const filtrar = (h: number) =>
    todas
      .map((e) => ({
        ...e,
        esperando: e.esperando.filter((p) => Date.parse(p.desde) < agora - h * 3600e3),
        semConversa: [],
      }))
      .filter((e) => e.esperando.length > 0);
  const empresas = horas ? filtrar(horas) : todas;
  const contar = (lista: EmpresaEsperando[]) =>
    lista.reduce((t, e) => t + e.esperando.length + e.semConversa.length, 0);
  const filtros = [
    { href: "/admin/esperando", nome: "Todas", n: contar(todas), atual: horas === null },
    ...ESPERAS.map((h) => ({
      href: `/admin/esperando?mais_de=${h}`,
      nome: `Curtiram há mais de ${h} h`,
      n: contar(filtrar(h)),
      atual: horas === h,
    })),
  ];
  const pessoas = empresas.reduce((t, e) => t + e.esperando.length + e.semConversa.length, 0);
  const semEmail = empresas.filter((e) => e.semEmail).length;

  return (
    <Secao
      titulo="Esperando a empresa"
      descricao="Empresas com gente esperando nas vagas no ar: quem curtiu e espera o aceite, e quem deu match (nos últimos 30 dias) e ainda não recebeu mensagem. Monte a mensagem e mande pelo seu WhatsApp; ela leva o link para a empresa responder (a conta que nunca entrou recebe o link de acesso)."
    >
      <nav aria-label="Filtrar a espera" className="-mx-1 overflow-x-auto px-1">
        <ul className="flex min-w-max gap-2">
          {filtros.map((f) => (
            <li key={f.href}>
              <Link
                href={f.href}
                aria-current={f.atual ? "true" : undefined}
                className={`inline-flex h-10 items-center gap-1.5 rounded-pill border px-4 text-label ${
                  f.atual ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-300 text-ink"
                }`}
              >
                {f.nome}
                <span className={f.atual ? "text-surface-300" : "text-ink-muted"}>{f.n}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {horas && (
        <p className="text-body-sm text-ink-muted">
          Só quem curtiu há mais de {horas} horas e ainda espera o aceite (o número do Painel).{" "}
          <Link href="/admin/esperando" className="underline underline-offset-2">
            Ver todas as esperas
          </Link>
        </p>
      )}
      {empresas.length === 0 ? (
        <Vazio icone={Hourglass} titulo={horas ? `Ninguém esperando há mais de ${horas} h` : "Ninguém esperando agora"}>
          Quando alguém curtir uma vaga e a empresa demorar a responder, aparece aqui.
        </Vazio>
      ) : (
        <>
          <p className="text-body-sm text-ink-muted">
            {plural(empresas.length, "empresa", "empresas")}, {plural(pessoas, "pessoa esperando", "pessoas esperando")}
            {semEmail > 0 &&
              `. ${semEmail === 1 ? "1 conta não tem e-mail e vem primeiro" : `${semEmail} contas não têm e-mail e vêm primeiro`}: só ficam sabendo pelo WhatsApp`}
            .
          </p>
          <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
            <Selo variante="novo">Novo</Selo>
            Cada empresa mostra se já entrou no Publike e quando foi a última vez (e se entrou depois do seu aviso).
          </p>
          <ul className="flex flex-col gap-4">
            {empresas.map((e) => (
              <li key={e.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="flex flex-col">
                    <Link href={`/admin/usuarios/${e.id}`} className="text-label underline-offset-2 hover:underline">
                      {e.nome}
                    </Link>
                    <span className="text-caption text-ink-muted">
                      {rotuloConta(e.tipo)}
                      {e.whatsapp ? ` · WhatsApp ${formatarTelefone(e.whatsapp)}` : " · sem WhatsApp"}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1 text-body-sm text-ink-muted">
                    espera desde {tempoRelativo(e.maisAntiga, agora)}
                    {e.avisadaEm && (
                      <span className="text-caption text-cerrado-text">
                        avisada {tempoRelativo(e.avisadaEm, agora)}
                      </span>
                    )}
                    <Acesso empresa={e} agora={agora} />
                  </span>
                </div>
                {e.semEmail && (
                  <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
                    <Selo variante="aviso">Sem e-mail</Selo>
                    Não recebe os avisos por e-mail: só fica sabendo pelo WhatsApp.
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {e.esperando.length > 0 && (
                    <Lista titulo="Curtiram e esperam o aceite" pessoas={e.esperando} agora={agora} />
                  )}
                  {e.semConversa.length > 0 && (
                    <Lista titulo="Deram match, sem mensagem da empresa" pessoas={e.semConversa} agora={agora} />
                  )}
                </div>
                <AvisarEmpresa contaId={e.id} pessoas={e.esperando.length + e.semConversa.length} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Secao>
  );
}

function Lista({ titulo, pessoas, agora }: { titulo: string; pessoas: PessoaEsperando[]; agora: number }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body-sm font-semibold">
        {titulo} ({pessoas.length})
      </p>
      <ul className="flex flex-col gap-0.5 text-body-sm">
        {pessoas.map((p, i) => (
          <li key={i}>
            {p.nome}, {p.vaga} <span className="text-ink-muted">· {tempoRelativo(p.desde, agora)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Se a empresa já entrou no Publike, quando foi a última vez e se foi depois do aviso pelo WhatsApp. */
function Acesso({ empresa: e, agora }: { empresa: EmpresaEsperando; agora: number }) {
  if (e.nuncaEntrou) return <Selo variante="aviso">Nunca entrou</Selo>;
  if (!e.ultimoAcesso) return null;
  const depoisDoAviso = e.avisadaEm ? e.ultimoAcesso > e.avisadaEm : null;
  return (
    <span
      className={`text-caption ${depoisDoAviso === false ? "text-terra-text" : depoisDoAviso ? "text-cerrado-text" : ""}`}
    >
      entrou {tempoRelativo(e.ultimoAcesso, agora)}
      {depoisDoAviso === true && " · depois do aviso"}
      {depoisDoAviso === false && " · não voltou desde o aviso"}
    </span>
  );
}
