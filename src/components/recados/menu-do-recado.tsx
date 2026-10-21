"use client";

import { Ellipsis, Flag, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { pedirConexao } from "@/lib/acoes/conexoes";
import { apagarRecado, denunciarRecado } from "@/lib/acoes/recados";
import { MOTIVOS_DENUNCIA } from "@/lib/constantes";

/**
 * O menu do recado: quem escreveu apaga (com confirmação ali mesmo, sem janela do navegador);
 * os outros pedem conexão com quem escreveu ou denunciam, com os motivos da denúncia de anúncio.
 */
export function MenuDoRecado({
  recadoId,
  proprio,
  logado,
  autor,
}: {
  recadoId: string;
  proprio: boolean;
  logado: boolean;
  /** quem escreveu (para o "Conectar com") */
  autor?: { id: string; nome: string };
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [passo, setPasso] = useState<"menu" | "apagar" | "denunciar">("menu");
  const [motivo, setMotivo] = useState("");
  const [detalhes, setDetalhes] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const id = useId();
  const quadro = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    const fora = (e: PointerEvent) => {
      if (quadro.current && !quadro.current.contains(e.target as Node)) setAberto(false);
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("pointerdown", fora);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("pointerdown", fora);
    };
  }, [aberto]);

  if (!logado) return null;

  function abrir() {
    setPasso("menu");
    setAviso(null);
    setAberto((a) => !a);
  }

  return (
    <div ref={quadro} className="relative z-10">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={abrir}
        className="grid size-9 place-items-center rounded-pill text-ink-muted hover:bg-surface-100 hover:text-ink"
      >
        <Ellipsis aria-hidden className="size-5" />
        <span className="sr-only">Mais opções do recado</span>
      </button>
      {aberto && (
        <div
          id={id}
          className="absolute right-0 bottom-11 z-30 w-[300px] max-w-[calc(100vw-32px)] rounded-lg border border-line bg-surface-200 p-2 text-ink shadow-raised"
        >
          {aviso ? (
            <p role="status" className={`p-2 text-body-sm ${aviso.ok ? "text-ink" : "text-danger"}`}>
              {aviso.texto}
            </p>
          ) : passo === "menu" ? (
            proprio ? (
              <button
                type="button"
                onClick={() => setPasso("apagar")}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-label hover:bg-surface-300"
              >
                <Trash2 aria-hidden className="size-[18px]" />
                Apagar recado
              </button>
            ) : (
              <>
                {autor && (
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() =>
                      iniciar(async () => {
                        const r = await pedirConexao(autor.id, null, `/recado/${recadoId}`);
                        if (!r.ok && r.ir?.startsWith("/entrar")) return router.push(r.ir);
                        setAviso(r.ok ? { ok: true, texto: r.mensagem } : { ok: false, texto: r.erro });
                      })
                    }
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-label hover:bg-surface-300 disabled:opacity-60"
                  >
                    <UserPlus aria-hidden className="size-[18px]" />
                    {pendente ? "Enviando…" : `Conectar com ${autor.nome.split(" ")[0]}`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPasso("denunciar")}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-label text-danger hover:bg-surface-300"
                >
                  <Flag aria-hidden className="size-[18px]" />
                  Denunciar recado
                </button>
              </>
            )
          ) : passo === "apagar" ? (
            <div className="flex flex-col gap-3 p-2">
              <p className="text-body-sm">
                O recado some da linha do tempo, do seu perfil e do link. Não dá para desfazer.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="min-h-10 rounded-md px-3 text-label hover:bg-surface-300"
                >
                  Manter
                </button>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() =>
                    iniciar(async () => {
                      const r = await apagarRecado(recadoId);
                      if (!r.ok) setAviso({ ok: false, texto: r.erro });
                      else {
                        setAberto(false);
                        router.refresh();
                      }
                    })
                  }
                  className="min-h-10 rounded-md bg-danger px-4 text-label font-bold text-on-terra disabled:opacity-60"
                >
                  {pendente ? "Apagando…" : "Apagar"}
                </button>
              </div>
            </div>
          ) : (
            <form
              className="flex flex-col gap-2.5 p-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!motivo) return setAviso({ ok: false, texto: "Escolha o motivo." });
                iniciar(async () => {
                  const r = await denunciarRecado(recadoId, motivo, detalhes);
                  setAviso(
                    r.ok ? { ok: true, texto: r.mensagem ?? "Denúncia enviada." } : { ok: false, texto: r.erro },
                  );
                });
              }}
            >
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-label">Por que denunciar?</legend>
                {MOTIVOS_DENUNCIA.map((m) => (
                  <label
                    key={m.valor}
                    className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-body-sm hover:bg-surface-300"
                  >
                    <input
                      type="radio"
                      name="motivo"
                      value={m.valor}
                      checked={motivo === m.valor}
                      onChange={() => setMotivo(m.valor)}
                      className="accent-ink"
                    />
                    {m.nome}
                  </label>
                ))}
              </fieldset>
              <label className="flex flex-col gap-1 text-body-sm">
                Detalhes (se quiser)
                <textarea
                  value={detalhes}
                  onChange={(e) => setDetalhes(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  className="rounded-md border border-line-strong bg-surface-200 px-3 py-2 text-body-sm"
                />
              </label>
              <button
                type="submit"
                disabled={pendente}
                className="min-h-10 self-end rounded-md bg-danger px-4 text-label font-bold text-on-terra disabled:opacity-60"
              >
                {pendente ? "Enviando…" : "Enviar denúncia"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
