import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { FormAnuncio, type ValoresAnuncio } from "@/components/form-anuncio";
import { Aviso } from "@/components/ui/basicos";
import { classesEntrada, Seletor } from "@/components/ui/campo";
import { publicarConvitePeloAdmin } from "@/lib/acoes/admin-convites";
import { TIPOS_CONTA } from "@/lib/constantes";
import { formatarFone, rascunhoValido, type Convite } from "@/lib/convites";
import { iaConfigurada } from "@/lib/ia/openai";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { UUID } from "@/lib/validacao";
import { valoresDoConvite } from "@/lib/valores-convite";

export const metadata: Metadata = { title: "Publicar com o sim da empresa" };

// A empresa respondeu "sim" no WhatsApp (ou por e-mail) mas não abriu o link: o admin confere a vaga
// lida do anúncio e publica por ela. A conta da empresa é criada aqui, se ainda não existir.
export default function PublicarConvite({ params }: PageProps<"/admin/convites/[id]/publicar">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {params.then(({ id }) => (
        <Conteudo id={id} />
      ))}
    </Suspense>
  );
}

async function Conteudo({ id }: { id: string }) {
  const c = await exigirAdminLocal();
  if (!UUID.test(id)) notFound();
  const { data } = await c.from("convites").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const convite = data as unknown as Convite;
  const { data: conta } = convite.usuario_id
    ? await c.from("perfis").select("id, nome").eq("id", convite.usuario_id).maybeSingle()
    : { data: null };
  const rascunho = rascunhoValido(convite.rascunho);
  const base: ValoresAnuncio = {
    tipo: "vaga",
    titulo: convite.vagas[0] ?? "",
    descricao: "",
    categoria: "",
    regime: null,
    pagamento_valor: null,
    pagamento_unidade: null,
    beneficios: null,
    horario: null,
    vagas: 1,
    cidade: "Goiânia",
    bairro: "",
    lat: null,
    lng: null,
  };
  const inicial = rascunho ? valoresDoConvite(rascunho, base) : base;
  const fone = convite.whatsapp[0];
  const id_ = (k: string) => `conta-${k}`;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href="/admin/convites"
        className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Convites
      </Link>
      <h2 className="text-h2">Publicar a vaga de {convite.nome}</h2>
      <p className="-mt-3 text-body text-ink-muted">
        Para quando a empresa disse “sim” mas não abriu o link. Confira a vaga (veio do anúncio dela) e publique:{" "}
        {conta
          ? `ela sai na conta ${conta.nome}.`
          : "a conta da empresa é criada agora, com os dados abaixo, e a vaga sai no nome dela."}{" "}
        O convite fica como Autorizou.
      </p>
      {convite.anuncio_id && (
        <Aviso tipo="alerta" titulo="Este convite já tem uma vaga publicada">
          Publicar de novo cria outra vaga.{" "}
          <Link href={`/anuncio/${convite.anuncio_id}`} className="underline underline-offset-2">
            Ver a vaga publicada
          </Link>
        </Aviso>
      )}
      <FormAnuncio
        inicial={inicial}
        acaoSalvar={publicarConvitePeloAdmin.bind(null, convite.id)}
        ia={iaConfigurada()}
        agencia={convite.tipo === "agencia"}
        contatoAgencia={{ whatsapp: fone ? `55${fone}` : null, email: convite.email }}
        enderecoPublico
        emNomeDe={convite.nome}
        previa={
          <section
            aria-label="Conta e autorização"
            className="flex flex-col gap-4 rounded-lg border border-line-strong bg-surface-200 p-4"
          >
            {conta ? (
              <p className="text-body-sm">
                Conta da empresa: <strong>{conta.nome}</strong> (já existe).
              </p>
            ) : (
              <fieldset className="flex flex-col gap-3">
                <legend className="text-label">Conta da empresa (criada ao publicar)</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label htmlFor={id_("nome")} className="flex flex-col gap-1 text-label">
                    Nome
                    <input
                      id={id_("nome")}
                      name="conta_nome"
                      defaultValue={convite.nome}
                      maxLength={80}
                      className={classesEntrada}
                    />
                  </label>
                  <label htmlFor={id_("tipo")} className="flex flex-col gap-1 text-label">
                    Tipo de conta
                    <Seletor
                      id={id_("tipo")}
                      name="conta_tipo"
                      defaultValue={convite.tipo === "agencia" ? "agencia" : "empresa"}
                      className={classesEntrada}
                    >
                      {(["comercio", "empresa", "agencia"] as const).map((t) => (
                        <option key={t} value={t}>
                          {TIPOS_CONTA[t].nome}
                        </option>
                      ))}
                    </Seletor>
                  </label>
                  <label htmlFor={id_("whatsapp")} className="flex flex-col gap-1 text-label">
                    WhatsApp (recebe os candidatos)
                    <input
                      id={id_("whatsapp")}
                      name="conta_whatsapp"
                      inputMode="tel"
                      defaultValue={fone ? formatarFone(fone) : ""}
                      placeholder="(62) 99999-0000"
                      className={classesEntrada}
                    />
                  </label>
                  <label htmlFor={id_("email")} className="flex flex-col gap-1 text-label">
                    E-mail (é por ele que a empresa entra)
                    <input
                      id={id_("email")}
                      name="conta_email"
                      type="email"
                      defaultValue={convite.email ?? ""}
                      placeholder="contato@empresa.com.br"
                      className={classesEntrada}
                    />
                    <span className="text-body-sm font-normal text-ink-muted">
                      O Publike entra só pelo e-mail. Sem ele, a vaga sai, mas a empresa só consegue entrar depois que
                      você colocar um e-mail na conta.
                    </span>
                  </label>
                  {convite.tipo === "agencia" && (
                    <label htmlFor={id_("cnpj")} className="flex flex-col gap-1 text-label">
                      CNPJ da agência
                      <input id={id_("cnpj")} name="conta_cnpj" inputMode="numeric" className={classesEntrada} />
                    </label>
                  )}
                </div>
              </fieldset>
            )}
            <label className="flex items-start gap-3 text-body-sm">
              <input type="checkbox" name="autorizou" className="mt-0.5 size-5 accent-[var(--pk-ink)]" />
              <span>
                <span className="text-label">{convite.nome} autorizou a publicação</span>
                <span className="block text-ink-muted">Respondeu “sim” ao convite, no WhatsApp ou por e-mail.</span>
              </span>
            </label>
            <label htmlFor="como-autorizou" className="flex flex-col gap-1 text-label">
              Como autorizou (opcional, fica anotado no convite)
              <input
                id="como-autorizou"
                name="como_autorizou"
                maxLength={300}
                placeholder="ex.: respondeu “pode publicar” no WhatsApp"
                className={classesEntrada}
              />
            </label>
          </section>
        }
      />
    </div>
  );
}
