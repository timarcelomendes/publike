"use client";

import { Camera, Plus, X } from "lucide-react";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { excluirConta, salvarPerfil } from "@/lib/acoes/perfil";
import { BAIRROS } from "@/lib/bairros";
import { bairroDaReceita, formatarCnpj, limparCnpj, nomeDaReceita, type DadosCnpj } from "@/lib/cnpj";
import { CIDADES, LIMITES_CONTA, TIPOS_CONTA, type Cidade } from "@/lib/constantes";
import { formatarTelefone } from "@/lib/formato";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import type { EstadoForm, MeuPerfil, TipoConta } from "@/lib/tipos";
import { CampoCnpj } from "./campo-cnpj";
import { Aviso, Avatar } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { Campo, classesEntrada, ligarCampo, MensagemErro, Seletor } from "./ui/campo";

const SUGESTOES = [
  "Diarista",
  "Pedreiro",
  "Eletricista",
  "Pintor",
  "Garçom",
  "Cozinha",
  "Atendimento",
  "Vendas",
  "Motorista",
  "Entregas",
  "Babá",
  "Cuidador de idosos",
  "Manicure",
  "Jardinagem",
];

/** Reduz a foto para um quadrado de 320 px (JPEG), para ficar leve no celular. */
async function reduzirFoto(arquivo: File, lado = 320): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo);
  const menor = Math.min(imagem.width, imagem.height);
  const tela = document.createElement("canvas");
  tela.width = lado;
  tela.height = lado;
  const ctx = tela.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(imagem, (imagem.width - menor) / 2, (imagem.height - menor) / 2, menor, menor, 0, 0, lado, lado);
  return new Promise((resolver, rejeitar) =>
    tela.toBlob((b) => (b ? resolver(b) : rejeitar(new Error("blob"))), "image/jpeg", 0.85),
  );
}

function mascararCelular(valor: string) {
  const d = valor.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function FormPerfil({
  perfil,
  usuarioId,
  telefone,
  email,
  nomeSugerido,
  completar,
  proximo,
}: {
  perfil: MeuPerfil | null;
  usuarioId: string;
  telefone: string | null;
  email: string | null;
  /** Nome da conta Google, Facebook ou LinkedIn: já vem preenchido no primeiro acesso. */
  nomeSugerido?: string | null;
  completar: boolean;
  proximo: string;
}) {
  const [estado, acao, enviando] = useActionState(salvarPerfil, { ok: false } as EstadoForm);
  const [nome, setNome] = useState(perfil?.nome ?? nomeSugerido ?? "");
  const [tipo, setTipo] = useState<TipoConta>((perfil?.tipo as TipoConta) ?? "pessoa");
  const [foto, setFoto] = useState<string | null>(perfil?.foto ?? null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const [cidade, setCidade] = useState(perfil?.cidade ?? "Goiânia");
  const [servicos, setServicos] = useState<string[]>(perfil?.servicos ?? []);
  const [novo, setNovo] = useState("");
  const [whatsapp, setWhatsapp] = useState(
    perfil?.whatsapp ? formatarTelefone(perfil.whatsapp) : telefone ? mascararCelular(telefone) : "",
  );
  const [cnpj, setCnpj] = useState(formatarCnpj(perfil?.cnpj));
  const [bairro, setBairro] = useState(perfil?.bairro ?? "");
  const formulario = useRef<HTMLFormElement>(null);
  const erros = estado.erros ?? {};
  const agencia = tipo === "agencia";
  // o selo de verificado vale para aquele tipo de conta e aquele CNPJ
  const perdeSelo =
    Boolean(perfil?.verificado) &&
    (agencia !== (perfil?.tipo === "agencia") || (agencia && limparCnpj(cnpj) !== (perfil?.cnpj ?? "")));

  useEffect(() => {
    if (!estado.erros) return;
    formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [estado]);

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    startTransition(() => acao(dados));
  }

  /** Dados da Receita: no automático só preenche o que está vazio; no botão, troca nome, cidade e bairro. */
  function usarReceita(d: DadosCnpj, soVazios: boolean) {
    const novoNome = nomeDaReceita(d.nomeFantasia || d.razaoSocial).slice(0, 80);
    if (novoNome && (!soVazios || !nome.trim())) setNome(novoNome);
    const chave = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
    const cidadeDaReceita = d.uf === "GO" ? CIDADES.find((c) => chave(c) === chave(d.municipio ?? "")) : undefined;
    if (!cidadeDaReceita || (soVazios && bairro.trim())) return;
    setCidade(cidadeDaReceita);
    if (d.bairro) setBairro(bairroDaReceita(d.bairro).slice(0, 80));
  }

  function adicionar(valor: string) {
    const limpo = valor.trim().replace(/\s+/g, " ").slice(0, 40);
    if (limpo.length < 2 || servicos.length >= 12) return;
    if (servicos.some((s) => s.toLowerCase() === limpo.toLowerCase())) return;
    setServicos([...servicos, limpo]);
    setNovo("");
  }

  function teclaServico(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      adicionar(novo);
    }
  }

  async function escolherFoto(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      setErroFoto("Escolha uma imagem.");
      return;
    }
    setEnviandoFoto(true);
    setErroFoto(null);
    try {
      const imagem = await reduzirFoto(arquivo);
      const caminho = `${usuarioId}/${Date.now()}.jpg`;
      const supabase = criarClienteNavegador();
      const { error } = await supabase.storage
        .from("avatars")
        .upload(caminho, imagem, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
      if (error) throw error;
      setFoto(caminho);
    } catch {
      setErroFoto("Não foi possível enviar a foto. Tente outra imagem.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="flex flex-col gap-6">
      {completar && (
        <Aviso tipo="info" titulo="Falta pouco!">
          Complete seu perfil para publicar e curtir. Seu WhatsApp só aparece para quem der match com você.
        </Aviso>
      )}
      {estado.ok && estado.mensagem && <Aviso tipo="sucesso" titulo={estado.mensagem} />}
      {proximo && <input type="hidden" name="next" value={proximo} />}
      <input type="hidden" name="foto" value={foto ?? ""} />
      <input type="hidden" name="servicos" value={servicos.join(",")} />

      <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <Avatar nome={nome || "?"} foto={foto} tamanho={72} />
          <div className="flex flex-col gap-1">
            <label className={`inline-flex min-h-10 cursor-pointer items-center gap-2 self-start rounded-md border border-line-strong bg-surface-200 px-3.5 text-label hover:bg-surface-300 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${enviandoFoto ? "opacity-60" : ""}`}>
              <Camera aria-hidden className="size-[18px]" />
              {enviandoFoto ? "Enviando…" : foto ? "Trocar foto" : "Pôr uma foto"}
              <input type="file" accept="image/*" onChange={escolherFoto} disabled={enviandoFoto} className="sr-only" />
            </label>
            <p className="text-body-sm text-ink-muted">Opcional. Rosto ou logo ajudam a passar confiança.</p>
            {(erroFoto || erros.foto) && <MensagemErro>{erroFoto ?? erros.foto}</MensagemErro>}
          </div>
        </div>

        <Campo
          rotulo={tipo === "pessoa" ? "Seu nome" : agencia ? "Nome da agência" : "Nome do comércio ou da empresa"}
          nome="nome"
          erro={erros.nome}
        >
          <input
            {...ligarCampo("nome", erros.nome)}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={80}
            autoComplete={tipo === "pessoa" ? "name" : "organization"}
            className={classesEntrada}
          />
        </Campo>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label">Você é</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(TIPOS_CONTA).map(([valor, t]) => (
              <label
                key={valor}
                className="flex cursor-pointer flex-col rounded-md border border-line-strong bg-surface-200 p-3 has-[:checked]:border-ink has-[:checked]:bg-surface-300 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
              >
                <input
                  type="radio"
                  name="tipo"
                  value={valor}
                  checked={tipo === valor}
                  onChange={() => setTipo(valor as TipoConta)}
                  className="sr-only"
                />
                <span className="text-label">{t.nome}</span>
                <span className="text-body-sm text-ink-muted">{t.ajuda}</span>
              </label>
            ))}
          </div>
          {erros.tipo && <MensagemErro>{erros.tipo}</MensagemErro>}
        </fieldset>

        {tipo !== "pessoa" && (
          <CampoCnpj
            valor={cnpj}
            aoMudar={setCnpj}
            erro={erros.cnpj}
            agencia={agencia}
            aoAchar={(d) => usarReceita(d, true)}
            aoUsar={(d) => usarReceita(d, false)}
          />
        )}
        {agencia && (
          <p className="text-body-sm text-ink-muted">
            Publicar vagas é grátis. Depois que a equipe do Publike confere o CNPJ, a agência ganha o selo de verificada
            e pode ter até {LIMITES_CONTA.agenciaVerificada.noAr} vagas no ar e publicar{" "}
            {LIMITES_CONTA.agenciaVerificada.porDia} por dia. Antes disso, vale o limite de todas as contas:{" "}
            {LIMITES_CONTA.comum.noAr} no ar e {LIMITES_CONTA.comum.porDia} por dia.
          </p>
        )}
        {perdeSelo && (
          <Aviso tipo="alerta">
            Trocar o tipo da conta ou o CNPJ tira o selo de verificado até a equipe do Publike conferir de novo.
          </Aviso>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Cidade" nome="cidade" erro={erros.cidade}>
            <Seletor
              {...ligarCampo("cidade", erros.cidade)}
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              className={classesEntrada}
            >
              {CIDADES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Seletor>
          </Campo>
          <Campo rotulo="Bairro" nome="bairro" opcional erro={erros.bairro} ajuda="Aparece no perfil. Não coloque o endereço.">
            <input
              {...ligarCampo("bairro", erros.bairro, true)}
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
              list="bairros-perfil"
              maxLength={80}
              autoComplete="off"
              className={classesEntrada}
            />
            <datalist id="bairros-perfil">
              {(BAIRROS[cidade as Cidade] ?? []).map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Campo>
        </div>
      </section>

      <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:p-6">
        <div>
          <h2 className="text-h3">Contato</h2>
          <p className="mt-1 text-body-sm text-ink-muted">
            Só aparece para quem deu match com você. Nunca fica público no site.
          </p>
        </div>
        <Campo rotulo="WhatsApp" nome="whatsapp" erro={erros.whatsapp}>
          <input
            {...ligarCampo("whatsapp", erros.whatsapp)}
            value={whatsapp}
            onChange={(e) => setWhatsapp(mascararCelular(e.target.value))}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(62) 99999-0000"
            className={classesEntrada}
          />
        </Campo>
        <Campo rotulo="E-mail de contato" nome="email" opcional erro={erros.email}>
          <input
            {...ligarCampo("email", erros.email)}
            type="email"
            defaultValue={perfil?.email ?? email ?? ""}
            autoComplete="email"
            className={classesEntrada}
          />
        </Campo>
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="receber_emails"
            defaultChecked={perfil?.receber_emails ?? true}
            className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
          />
          <span>
            <span className="block text-label">Receber avisos por e-mail</span>
            <span className="block text-body-sm text-ink-muted">
              Curtidas, matches e avisos da moderação, no e-mail da sua conta.
            </span>
          </span>
        </label>
      </section>

      <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:p-6">
        <h2 className="text-h3">{tipo === "pessoa" ? "Sobre você" : agencia ? "Sobre a agência" : "Sobre o negócio"}</h2>
        <Campo
          rotulo={tipo === "pessoa" ? "O que você faz" : "Área de atuação"}
          nome="novo-servico"
          ajuda="Aparece para quem publica quando você curte. Até 12."
        >
          <div className="flex gap-2">
            <input
              id="novo-servico"
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={teclaServico}
              maxLength={40}
              placeholder="Ex.: pedreiro, garçom, diarista"
              className={classesEntrada}
              aria-describedby="novo-servico-ajuda"
            />
            <Botao onClick={() => adicionar(novo)} aria-label="Adicionar">
              <Plus aria-hidden />
            </Botao>
          </div>
        </Campo>
        {servicos.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="O que você faz">
            {servicos.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => setServicos(servicos.filter((x) => x !== s))}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-pill bg-ink px-3 text-label text-surface-100"
                >
                  {s}
                  <X aria-hidden className="size-4" />
                  <span className="sr-only">(remover)</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {SUGESTOES.filter((s) => !servicos.some((x) => x.toLowerCase() === s.toLowerCase()))
            .slice(0, 10)
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => adicionar(s)}
                className="inline-flex min-h-9 items-center gap-1 rounded-pill border border-line bg-surface-300 px-3 text-body-sm text-ink hover:border-line-strong"
              >
                <Plus aria-hidden className="size-3.5" />
                {s}
              </button>
            ))}
        </div>
        {erros.servicos && <MensagemErro>{erros.servicos}</MensagemErro>}

        <Campo rotulo="Apresentação" nome="sobre" opcional erro={erros.sobre}>
          <textarea
            {...ligarCampo("sobre", erros.sobre)}
            defaultValue={perfil?.sobre ?? ""}
            rows={4}
            maxLength={600}
            placeholder={
              tipo === "pessoa"
                ? "Ex.: Trabalho com cozinha há 3 anos. Tenho disponibilidade à noite e moro no Jardim América."
                : agencia
                  ? "Ex.: Recrutamento e seleção desde 2012. Atendemos comércio, indústria e escritórios de Goiânia."
                  : "Ex.: Restaurante de comida caseira no Setor Bueno, aberto desde 2015."
            }
            className={`${classesEntrada} resize-y`}
          />
        </Campo>
      </section>

      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      <Botao type="submit" variante="primario" disabled={enviando || enviandoFoto} className="self-start sm:min-w-56">
        {enviando ? "Salvando…" : proximo ? "Salvar e continuar" : "Salvar perfil"}
      </Botao>
    </form>
  );
}

export function ExcluirConta() {
  const [estado, acao, enviando] = useActionState(excluirConta, { ok: false } as EstadoForm);
  return (
    <details className="mt-10 rounded-lg border border-line bg-surface-200 p-5">
      <summary className="cursor-pointer text-label text-ink-muted">Excluir minha conta</summary>
      <form action={acao} className="mt-4 flex flex-col gap-4">
        <p className="text-body-sm">
          Isso apaga de vez seu perfil, seus anúncios, suas curtidas e seus matches. Não dá para desfazer.
        </p>
        <label className="flex items-start gap-3 text-body-sm">
          <input type="checkbox" name="confirmar" className="mt-0.5 size-5 accent-[var(--pk-danger)]" />
          Entendi e quero excluir minha conta.
        </label>
        {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}
        <Botao type="submit" variante="perigo" disabled={enviando} className="self-start">
          {enviando ? "Excluindo…" : "Excluir minha conta"}
        </Botao>
      </form>
    </details>
  );
}
