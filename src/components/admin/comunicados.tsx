"use client";

import { Bell, Megaphone, Send } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { contarComunicado, enviarComunicado } from "@/lib/acoes/admin";
import { PUBLICOS_COMUNICADO, type PublicoComunicado } from "@/lib/comunicados";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada, ligarCampo } from "../ui/campo";

const INICIAL: EstadoForm = { ok: false };
const enviarComunicadoProtegido = protegerAcao(enviarComunicado);
const MAXIMO = 240;

/**
 * Escrever e mandar um comunicado no sino: o público, o texto e o link (opcional). Mostra quantas contas
 * recebem antes de mandar e pede confirmação.
 */
export function FormComunicado({
  inicial,
}: {
  inicial: { publico: PublicoComunicado; texto: string; link: string } | null;
}) {
  const [estado, acao, enviando] = useActionState(enviarComunicadoProtegido, INICIAL);
  const [publico, setPublico] = useState<PublicoComunicado>(inicial?.publico ?? "todos");
  const [texto, setTexto] = useState(inicial?.texto ?? "");
  const [link, setLink] = useState(inicial?.link ?? "");
  const [conta, setConta] = useState<{ total?: number; erro?: string } | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const erros = estado.erros ?? {};

  // quantas contas recebem: o público e o link mudam a conta (quem já recebeu o mesmo link fica de fora)
  useEffect(() => {
    let ativo = true;
    const espera = setTimeout(() => {
      contarComunicado(publico, link).then(
        (r) => ativo && setConta(r.ok ? { total: r.total ?? 0 } : { erro: r.erro }),
        () => ativo && setConta({ erro: "Não deu para contar agora." }),
      );
    }, 400);
    return () => {
      ativo = false;
      clearTimeout(espera);
    };
  }, [publico, link, estado]);

  // mandou: volta para o primeiro passo
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o resultado do envio fecha a confirmação
    if (estado.ok || estado.erro) setConfirmar(false);
  }, [estado]);

  const total = conta?.total ?? 0;
  return (
    <form action={acao} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label">Quem recebe</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PUBLICOS_COMUNICADO.map((p) => (
            <label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-body-sm">
              <input
                type="radio"
                name="publico"
                value={p.id}
                checked={publico === p.id}
                onChange={() => {
                  setPublico(p.id);
                  setConfirmar(false);
                }}
                className="size-5 shrink-0 accent-[var(--pk-ink)]"
              />
              {p.nome}
            </label>
          ))}
        </div>
        <p className="text-body-sm text-ink-muted">
          O aparelho é o do último acesso da conta. Contas bloqueadas ficam de fora.
        </p>
      </fieldset>

      <Campo rotulo="Texto" nome="texto" erro={erros.texto} ajuda={`${texto.length} de ${MAXIMO} letras.`}>
        <textarea
          {...ligarCampo("texto", erros.texto, true)}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value.slice(0, MAXIMO));
            setConfirmar(false);
          }}
          rows={3}
          required
          minLength={10}
          maxLength={MAXIMO}
          className={classesEntrada}
        />
      </Campo>

      <Campo
        rotulo="Link"
        nome="link"
        erro={erros.link}
        opcional
        ajuda="Uma página do site, começando com / (ex.: /testar-app?de=sino). Com link, quem já recebeu um comunicado com o mesmo link não recebe de novo."
      >
        <input
          {...ligarCampo("link", erros.link, true)}
          value={link}
          onChange={(e) => {
            setLink(e.target.value.trim());
            setConfirmar(false);
          }}
          autoComplete="off"
          spellCheck={false}
          placeholder="/testar-app?de=sino"
          className={classesEntrada}
        />
      </Campo>

      {texto.trim().length >= 10 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-label text-ink-muted">Como aparece no sino</p>
          <div className="flex max-w-md gap-3 rounded-lg border border-line bg-surface-100 p-3 text-body-sm">
            <Megaphone aria-hidden className="mt-0.5 size-5 shrink-0 text-terra-text" />
            <p>{texto.trim()}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-body-sm" role="status">
          <Bell aria-hidden className="mr-1 inline size-4 align-[-3px] text-ink-muted" />
          {conta?.erro ? (
            <span className="text-danger">{conta.erro}</span>
          ) : conta ? (
            <>
              <strong>{total}</strong> {total === 1 ? "conta recebe" : "contas recebem"} agora
            </>
          ) : (
            "Contando…"
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {confirmar ? (
            <>
              {/* as chaves: o botão de confirmar é outro elemento (senão o clique em "Mandar" já enviaria) */}
              <Botao key="confirmar" type="submit" variante="primario" disabled={enviando}>
                <Send aria-hidden />
                {enviando ? "Mandando…" : `Confirmar: mandar para ${total}`}
              </Botao>
              <Botao key="cancelar" type="button" disabled={enviando} onClick={() => setConfirmar(false)}>
                Cancelar
              </Botao>
            </>
          ) : (
            <Botao
              key="mandar"
              type="button"
              disabled={!conta || Boolean(conta.erro) || total === 0 || texto.trim().length < 10}
              onClick={() => setConfirmar(true)}
            >
              <Send aria-hidden />
              Mandar no sino
            </Botao>
          )}
        </div>
        <p className="text-body-sm text-ink-muted">Só no sino: sem e-mail e sem notificação no celular.</p>
      </div>

      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
      {estado.ok && estado.mensagem && <Aviso tipo="sucesso">{estado.mensagem}</Aviso>}
    </form>
  );
}
