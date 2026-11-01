-- O rastro das contas apagadas e o motivo de quem sai (pedido de 01/11/2026). Pode rodar de novo.
-- Rode depois de 20270112120000_busca_sem_postgis.sql.
-- Uma conta apagada não some sem explicação no admin (o link do aviso "Novo cadastro" levava a uma página vazia): fica
-- quem apagou (a própria pessoa ou a equipe), quando, quanto tempo a conta durou, o tipo, a cidade e o motivo que a
-- pessoa quis contar. Sem nome, contato nem documento (LGPD); o registro some em 12 meses.

create table if not exists privado.contas_apagadas (
  -- o id que a conta tinha (o mesmo do link do aviso de cadastro)
  id uuid primary key,
  tipo text,
  cidade text,
  criada_em timestamptz,
  apagada_em timestamptz not null default now(),
  por text not null check (por in ('pessoa', 'equipe')),
  -- o que a pessoa escolheu ou escreveu ao sair (opcional)
  motivo text check (motivo is null or char_length(motivo) <= 400)
);
create index if not exists contas_apagadas_quando on privado.contas_apagadas (apagada_em desc);
alter table privado.contas_apagadas enable row level security;
revoke all on table privado.contas_apagadas from public, anon, authenticated;

create or replace function privado.anotar_conta_apagada(p_id uuid, p_por text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from privado.contas_apagadas where apagada_em < now() - interval '12 months';
  insert into privado.contas_apagadas (id, tipo, cidade, criada_em, por, motivo)
  select u.id, p.tipo, p.cidade, u.created_at, p_por, nullif(left(btrim(coalesce(p_motivo, '')), 400), '')
    from auth.users u
    left join public.perfis p on p.id = u.id
   where u.id = p_id
  on conflict (id) do update
    set apagada_em = now(), por = excluded.por, motivo = coalesce(excluded.motivo, privado.contas_apagadas.motivo);
end
$$;

-- Excluir a conta é só da própria pessoa, na própria conta (o mesmo da 20261020120000, com o registro e o motivo).
create or replace function public.excluir_minha_conta(p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null then
    raise exception 'Entre na sua conta para excluí-la.' using errcode = '42501';
  end if;
  if public.conta_atual() is distinct from usuario then
    raise exception 'Você está agindo pela equipe de uma agência. Troque para a sua conta para excluí-la.'
      using errcode = 'P0001', hint = 'equipe';
  end if;
  perform privado.exigir_conta_ativa();
  perform privado.anotar_conta_apagada(usuario, 'pessoa', p_motivo);
  delete from auth.users where id = usuario;
end
$$;

-- a de antes, sem o motivo (o site de antes desta migração chama assim)
create or replace function public.excluir_minha_conta()
returns void
language sql
security definer
set search_path = ''
as $$
  select public.excluir_minha_conta(null::text)
$$;

-- A equipe apaga uma conta (o mesmo da 20261008120000, com o registro sem nome)
create or replace function public.admin_excluir_conta(p_usuario uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rotulo text;
  motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform privado.exigir_admin();
  if exists (select 1 from public.moderadores m where m.perfil_id = p_usuario) then
    raise exception 'Essa pessoa é moderadora. Tire ela da moderação antes.' using errcode = 'P0001';
  end if;
  if motivo is null or char_length(motivo) < 3 then
    raise exception 'Escreva o motivo (fica no registro da equipe).' using errcode = 'P0001';
  end if;
  select coalesce(p.nome, u.email::text, u.phone::text) into rotulo
    from auth.users u left join public.perfis p on p.id = u.id
   where u.id = p_usuario;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'P0002';
  end if;
  perform privado.anotar_conta_apagada(p_usuario, 'equipe', null);
  delete from auth.users where id = p_usuario;
  perform privado.registrar('excluir_conta', 'usuario', p_usuario::text, rotulo, jsonb_build_object('motivo', motivo));
end
$$;

-- Para o admin: uma conta apagada (a ficha) e as dos últimos dias (a lista)
create or replace function public.admin_conta_apagada(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r privado.contas_apagadas;
begin
  perform privado.exigir_admin();
  select * into r from privado.contas_apagadas c where c.id = p_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object('id', r.id, 'tipo', r.tipo, 'cidade', r.cidade, 'criada_em', r.criada_em,
                            'apagada_em', r.apagada_em, 'por', r.por, 'motivo', r.motivo,
                            'motivo_da_equipe', (select e.detalhes ->> 'motivo' from public.registro_equipe e
                                                  where e.acao = 'excluir_conta' and e.alvo_id = r.id::text
                                                  order by e.criado_em desc limit 1));
end
$$;

create or replace function public.admin_contas_apagadas(p_dias integer default 90)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return query
  select jsonb_build_object('id', c.id, 'tipo', c.tipo, 'cidade', c.cidade, 'criada_em', c.criada_em,
                            'apagada_em', c.apagada_em, 'por', c.por, 'motivo', c.motivo)
    from privado.contas_apagadas c
   where c.apagada_em > now() - make_interval(days => greatest(1, least(coalesce(p_dias, 90), 365)))
   order by c.apagada_em desc
   limit 200;
end
$$;

revoke all on function privado.anotar_conta_apagada(uuid, text, text) from public, anon, authenticated;
revoke all on function public.excluir_minha_conta(text), public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta(text), public.excluir_minha_conta() to authenticated;
-- as do admin: só com a chave secreta (o papel service_role, que fica com a permissão padrão)
revoke all on function public.admin_conta_apagada(uuid), public.admin_contas_apagadas(integer)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
