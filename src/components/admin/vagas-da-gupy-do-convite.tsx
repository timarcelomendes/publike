"use client";

import { ExternalLink } from "lucide-react";
import { useActionState } from "react";
import { autorizarVagasDaGupy } from "@/lib/acoes/admin-convites";
import { CIDADES } from "@/lib/constantes";
import type { Convite } from "@/lib/convites";
import { PRACA_PADRAO } from "@/lib/pracas";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";
import { ContaDoConvite } from "./conta-do-convite";

/**
 * A empresa com as vagas na Gupy disse "sim": a conta (a que já existe, ou os dados para criar, com a cidade) e a
 * autorização. Ao seguir, a conta é criada e abre o "Puxar do link da Gupy" dela, já com a lista das vagas.
 */
export function VagasDaGupyDoConvite({
  convite,
  conta,
  pagina,
}: {
  convite: Convite;
  conta: { nome: string } | null;
  /** https://empresa.gupy.io/ */
  pagina: string;
}) {
  const [estado, acao, enviando] = useActionState(autorizarVagasDaGupy.bind(null, convite.id), {
    ok: false,
  } as EstadoForm);
  // sem WhatsApp, a conta começa com o telefone (as vagas da Gupy não mandam candidato para o número)
  const comFone = convite.whatsapp.length ? convite : { ...convite, whatsapp: convite.telefones.slice(0, 1) };
  return (
    <form action={acao} className="flex flex-col gap-5">
      <a
        href={pagina}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-10 items-center gap-1.5 self-start text-body-sm underline underline-offset-2"
      >
        <ExternalLink aria-hidden className="size-4" />
        Ver as vagas de {convite.nome} na Gupy
      </a>
      <ContaDoConvite convite={comFone} conta={conta} />
      {!conta && (
        <fieldset className="grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-2">
          <legend className="px-1 text-label">Onde fica a empresa</legend>
          <label htmlFor="conta-cidade" className="flex flex-col gap-1 text-label">
            Cidade
            <Seletor
              id="conta-cidade"
              name="conta_cidade"
              defaultValue={PRACA_PADRAO.cidade}
              className={classesEntrada}
            >
              {CIDADES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Seletor>
          </label>
          <label htmlFor="conta-bairro" className="flex flex-col gap-1 text-label">
            Bairro (opcional)
            <input id="conta-bairro" name="conta_bairro" maxLength={80} className={classesEntrada} />
          </label>
          <p className="text-body-sm text-ink-muted sm:col-span-2">
            É o lugar da conta. Cada vaga sai com o endereço que está na Gupy.
          </p>
        </fieldset>
      )}
      {!estado.ok && estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      <Botao type="submit" variante="primario" disabled={enviando} className="self-start">
        {enviando ? "Abrindo…" : conta ? "Ver as vagas da Gupy" : "Criar a conta e ver as vagas da Gupy"}
      </Botao>
    </form>
  );
}
