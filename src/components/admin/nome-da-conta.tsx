"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { corrigirNome } from "@/lib/acoes/admin";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada, ligarCampo } from "../ui/campo";

const INICIAL: EstadoForm = { ok: false };
const corrigirNomeProtegido = protegerAcao(corrigirNome);

/** Corrigir o nome da conta: o que aparece no perfil, nas vagas e nas conversas. */
export function FormNomeDaConta({ usuarioId, nome }: { usuarioId: string; nome: string }) {
  const [estado, acao, enviando] = useActionState(corrigirNomeProtegido, INICIAL);
  const erro = estado.erros?.nome;
  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="usuario_id" value={usuarioId} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Campo
          rotulo="Nome no Publike"
          nome="nome"
          erro={erro}
          ajuda="Aparece no perfil, nas vagas e nas conversas. A troca fica no registro da equipe."
          className="flex-1"
        >
          <input
            {...ligarCampo("nome", erro, true)}
            defaultValue={nome}
            key={nome}
            required
            minLength={2}
            maxLength={80}
            autoComplete="off"
            className={classesEntrada}
          />
        </Campo>
        <Botao type="submit" disabled={enviando} className="sm:mt-7">
          <Check aria-hidden />
          {enviando ? "Salvando…" : "Salvar nome"}
        </Botao>
      </div>
      {estado.erro && !erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado.ok && estado.mensagem && <Aviso tipo="sucesso">{estado.mensagem}</Aviso>}
    </form>
  );
}
