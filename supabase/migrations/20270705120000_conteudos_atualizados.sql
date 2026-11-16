-- Os números dos conteúdos em dia (16/11/2026, "também está fixo?"): os artigos de /conteudos têm números de fontes
-- que mudam (o Novo Caged todo mês, a PNAD a cada trimestre, a estimativa do IBGE todo ano). Uma vez por dia, o site
-- (/api/conteudos/atualizar, Vercel Cron) confere até 2 artigos com número (cada um no máximo a cada 7 dias): a IA
-- procura na web o dado oficial mais novo e, se tiver número novo, escreve a versão atualizada do artigo, que fica
-- como rascunho em Admin › Conteúdos. A página só muda quando o admin publica. O texto do repositório continua sendo
-- a base: o site mostra a última versão publicada aqui por cima dele.

create table if not exists privado.conteudos_atualizados (
  id bigint generated always as identity primary key,
  slug text not null check (slug ~ '^[a-z0-9-]{3,120}$'),
  -- titulo, descricao, blocos e fontes (o mesmo formato do artigo)
  dados jsonb not null,
  -- o que mudou, em uma ou duas frases (para o admin)
  motivo text not null default '' check (char_length(motivo) <= 600),
  situacao text not null default 'rascunho' check (situacao in ('rascunho', 'publicado', 'descartado')),
  criado_em timestamptz not null default now(),
  decidido_em timestamptz
);
create unique index if not exists conteudos_atualizados_um_rascunho
  on privado.conteudos_atualizados (slug) where situacao = 'rascunho';
create index if not exists conteudos_atualizados_publicados
  on privado.conteudos_atualizados (slug, decidido_em desc) where situacao = 'publicado';
alter table privado.conteudos_atualizados enable row level security;
revoke all on privado.conteudos_atualizados from public, anon, authenticated;

create table if not exists privado.conteudos_conferidos (
  slug text primary key check (slug ~ '^[a-z0-9-]{3,120}$'),
  conferido_em timestamptz not null default now(),
  resultado text not null default '' check (char_length(resultado) <= 600)
);
alter table privado.conteudos_conferidos enable row level security;
revoke all on privado.conteudos_conferidos from public, anon, authenticated;

-- o site: a última versão publicada de cada artigo
create or replace function public.conteudos_publicados()
returns table (slug text, dados jsonb, publicado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (c.slug) c.slug, c.dados, c.decidido_em
    from privado.conteudos_atualizados c
   where c.situacao = 'publicado'
   order by c.slug, c.decidido_em desc
$$;
revoke execute on function public.conteudos_publicados() from public;
grant execute on function public.conteudos_publicados() to anon, authenticated, service_role;

-- o robô: quais conferir agora (sem rascunho esperando e sem conferir há 7 dias), os nunca conferidos primeiro
create or replace function public.servidor_conteudos_para_conferir(p_chave text, p_slugs text[], p_quantos integer)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return coalesce((
    select array_agg(x.s order by x.quando nulls first, x.s)
      from (select s, k.conferido_em as quando
              from unnest(p_slugs) as s
              left join privado.conteudos_conferidos k on k.slug = s
             where (k.conferido_em is null or k.conferido_em < now() - interval '7 days')
               and not exists (select 1 from privado.conteudos_atualizados a
                                where a.slug = s and a.situacao = 'rascunho')
             order by k.conferido_em nulls first, s
             limit least(greatest(coalesce(p_quantos, 1), 1), 5)) x
  ), '{}'::text[]);
end
$$;

-- o robô: o que achou (e, com número novo, o rascunho da versão atualizada)
create or replace function public.servidor_conteudo_conferido(
  p_chave text, p_slug text, p_resultado text, p_dados jsonb, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.conteudos_conferidos (slug, conferido_em, resultado)
  values (p_slug, now(), left(coalesce(p_resultado, ''), 600))
  on conflict (slug) do update set conferido_em = now(), resultado = excluded.resultado;
  if p_dados is not null then
    delete from privado.conteudos_atualizados where slug = p_slug and situacao = 'rascunho';
    insert into privado.conteudos_atualizados (slug, dados, motivo)
    values (p_slug, p_dados, left(coalesce(p_motivo, ''), 600));
  end if;
end
$$;
revoke execute on function public.servidor_conteudos_para_conferir(text, text[], integer),
  public.servidor_conteudo_conferido(text, text, text, jsonb, text) from public, authenticated;
grant execute on function public.servidor_conteudos_para_conferir(text, text[], integer),
  public.servidor_conteudo_conferido(text, text, text, jsonb, text) to anon, service_role;

-- o admin: os rascunhos esperando e as últimas conferências
create or replace function public.admin_conteudos_atualizados()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike vê as atualizações dos conteúdos.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'rascunhos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'slug', a.slug, 'dados', a.dados,
                                                               'motivo', a.motivo, 'criado_em', a.criado_em)
                                            order by a.criado_em desc)
                             from privado.conteudos_atualizados a where a.situacao = 'rascunho'), '[]'::jsonb),
    'conferidos', coalesce((select jsonb_agg(jsonb_build_object('slug', k.slug, 'conferido_em', k.conferido_em,
                                                                'resultado', k.resultado)
                                             order by k.conferido_em desc)
                              from privado.conteudos_conferidos k), '[]'::jsonb));
end
$$;

-- o admin publica ou descarta o rascunho
create or replace function public.admin_decidir_conteudo(p_id bigint, p_publicar boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike publica as atualizações dos conteúdos.' using errcode = '42501';
  end if;
  update privado.conteudos_atualizados a
     set situacao = case when p_publicar then 'publicado' else 'descartado' end, decidido_em = now()
   where a.id = p_id and a.situacao = 'rascunho'
  returning a.slug into v_slug;
  if v_slug is null then
    raise exception 'Esse rascunho já foi decidido.' using errcode = 'P0002';
  end if;
  return v_slug;
end
$$;
revoke execute on function public.admin_conteudos_atualizados(), public.admin_decidir_conteudo(bigint, boolean)
  from public, anon;
grant execute on function public.admin_conteudos_atualizados(), public.admin_decidir_conteudo(bigint, boolean)
  to authenticated, service_role;

select privado.migracao_aplicada('20270705120000_conteudos_atualizados');
