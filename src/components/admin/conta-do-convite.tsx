import { classesEntrada, Seletor } from "@/components/ui/campo";
import { TIPOS_CONTA } from "@/lib/constantes";
import { formatarFone, type Convite } from "@/lib/convites";

/**
 * Quem disse "sim" ao convite: a conta (já existe, ou os dados para criar) e a autorização.
 * Vai junto do formulário da vaga (empresa) ou da vitrine (prestador). Os campos vêm com "conta_".
 */
export function ContaDoConvite({ convite, conta }: { convite: Convite; conta: { nome: string } | null }) {
  const prestador = convite.tipo === "prestador";
  const fone = convite.whatsapp[0];
  const id_ = (k: string) => `conta-${k}`;
  return (
    <section
      aria-label="Conta e autorização"
      className="flex flex-col gap-4 rounded-lg border border-line-strong bg-surface-200 p-4"
    >
      {conta ? (
        <p className="text-body-sm">
          {prestador ? "Conta" : "Conta da empresa"}: <strong>{conta.nome}</strong> (já existe).
        </p>
      ) : (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-label">
            {prestador ? "Conta de quem presta o serviço (criada ao salvar)" : "Conta da empresa (criada ao publicar)"}
          </legend>
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
                defaultValue={prestador ? "pessoa" : convite.tipo === "agencia" ? "agencia" : "empresa"}
                className={classesEntrada}
              >
                {(prestador
                  ? (["pessoa", "comercio", "empresa"] as const)
                  : (["comercio", "empresa", "agencia"] as const)
                ).map((t) => (
                  <option key={t} value={t}>
                    {TIPOS_CONTA[t].nome}
                  </option>
                ))}
              </Seletor>
            </label>
            <label htmlFor={id_("whatsapp")} className="flex flex-col gap-1 text-label">
              {prestador ? "WhatsApp (recebe os clientes)" : "WhatsApp (recebe os candidatos)"}
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
              {prestador ? "E-mail (é por ele que a pessoa entra)" : "E-mail (é por ele que a empresa entra)"}
              <input
                id={id_("email")}
                name="conta_email"
                type="email"
                defaultValue={convite.email ?? ""}
                placeholder={prestador ? "seunome@gmail.com" : "contato@empresa.com.br"}
                className={classesEntrada}
              />
              <span className="text-body-sm font-normal text-ink-muted">
                O Publike entra só pelo e-mail. Sem ele, {prestador ? "a vitrine sai" : "a vaga sai"}, mas só dá para
                entrar depois que tiver um e-mail na conta (ou pelo link de acesso no WhatsApp).
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
          placeholder={prestador ? "ex.: respondeu “pode” no WhatsApp" : "ex.: respondeu “pode publicar” no WhatsApp"}
          className={classesEntrada}
        />
      </label>
    </section>
  );
}
