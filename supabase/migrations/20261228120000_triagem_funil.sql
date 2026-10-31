-- Triagem com IA: o funil (claude/plano-triagem-automatica.md). Com muitos candidatos, ler todos com a IA não
-- dá (custo e tempo). Então:
--  1. sem IA, para todos: as perguntas eliminatórias tiram quem ficou fora, e a pré-nota (o % de match e as
--     palavras dos critérios) ordena o resto. A conta é feita no site (src/lib/copiloto.ts, funilDaTriagem);
--  2. a IA lê só os primeiros pela pré-nota: o teto da vaga (50 no começo). Quem chega depois só entra na
--     leitura se ficar dentro do teto, isto é, acima do último lido;
--  3. o resto aparece pela pré-nota, "não lido pela IA", e "Ler mais 50" aumenta o teto.

alter table privado.copiloto_vagas add column if not exists teto_leitura integer not null default 50;
alter table privado.copiloto_vagas drop constraint if exists copiloto_vagas_teto_leitura_check;
alter table privado.copiloto_vagas add constraint copiloto_vagas_teto_leitura_check
  check (teto_leitura between 50 and 100000);
-- quando a tarefa conferiu a vaga por último: sem candidato novo, currículo novo, critério ou teto novo, a
-- vaga não volta para a fila (com muitos candidatos, refazer a conta a cada rodada custaria à toa)
alter table privado.copiloto_vagas add column if not exists fila_conferida_em timestamptz;

alter table privado.copiloto_registro drop constraint if exists copiloto_registro_acao_check;
alter table privado.copiloto_registro add constraint copiloto_registro_acao_check
  check (acao in ('criterios', 'ligou', 'avaliou', 'convidou', 'ler_mais'));

-- a) a tela: o teto entra no que a aba lê
create or replace function public.copiloto_da_vaga(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c privado.copiloto_contas;
  v privado.copiloto_vagas;
begin
  if not exists (select 1 from public.anuncios a
                  where a.id = p_anuncio and a.tipo = 'vaga' and a.autor_id = public.conta_atual()) then
    raise exception 'Vaga não encontrada.' using errcode = 'P0001';
  end if;
  select * into c from privado.copiloto_contas x
   where x.conta_id = public.conta_atual() and (x.ate is null or x.ate > now());
  if not found then
    return jsonb_build_object('liberado', false);
  end if;
  select * into v from privado.copiloto_vagas x where x.anuncio_id = p_anuncio;
  return jsonb_build_object(
    'liberado', true,
    'criterios', coalesce(v.criterios, '[]'::jsonb),
    'versao', coalesce(v.versao, ''),
    'triagem', coalesce(v.triagem, c.triagem),
    'busca', coalesce(v.busca, c.busca),
    'atualizado_em', v.atualizado_em,
    'padrao_triagem', c.triagem,
    'padrao_busca', c.busca,
    'automaticos', coalesce(v.automaticos, false),
    'teto', coalesce(v.teto_leitura, 50));
end
$$;

-- b) "Ler mais 50": quem publicou aumenta o teto (e a vaga volta para a fila)
create or replace function public.copiloto_ler_mais(p_anuncio uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  novo integer;
begin
  perform privado.copiloto_minha_vaga(p_anuncio);
  update privado.copiloto_vagas
     set teto_leitura = least(teto_leitura + 50, 100000), fila_conferida_em = null
   where anuncio_id = p_anuncio
  returning teto_leitura into novo;
  if novo is null then
    raise exception 'Salve os critérios primeiro.' using errcode = 'P0001';
  end if;
  insert into privado.copiloto_registro (anuncio_id, conta_id, pessoa_id, acao, quantos, detalhe)
  values (p_anuncio, public.conta_atual(), (select auth.uid()), 'ler_mais', 50, 'teto:' || novo);
  return novo;
end
$$;

-- c) a tarefa: as vagas com candidato ainda não lido e alguma coisa nova desde a última conferida
create or replace function public.servidor_copiloto_vagas_para_ler(
  p_chave text, p_limite integer default 5, p_anuncio uuid default null)
returns table (
  anuncio_id uuid, conta_id uuid, vaga jsonb, triagem_perguntas jsonb, criterios jsonb, versao text,
  teto integer, restam integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
    select a.id, a.autor_id,
           jsonb_build_object(
             'titulo', a.titulo, 'descricao', coalesce(a.descricao, ''), 'escolaridade_minima', a.escolaridade_minima,
             'experiencia', a.experiencia, 'cnh', a.cnh, 'cidade', a.cidade, 'bairro', a.bairro,
             'jornada', a.jornada, 'horario_detalhe', a.horario_detalhe, 'perguntas', a.perguntas),
           coalesce(vt.criterios, '{}'::jsonb), v.criterios, v.versao, v.teto_leitura,
           greatest(0, 300 - (select count(*)::integer from privado.limites_uso u
                               where u.perfil_id = a.autor_id and u.acao = 'copiloto'
                                 and u.criado_em > now() - interval '24 hours'))
      from public.anuncios a
      join privado.copiloto_contas c on c.conta_id = a.autor_id and (c.ate is null or c.ate > now())
      join privado.copiloto_vagas v on v.anuncio_id = a.id and jsonb_array_length(v.criterios) > 0
      left join public.vaga_triagem vt on vt.anuncio_id = a.id
     where a.tipo = 'vaga' and a.status = 'ativo'
       and (p_anuncio is null or a.id = p_anuncio)
       and coalesce(v.triagem, c.triagem, true)
       and exists (
         select 1 from public.curtidas k
           join public.curriculos cv on cv.perfil_id = k.perfil_id
           left join privado.copiloto_avaliacoes l on l.anuncio_id = a.id and l.perfil_id = k.perfil_id
          where k.anuncio_id = a.id and k.status <> 'dispensada'
            and (l.perfil_id is null or l.versao <> v.versao or l.curriculo_em <> cv.atualizado_em)
            and (v.fila_conferida_em is null or k.criado_em > v.fila_conferida_em
                 or cv.atualizado_em > v.fila_conferida_em or v.atualizado_em > v.fila_conferida_em
                 or vt.atualizado_em > v.fila_conferida_em))
     order by v.fila_conferida_em nulls first, a.criado_em
     limit least(greatest(coalesce(p_limite, 5), 1), 20);
end
$$;

-- d) todos os candidatos da vaga com currículo (lidos ou não): o site faz a pré-nota e o corte
create or replace function public.servidor_copiloto_candidatos_da_vaga(p_chave text, p_anuncio uuid)
returns table (
  perfil_id uuid, curtido_em timestamptz, curriculo jsonb, curriculo_em timestamptz, nome text, bairro text,
  cidade text, respostas jsonb, mensagem text, lido boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
    select k.perfil_id, k.criado_em, to_jsonb(cv) - 'arquivo', cv.atualizado_em, p.nome, p.bairro, p.cidade,
           k.respostas, k.mensagem,
           (l.perfil_id is not null and l.versao = v.versao and l.curriculo_em = cv.atualizado_em)
      from public.curtidas k
      join privado.copiloto_vagas v on v.anuncio_id = k.anuncio_id
      join public.curriculos cv on cv.perfil_id = k.perfil_id
      join public.perfis p on p.id = k.perfil_id
      left join privado.copiloto_avaliacoes l on l.anuncio_id = k.anuncio_id and l.perfil_id = k.perfil_id
     where k.anuncio_id = p_anuncio and k.status <> 'dispensada'
     order by k.criado_em
     limit 20000;
end
$$;

-- e) a vaga foi conferida (com a hora em que a lista foi lida, para não perder quem chegou no meio)
create or replace function public.servidor_copiloto_vaga_conferida(p_chave text, p_anuncio uuid, p_em timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.copiloto_vagas set fila_conferida_em = least(coalesce(p_em, now()), now())
   where anuncio_id = p_anuncio;
end
$$;

revoke all on function public.copiloto_ler_mais(uuid) from public, anon;
grant execute on function public.copiloto_ler_mais(uuid) to authenticated;
revoke all on function public.servidor_copiloto_vagas_para_ler(text, integer, uuid),
  public.servidor_copiloto_candidatos_da_vaga(text, uuid),
  public.servidor_copiloto_vaga_conferida(text, uuid, timestamptz) from public;
grant execute on function public.servidor_copiloto_vagas_para_ler(text, integer, uuid),
  public.servidor_copiloto_candidatos_da_vaga(text, uuid),
  public.servidor_copiloto_vaga_conferida(text, uuid, timestamptz)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
