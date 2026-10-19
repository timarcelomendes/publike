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
import {
  anotarConvite,
  apagarConvite,
  enviarConviteEmail,
  importarConvites,
  lerConviteDaImagem,
  mudarConvite,
} from "@/lib/acoes/admin-convites";
import {
  ESTADOS_CONVITE,
  formatarFone,
  lerCsv,
  emailDoConvite,
  linkDoConvite,
  linhasParaConvites,
  mensagemConviteAgrupada,
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

/** Depois de importar: o atalho para a lista (a sub-aba Empresas). */
function VerLista() {
  return (
    <Link href="/admin/convites" className={`${classesBotao("secundario", "sm")} self-start`}>
      Ver a lista de convidados
    </Link>
  );
}

export function ImportarConvites() {
  const { rodar, pendente, mensagem } = useAcao();
  const [importou, setImportou] = useState(false);
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
          1. Baixe o modelo e abra no Excel ou no Google Planilhas. Um convite por linha (empresa ou prestador); vagas
          ou serviços separados por vírgula; mais de um telefone separado por barra.
        </li>
        <li>2. Na coluna “tipo”, escreva empresa, agencia ou prestador. Apague as linhas de exemplo.</li>
        <li>3. Salve como CSV e escolha o arquivo aqui. Quem já está na lista não entra de novo.</li>
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
            {previa.convites.length === 1 ? "1 convite pronto" : `${previa.convites.length} convites prontos`}
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
                      setImportou(true);
                      setPrevia(null);
                      if (campo.current) campo.current.value = "";
                    }
                  },
                )
              }
            >
              {pendente
                ? "Importando…"
                : `Importar ${previa.convites.length === 1 ? "1 convite" : `${previa.convites.length} convites`}`}
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
      {importou && <VerLista />}
    </div>
  );
}

// ------------------------------------------------------------------ Importar por imagens

/** Até quantas imagens por vez (cada uma é uma leitura da IA). */
const MAX_IMAGENS = 30;

/** A imagem reduzida (lado maior de 1600 px, JPEG) em data: URL: cabe no pedido ao servidor e a IA lê bem. */
async function reduzirImagem(arquivo: File): Promise<string> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(bitmap.width * escala);
  tela.height = Math.round(bitmap.height * escala);
  tela.getContext("2d")!.drawImage(bitmap, 0, 0, tela.width, tela.height);
  bitmap.close();
  for (const qualidade of [0.85, 0.7, 0.55]) {
    const url = tela.toDataURL("image/jpeg", qualidade);
    if (url.length < 900_000) return url;
  }
  return tela.toDataURL("image/jpeg", 0.4);
}

type LidaDaImagem = { arquivo: string; convite?: NovoConvite; erro?: string; marcada: boolean };

/** Junta as vagas da mesma empresa (várias imagens dela) num convite só. */
function juntarPorEmpresa(lidas: LidaDaImagem[]): LidaDaImagem[] {
  const saida: LidaDaImagem[] = [];
  for (const l of lidas) {
    const igual =
      l.convite && saida.find((s) => s.convite && s.convite.nome.toLowerCase() === l.convite!.nome.toLowerCase());
    if (!igual || !igual.convite || !l.convite) {
      saida.push(l);
      continue;
    }
    const a = igual.convite;
    const b = l.convite;
    igual.convite = {
      ...a,
      vagas: [...new Set([...a.vagas, ...b.vagas])].slice(0, 20),
      whatsapp: [...new Set([...a.whatsapp, ...b.whatsapp])].slice(0, 5),
      telefones: [...new Set([...a.telefones, ...b.telefones])].slice(0, 5),
      email: a.email ?? b.email,
      rascunho: a.rascunho ?? b.rascunho,
    };
    igual.arquivo = `${igual.arquivo}, ${l.arquivo}`;
  }
  return saida;
}

/**
 * Importar pelas imagens dos anúncios (prints ou imagens salvas das vagas que você viu nas redes):
 * a IA lê empresa, cargos, contato e a vaga; você confere e importa. A vaga lida vem pronta
 * no link do convite, para a empresa só conferir e publicar.
 */
export function ImportarPorImagens() {
  const { rodar, pendente, mensagem } = useAcao();
  const [importou, setImportou] = useState(false);
  const [lidas, setLidas] = useState<LidaDaImagem[] | null>(null);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  async function escolher(e: ChangeEvent<HTMLInputElement>) {
    const arquivos = [...(e.target.files ?? [])].filter((f) => f.type.startsWith("image/"));
    setErro(null);
    setLidas(null);
    if (!arquivos.length) return;
    if (arquivos.length > MAX_IMAGENS) {
      setErro(`Escolha até ${MAX_IMAGENS} imagens por vez.`);
      return;
    }
    const resultado: LidaDaImagem[] = [];
    setProgresso({ feitas: 0, total: arquivos.length });
    // uma de cada vez: a IA lê melhor e o servidor não recebe tudo junto
    for (const arquivo of arquivos) {
      let imagem: string;
      try {
        imagem = await reduzirImagem(arquivo);
      } catch {
        resultado.push({ arquivo: arquivo.name, erro: "Não deu para abrir esta imagem.", marcada: false });
        setProgresso({ feitas: resultado.length, total: arquivos.length });
        continue;
      }
      const r = await lerConviteDaImagem(imagem, arquivo.name).catch(() => ({
        ok: false as const,
        erro: "Falhou a leitura. Tente de novo.",
      }));
      resultado.push(
        r.ok
          ? { arquivo: arquivo.name, convite: r.convite, marcada: true }
          : { arquivo: arquivo.name, erro: r.erro, marcada: false },
      );
      setProgresso({ feitas: resultado.length, total: arquivos.length });
    }
    setProgresso(null);
    setLidas(juntarPorEmpresa(resultado));
  }

  const marcadas = (lidas ?? []).filter((l) => l.convite && l.marcada);
  const limpar = () => {
    setLidas(null);
    if (campo.current) campo.current.value = "";
  };

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-1.5 text-body-sm text-ink-muted">
        <li>1. Salve as imagens (ou tire prints) das vagas e dos serviços que você viu: um anúncio por imagem.</li>
        <li>
          2. Escolha as imagens aqui (até {MAX_IMAGENS} por vez). A IA lê quem anunciou, os cargos (ou o serviço), o
          WhatsApp, o telefone, o e-mail e a vaga.
        </li>
        <li>
          3. Confira e importe. O convite leva o link com a vaga (ou a vitrine de serviços) pronta: é só conferir e
          publicar.
        </li>
      </ol>
      <label
        className={`${classesBotao("secundario", "sm")} cursor-pointer self-start has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${progresso ? "pointer-events-none opacity-60" : ""}`}
      >
        <ImageIcon aria-hidden />
        Escolher as imagens
        <input
          ref={campo}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          onChange={escolher}
          disabled={Boolean(progresso)}
          className="sr-only"
        />
      </label>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {progresso && (
        <p role="status" className="text-body-sm text-ink-muted">
          Lendo as imagens… {progresso.feitas} de {progresso.total}
        </p>
      )}

      {lidas && (
        <div className="flex flex-col gap-3 rounded-md bg-surface-300 p-4">
          <p className="text-label">
            {marcadas.length === 1 ? "1 convite para importar" : `${marcadas.length} convites para importar`}
            {lidas.some((l) => l.erro) &&
              `, ${lidas.filter((l) => l.erro).length === 1 ? "1 imagem ficou de fora" : `${lidas.filter((l) => l.erro).length} imagens ficaram de fora`}`}
          </p>
          <ul aria-label="Lidas das imagens" className="flex flex-col gap-2">
            {lidas.map((l, i) =>
              l.convite ? (
                <li key={i} className="flex items-start gap-3 rounded-sm bg-surface-200 p-3">
                  <input
                    type="checkbox"
                    checked={l.marcada}
                    aria-label={`Importar ${l.convite.nome}`}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setLidas((atual) => atual && atual.map((x, j) => (j === i ? { ...x, marcada: v } : x)));
                    }}
                    className="mt-1 size-5 accent-[var(--pk-ink)]"
                  />
                  <div className="flex min-w-0 flex-col gap-0.5 text-body-sm">
                    <p className="text-label">
                      {l.convite.nome}
                      {l.convite.tipo === "agencia" && <span className="text-ink-muted"> · agência</span>}
                    </p>
                    {l.convite.vagas.length > 0 && <p>{l.convite.vagas.join(", ")}</p>}
                    <p className="text-ink-muted">
                      {[
                        ...l.convite.whatsapp.map((n) => `WhatsApp ${formatarFone(n)}`),
                        ...l.convite.telefones.map((n) => `Tel. ${formatarFone(n)}`),
                        l.convite.email,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {l.convite.rascunho && (
                      <p className="text-ink-muted">
                        Vaga pronta: {l.convite.rascunho.titulo}
                        {l.convite.rascunho.salario
                          ? ` · R$ ${l.convite.rascunho.salario.toLocaleString("pt-BR")}`
                          : ""}
                      </p>
                    )}
                    <p className="truncate text-caption text-ink-muted">{l.arquivo}</p>
                  </div>
                </li>
              ) : (
                <li key={i} className="rounded-sm px-3 py-2 text-body-sm text-ink-muted">
                  {l.arquivo}: {l.erro}
                </li>
              ),
            )}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Botao
              variante="primario"
              tamanho="sm"
              disabled={pendente || !marcadas.length}
              onClick={() =>
                rodar(
                  () => importarConvites(marcadas.map((l) => l.convite!)),
                  (r) => {
                    if (r.ok) {
                      setImportou(true);
                      limpar();
                    }
                  },
                )
              }
            >
              {pendente
                ? "Importando…"
                : `Importar ${marcadas.length === 1 ? "1 convite" : `${marcadas.length} convites`}`}
            </Botao>
            <Botao variante="fantasma" tamanho="sm" onClick={limpar}>
              Cancelar
            </Botao>
          </div>
        </div>
      )}
      {mensagem}
      {importou && <VerLista />}
    </div>
  );
}

// ------------------------------------------------------------------ Lista

export function ListaConvites({ convites, agora, site }: { convites: Convite[]; agora: number; site: string }) {
  const [filtro, setFiltro] = useState<StatusConvite | "todos">("todos");
  // filtros a mais (juntam com a situação): lida da imagem, agência, só telefone
  const [marcas, setMarcas] = useState<Set<Marca>>(new Set());
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
  // empresas com o mesmo WhatsApp (ainda a convidar): dá para mandar uma mensagem só
  const grupos = useMemo(() => {
    const porNumero = new Map<string, Convite[]>();
    for (const c of itens) {
      if ((c.status !== "a_enviar" && c.status !== "enviada") || c.tipo === "prestador") continue;
      for (const n of c.whatsapp) porNumero.set(n, [...(porNumero.get(n) ?? []), c]);
    }
    return new Map([...porNumero].filter(([, l]) => l.length > 1));
  }, [itens]);
  const grupoDe = (c: Convite) => {
    const n = c.whatsapp.find((x) => grupos.has(x));
    return n ? { numero: n, convites: grupos.get(n)! } : null;
  };
  const temMarca = (m: Marca, c: Convite) => (m === "mesmo_whatsapp" ? Boolean(grupoDe(c)) : MARCAS[m].tem(c));
  const visiveis = itens.filter(
    (c) => (filtro === "todos" || c.status === filtro) && [...marcas].every((m) => temMarca(m, c)),
  );
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
        Ninguém na lista ainda. Importe em “Importar pelas imagens” ou “Importar arquivo”, aqui em cima.
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

      {LISTA_MARCAS.some((m) => itens.some((c) => temMarca(m, c))) && (
        <div role="group" aria-label="Filtrar por tipo" className="sem-barra -mt-2 flex gap-2 overflow-x-auto pb-1">
          {LISTA_MARCAS.filter((m) => itens.some((c) => temMarca(m, c)) || marcas.has(m)).map((m) => {
            const ativo = marcas.has(m);
            return (
              <button
                key={m}
                type="button"
                className={chip(ativo)}
                aria-pressed={ativo}
                onClick={() =>
                  setMarcas((atual) => {
                    const nova = new Set(atual);
                    if (ativo) nova.delete(m);
                    else nova.add(m);
                    return nova;
                  })
                }
              >
                {MARCAS[m].nome}{" "}
                <span className="tabular-nums opacity-70">{itens.filter((c) => temMarca(m, c)).length}</span>
              </button>
            );
          })}
        </div>
      )}

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {visiveis.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-ink-muted">
          {marcas.size ? "Ninguém com esses filtros." : "Ninguém nesta situação."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visiveis.map((c) => (
            <CartaoConvite
              key={c.id}
              c={c}
              site={site}
              assinatura={assinatura}
              lembrar={tocou.has(c.id) && c.status === "a_enviar"}
              aoAbrirWhats={() => setTocou((t) => new Set(t).add(c.id))}
              aoMarcar={(s) => marcar(c, s)}
              grupo={grupoDe(c)}
              aoAbrirGrupo={(l) => setTocou((t) => new Set([...t, ...l.map((x) => x.id)]))}
              aoMarcarGrupo={(l) => l.forEach((x) => marcar(x, "enviada"))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// os filtros a mais da lista (os mesmos selos do cartão)
const MARCAS = {
  imagem: { nome: "Lida da imagem", tem: (c: Convite) => c.origem === "imagem" },
  agencia: { nome: "Agência", tem: (c: Convite) => c.tipo === "agencia" },
  prestador: { nome: "Prestador", tem: (c: Convite) => c.tipo === "prestador" },
  so_telefone: { nome: "Só telefone", tem: (c: Convite) => !c.whatsapp.length && !c.email },
  // depende das outras empresas da lista (calculado na lista)
  mesmo_whatsapp: { nome: "Mesmo WhatsApp", tem: () => false },
} as const;
type Marca = keyof typeof MARCAS;
const LISTA_MARCAS = Object.keys(MARCAS) as Marca[];

/** Como o e-mail chega: de quem, para quem, o assunto e o corpo, antes de enviar. */
function PreviaEmail({
  c,
  site,
  assinatura,
  enviando,
  aoFechar,
  aoEnviar,
}: {
  c: Convite;
  site: string;
  assinatura: string;
  enviando: boolean;
  aoFechar: () => void;
  aoEnviar: () => void;
}) {
  const e = emailDoConvite(c, assinatura, site);
  return (
    <section
      aria-label={`Prévia do e-mail para ${c.nome}`}
      className="flex flex-col gap-3 rounded-md border border-line-strong bg-surface-200 p-3"
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body-sm">
        <dt className="text-ink-muted">De</dt>
        <dd>Publike</dd>
        <dt className="text-ink-muted">Para</dt>
        <dd className="break-all">{c.email}</dd>
        <dt className="text-ink-muted">Assunto</dt>
        <dd className="text-label">{e.assunto}</dd>
      </dl>
      {/* o corpo como chega na caixa de entrada (fundo branco, como a maioria dos e-mails) */}
      <iframe
        title={`Corpo do e-mail para ${c.nome}`}
        srcDoc={`<!doctype html><meta charset="utf-8"><body style="margin:0;padding:20px;background:#ffffff">${e.html}</body>`}
        sandbox=""
        className="h-96 w-full rounded-sm border border-line bg-white"
      />
      <div className="flex flex-wrap gap-2">
        <Botao variante="primario" tamanho="sm" disabled={enviando} onClick={aoEnviar}>
          <Mail aria-hidden />
          {enviando ? "Enviando…" : "Enviar agora"}
        </Botao>
        <Botao variante="fantasma" tamanho="sm" onClick={aoFechar}>
          Fechar
        </Botao>
      </div>
    </section>
  );
}

const juntarNomes = (l: string[]) => (l.length < 2 ? l.join("") : `${l.slice(0, -1).join(", ")} e ${l.at(-1)}`);

// a imagem é da vaga (empresa ou agência); para o prestador, vai só o texto
const imagemDoConvite = (tipo: Convite["tipo"]) =>
  tipo === "prestador" ? null : `/convites/convite-${tipo === "agencia" ? "agencia" : "empresa"}.png`;

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
  site,
  assinatura,
  lembrar,
  aoAbrirWhats,
  aoMarcar,
  grupo,
  aoAbrirGrupo,
  aoMarcarGrupo,
}: {
  c: Convite;
  /** o endereço público do site (o link do convite) */
  site: string;
  assinatura: string;
  lembrar: boolean;
  aoAbrirWhats: () => void;
  aoMarcar: (s: StatusConvite) => void;
  /** outras empresas da lista com o mesmo WhatsApp (a convidar): enviar numa mensagem só */
  grupo: { numero: string; convites: Convite[] } | null;
  aoAbrirGrupo: (l: Convite[]) => void;
  aoMarcarGrupo: (l: Convite[]) => void;
}) {
  const nota = useAcao();
  const apagar = useAcao();
  const email = useAcao();
  const [previaEmail, setPreviaEmail] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [avisoImagem, setAvisoImagem] = useState<string | null>(null);
  const podeCompartilhar = useCompartilhar();
  const [confirmar, setConfirmar] = useState(false);
  const msg = mensagemConvite(c, assinatura, linkDoConvite(site, c.token, c.tipo), Boolean(c.rascunho));
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
    if (!imagem) return;
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
    if (!imagem) return;
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
          {c.tipo === "prestador" && <Selo variante="aviso">Prestador</Selo>}
          {c.status === "autorizou" && <Selo variante="match">Autorizou</Selo>}
          {c.origem === "imagem" && <Selo variante="contorno">Lida da imagem</Selo>}
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
          // abre a prévia; o envio é pelo Publike (o "mailto:" dependia do programa de e-mail do computador)
          <Botao
            tamanho="sm"
            aria-expanded={previaEmail}
            onClick={() => setPreviaEmail((v) => !v)}
            className="max-w-full"
          >
            <Mail aria-hidden />
            {/* e-mail comprido não estica o cartão no celular */}
            <span className="min-w-0 truncate">E-mail para {c.email}</span>
          </Botao>
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
      {previaEmail && c.email && (
        <PreviaEmail
          c={c}
          site={site}
          assinatura={assinatura}
          enviando={email.pendente}
          aoFechar={() => setPreviaEmail(false)}
          aoEnviar={() =>
            email.rodar(
              () => enviarConviteEmail(c.id, assinatura),
              (r) => {
                if (!r.ok) return;
                setPreviaEmail(false);
                if (c.status === "a_enviar") aoMarcar("enviada");
              },
            )
          }
        />
      )}
      {email.mensagem}

      {grupo && (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-300 p-3 text-body-sm">
          <p>
            <span className="text-label">Mesmo WhatsApp {formatarFone(grupo.numero)}</span> de{" "}
            {juntarNomes(grupo.convites.filter((x) => x.id !== c.id).map((x) => x.nome))}. Mande uma mensagem só, com o
            link de cada vaga.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://wa.me/55${grupo.numero}?text=${encodeURIComponent(mensagemConviteAgrupada(grupo.convites, assinatura, site))}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => aoAbrirGrupo(grupo.convites)}
              className={classesBotao("sucesso", "sm")}
            >
              <MessageCircle aria-hidden />
              Enviar junto ({grupo.convites.length} empresas)
            </a>
            <Botao
              tamanho="sm"
              disabled={grupo.convites.every((x) => x.status === "enviada")}
              onClick={() => aoMarcarGrupo(grupo.convites)}
            >
              Marcar as {grupo.convites.length} como Enviei
            </Botao>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {imagem && (
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
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {imagem && (
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
          )}
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

      {c.aceite_em && (
        <p className="text-body-sm text-cerrado-text">
          Autorizou e a vaga foi publicada em{" "}
          {new Date(c.aceite_em).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          })}
          {c.anuncio_id && (
            <>
              {" · "}
              <Link href={`/anuncio/${c.anuncio_id}`} className="underline underline-offset-2">
                ver a vaga
              </Link>
            </>
          )}
        </p>
      )}

      {!c.anuncio_id && c.status !== "recusou" && c.status !== "sem_contato" && (
        // disse "sim" no WhatsApp mas não abriu o link: o admin publica por ela
        <Link
          href={`/admin/convites/${c.id}/${c.tipo === "prestador" ? "vitrine" : "publicar"}`}
          className={`${classesBotao("secundario", "sm")} self-start`}
        >
          <UserPlus aria-hidden />
          {c.tipo === "prestador" ? "Disse sim? Montar a vitrine por ele" : "Disse sim? Publicar por ela"}
        </Link>
      )}

      {c.status === "autorizou" && c.usuario_id && (
        <Link href={`/admin/usuarios/${c.usuario_id}`} className={`${classesBotao("secundario", "sm")} self-start`}>
          <UserRound aria-hidden />
          {c.tipo === "prestador" ? "Abrir a conta" : "Abrir a conta da empresa"}
        </Link>
      )}

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
