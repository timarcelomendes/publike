"use client";

import {
  Camera,
  Check,
  Copy,
  ExternalLink,
  FileText,
  FileUp,
  KanbanSquare,
  LoaderCircle,
  MessageCircle,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { cancelarConviteCandidato, criarConviteCandidato } from "@/lib/acoes/convites-candidato";
import {
  enviarPdf,
  ErroDaLeitura,
  fotosParaLeitura,
  MAX_FOTOS_CURRICULO,
  resumoDaLeitura,
} from "@/lib/arquivo-curriculo";
import { MAX_PDF_MB } from "@/lib/constantes";
import { mensagemDoConvite, situacaoNaLista, SITUACOES_CONVITE, type ConviteDaVaga } from "@/lib/convite-candidato";
import { formatarDataCurta } from "@/lib/formato";
import { Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada, MensagemErro } from "../ui/campo";

// Candidato de fora, do lado de quem publicou a vaga: chamar a pessoa (o nome e, se tiver, o PDF
// ou a foto do currículo) e mandar o link; a lista dos convites da vaga.

type Arquivo = { tipo: "pdf"; pdf: File } | { tipo: "fotos"; fotos: File[] } | null;

type Criado = { nome: string; token: string; expira_em: string; lido: string | null };

/** O telefone que a agência digitou, só para abrir o WhatsApp certo (não vai para o servidor). */
function numeroDoWhats(t: string) {
  const d = t.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return d.length === 10 || d.length === 11 ? `55${d}` : null;
}

function linkDoWhats(numero: string | null, texto: string) {
  return `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(texto)}`;
}

export function ChamarCandidato({
  anuncioId,
  usuarioId,
  site,
  vaga,
  quem,
  comIA,
}: {
  anuncioId: string;
  usuarioId: string;
  /** o endereço do site, para montar o link inteiro */
  site: string;
  vaga: string;
  quem: string;
  /** a leitura do currículo (IA) está ligada */
  comIA: boolean;
}) {
  const [nome, setNome] = useState("");
  const [arquivo, setArquivo] = useState<Arquivo>(null);
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [fase, setFase] = useState<"parado" | "lendo" | "criando">("parado");
  const [criado, setCriado] = useState<Criado | null>(null);
  const seletorPdf = useRef<HTMLInputElement>(null);
  const seletorFoto = useRef<HTMLInputElement>(null);
  const campoNome = useRef<HTMLInputElement>(null);
  const trabalhando = fase !== "parado";

  function escolherPdf(e: ChangeEvent<HTMLInputElement>) {
    const pdf = e.target.files?.[0];
    e.target.value = "";
    if (!pdf) return;
    setErro(null);
    if (pdf.type !== "application/pdf") return setErro("Envie um arquivo PDF.");
    if (pdf.size > MAX_PDF_MB * 1024 * 1024) return setErro(`O PDF pode ter no máximo ${MAX_PDF_MB} MB.`);
    setArquivo({ tipo: "pdf", pdf });
  }

  function escolherFotos(e: ChangeEvent<HTMLInputElement>) {
    const fotos = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!fotos.length) return;
    setErro(null);
    if (fotos.length > MAX_FOTOS_CURRICULO) {
      return setErro(`Escolha no máximo ${MAX_FOTOS_CURRICULO} fotos, uma por página.`);
    }
    if (fotos.some((f) => !f.type.startsWith("image/"))) {
      return setErro("Escolha fotos (JPG ou PNG). Para PDF, use “Enviar PDF”.");
    }
    setArquivo({ tipo: "fotos", fotos });
  }

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setErroNome(null);
    const limpo = nome.replace(/\s+/g, " ").trim();
    if (limpo.length < 2) {
      setErroNome("Escreva o nome da pessoa.");
      campoNome.current?.focus();
      return;
    }
    const dados = new FormData();
    dados.set("nome", limpo);
    setFase(arquivo ? "lendo" : "criando");
    try {
      if (arquivo?.tipo === "pdf") dados.set("pdf", await enviarPdf(arquivo.pdf, usuarioId));
      if (arquivo?.tipo === "fotos") {
        (await fotosParaLeitura(arquivo.fotos)).forEach((b, i) => dados.append("foto", b, `pagina-${i + 1}.jpg`));
      }
      const r = await criarConviteCandidato(anuncioId, dados);
      if (!r.ok) {
        if (r.campo === "nome") {
          setErroNome(r.erro);
          campoNome.current?.focus();
        } else setErro(r.erro);
        return;
      }
      setCriado({
        nome: limpo,
        token: r.token,
        expira_em: r.expira_em,
        lido: r.curriculo ? resumoDaLeitura(r.curriculo) : null,
      });
      setNome("");
      setArquivo(null);
    } catch (e) {
      setErro(e instanceof ErroDaLeitura ? e.message : "Não deu para enviar o arquivo. Tente de novo.");
    } finally {
      setFase("parado");
    }
  }

  if (criado) {
    return (
      <ConvitePronto
        criado={criado}
        site={site}
        vaga={vaga}
        quem={quem}
        outro={() => {
          setCriado(null);
          setTimeout(() => campoNome.current?.focus(), 50);
        }}
      />
    );
  }

  return (
    <form onSubmit={criar} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="convite-nome" className="text-label">
          Nome da pessoa
        </label>
        <input
          ref={campoNome}
          id="convite-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={80}
          autoComplete="off"
          placeholder="Ex.: Joana Souza"
          aria-invalid={erroNome ? true : undefined}
          aria-describedby={erroNome ? "convite-nome-erro" : undefined}
          disabled={trabalhando}
          className={`${classesEntrada} sm:max-w-md`}
        />
        {erroNome && <MensagemErro id="convite-nome-erro">{erroNome}</MensagemErro>}
      </div>

      {comIA && (
        <div className="flex flex-col gap-2">
          <p className="text-label">
            Currículo que a pessoa mandou <span className="font-normal text-ink-muted">(opcional)</span>
          </p>
          <p className="text-body-sm text-ink-muted">
            PDF de até {MAX_PDF_MB} MB ou até {MAX_FOTOS_CURRICULO} fotos da folha. O Publike lê e monta o currículo
            dela, sem telefone nem e-mail; o arquivo não fica guardado. Ela confere antes de aceitar.
          </p>
          <input
            ref={seletorPdf}
            type="file"
            accept="application/pdf"
            onChange={escolherPdf}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
          <input
            ref={seletorFoto}
            type="file"
            accept="image/*"
            multiple
            onChange={escolherFotos}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
          {arquivo ? (
            <p className="flex flex-wrap items-center gap-2 text-body-sm">
              <span className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface-100 px-3">
                {arquivo.tipo === "pdf" ? (
                  <FileText aria-hidden className="size-4 text-ink-muted" />
                ) : (
                  <Camera aria-hidden className="size-4 text-ink-muted" />
                )}
                <span className="max-w-[16rem] truncate">
                  {arquivo.tipo === "pdf"
                    ? arquivo.pdf.name
                    : arquivo.fotos.length === 1
                      ? "1 foto"
                      : `${arquivo.fotos.length} fotos`}
                </span>
              </span>
              <Botao tamanho="sm" variante="fantasma" onClick={() => setArquivo(null)} disabled={trabalhando}>
                <X aria-hidden />
                Tirar
              </Botao>
            </p>
          ) : (
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <Botao onClick={() => seletorPdf.current?.click()} disabled={trabalhando}>
                <FileUp aria-hidden />
                Enviar PDF
              </Botao>
              <Botao onClick={() => seletorFoto.current?.click()} disabled={trabalhando}>
                <Camera aria-hidden />
                Foto do currículo
              </Botao>
            </div>
          )}
        </div>
      )}

      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" variante="primario" disabled={trabalhando}>
          {trabalhando ? <LoaderCircle aria-hidden className="motion-safe:animate-spin" /> : <UserPlus aria-hidden />}
          {fase === "lendo" ? "Lendo o currículo…" : fase === "criando" ? "Criando…" : "Criar o convite"}
        </Botao>
        {fase === "lendo" && (
          <p role="status" className="text-body-sm text-ink-muted">
            Pode levar até um minuto.
          </p>
        )}
      </div>
    </form>
  );
}

function ConvitePronto({
  criado,
  site,
  vaga,
  quem,
  outro,
}: {
  criado: Criado;
  site: string;
  vaga: string;
  quem: string;
  outro: () => void;
}) {
  const [telefone, setTelefone] = useState("");
  const url = `${site}/candidatura/${criado.token}`;
  const numero = numeroDoWhats(telefone);
  const texto = mensagemDoConvite({ nome: criado.nome, quem, vaga, url, comCurriculo: criado.lido !== null });
  const primeiro = criado.nome.split(" ")[0];
  return (
    <div className="flex flex-col gap-4">
      <div role="status">
        <p className="flex items-center gap-2 text-label text-cerrado-text">
          <Check aria-hidden className="size-5" />
          Convite para {primeiro} pronto. Vale até {formatarDataCurta(criado.expira_em)}.
        </p>
        <p className="mt-1 text-body-sm text-ink-muted">
          {criado.lido
            ? `Lemos o currículo: ${criado.lido}. ${primeiro} confere tudo antes de aceitar.`
            : `${primeiro} preenche o currículo ao aceitar.`}{" "}
          Mande o link: quando aceitar, aparece no quadro e você recebe o aviso.
        </p>
      </div>
      <LinkParaCopiar url={url} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="convite-whats" className="text-label">
          WhatsApp de {primeiro} <span className="font-normal text-ink-muted">(opcional, não fica guardado)</span>
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id="convite-whats"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            inputMode="tel"
            autoComplete="off"
            placeholder="(62) 99999-0000"
            className={`${classesEntrada} sm:max-w-60`}
          />
          <a
            href={linkDoWhats(numero, texto)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-cerrado px-5 text-label text-on-cerrado hover:brightness-110"
          >
            <MessageCircle aria-hidden className="size-[18px]" />
            {numero ? `Mandar para ${primeiro} no WhatsApp` : "Mandar pelo WhatsApp"}
          </a>
        </div>
      </div>
      <div>
        <Botao tamanho="sm" onClick={outro}>
          <UserPlus aria-hidden />
          Chamar outra pessoa
        </Botao>
      </div>
    </div>
  );
}

function LinkParaCopiar({ url, rotulo = "Link do convite (para copiar)" }: { url: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  const [falhou, setFalhou] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setFalhou(false);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      setFalhou(true);
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          readOnly
          value={url}
          aria-label={rotulo}
          onFocus={(e) => e.currentTarget.select()}
          className={`${classesEntrada} font-mono text-body-sm sm:flex-1`}
        />
        <Botao tamanho="sm" onClick={copiar}>
          {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copiado ? "Copiado" : "Copiar"}
        </Botao>
      </div>
      {falhou && <p className="text-body-sm text-danger">Não deu para copiar. Toque no link e copie à mão.</p>}
    </div>
  );
}

/** Os convites da vaga: quem aceitou, quem ainda não respondeu (o link de novo) e os que acabaram. */
export function ListaDeConvites({
  anuncioId,
  convites,
  site,
  vaga,
  quem,
  agora,
}: {
  anuncioId: string;
  convites: ConviteDaVaga[];
  site: string;
  vaga: string;
  quem: string;
  agora: number;
}) {
  return (
    <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
      {convites.map((c) => (
        <ItemConvite key={c.id} anuncioId={anuncioId} c={c} site={site} vaga={vaga} quem={quem} agora={agora} />
      ))}
    </ul>
  );
}

function ItemConvite({
  anuncioId,
  c,
  site,
  vaga,
  quem,
  agora,
}: {
  anuncioId: string;
  c: ConviteDaVaga;
  site: string;
  vaga: string;
  quem: string;
  agora: number;
}) {
  const [pendente, iniciar] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const situacao = situacaoNaLista(c, agora);
  const info = SITUACOES_CONVITE[situacao];
  const url = `${site}/candidatura/${c.token}`;
  const quando =
    situacao === "aceito" && c.aceito_em
      ? `aceitou em ${formatarDataCurta(c.aceito_em)}`
      : situacao === "recusado" && c.recusado_em
        ? `respondeu em ${formatarDataCurta(c.recusado_em)}`
        : situacao === "valido"
          ? `vale até ${formatarDataCurta(c.expira_em)}`
          : `chamado em ${formatarDataCurta(c.criado_em)}`;
  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-label break-words">{c.nome}</span>
            <Selo variante={info.selo}>{info.nome}</Selo>
          </p>
          <p className="text-body-sm text-ink-muted">
            {quando}
            {situacao === "valido" && (c.tem_curriculo ? " · com o currículo lido" : " · sem currículo")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {situacao === "aceito" && c.perfil_id && (
            <Link
              href={`/painel/anuncio/${anuncioId}/quadro?candidato=${c.perfil_id}`}
              className="inline-flex min-h-10 items-center gap-2 text-label underline-offset-2 hover:underline"
            >
              <KanbanSquare aria-hidden className="size-4 text-ink-muted" />
              Abrir no quadro
            </Link>
          )}
          {situacao === "valido" && (
            <>
              <Botao tamanho="sm" variante="fantasma" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
                <ExternalLink aria-hidden />
                {aberto ? "Fechar o link" : "Ver o link"}
              </Botao>
              {confirmar ? (
                <span className="flex flex-wrap items-center gap-2 text-body-sm">
                  O link para de abrir.
                  <Botao
                    tamanho="sm"
                    variante="perigo"
                    disabled={pendente}
                    onClick={() =>
                      iniciar(async () => {
                        const r = await cancelarConviteCandidato(c.id);
                        setAviso(r.ok ? null : r.erro);
                        setConfirmar(false);
                      })
                    }
                  >
                    {pendente ? "Cancelando…" : "Cancelar o convite"}
                  </Botao>
                  <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(false)}>
                    Voltar
                  </Botao>
                </span>
              ) : (
                <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(true)}>
                  <X aria-hidden />
                  Cancelar
                </Botao>
              )}
            </>
          )}
        </div>
      </div>
      {aberto && situacao === "valido" && (
        <div className="flex flex-col gap-2">
          <LinkParaCopiar url={url} rotulo={`Link do convite de ${c.nome} (para copiar)`} />
          <a
            href={linkDoWhats(
              null,
              mensagemDoConvite({ nome: c.nome, quem, vaga, url, comCurriculo: c.tem_curriculo }),
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md bg-cerrado px-3.5 text-label text-on-cerrado hover:brightness-110"
          >
            <MessageCircle aria-hidden className="size-[18px]" />
            Mandar pelo WhatsApp
          </a>
        </div>
      )}
      {aviso && (
        <p role="alert" className="text-body-sm text-danger">
          {aviso}
        </p>
      )}
    </li>
  );
}
