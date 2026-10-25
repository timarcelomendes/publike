"use client";

import { useEffect, useState, type ReactNode } from "react";
import { lerVitrine } from "@/lib/rascunho-servicos";
import { FormServicos, type ValoresServicos } from "./form-servicos";
import { Aviso } from "./ui/basicos";

/**
 * A vitrine com o rascunho de quem preencheu sem conta: sem conta, ele volta a cada visita; depois de
 * entrar (`rascunho`), volta uma vez, junto dos serviços que a conta já tem, para conferir e salvar.
 */
export function VitrineComRascunho({
  inicial,
  usuarioId,
  semConta = false,
  rascunho = false,
  extras,
}: {
  inicial: ValoresServicos;
  usuarioId: string;
  semConta?: boolean;
  /** voltou do /entrar pelo "Entrar e publicar" */
  rascunho?: boolean;
  extras?: ReactNode;
}) {
  const [valores, setValores] = useState<ValoresServicos | null>(null);

  useEffect(() => {
    if (!semConta && !rascunho) return;
    const r = lerVitrine(semConta);
    if (!r) return;
    const comConta = inicial.servicos.length > 0;
    const novos = r.servicos.filter(
      (s) => !inicial.servicos.some((x) => x.titulo.trim().toLowerCase() === s.titulo.trim().toLowerCase()),
    );
    // a conta já tem vitrine: os serviços do rascunho entram junto; onde fica e onde atende ficam os dela
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lido do navegador depois de montar
    setValores(comConta ? { ...inicial, servicos: [...inicial.servicos, ...novos] } : r);
  }, [semConta, rascunho, inicial]);

  return (
    <>
      {valores && (
        <Aviso tipo="info" className="mb-6">
          {semConta
            ? "Voltamos com o que você tinha preenchido. Toque em “Entrar e publicar” quando quiser."
            : "Voltamos com o que você preencheu antes de entrar. Confira, ponha fotos se quiser e toque em “Salvar meus serviços”."}
        </Aviso>
      )}
      <FormServicos
        key={valores ? "rascunho" : "inicial"}
        inicial={valores ?? inicial}
        usuarioId={usuarioId}
        semConta={semConta}
        extras={extras}
      />
    </>
  );
}
