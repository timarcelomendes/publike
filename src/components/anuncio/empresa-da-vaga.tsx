"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import type { ClienteParaVaga } from "@/lib/clientes";
import { formatarTelefone } from "@/lib/formato";
import { Campo, classesEntrada, ligarCampo, Seletor } from "../ui/campo";

/** No seletor: a empresa escrita à mão, fora da lista de clientes. */
const OUTRA = "outra";

/**
 * Vaga de agência: para qual empresa é. Com clientes cadastrados, a agência escolhe um
 * (o nome e o endereço vêm dele) ou escreve outra, que pode ficar guardada em Clientes.
 * Confidencial: na vaga aparece "Empresa confidencial", mas a agência sabe de quem é.
 */
export function EmpresaDaVaga({
  clientes,
  inicial,
  erros,
  confidencial,
  aoMudarConfidencial,
  aoEscolherCliente,
  equipe,
  emNomeDe,
  contatoAgencia,
}: {
  /** os clientes da agência (null: sem a lista, como na moderação e no admin; vazia: nenhum ainda) */
  clientes: ClienteParaVaga[] | null;
  inicial: { cliente_id: string | null; contratante: string | null };
  erros: Record<string, string>;
  confidencial: boolean;
  aoMudarConfidencial: (confidencial: boolean) => void;
  /** a agência escolheu um cliente na lista (o formulário traz o lugar dele) */
  aoEscolherCliente: (cliente: ClienteParaVaga) => void;
  equipe: boolean;
  emNomeDe: string | null;
  contatoAgencia: { whatsapp: string | null; email: string | null } | null;
}) {
  const comLista = Boolean(clientes?.length);
  const [escolha, setEscolha] = useState(() =>
    inicial.cliente_id && clientes?.some((c) => c.id === inicial.cliente_id)
      ? inicial.cliente_id
      : comLista && inicial.contratante
        ? OUTRA
        : "",
  );
  const [guardar, setGuardar] = useState(true);
  const campoNome = useRef<HTMLInputElement>(null);
  const escolhido = clientes?.find((c) => c.id === escolha) ?? null;
  const escrevendo = !comLista || escolha === OUTRA;
  // confidencial e sem guardar em Clientes: o nome não iria a lugar nenhum
  const nomeDesligado = confidencial && !(clientes && guardar);
  const erro = erros.contratante ?? erros.cliente_id;
  const ajudaConfidencial = "Quem procura vaga vê “Empresa confidencial”.";

  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-300 p-4">
      <input type="hidden" name="agencia" value="1" />
      {clientes && <input type="hidden" name="cliente_id" value={escolhido?.id ?? ""} />}

      {comLista && (
        <Campo
          rotulo="Para qual empresa é a vaga?"
          nome="cliente"
          erro={escrevendo ? undefined : erro}
          ajuda={
            escolhido
              ? confidencial
                ? `${ajudaConfidencial} A vaga fica guardada em ${escolhido.nome}, só para você.`
                : "O nome do cliente aparece na vaga, junto com o da agência."
              : "Escolha um dos seus clientes ou escreva outra empresa."
          }
        >
          <Seletor
            {...ligarCampo("cliente", escrevendo ? undefined : erro, true)}
            name={undefined}
            value={escolha}
            onChange={(e) => {
              const valor = e.target.value;
              setEscolha(valor);
              const c = clientes?.find((x) => x.id === valor);
              if (c) {
                aoMudarConfidencial(c.confidencial);
                aoEscolherCliente(c);
              }
              if (valor === OUTRA) window.setTimeout(() => campoNome.current?.focus(), 0);
            }}
            className={classesEntrada}
          >
            <option value="">Escolha o cliente</option>
            {clientes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.arquivado ? " (arquivado)" : ""}
              </option>
            ))}
            <option value={OUTRA}>Outra empresa (escrever o nome)</option>
          </Seletor>
        </Campo>
      )}

      {escrevendo && (
        <Campo
          rotulo={comLista ? "Nome da empresa" : "Para qual empresa é a vaga?"}
          nome="contratante"
          erro={erro}
          ajuda={
            confidencial
              ? clientes && guardar
                ? `${ajudaConfidencial} O nome fica só com você, em Clientes.`
                : `${ajudaConfidencial} Conte o ramo na descrição, como “indústria de alimentos”.`
              : "O nome aparece na vaga, junto com o da agência. Sem telefone, e-mail ou site."
          }
        >
          <input
            ref={campoNome}
            {...ligarCampo("contratante", erro, true)}
            defaultValue={inicial.cliente_id ? "" : (inicial.contratante ?? "")}
            disabled={nomeDesligado}
            maxLength={80}
            autoComplete="off"
            placeholder="Ex.: Distribuidora Cerrado"
            className={classesEntrada}
          />
        </Campo>
      )}

      {escrevendo && clientes && (
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 self-start text-body-sm">
          <input
            type="checkbox"
            name="guardar_cliente"
            checked={guardar}
            onChange={(e) => setGuardar(e.target.checked)}
            className="size-5 shrink-0 accent-[var(--pk-ink)]"
          />
          Guardar em Clientes, para escolher nas próximas vagas
        </label>
      )}

      <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 self-start text-label">
        <input
          type="checkbox"
          name="contratante_confidencial"
          checked={confidencial}
          onChange={(e) => aoMudarConfidencial(e.target.checked)}
          className="size-5 accent-[var(--pk-ink)]"
        />
        Empresa confidencial
      </label>

      {clientes && !equipe && !emNomeDe && (
        <p className="text-body-sm text-ink-muted">
          Cadastre e edite as empresas em{" "}
          <Link href="/painel/clientes" className="underline underline-offset-2 hover:text-ink">
            Clientes
          </Link>
          : CNPJ, endereço, contato e anotações ficam só com você.
        </p>
      )}

      {!equipe && (
        <div className="mt-1 flex gap-3 border-t border-line pt-3 text-body-sm">
          <MessageCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
          <p className="text-ink-muted">
            <span className="text-ink">No match, o candidato fala com a agência</span>, não com a empresa contratante:
            recebe o WhatsApp{" "}
            {contatoAgencia?.whatsapp ? (
              <span className="text-ink">{formatarTelefone(contatoAgencia.whatsapp)}</span>
            ) : (
              "da agência"
            )}
            {contatoAgencia?.email && (
              <>
                {" "}
                e o e-mail <span className="text-ink">{contatoAgencia.email}</span>
              </>
            )}
            .{" "}
            {!emNomeDe && (
              <Link href="/perfil" className="underline underline-offset-2 hover:text-ink">
                Trocar no perfil
              </Link>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
