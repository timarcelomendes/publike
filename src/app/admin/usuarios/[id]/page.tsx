import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  AcertarLogin,
  ExcluirContaAdmin,
  ReativarConta,
  SeloVerificado,
  SuspenderConta,
} from "@/components/admin/acoes-conta";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { LinhaAnuncio } from "@/components/admin/linha-anuncio";
import { Dado, Secao } from "@/components/admin/ui";
import { Aviso, Avatar, Selo } from "@/components/ui/basicos";
import { advertenciasDe, fichaUsuario, listarAnuncios, matchesDesfeitosDe, registroDaEquipe } from "@/lib/admin/dados";
import { nomeMotivoDesfazer } from "@/lib/constantes";
import { descreverAcao } from "@/lib/admin/textos";
import {
  ehParaSempre,
  formatarDataCurta,
  formatarDataHora,
  formatarLugar,
  formatarTelefone,
  nomeDoProvedor,
  rotuloConta,
  tempoRelativo,
} from "@/lib/formato";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Conta" };

export default function Conta({ params }: PageProps<"/admin/usuarios/[id]">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/admin/usuarios/[id]">["params"] }) {
  const c = await exigirAdminLocal();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [u, anuncios, registro, advertencias, desfeitos, agora] = await Promise.all([
    fichaUsuario(c, id),
    listarAnuncios(c, { busca: null, status: "todos", tipo: null, autor: id, pagina: 1 }),
    registroDaEquipe(c, 20, id),
    advertenciasDe(c, id),
    matchesDesfeitosDe(c, id),
    agoraDaRequisicao(),
  ]);
  if (!u) notFound();

  const nome = u.perfil?.nome ?? u.email ?? u.telefone ?? "Conta sem nome";
  const s = u.suspensao;
  const banida = s?.tipo === "banimento" || ehParaSempre(s?.fim, agora);
  // O login (Supabase Auth) tem que bater com a suspensão.
  const bloqueadoAte = u.login_bloqueado_ate ? new Date(u.login_bloqueado_ate).getTime() : 0;
  const loginSolto = s ? bloqueadoAte < new Date(s.fim).getTime() - 60_000 : false;
  const loginPreso = !s && bloqueadoAte > agora;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/usuarios" className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Usuários
      </Link>

      <header className="flex flex-wrap items-center gap-4">
        <Avatar nome={nome} foto={u.perfil?.foto} tamanho={64} />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-h2 break-words">{nome}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {u.perfil ? <Selo>{rotuloConta(u.perfil.tipo)}</Selo> : <Selo variante="contorno">Sem perfil</Selo>}
            {u.moderador && <Selo>Moderador</Selo>}
            {u.perfil?.verificado && <Selo variante="match">Verificado</Selo>}
            {s && (banida ? <Selo variante="perigo">Banida</Selo> : <Selo variante="aviso">Suspensa</Selo>)}
          </div>
        </div>
      </header>

      {(loginSolto || loginPreso) && (
        <Aviso tipo="alerta" titulo={loginSolto ? "O login ainda não está bloqueado" : "O login ainda está bloqueado"}>
          <p>
            {loginSolto
              ? "A conta está suspensa, mas o Supabase ainda deixa a pessoa entrar."
              : `A conta não está suspensa, mas o Supabase bloqueia o login até ${formatarDataHora(u.login_bloqueado_ate ?? "")}.`}
          </p>
          <AcertarLogin usuarioId={u.id} bloquear={loginSolto} />
        </Aviso>
      )}

      {s ? (
        <Secao titulo={banida ? "Conta banida" : "Conta suspensa"}>
          <Aviso tipo="alerta" titulo={banida ? "Banida de vez" : `Suspensa até ${formatarDataHora(s.fim)}`}>
            <p>Motivo: {s.motivo}</p>
            <p>
              Desde {formatarDataHora(s.inicio)}. A pessoa não consegue entrar, os anúncios estão fora do ar e o contato
              não aparece nos matches.
            </p>
          </Aviso>
          <ReativarConta usuarioId={u.id} />
        </Secao>
      ) : (
        <Secao
          titulo="Suspender ou banir"
          descricao="A pessoa sai do site na hora, os anúncios somem das buscas e o contato some dos matches. Quando a suspensão vence, tudo volta sozinho."
        >
          <SuspenderConta usuarioId={u.id} moderador={u.moderador} />
        </Secao>
      )}

      <Secao titulo="Dados da conta">
        <dl className="flex flex-col gap-3">
          <Dado rotulo="E-mail de login">{u.email ?? "—"}</Dado>
          {u.telefone && <Dado rotulo="Celular de login">{formatarTelefone(u.telefone)}</Dado>}
          <Dado rotulo="Entra com">
            {(u.provedores.length ? u.provedores : [u.provedor]).map(nomeDoProvedor).join(", ")}
          </Dado>
          <Dado rotulo="Conta criada">{formatarDataHora(u.criado_em)}</Dado>
          <Dado rotulo="Último acesso">{u.ultimo_acesso ? tempoRelativo(u.ultimo_acesso, agora) : "Nunca entrou"}</Dado>
          <Dado rotulo="WhatsApp">{u.contato.whatsapp ? formatarTelefone(u.contato.whatsapp) : "—"}</Dado>
          <Dado rotulo="E-mail de contato">{u.contato.email ?? "—"}</Dado>
          <Dado rotulo="Avisos por e-mail">{u.contato.receber_emails ? "Recebe" : "Desligou"}</Dado>
        </dl>
      </Secao>

      {u.perfil && (
        <Secao
          titulo="Perfil"
          acoes={
            <Link href={`/perfil/${u.id}`} className="inline-flex min-h-10 items-center gap-1.5 text-label underline">
              Ver perfil público
              <ExternalLink aria-hidden className="size-4" />
            </Link>
          }
        >
          <dl className="flex flex-col gap-3">
            <Dado rotulo="Onde">{formatarLugar(u.perfil.bairro, u.perfil.cidade)}</Dado>
            <Dado rotulo="No Publike desde">{formatarDataCurta(u.perfil.criado_em)}</Dado>
            {u.perfil.servicos.length > 0 && <Dado rotulo="Faz">{u.perfil.servicos.join(", ")}</Dado>}
            {u.perfil.sobre && <Dado rotulo="Apresentação">{u.perfil.sobre}</Dado>}
          </dl>
          <SeloVerificado usuarioId={u.id} verificado={u.perfil.verificado} />
        </Secao>
      )}

      <Secao titulo="Números">
        <dl className="grid grid-cols-2 gap-3 text-body-sm sm:grid-cols-4">
          {[
            ["Anúncios", u.numeros.anuncios],
            ["No ar", u.numeros.no_ar],
            ["Curtidas feitas", u.numeros.curtidas_feitas],
            ["Curtidas recebidas", u.numeros.curtidas_recebidas],
            ["Matches", u.numeros.matches],
            ["Denúncias recebidas", u.numeros.denuncias_recebidas],
            ["Denúncias confirmadas", u.numeros.denuncias_procedentes],
            ["Denúncias que fez", u.numeros.denuncias_feitas],
          ].map(([rotulo, valor]) => (
            <div key={rotulo} className="flex flex-col">
              <dt className="text-ink-muted">{rotulo}</dt>
              <dd className="font-display text-h3">{valor}</dd>
            </div>
          ))}
        </dl>
      </Secao>

      <Secao titulo={`Anúncios (${anuncios.total})`}>
        {anuncios.itens.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Nenhum anúncio.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {anuncios.itens.map((a) => (
              <LinhaAnuncio key={a.id} a={a} agora={agora} mostrarAutor={false} />
            ))}
          </ul>
        )}
      </Secao>

      {advertencias.length > 0 && (
        <Secao
          titulo={`Advertências (${advertencias.length})`}
          descricao="Textos de avaliação retidos pela IA ou removidos pela equipe. Use para decidir uma suspensão."
        >
          <ul className="flex flex-col divide-y divide-line">
            {advertencias.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 py-2.5 text-body-sm">
                <span>{a.motivo}</span>
                <span className="text-ink-muted">
                  {formatarDataHora(a.criado_em)} · {a.origem === "ia" ? "IA" : "Equipe"}
                </span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {desfeitos.length > 0 && (
        <Secao
          titulo={`Matches desfeitos (${desfeitos.length})`}
          descricao="Os que a pessoa desfez e os que desfizeram com ela, com a justificativa escrita (a outra pessoa só vê o motivo)."
        >
          <ul className="flex flex-col divide-y divide-line">
            {desfeitos.map((d) => (
              <li key={d.id} className="flex flex-col gap-0.5 py-2.5 text-body-sm">
                <span className="text-label">
                  {d.fez ? "Desfez com " : "Desfeito por "}
                  {d.outro_id ? (
                    <Link href={`/admin/usuarios/${d.outro_id}`} className="underline">
                      {d.outro_nome ?? "conta apagada"}
                    </Link>
                  ) : (
                    "conta apagada"
                  )}{" "}
                  · {nomeMotivoDesfazer(d.motivo)}
                </span>
                <span className="text-ink-muted">
                  {d.fez
                    ? d.futuro
                      ? "Disse que topa negociar de novo."
                      : "Disse que não quer negociar de novo (os dois ficaram bloqueados)."
                    : d.futuro
                      ? "Quem desfez topa negociar de novo."
                      : "Quem desfez não quer negociar de novo (os dois ficaram bloqueados)."}
                </span>
                <span>“{d.justificativa}”</span>
                <span className="text-ink-muted">
                  {formatarDataHora(d.criado_em)} · {d.tipo_anuncio === "servico" ? "serviço" : "vaga"} “{d.titulo}”
                </span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {u.historico.length > 0 && (
        <Secao titulo="Suspensões">
          <ul className="flex flex-col divide-y divide-line">
            {u.historico.map((h) => (
              <li key={h.id} className="flex flex-col gap-0.5 py-2.5 text-body-sm">
                <span className="text-label">
                  {h.tipo === "banimento" ? "Banimento" : `Suspensão de ${h.dias} dias`}
                  {h.encerrada_em ? ` · encerrada em ${formatarDataCurta(h.encerrada_em)}` : ""}
                </span>
                <span>Motivo: {h.motivo}</span>
                <span className="text-ink-muted">
                  {formatarDataHora(h.inicio)} · por {h.aplicada_por ?? "Admin"}
                </span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {registro.length > 0 && (
        <Secao titulo="Registro da equipe">
          <ul className="flex flex-col divide-y divide-line">
            {registro.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5 text-body-sm">
                <span>
                  <strong className="font-semibold">{r.quem}</strong> {descreverAcao(r.acao, true)}
                  {typeof (r.detalhes as Record<string, unknown>)?.motivo === "string" &&
                    ` · “${(r.detalhes as Record<string, unknown>).motivo as string}”`}
                </span>
                <span className="text-ink-muted">{formatarDataHora(r.criado_em)}</span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <ExcluirContaAdmin usuarioId={u.id} nome={nome} />
    </div>
  );
}
