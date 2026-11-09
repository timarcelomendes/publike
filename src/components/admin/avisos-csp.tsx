import { Secao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import { plural, tempoRelativo } from "@/lib/formato";

export type AvisoCspDoBanco = {
  diretiva: string;
  bloqueado: string;
  pagina: string;
  vezes: number;
  primeira: string;
  ultima: string;
};

/** O que vem de fora do Publike: o domínio que precisaria entrar na política para não ser bloqueado. */
const NOMES_DA_DIRETIVA: Record<string, string> = {
  "script-src": "script",
  "script-src-elem": "script",
  "script-src-attr": "script no atributo",
  "style-src": "estilo",
  "style-src-elem": "estilo",
  "style-src-attr": "estilo no atributo",
  "img-src": "imagem",
  "connect-src": "conexão",
  "frame-src": "janela embutida",
  "font-src": "fonte",
  "media-src": "vídeo ou áudio",
  "worker-src": "worker",
  "manifest-src": "manifesto",
  "form-action": "envio de formulário",
};

/**
 * Admin › Falhas: os avisos da política de scripts (CSP em modo de relatório). Enquanto aparecer coisa do próprio
 * Publike (o site, o Supabase, o Google, a Cloudflare), a política ainda não pode valer de verdade.
 */
export function AvisosCsp({ avisos, erro, agora }: { avisos: AvisoCspDoBanco[]; erro: string | null; agora: number }) {
  return (
    <Secao
      titulo="Política de scripts: o que seria bloqueado"
      descricao="O site manda a política de conteúdo (CSP) em modo de relatório: nada é bloqueado ainda, mas o navegador avisa o que bloquearia. Quando só sobrar o que não é do Publike (extensões, golpes), a política passa a valer. A lista guarda a regra, de onde vinha e a página, sem dado de quem visitou."
    >
      {erro ? (
        <Aviso tipo="alerta" titulo="A lista ainda não está no banco">
          Rode a migração 20270329130000_relatorio_da_csp.sql no Supabase. ({erro})
        </Aviso>
      ) : !avisos.length ? (
        <p className="text-body-sm text-ink-muted">Nenhum aviso até agora.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-body-sm">
            <thead className="text-label text-ink-muted">
              <tr>
                <th className="py-2 pr-3 font-semibold">O que</th>
                <th className="py-2 pr-3 font-semibold">De onde</th>
                <th className="py-2 pr-3 font-semibold">Página</th>
                <th className="py-2 pr-3 text-right font-semibold">Vezes</th>
                <th className="py-2 font-semibold">Último</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {avisos.map((a) => (
                <tr key={`${a.diretiva}|${a.bloqueado}|${a.pagina}`}>
                  <td className="py-2 pr-3" title={a.diretiva}>
                    {NOMES_DA_DIRETIVA[a.diretiva] ?? a.diretiva}
                  </td>
                  <td className="py-2 pr-3 break-all">{a.bloqueado}</td>
                  <td className="py-2 pr-3 break-all">{a.pagina}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{a.vezes}</td>
                  <td className="py-2 whitespace-nowrap text-ink-muted">{tempoRelativo(a.ultima, agora)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-caption text-ink-muted">
            {plural(avisos.length, "combinação", "combinações")} de regra, origem e página.
          </p>
        </div>
      )}
    </Secao>
  );
}
