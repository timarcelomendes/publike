import { qrSvg } from "@/lib/qr";
import type { CurriculoImpresso } from "@/lib/rota-curriculo";

/**
 * Uma folha A4 do currículo da rota (claude/plano-base-de-empresas-da-receita.md, parte 2): "Para: <lugar>" no alto e,
 * com `link`, o QR code daquela cópia. A mesma folha aparece na página do QR (sem o QR).
 */
export function FolhaCurriculo({
  cv,
  para,
  link,
}: {
  cv: CurriculoImpresso;
  para: string;
  /** o endereço da cópia (o QR code); sem ele, a folha vai sem QR */
  link?: string;
}) {
  return (
    <article className="folha-cv mx-auto flex w-full max-w-[210mm] flex-col gap-4 bg-white p-6 text-[#1f1a14] sm:p-10 print:max-w-none print:p-0">
      <header className="flex items-start justify-between gap-4 border-b border-[#1f1a14]/20 pb-4">
        <div className="min-w-0">
          <p className="text-[13px] text-[#1f1a14]/70">Para: {para}</p>
          <h2 className="mt-1 text-[26px] font-semibold leading-tight">{cv.nome}</h2>
          {cv.titulo && <p className="text-[16px]">{cv.titulo}</p>}
          <p className="mt-2 text-[14px]">
            {[cv.whatsapp && `WhatsApp ${cv.whatsapp}`, cv.email, [cv.bairro, cv.cidade].filter(Boolean).join(", ")]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        </div>
        {link && (
          <div className="flex w-[92px] shrink-0 flex-col items-center gap-1 text-center">
            <span className="block size-[92px]" dangerouslySetInnerHTML={{ __html: qrSvg(link, { margem: 1 }) }} />
            <span className="text-[9px] leading-tight text-[#1f1a14]/70">Aponte a câmera para ver no celular</span>
          </div>
        )}
      </header>

      {cv.sobre && <p className="text-[14px] leading-relaxed">{cv.sobre}</p>}

      {cv.experiencias.length > 0 && (
        <section>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#1f1a14]/70">Experiência</h3>
          <ul className="mt-2 flex flex-col gap-2.5">
            {cv.experiencias.map((e, i) => (
              <li key={i} className="text-[14px] leading-snug">
                <p>
                  <strong className="font-semibold">{e.cargo}</strong>
                  {e.onde && <>, {e.onde}</>}
                  {e.periodo && <span className="text-[#1f1a14]/70"> ({e.periodo})</span>}
                </p>
                {e.descricao && <p className="text-[#1f1a14]/85">{e.descricao}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(cv.estudo || cv.cursos.length > 0) && (
        <section>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#1f1a14]/70">Estudo</h3>
          {cv.estudo && <p className="mt-1 text-[14px]">{cv.estudo}</p>}
          {cv.cursos.length > 0 && <p className="text-[14px]">Cursos: {cv.cursos.join(", ")}</p>}
        </section>
      )}

      {(cv.habilidades.length > 0 || cv.cnh || cv.disponibilidade.length > 0) && (
        <section>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#1f1a14]/70">Mais</h3>
          {cv.habilidades.length > 0 && <p className="mt-1 text-[14px]">{cv.habilidades.join(", ")}</p>}
          {(cv.cnh || cv.disponibilidade.length > 0) && (
            <p className="text-[14px]">
              {[cv.cnh, cv.disponibilidade.length ? `Disponível: ${cv.disponibilidade.join(", ")}` : null]
                .filter(Boolean)
                .join(". ")}
            </p>
          )}
        </section>
      )}

      <footer className="pt-6 text-[10px] text-[#1f1a14]/60">
        Currículo feito no Publike (publike.org). Precisa de gente? Publique sua vaga grátis.
      </footer>
    </article>
  );
}
