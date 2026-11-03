import { Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Copiar } from "@/components/admin/pagamentos";
import { ConvitesDoTestador, FormTestadores, TirarTestador } from "@/components/admin/testadores";
import { Filtros, linkCom, Secao } from "@/components/admin/ui";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { ACEITAR_TESTE } from "@/lib/android";
import { formatarTelefone, primeiro, tempoRelativo } from "@/lib/formato";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { whatsappDoTestador, type Testador, type TipoDeMensagem } from "@/lib/testadores-app";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Testadores do app" };

// O teste fechado do app na Play pela lista de e-mails (migração 20270128120000): a lista, os e-mails para colar
// na Play Console e o convite de cada um, no WhatsApp ou no e-mail. Só no admin, no computador do dono.

export default function Testadores({ searchParams }: PageProps<"/admin/testadores">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

const MENSAGENS = [
  { valor: "convite", nome: "Convite" },
  { valor: "lembrete", nome: "Lembrete (entrou no grupo e parou)" },
];

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/testadores">["searchParams"] }) {
  const c = await exigirAdminLocal();
  const tipo: TipoDeMensagem = primeiro((await searchParams).mensagem) === "lembrete" ? "lembrete" : "convite";
  const { data, error } = await c.rpc("admin_testadores_app");
  if (error) {
    return (
      <Aviso tipo="alerta" titulo="Rode a migração dos testadores">
        Falta a migração 20270128120000_testadores_app.sql neste banco.
      </Aviso>
    );
  }
  const lista = (data ?? []) as unknown as Testador[];
  const agora = await agoraDaRequisicao();
  const emails = lista.map((t) => t.email).join(", ");
  const faltam = lista.filter((t) => !t.whatsapp_em && !t.email_em).length;

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Testadores do app"
        descricao="O teste fechado na Play pela lista de e-mails, sem o Grupo do Google. 1) Ponha as pessoas aqui (quem pede em publike.org/testar-app, no “Quero testar”, entra sozinho). 2) Copie os e-mails e cole na Play Console (Teste fechado › Testadores › Listas de e-mail) e salve. 3) Espere uns minutos e mande o convite de cada um: o botão abre o WhatsApp ou o e-mail com a mensagem pronta, e você envia."
      >
        <FormTestadores />
      </Secao>

      <Secao
        titulo={`Na lista: ${lista.length}`}
        descricao={
          lista.length
            ? `${faltam ? `${faltam} ainda sem convite. ` : "Todos já receberam o convite. "}O Google pede 12 pessoas ou mais inscritas por 14 dias seguidos.`
            : undefined
        }
      >
        {lista.length === 0 ? (
          <Vazio icone={Smartphone} titulo="Ninguém na lista ainda">
            Cole acima o nome, o e-mail da Play Store e o WhatsApp de quem topou testar.
          </Vazio>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-label">Os e-mails, para a lista da Play Console</span>
              <Copiar valor={emails} rotulo="os e-mails dos testadores" />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-label">O link de aceite (vai na mensagem)</span>
              <Copiar valor={ACEITAR_TESTE} rotulo="o link de aceite do teste" />
            </div>
            <Filtros
              rotulo="Mensagem"
              opcoes={MENSAGENS}
              atual={tipo}
              link={(v) => linkCom("/admin/testadores", {}, { mensagem: v === "convite" ? null : v })}
            />
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface-100">
              {lista.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-label">{t.nome}</span>
                    <span className="text-body-sm break-all text-ink-muted">
                      {t.email}
                      {whatsappDoTestador(t)
                        ? ` · ${formatarTelefone(whatsappDoTestador(t)!)}${t.whatsapp ? "" : " (da conta)"}`
                        : " · sem WhatsApp"}
                    </span>
                    <span className="text-caption text-ink-muted">
                      {t.conta_id ? (
                        <>
                          Conta no Publike:{" "}
                          <Link href={`/admin/usuarios/${t.conta_id}`} className="underline-offset-2 hover:underline">
                            {t.conta_nome}
                          </Link>
                        </>
                      ) : (
                        "Sem conta no Publike com este e-mail"
                      )}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {t.whatsapp_em && <Selo variante="match">WhatsApp {tempoRelativo(t.whatsapp_em, agora)}</Selo>}
                      {t.email_em && <Selo variante="match">E-mail {tempoRelativo(t.email_em, agora)}</Selo>}
                      {!t.whatsapp_em && !t.email_em && <Selo variante="contorno">Sem convite</Selo>}
                      {t.origem === "site" && <Selo variante="contorno">Pediu pelo site</Selo>}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <ConvitesDoTestador t={t} tipo={tipo} />
                    <TirarTestador id={t.id} nome={t.nome} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Secao>
    </div>
  );
}
