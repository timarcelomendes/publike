"use client";

import { Building2, Lock, MapPin } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { salvarCliente } from "@/lib/acoes/clientes";
import { BAIRROS } from "@/lib/bairros";
import { montarEndereco } from "@/lib/cep";
import type { Cliente } from "@/lib/clientes";
import { bairroDaReceita, formatarCnpj, nomeDaReceita, type DadosCnpj } from "@/lib/cnpj";
import { CIDADES, type Cidade } from "@/lib/constantes";
import { formatarTelefone } from "@/lib/formato";
import type { EstadoForm } from "@/lib/tipos";
import { CampoCnpj } from "../campo-cnpj";
import { LocalComCep } from "../mapa/local-com-cep";
import { trocarBairro } from "../mapa/seletor-local";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada, ligarCampo, Seletor } from "../ui/campo";

const ESTADO_INICIAL: EstadoForm = { ok: false };

/** Cidade da Receita entre as do Publike ("GOIANIA" vira "Goiânia"). */
function cidadeDaReceita(d: DadosCnpj): Cidade | null {
  const chave = (t: string) =>
    t
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toUpperCase();
  if (d.uf !== "GO") return null;
  return CIDADES.find((c) => chave(c) === chave(d.municipio ?? "")) ?? null;
}

function Parte({
  icone: Icone,
  titulo,
  texto,
  children,
}: {
  icone: typeof Building2;
  titulo: string;
  texto?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-h3">
          <Icone aria-hidden className="size-5 text-ink-muted" />
          {titulo}
        </h3>
        {texto && <p className="text-body-sm text-ink-muted">{texto}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Cadastro (ou edição) de um cliente da agência. Só o nome aparece nas vagas; CNPJ,
 * endereço, contato e anotações ficam só com a agência.
 */
export function FormCliente({ cliente, cidadePadrao }: { cliente: Cliente | null; cidadePadrao: string }) {
  const [estado, acao, enviando] = useActionState(salvarCliente, ESTADO_INICIAL);
  const erros = estado.erros ?? {};
  const formulario = useRef<HTMLFormElement>(null);
  const [cnpj, setCnpj] = useState(formatarCnpj(cliente?.cnpj ?? ""));
  const [nome, setNome] = useState(cliente?.nome ?? "");
  const [cidade, setCidade] = useState<string>(
    cliente?.cidade ?? ((CIDADES as readonly string[]).includes(cidadePadrao) ? cidadePadrao : CIDADES[0]),
  );
  const [lugar, setLugar] = useState({
    bairro: cliente?.bairro ?? "",
    cep: cliente?.cep ?? null,
    endereco: cliente?.endereco ?? null,
    numero: null as string | null,
    lat: cliente?.lat ?? null,
    lng: cliente?.lng ?? null,
  });
  // trocar o lugar pela Receita monta o "Ache pelo CEP" de novo, com o CEP e a rua novos
  const [chaveLugar, setChaveLugar] = useState(0);
  const [avisoReceita, setAvisoReceita] = useState<string | null>(null);

  // depois de um erro, leva até o primeiro campo com problema
  useEffect(() => {
    if (!estado.erros) return;
    formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [estado]);

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // o botão apertado vai junto ("Salvar e publicar uma vaga")
    const dados = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => acao(dados));
  }

  function usarReceita(d: DadosCnpj, soVazios: boolean) {
    const novoNome = nomeDaReceita(d.nomeFantasia || d.razaoSocial).slice(0, 80);
    if (novoNome && (!soVazios || !nome.trim())) setNome(novoNome);
    const c = cidadeDaReceita(d);
    if (!c) return;
    const campoBairro = formulario.current?.elements.namedItem("bairro");
    const bairroAtual = campoBairro instanceof HTMLInputElement ? campoBairro.value.trim() : lugar.bairro;
    if (soVazios && (bairroAtual || lugar.cep || lugar.lat != null)) return;
    setCidade(c);
    setLugar({
      bairro: d.bairro ? bairroDaReceita(d.bairro).slice(0, 80) : "",
      cep: d.cep,
      endereco: montarEndereco(d.logradouro ? nomeDaReceita(d.logradouro) : null, d.numero),
      numero: d.numero,
      lat: null,
      lng: null,
    });
    setChaveLugar((k) => k + 1);
    setAvisoReceita(d.cep ? "Trouxemos o endereço da Receita. Toque em “Achar no mapa” para marcar o ponto." : null);
  }

  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="flex flex-col gap-6">
      {cliente && <input type="hidden" name="id" value={cliente.id} />}

      <Parte icone={Building2} titulo="A empresa">
        <CampoCnpj
          valor={cnpj}
          aoMudar={setCnpj}
          erro={erros.cnpj}
          agencia={false}
          rotulo="CNPJ do cliente"
          ajuda="Com ele, buscamos na Receita o nome e o endereço da empresa. O número fica só com você."
          textoUsar="Usar o nome e o endereço da Receita"
          aoAchar={(d) => usarReceita(d, true)}
          aoUsar={(d) => usarReceita(d, false)}
        />
        <Campo
          rotulo="Nome da empresa"
          nome="nome"
          erro={erros.nome}
          ajuda="É o nome que aparece nas vagas deste cliente, junto com o da agência. Sem telefone, e-mail ou site."
        >
          <input
            {...ligarCampo("nome", erros.nome, true)}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={80}
            required
            autoComplete="off"
            placeholder="Ex.: Distribuidora Cerrado"
            className={classesEntrada}
          />
        </Campo>
        <label className="flex cursor-pointer items-start gap-3 rounded-md bg-surface-300 p-4">
          <input
            type="checkbox"
            name="confidencial"
            defaultChecked={cliente?.confidencial ?? false}
            className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
          />
          <span>
            <span className="block text-label">Vagas confidenciais</span>
            <span className="block text-body-sm text-ink-muted">
              As vagas novas deste cliente já vêm marcadas como “Empresa confidencial”: quem procura vaga não vê o nome.
              Dá para mudar em cada vaga.
            </span>
          </span>
        </label>
      </Parte>

      <Parte
        icone={MapPin}
        titulo="Onde fica"
        texto="Opcional. As vagas deste cliente já vêm com este lugar; dá para mudar em cada vaga."
      >
        {avisoReceita && <p className="-mt-2 text-body-sm text-ink">{avisoReceita}</p>}
        <LocalComCep
          key={chaveLugar}
          inicial={lugar.lat != null && lugar.lng != null ? { lat: lugar.lat, lng: lugar.lng } : null}
          inicialCep={lugar.cep}
          inicialEndereco={lugar.endereco}
          inicialNumero={lugar.numero}
          publico
          mapaOpcional
          cidade={cidade}
          erro={erros.lat ?? erros.lng}
          aoAchar={({ cidade: c, bairro: b }) => {
            // achou no mapa: o aviso da Receita já cumpriu o papel
            setAvisoReceita(null);
            if ((CIDADES as readonly string[]).includes(c)) setCidade(c);
            return trocarBairro(formulario.current?.elements.namedItem("bairro"), b);
          }}
        >
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
            <Campo rotulo="Bairro ou setor" nome="bairro" opcional erro={erros.bairro}>
              <input
                {...ligarCampo("bairro", erros.bairro)}
                defaultValue={lugar.bairro}
                list="bairros-cliente"
                maxLength={80}
                placeholder="Ex.: Setor Bueno"
                autoComplete="off"
                className={classesEntrada}
              />
              <datalist id="bairros-cliente">
                {(BAIRROS[cidade as Cidade] ?? []).map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Campo>
          </div>
        </LocalComCep>
        {(erros.cep || erros.endereco) && <p className="text-body-sm text-danger">{erros.cep ?? erros.endereco}</p>}
      </Parte>

      <Parte
        icone={Lock}
        titulo="Contato no cliente"
        texto="Só você vê. Para lembrar com quem falar sobre as vagas e os candidatos."
      >
        <Campo rotulo="Quem é o contato" nome="responsavel" opcional erro={erros.responsavel}>
          <input
            {...ligarCampo("responsavel", erros.responsavel)}
            defaultValue={cliente?.responsavel ?? ""}
            maxLength={80}
            autoComplete="off"
            placeholder="Ex.: Ana, do RH"
            className={classesEntrada}
          />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="WhatsApp ou telefone" nome="telefone" opcional erro={erros.telefone}>
            <input
              {...ligarCampo("telefone", erros.telefone)}
              defaultValue={cliente?.telefone ? formatarTelefone(cliente.telefone) : ""}
              type="tel"
              inputMode="tel"
              maxLength={20}
              autoComplete="off"
              placeholder="(62) 99999-0000"
              className={classesEntrada}
            />
          </Campo>
          <Campo rotulo="E-mail" nome="email" opcional erro={erros.email}>
            <input
              {...ligarCampo("email", erros.email)}
              defaultValue={cliente?.email ?? ""}
              type="email"
              inputMode="email"
              maxLength={120}
              autoComplete="off"
              placeholder="rh@empresa.com.br"
              className={classesEntrada}
            />
          </Campo>
        </div>
        <Campo
          rotulo="Anotações"
          nome="nota"
          opcional
          erro={erros.nota}
          ajuda="O que vale lembrar: como o cliente gosta de receber os candidatos, o que foi combinado, prazos."
        >
          <textarea
            {...ligarCampo("nota", erros.nota, true)}
            defaultValue={cliente?.nota ?? ""}
            rows={4}
            maxLength={1000}
            className={`${classesEntrada} resize-y`}
          />
        </Campo>
      </Parte>

      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Botao type="submit" variante="primario" disabled={enviando} className="sm:min-w-48">
          {enviando ? "Salvando…" : cliente ? "Salvar alterações" : "Salvar cliente"}
        </Botao>
        {!cliente && (
          <Botao type="submit" name="depois" value="publicar" disabled={enviando}>
            Salvar e publicar uma vaga
          </Botao>
        )}
        <Link
          href={cliente ? `/painel/clientes/${cliente.id}` : "/painel/clientes"}
          className="inline-flex min-h-11 items-center justify-center px-3 text-label text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
