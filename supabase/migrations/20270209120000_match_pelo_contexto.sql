-- O % pela função que cada lado descreve (05/11/2026; claude/plano-match-pelo-contexto.md). A função da vaga sai do
-- texto todo (a IA lê o título e a descrição), e a de cada experiência do currículo também (o cargo e o "o que você
-- fazia"). O título é complemento. Pode rodar de novo.

-- 1. A função de cada experiência, guardada pela impressão do texto (sha-256 de cargo|descrição, sem acento):
-- não guarda o texto nem de quem é. A mesma experiência em dois currículos é lida uma vez só.
create table if not exists privado.funcoes_das_experiencias (
  chave text primary key check (chave ~ '^[0-9a-f]{40}$'),
  cbo text check (cbo is null or cbo ~ '^[0-9]{6}$'),
  -- ia: a IA leu o cargo e o que a pessoa fazia; regra: as regras do cargo (sem a IA); nenhuma: não achou
  origem text not null check (origem in ('ia', 'regra', 'nenhuma')),
  criado_em timestamptz not null default now()
);
alter table privado.funcoes_das_experiencias enable row level security;
revoke all on privado.funcoes_das_experiencias from public, anon, authenticated;

-- até quando o robô já leu cada currículo (separado do currículo: ler não mexe no "atualizado em" nem nos gatilhos)
create table if not exists privado.curriculos_lidos (
  perfil_id uuid primary key references public.curriculos (perfil_id) on delete cascade,
  lido_em timestamptz not null
);
alter table privado.curriculos_lidos enable row level security;
revoke all on privado.curriculos_lidos from public, anon, authenticated;

-- o % de qualquer tela: a ocupação de cada impressão pedida (só o código; a impressão não diz o texto)
create or replace function public.funcoes_das_experiencias(p_chaves text[])
returns table (chave text, cbo text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.chave, f.cbo
    from privado.funcoes_das_experiencias f
   where f.chave = any ((coalesce(p_chaves, '{}'))[1:2000]) and f.cbo is not null
$$;
revoke execute on function public.funcoes_das_experiencias(text[]) from public;
grant execute on function public.funcoes_das_experiencias(text[]) to anon, authenticated, service_role;

-- o robô: os currículos com experiência que mudaram desde a última leitura (os mais novos primeiro)
create or replace function public.servidor_curriculos_para_ler(p_chave text, p_limite integer default 10)
returns table (perfil_id uuid, atualizado_em timestamptz, experiencias jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select c.perfil_id, c.atualizado_em, c.experiencias
    from public.curriculos c
    left join privado.curriculos_lidos l on l.perfil_id = c.perfil_id
   where jsonb_typeof(c.experiencias) = 'array' and jsonb_array_length(c.experiencias) > 0
     and (l.lido_em is null or l.lido_em < c.atualizado_em)
   order by c.atualizado_em desc
   limit least(greatest(coalesce(p_limite, 10), 1), 50);
end
$$;

-- p_linhas: [{chave, cbo, origem}]; o que não achou ("nenhuma") pode virar achado depois
create or replace function public.servidor_guardar_funcoes_das_experiencias(p_chave text, p_linhas jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l jsonb;
begin
  perform privado.exigir_servidor(p_chave);
  if jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'Linhas inválidas.' using errcode = '22023';
  end if;
  for l in select value from jsonb_array_elements(p_linhas) loop
    if coalesce(l ->> 'chave', '') !~ '^[0-9a-f]{40}$'
       or coalesce(l ->> 'origem', '') not in ('ia', 'regra', 'nenhuma')
       or (l ->> 'cbo' is not null and l ->> 'cbo' !~ '^[0-9]{6}$') then
      raise exception 'Linha inválida.' using errcode = '22023';
    end if;
    insert into privado.funcoes_das_experiencias (chave, cbo, origem)
    values (l ->> 'chave', l ->> 'cbo', l ->> 'origem')
    on conflict (chave) do update set cbo = excluded.cbo, origem = excluded.origem, criado_em = now()
     where privado.funcoes_das_experiencias.origem <> 'ia' or excluded.origem = 'ia';
  end loop;
end
$$;

create or replace function public.servidor_marcar_curriculo_lido(p_chave text, p_perfil uuid, p_em timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  insert into privado.curriculos_lidos (perfil_id, lido_em)
  select c.perfil_id, p_em from public.curriculos c where c.perfil_id = p_perfil
  on conflict (perfil_id) do update set lido_em = greatest(privado.curriculos_lidos.lido_em, excluded.lido_em);
end
$$;

revoke execute on function public.servidor_curriculos_para_ler(text, integer),
  public.servidor_guardar_funcoes_das_experiencias(text, jsonb),
  public.servidor_marcar_curriculo_lido(text, uuid, timestamptz) from public;
grant execute on function public.servidor_curriculos_para_ler(text, integer),
  public.servidor_guardar_funcoes_das_experiencias(text, jsonb),
  public.servidor_marcar_curriculo_lido(text, uuid, timestamptz) to anon, authenticated, service_role;

-- 2. A função da vaga pelo texto todo: as que a regra ou a IA acharam só pelo título (antes desta migração) são
-- lidas de novo uma vez, quando têm descrição e a IA está ligada.
alter table privado.funcoes_das_vagas add column if not exists pelo_contexto boolean not null default false;

drop function if exists public.servidor_vagas_sem_funcao(text, integer);
create or replace function public.servidor_vagas_sem_funcao(
  p_chave text,
  p_limite integer default 20,
  p_com_contexto boolean default false
)
returns table (id uuid, titulo text, descricao text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  return query
  select a.id, a.titulo, left(a.descricao, 1200)
    from public.anuncios a
   where a.tipo = 'vaga' and a.status in ('ativo', 'pausado', 'em_analise')
     and (
       -- a que não achou função volta depois de 7 dias (a IA pode ter sido ligada, a regra pode ter mudado)
       not exists (select 1 from privado.funcoes_das_vagas f
                    where f.anuncio_id = a.id and (f.origem <> 'nenhuma' or f.atualizado_em > now() - interval '7 days'))
       -- com a IA ligada: a que foi achada (ou não achada) só pelo título e tem descrição
       or (coalesce(p_com_contexto, false) and char_length(regexp_replace(coalesce(a.descricao, ''), '\s', '', 'g')) >= 80
           and exists (select 1 from privado.funcoes_das_vagas f
                        where f.anuncio_id = a.id and f.origem <> 'empresa' and not f.pelo_contexto))
     )
   order by a.criado_em desc
   limit least(greatest(coalesce(p_limite, 20), 1), 100);
end
$$;

drop function if exists public.servidor_definir_funcao(text, uuid, text, text);
create or replace function public.servidor_definir_funcao(
  p_chave text,
  p_anuncio uuid,
  p_cbo text,
  p_origem text,
  p_contexto boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if p_origem not in ('regra', 'ia', 'nenhuma') or (p_cbo is not null and p_cbo !~ '^[0-9]{6}$') then
    raise exception 'Função inválida.' using errcode = '22023';
  end if;
  insert into privado.funcoes_das_vagas (anuncio_id, cbo, origem, pelo_contexto)
  values (p_anuncio, p_cbo, p_origem, coalesce(p_contexto, false))
  on conflict (anuncio_id) do update
     set cbo = excluded.cbo, origem = excluded.origem, pelo_contexto = excluded.pelo_contexto, atualizado_em = now()
   where privado.funcoes_das_vagas.origem <> 'empresa';
end
$$;

revoke execute on function public.servidor_vagas_sem_funcao(text, integer, boolean),
  public.servidor_definir_funcao(text, uuid, text, text, boolean) from public;
grant execute on function public.servidor_vagas_sem_funcao(text, integer, boolean),
  public.servidor_definir_funcao(text, uuid, text, text, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
