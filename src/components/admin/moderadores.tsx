"use client";

import { Eye, EyeOff, UserPlus } from "lucide-react";
import { useActionState } from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { adicionarModerador, liberarPainelNoSite } from "@/lib/acoes/admin";

import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";
import { Campo, classesEntrada, ligarCampo } from "../ui/campo";

const INICIAL: EstadoForm = { ok: false };
const adicionarProtegido = protegerAcao(adicionarModerador);

export function FormNovoModerador() {
  const [estado, acao, enviando] = useActionState(adicionarProtegido, INICIAL);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Campo
          rotulo="E-mail da pessoa"
          nome="email"
          erro={estado.erros?.email}
          ajuda="Ela precisa já ter entrado no Publike e criado o perfil."
          className="flex-1"
        >
          <input {...ligarCampo("email", estado.erros?.email, true)} type="email" required className={classesEntrada} />
        </Campo>
        <Botao type="submit" disabled={enviando} className="sm:mb-7">
          <UserPlus aria-hidden />
          {enviando ? "Adicionando…" : "Pôr na moderação"}
        </Botao>
      </div>
      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado.ok && estado.mensagem && <Aviso tipo="sucesso">{estado.mensagem}</Aviso>}
    </form>
  );
}

/** Liga ou desliga o Painel no site (/equipe) para uma conta @publike.org. */
export function BotaoPainelNoSite({ usuarioId, liberado }: { usuarioId: string; liberado: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-end gap-1">
      <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(() => liberarPainelNoSite(usuarioId, !liberado))}>
        {liberado ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        {liberado ? "Tirar o acesso" : "Liberar o Painel"}
      </Botao>
      {mensagem}
    </div>
  );
}
