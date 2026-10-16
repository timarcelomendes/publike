"use client";

import { Check, Code, Copy, ExternalLink, Link2, MessageCircle } from "lucide-react";
import { useState } from "react";
import { classesEntrada, Seletor } from "../ui/campo";
import { Botao, classesBotao } from "../ui/botao";

type Tema = "claro" | "escuro" | "auto";

const TEMAS: { id: Tema; nome: string }[] = [
  { id: "claro", nome: "Claro (site de fundo branco)" },
  { id: "escuro", nome: "Escuro (site de fundo escuro)" },
  { id: "auto", nome: "Segue o celular de quem visita" },
];

/** Copia um texto e mostra "Copiado" por um instante. */
function BotaoCopiar({ texto, rotulo, principal = false }: { texto: string; rotulo: string; principal?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // sem acesso à área de transferência: a pessoa seleciona o texto na caixa
    }
  }
  return (
    <Botao tamanho="sm" variante={principal ? "primario" : "secundario"} onClick={copiar}>
      {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copiado ? "Copiado" : rotulo}</span>
    </Botao>
  );
}

/**
 * "Sua página de vagas" em Meus anúncios: o link com todas as vagas abertas da conta
 * (/perfil/<id>/vagas) e, para empresa, comércio e agência, o código do quadro de
 * vagas que vai no site dela (/embed.js → /embed/vagas/<id>).
 */
export function PaginaDeVagas({
  perfilId,
  nome,
  site,
  noAr,
  comQuadro,
}: {
  perfilId: string;
  nome: string;
  site: string;
  noAr: number;
  comQuadro: boolean;
}) {
  const [tema, setTema] = useState<Tema>("claro");
  const [limite, setLimite] = useState("");
  const link = `${site}/perfil/${perfilId}/vagas`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Vagas abertas de ${nome} no Publike. Candidate-se de graça: ${link}`)}`;
  const extras = `${tema !== "claro" ? ` data-tema="${tema}"` : ""}${limite ? ` data-limite="${limite}"` : ""}`;
  const codigo = `<div class="publike-vagas" data-empresa="${perfilId}"${extras}></div>\n<script src="${site}/embed.js" async></script>`;
  const previa = `${site}/embed/vagas/${perfilId}?tema=${tema}${limite ? `&limite=${limite}` : ""}`;

  return (
    <section
      aria-labelledby="pagina-de-vagas"
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <div>
        <h3 id="pagina-de-vagas" className="flex items-center gap-2 text-h3">
          <Link2 aria-hidden className="size-5 shrink-0 text-ink-muted" />
          Sua página de vagas
        </h3>
        <p className="mt-1 text-body-sm text-ink-muted">
          Um link com todas as suas vagas abertas ({noAr} agora), sempre em dia: vaga nova entra sozinha, vaga encerrada
          sai. Ponha na bio do Instagram, no status do WhatsApp ou mande para quem perguntar se tem vaga.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="link-das-vagas" className="sr-only">
          Link da sua página de vagas
        </label>
        <input
          id="link-das-vagas"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className={`${classesEntrada} min-w-0 flex-1 text-body-sm`}
        />
        <div className="flex flex-wrap gap-2">
          <BotaoCopiar texto={link} rotulo="Copiar link" principal />
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={classesBotao("secundario", "sm")}>
            <MessageCircle aria-hidden />
            WhatsApp
          </a>
          <a href={link} target="_blank" rel="noopener" className={classesBotao("fantasma", "sm")}>
            <ExternalLink aria-hidden />
            Abrir
          </a>
        </div>
      </div>

      {comQuadro && (
        <details className="group rounded-md border border-line bg-surface-100">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2 text-label marker:hidden">
            <Code aria-hidden className="size-5 shrink-0 text-ink-muted" />
            <span className="flex-1">Colocar as vagas no site da empresa</span>
            <span className="hidden text-body-sm text-ink-muted group-open:hidden sm:inline">Ver o código</span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-line px-4 py-4">
            <p className="text-body-sm text-ink-muted">
              Cole este código na página “Trabalhe conosco” do seu site (no WordPress, num bloco “HTML personalizado”;
              no Wix, em “Incorporar código”). As vagas abertas aparecem ali e se atualizam sozinhas. Quem tocar numa
              vaga abre o Publike para se candidatar, e o candidato chega aqui no seu painel.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="quadro-tema" className="text-label">
                  Cores
                </label>
                <Seletor
                  id="quadro-tema"
                  value={tema}
                  onChange={(e) => setTema(e.target.value as Tema)}
                  className={classesEntrada}
                >
                  {TEMAS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </Seletor>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="quadro-limite" className="text-label">
                  Quantas vagas mostrar
                </label>
                <Seletor
                  id="quadro-limite"
                  value={limite}
                  onChange={(e) => setLimite(e.target.value)}
                  className={classesEntrada}
                >
                  <option value="">Todas</option>
                  {["3", "6", "9", "12"].map((n) => (
                    <option key={n} value={n}>
                      Até {n}
                    </option>
                  ))}
                </Seletor>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="quadro-codigo" className="text-label">
                Código para o site
              </label>
              <textarea
                id="quadro-codigo"
                readOnly
                rows={3}
                value={codigo}
                onFocus={(e) => e.currentTarget.select()}
                className={`${classesEntrada} resize-none font-mono text-body-sm`}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <BotaoCopiar texto={codigo} rotulo="Copiar código" principal />
              <a href={previa} target="_blank" rel="noopener" className={classesBotao("secundario", "sm")}>
                <ExternalLink aria-hidden />
                Ver como fica
              </a>
            </div>
            <p className="text-body-sm text-ink-muted">
              Quem cuida do site prefere um iframe simples? Também funciona:{" "}
              <code className="rounded-sm bg-surface-300 px-1 py-0.5 text-[0.8125rem] break-all">
                {`<iframe src="${previa}" title="Vagas abertas" style="width:100%;height:600px;border:0"></iframe>`}
              </code>
            </p>
          </div>
        </details>
      )}
    </section>
  );
}
