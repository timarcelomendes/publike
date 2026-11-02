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
export function BotaoCopiar({
  texto,
  rotulo,
  principal = false,
}: {
  texto: string;
  rotulo: string;
  principal?: boolean;
}) {
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
 * "O link da página" em Página de vagas (/painel/links): o link com todas as vagas abertas da conta (/perfil/<id>/vagas),
 * para copiar, mandar no WhatsApp (com a lista das vagas, `texto`) ou abrir.
 */
export function PaginaDeVagas({
  perfilId,
  site,
  noAr,
  texto,
  apelido = null,
}: {
  perfilId: string;
  site: string;
  noAr: number;
  /** a mensagem do WhatsApp: as vagas e o link (textoDasVagas) */
  texto: string;
  /** com a página de carreiras liberada: o endereço curto (publike.org/v/apelido) */
  apelido?: string | null;
}) {
  const link = apelido ? `${site}/v/${apelido}` : `${site}/perfil/${perfilId}/vagas`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(texto)}`;

  return (
    <section
      aria-labelledby="pagina-de-vagas"
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <div>
        <h3 id="pagina-de-vagas" className="flex items-center gap-2 text-h3">
          <Link2 aria-hidden className="size-5 shrink-0 text-ink-muted" />O link da página
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
    </section>
  );
}

const AJUDA_DOS_SITES = [
  {
    nome: "WordPress",
    passos:
      "Edite a página “Trabalhe conosco”, toque em + e escolha o bloco “HTML personalizado”. Cole o código e publique.",
  },
  {
    nome: "Wix",
    passos:
      "No editor, toque em Adicionar › Incorporar código › Incorporar HTML. Cole o código e ajuste o tamanho da caixa.",
  },
  {
    nome: "Google Sites",
    passos: "Toque em Incorporar (na coluna Inserir) › Incorporar código. Cole o código e toque em Avançar e Inserir.",
  },
  {
    nome: "Outro site",
    passos: "Mande o código para quem cuida do site: ele vai no HTML da página, onde as vagas devem aparecer.",
  },
];

/**
 * O quadro de vagas no site da empresa (/embed.js → /embed/vagas/<id>): as cores e quantas mostrar, o código para
 * colar, o botão "Trabalhe conosco" no canto do site e como colar no WordPress, no Wix e no Google Sites.
 */
export function QuadroParaOSite({ perfilId, site }: { perfilId: string; site: string }) {
  const [tema, setTema] = useState<Tema>("claro");
  const [limite, setLimite] = useState("");
  const [comBotao, setComBotao] = useState(false);
  const extras = `${tema !== "claro" ? ` data-tema="${tema}"` : ""}${limite ? ` data-limite="${limite}"` : ""}`;
  const codigo = `<div class="publike-vagas" data-empresa="${perfilId}"${extras}></div>\n<script src="${site}/embed.js"${comBotao ? ` data-botao="${perfilId}"` : ""} async></script>`;
  const codigoBotao = `<script src="${site}/embed.js" data-botao="${perfilId}" async></script>`;
  const previa = `${site}/embed/vagas/${perfilId}?tema=${tema}${limite ? `&limite=${limite}` : ""}`;
  return (
    <details className="group rounded-md border border-line bg-surface-100">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2 text-label marker:hidden">
        <Code aria-hidden className="size-5 shrink-0 text-ink-muted" />
        <span className="flex-1">Colocar as vagas no site da empresa</span>
        <span className="hidden text-body-sm text-ink-muted group-open:hidden sm:inline">Ver o código</span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-line px-4 py-4">
        <p className="text-body-sm text-ink-muted">
          Cole este código na página “Trabalhe conosco” do seu site. As vagas abertas aparecem ali, com a sua logo, e se
          atualizam sozinhas. Com 6 vagas ou mais, vem também a busca e a área. Quem tocar numa vaga abre o Publike para
          se candidatar, e o candidato chega aqui no seu painel.
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
        <label className="flex min-h-11 items-start gap-3 text-body-sm">
          <input
            type="checkbox"
            checked={comBotao}
            onChange={(e) => setComBotao(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
          />
          <span>
            <span className="block text-label">Também o botão “Trabalhe conosco” no canto do site</span>
            <span className="text-ink-muted">Fica em todas as páginas e abre a sua página de vagas.</span>
          </span>
        </label>
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
        <div className="flex flex-col gap-2">
          <h4 className="text-label">Como colar</h4>
          <ul className="flex flex-col gap-2 text-body-sm">
            {AJUDA_DOS_SITES.map((a) => (
              <li key={a.nome}>
                <span className="font-semibold">{a.nome}:</span> <span className="text-ink-muted">{a.passos}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-body-sm text-ink-muted">
          Só o botão, sem o quadro (cole no rodapé do site, para aparecer em todas as páginas):{" "}
          <code className="rounded-sm bg-surface-300 px-1 py-0.5 text-[0.8125rem] break-all">{codigoBotao}</code>
        </p>
        <p className="text-body-sm text-ink-muted">
          Quem cuida do site prefere um iframe simples? Também funciona:{" "}
          <code className="rounded-sm bg-surface-300 px-1 py-0.5 text-[0.8125rem] break-all">
            {`<iframe src="${previa}" title="Vagas abertas" style="width:100%;height:600px;border:0"></iframe>`}
          </code>
        </p>
      </div>
    </details>
  );
}
