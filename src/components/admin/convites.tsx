"use client";

import {
  Copy,
  Download,
  FileUp,
  ImageIcon,
  Mail,
  MessageCircle,
  Phone,
  Share2,
  Trash2,
  UserPlus,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ChangeEvent } from "react";
import { anotarConvite, apagarConvite, importarConvites, mudarConvite } from "@/lib/acoes/admin-convites";
import {
  ESTADOS_CONVITE,
  assuntoConvite,
  formatarFone,
  lerCsv,
  linhasParaConvites,
  mensagemConvite,
  type Convite,
  type NovoConvite,
  type StatusConvite,
} from "@/lib/convites";
import { Aviso, Selo } from "../ui/basicos";
import { Botao, classesBotao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

const CHAVE_ASSINATURA = "publike_admin_assinatura";
const POR_HORA = 10;

const chip = (ativo: boolean) =>
  `inline-flex min-h-10 shrink-0 items-center gap-2 rounded-pill border px-3.5 text-label transition-colors ${
    ativo ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-300 text-ink hover:border-line-strong"
  }`;

/** Lê o arquivo como UTF-8; se vier do Excel antigo (Windows-1252), lê de novo nessa codificação. */
async function lerArquivo(arquivo: File) {
  const bytes = await arquivo.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

// ------------------------------------------------------------------ Importar

export function ImportarConvites() {
  const { rodar, pendente, mensagem } = useAcao();
  const [previa, setPrevia] = useState<{
    arquivo: string;
    convites: NovoConvite[];
    ignoradas: { linha: number; motivo: string }[];
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  async function escolher(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    setErro(null);
    setPrevia(null);
    if (!arquivo) return;
    if (/\.(xlsx?|ods|numbers)$/i.test(arquivo.name)) {
      setErro(
        "Este arquivo é de planilha. Salve como CSV antes: no Excel, Arquivo > Salvar como > CSV; no Google Planilhas, Arquivo > Fazer download > CSV.",
      );
      return;
    }
    if (arquivo.size > 2_000_000) {
      setErro("O arquivo passa de 2 MB. Divida a lista em partes.");
      return;
    }
    const r = linhasParaConvites(lerCsv(await lerArquivo(arquivo)));
    if (r.semCabecalho) {
      setErro(
        'Não achei a coluna "empresa" na primeira linha. Use o modelo: a primeira linha tem os nomes das colunas.',
      );
      return;
    }
    setPrevia({ arquivo: arquivo.name, ...r });
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-1.5 text-body-sm text-ink-muted">
        <li>
          1. Baixe o modelo e abra no Excel ou no Google Planilhas. Uma empresa por linha; vagas separadas por vírgula;
          mais de um telefone separado por barra.
        </li>
        <li>2. Na coluna “tipo”, escreva empresa ou agencia. Apague as duas linhas de exemplo.</li>
        <li>3. Salve como CSV e escolha o arquivo aqui. Empresa que já está na lista não entra de novo.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <a href="/admin/convites/modelo" className={classesBotao("secundario", "sm")}>
          <Download aria-hidden />
          Baixar o modelo
        </a>
        <label
          className={`${classesBotao("secundario", "sm")} cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus`}
        >
          <FileUp aria-hidden />
          Escolher o arquivo
          <input
            ref={campo}
            type="file"
            accept=".csv,.txt,text/csv,text/plain,.xlsx,.xls"
            onChange={escolher}
            className="sr-only"
          />
        </label>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {previa && (
        <div className="flex flex-col gap-3 rounded-md bg-surface-300 p-4">
          <p className="text-label">
            {previa.arquivo}:{" "}
            {previa.convites.length === 1 ? "1 empresa pronta" : `${previa.convites.length} empresas prontas`}
            {previa.ignoradas.length > 0 &&
              `, ${previa.ignoradas.length === 1 ? "1 linha ficou de fora" : `${previa.ignoradas.length} linhas ficaram de fora`}`}
          </p>
          {previa.convites.length > 0 && (
            <p className="text-body-sm text-ink-muted">
              {previa.convites
                .slice(0, 6)
                .map((c) => c.nome)
                .join(", ")}
              {previa.convites.length > 6 && ` e mais ${previa.convites.length - 6}`}
            </p>
          )}
          {previa.ignoradas.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-body-sm text-ink-muted">
              {previa.ignoradas.slice(0, 8).map((i) => (
                <li key={i.linha}>
                  Linha {i.linha}: {i.motivo}
                </li>
              ))}
              {previa.ignoradas.length > 8 && <li>e mais {previa.ignoradas.length - 8}</li>}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Botao
              variante="primario"
              tamanho="sm"
              disabled={pendente || !previa.convites.length}
              onClick={() =>
                rodar(
                  () => importarConvites(previa.convites),
                  (r) => {
                    if (r.ok) {
                      setPrevia(null);
                      if (campo.current) campo.current.value = "";
                    }
                  },
                )
              }
            >
              {pendente
                ? "Importando…"
                : `Importar ${previa.convites.length === 1 ? "1 empresa" : `${previa.convites.length} empresas`}`}
            </Botao>
            <Botao
              variante="fantasma"
              tamanho="sm"
              onClick={() => {
                setPrevia(null);
                if (campo.current) campo.current.value = "";
              }}
            >
              Cancelar
            </Botao>
          </div>
        </div>
      )}
      {mensagem}
    </div>
  );
}

// ------------------------------------------------------------------ Lista

export function ListaConvites({ convites, agora }: { convites: Convite[]; agora: number }) {
  const [filtro, setFiltro] = useState<StatusConvite | "todos">("todos");
  const [mudancas, setMudancas] = useState<Record<string, Partial<Convite>>>({});
  const [tocou, setTocou] = useState<Set<string>>(new Set());
  const [assinatura, setAssinatura] = useState("o Marcelo");
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  useEffect(() => {
    try {
      const salva = localStorage.getItem(CHAVE_ASSINATURA);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferência do navegador, só existe no cliente
      if (salva !== null) setAssinatura(salva);
    } catch {}
  }, []);

  const itens = useMemo(() => convites.map((c) => ({ ...c, ...mudancas[c.id] })), [convites, mudancas]);
  const conta = (s: StatusConvite) => itens.filter((c) => c.status === s).length;
  const visiveis = itens.filter((c) => filtro === "todos" || c.status === filtro);
  const naHora = itens.filter((c) => c.enviada_em && Date.parse(c.enviada_em) > agora - 3600e3).length;

  function marcar(c: Convite, status: StatusConvite) {
    if (c.status === status) return;
    const antes = mudancas[c.id];
    setErro(null);
    setMudancas((m) => ({
      ...m,
      [c.id]: {
        ...m[c.id],
        status,
        ...(status === "enviada" && !c.enviada_em ? { enviada_em: new Date().toISOString() } : {}),
      },
    }));
    iniciar(async () => {
      const r = await mudarConvite(c.id, status);
      if (!r.ok) {
        setErro(r.erro);
        setMudancas((m) => ({ ...m, [c.id]: antes ?? {} }));
      }
    });
  }

  if (!convites.length) {
    return (
      <p className="rounded-md border border-dashed border-line-strong p-6 text-center text-body-sm text-ink-muted">
        Nenhuma empresa na lista ainda. Baixe o modelo, preencha e importe o arquivo acima.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div
          className={`flex items-start gap-3 rounded-md border p-4 ${naHora >= POR_HORA ? "border-terra bg-terra-soft" : "border-line bg-surface-100"}`}
        >
          <span className="text-h2 tabular-nums">{naHora}</span>
          <p className="text-body-sm text-ink-muted">
            <span className="block text-label text-ink">
              {naHora >= POR_HORA
                ? "Convites enviados na última hora. Faça uma pausa antes dos próximos."
                : `de uns ${POR_HORA} convites por hora`}
            </span>
            Muitas mensagens iguais para quem não tem o seu número fazem o WhatsApp bloquear a conta. Telefone fixo sem
            WhatsApp: ligue ou mande e-mail.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-label">
          Como você se apresenta
          <input
            value={assinatura}
            onChange={(e) => {
              setAssinatura(e.target.value);
              try {
                localStorage.setItem(CHAVE_ASSINATURA, e.target.value);
              } catch {}
            }}
            maxLength={40}
            placeholder="o Marcelo"
            className={`${classesEntrada} sm:w-56`}
          />
          <span className="text-body-sm font-normal text-ink-muted">“Sou {assinatura.trim() || "…"}, do Publike”</span>
        </label>
      </div>

      <div role="group" aria-label="Filtrar pela situação" className="sem-barra flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          className={chip(filtro === "todos")}
          aria-pressed={filtro === "todos"}
          onClick={() => setFiltro("todos")}
        >
          Todos <span className="tabular-nums opacity-70">{itens.length}</span>
        </button>
        {ESTADOS_CONVITE.filter((e) => conta(e.id) > 0 || filtro === e.id).map((e) => (
          <button
            key={e.id}
            type="button"
            className={chip(filtro === e.id)}
            aria-pressed={filtro === e.id}
            onClick={() => setFiltro(e.id)}
          >
            {e.filtro} <span className="tabular-nums opacity-70">{conta(e.id)}</span>
          </button>
        ))}
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {visiveis.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-ink-muted">Nenhuma empresa nesta situação.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visiveis.map((c) => (
            <CartaoConvite
              key={c.id}
              c={c}
              assinatura={assinatura}
              lembrar={tocou.has(c.id) && c.status === "a_enviar"}
              aoAbrirWhats={() => setTocou((t) => new Set(t).add(c.id))}
              aoMarcar={(s) => marcar(c, s)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const imagemDoConvite = (tipo: Convite["tipo"]) =>
  `/convites/convite-${tipo === "agencia" ? "agencia" : "empresa"}.png`;

/** O navegador sabe compartilhar arquivos (Safari e Chrome no Mac, celulares). Só no cliente. */
function useCompartilhar() {
  return useSyncExternalStore(
    () => () => {},
    () => {
      try {
        const teste = new File([""], "x.png", { type: "image/png" });
        return typeof navigator.canShare === "function" && navigator.canShare({ files: [teste] });
      } catch {
        return false;
      }
    },
    () => false,
  );
}

function CartaoConvite({
  c,
  assinatura,
  lembrar,
  aoAbrirWhats,
  aoMarcar,
}: {
  c: Convite;
  assinatura: string;
  lembrar: boolean;
  aoAbrirWhats: () => void;
  aoMarcar: (s: StatusConvite) => void;
}) {
  const nota = useAcao();
  const apagar = useAcao();
  const [copiado, setCopiado] = useState(false);
  const [avisoImagem, setAvisoImagem] = useState<string | null>(null);
  const podeCompartilhar = useCompartilhar();
  const [confirmar, setConfirmar] = useState(false);
  const msg = mensagemConvite(c, assinatura);
  const texto = encodeURIComponent(msg);
  const apagado = c.status === "recusou" || c.status === "sem_contato";

  const imagem = imagemDoConvite(c.tipo);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(msg);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {}
  }

  // a imagem vai para a área de transferência: na conversa do WhatsApp, é só colar (⌘V)
  async function copiarImagem() {
    setAvisoImagem(null);
    try {
      const png = fetch(imagem).then((r) => r.blob());
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setAvisoImagem("Imagem copiada. Na conversa do WhatsApp, cole com ⌘V (ou Ctrl+V) e mande junto com o texto.");
    } catch {
      setAvisoImagem("Este navegador não deixou copiar a imagem. Use Baixar imagem e anexe na conversa.");
    }
  }

  // no Mac e no celular, abre o compartilhar do sistema com a imagem e o texto juntos
  async function compartilhar() {
    setAvisoImagem(null);
    try {
      const blob = await fetch(imagem).then((r) => r.blob());
      const arquivo = new File([blob], `publike-${c.tipo}.png`, { type: "image/png" });
      await navigator.share({ files: [arquivo], text: msg });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError")
        setAvisoImagem("Não deu para compartilhar daqui. Copie a imagem e o texto.");
    }
  }

  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border bg-surface-100 p-4 ${
        c.status === "autorizou" ? "border-cerrado" : "border-line"
      } ${apagado ? "opacity-75" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-h3">{c.nome}</h3>
          {c.vagas.length > 0 && <p className="text-body-sm">{c.vagas.join(" · ")}</p>}
          {c.observacao && <p className="text-body-sm text-ink-muted">{c.observacao}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {c.tipo === "agencia" && <Selo variante="aviso">Agência</Selo>}
          {c.status === "autorizou" && <Selo variante="match">Autorizou</Selo>}
          {!c.whatsapp.length && !c.email && <Selo variante="contorno">Só telefone</Selo>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {c.whatsapp.map((n) => (
          <a
            key={n}
            href={`https://wa.me/55${n}?text=${texto}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={aoAbrirWhats}
            className={classesBotao("sucesso", "sm")}
          >
            <MessageCircle aria-hidden />
            WhatsApp {formatarFone(n)}
          </a>
        ))}
        {c.email && (
          <a
            href={`mailto:${c.email}?subject=${encodeURIComponent(assuntoConvite(c))}&body=${texto}`}
            className={classesBotao("secundario", "sm")}
          >
            <Mail aria-hidden />
            {c.email}
          </a>
        )}
        <Botao tamanho="sm" onClick={copiar}>
          <Copy aria-hidden />
          {copiado ? "Copiada" : "Copiar mensagem"}
        </Botao>
        {c.telefones.map((n) => (
          <a
            key={n}
            href={`tel:+55${n}`}
            className="inline-flex min-h-10 items-center gap-1.5 px-1 text-body-sm text-ink-muted tabular-nums hover:text-ink"
          >
            <Phone aria-hidden className="size-4" />
            {formatarFone(n)}
          </a>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <a href={imagem} target="_blank" rel="noopener noreferrer" className="shrink-0 self-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de um arquivo estático, sem otimização */}
          <img
            src={imagem}
            alt={`Imagem do convite para ${c.tipo === "agencia" ? "agências" : "empresas"}`}
            width={96}
            height={120}
            loading="lazy"
            className="h-30 w-24 rounded-md border border-line object-cover"
          />
        </a>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Botao tamanho="sm" onClick={copiarImagem}>
              <ImageIcon aria-hidden />
              Copiar imagem
            </Botao>
            <a href={imagem} download={`publike-convite-${c.tipo}.png`} className={classesBotao("fantasma", "sm")}>
              <Download aria-hidden />
              Baixar imagem
            </a>
            {podeCompartilhar && (
              <Botao tamanho="sm" variante="fantasma" onClick={compartilhar}>
                <Share2 aria-hidden />
                Compartilhar imagem e texto
              </Botao>
            )}
          </div>
          {avisoImagem && (
            <p role="status" className="text-body-sm text-ink-muted">
              {avisoImagem}
            </p>
          )}
          <details className="rounded-md border border-dashed border-line-strong px-3">
            <summary className="flex min-h-10 cursor-pointer items-center text-label">Ver a mensagem</summary>
            <p className="pb-3 text-body-sm whitespace-pre-wrap">{msg}</p>
          </details>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3"
        role="group"
        aria-label={`Situação do convite para ${c.nome}`}
      >
        {ESTADOS_CONVITE.map((e) => {
          const ativo = c.status === e.id;
          const destaque = lembrar && e.id === "enviada";
          return (
            <button
              key={e.id}
              type="button"
              aria-pressed={ativo}
              onClick={() => aoMarcar(e.id)}
              className={`inline-flex min-h-10 items-center rounded-pill border px-3 text-label transition-colors ${
                ativo
                  ? e.id === "autorizou"
                    ? "border-cerrado bg-cerrado text-on-cerrado"
                    : "border-ink bg-ink text-surface-100"
                  : destaque
                    ? "border-terra bg-terra-soft text-terra-text"
                    : "border-line bg-surface-300 text-ink hover:border-line-strong"
              }`}
            >
              {e.nome}
            </button>
          );
        })}
        {c.enviada_em && (
          <span className="text-body-sm text-ink-muted tabular-nums">
            enviado em{" "}
            {new Date(c.enviada_em).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Sao_Paulo",
            })}
          </span>
        )}
      </div>

      {c.status === "autorizou" &&
        (c.usuario_id ? (
          <Link href={`/admin/usuarios/${c.usuario_id}`} className={`${classesBotao("secundario", "sm")} self-start`}>
            <UserRound aria-hidden />
            Abrir a conta da empresa
          </Link>
        ) : (
          <Link
            href={`/admin/usuarios/nova?convite=${c.id}`}
            className={`${classesBotao("primario", "sm")} self-start`}
          >
            <UserPlus aria-hidden />
            Criar a conta e publicar as vagas
          </Link>
        ))}

      <div className="flex flex-col gap-1">
        <label htmlFor={`nota-${c.id}`} className="sr-only">
          Anotação sobre {c.nome}
        </label>
        <input
          id={`nota-${c.id}`}
          defaultValue={c.nota ?? ""}
          maxLength={500}
          placeholder="Anote a resposta: WhatsApp ou e-mail para os candidatos, com quem falou…"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (c.nota ?? "")) nota.rodar(() => anotarConvite(c.id, v));
          }}
          className={classesEntrada}
        />
        {nota.mensagem}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {confirmar ? (
          <>
            <span className="text-body-sm">Tirar {c.nome} da lista?</span>
            <Botao
              variante="perigo"
              tamanho="sm"
              disabled={apagar.pendente}
              onClick={() => apagar.rodar(() => apagarConvite(c.id))}
            >
              Tirar da lista
            </Botao>
            <Botao variante="fantasma" tamanho="sm" onClick={() => setConfirmar(false)}>
              Cancelar
            </Botao>
          </>
        ) : (
          <Botao variante="fantasma" tamanho="sm" onClick={() => setConfirmar(true)} className="text-ink-muted">
            <Trash2 aria-hidden />
            Tirar da lista
          </Botao>
        )}
        {apagar.mensagem}
      </div>
    </li>
  );
}
