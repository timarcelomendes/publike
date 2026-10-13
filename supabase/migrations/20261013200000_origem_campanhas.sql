-- De qual campanha veio cada conta nova (13/10/2026). Pode rodar de novo sem problema.
-- O link do anúncio (Google, Instagram…) leva ?utm_source=google&utm_campaign=servicos; o site guarda
-- só "google:servicos" num cookie próprio por 7 dias e, quando a pessoa cria a conta, grava aqui.
-- Nada vai para fora: é só para o admin saber quantas contas e publicações cada campanha trouxe.

create table if not exists privado.origens (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  origem text not null check (origem ~ '^[a-z0-9_-]{1,40}(:[a-z0-9_-]{1,40})?$'),
  criado_em timestamptz not null default now()
);
alter table privado.origens enable row level security;
revoke all on table privado.origens from public, anon, authenticated;

-- Chamada logo depois de entrar. Só conta conta criada nas últimas 2 horas: quem já
-- tinha conta e clicou no anúncio não vira "cadastro da campanha". Vale a primeira.
create or replace function public.registrar_origem(p_origem text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
begin
  if usuario is null or p_origem is null or p_origem !~ '^[a-z0-9_-]{1,40}(:[a-z0-9_-]{1,40})?$' then
    return;
  end if;
  if not exists (select 1 from auth.users u where u.id = usuario and u.created_at > now() - interval '2 hours') then
    return;
  end if;
  insert into privado.origens (usuario_id, origem) values (usuario, p_origem)
  on conflict do nothing;
end
$$;
revoke execute on function public.registrar_origem(text) from public, anon;
grant execute on function public.registrar_origem(text) to authenticated;

-- Admin: por campanha, quantas contas, quantas publicaram vaga ou serviço e quantos anúncios estão no ar.
-- Sem p_desde, conta tudo. As contas sem campanha entram como "direto" para comparar.
drop function if exists public.admin_origens(timestamptz);
create function public.admin_origens(p_desde timestamptz default null)
returns table(origem text, contas bigint, publicaram_vaga bigint, publicaram_servico bigint, anuncios_no_ar bigint,
              primeira timestamptz, ultima timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
    with contas as (
      select u.id, coalesce(o.origem, 'direto') as origem, u.created_at
        from auth.users u
        left join privado.origens o on o.usuario_id = u.id
       where p_desde is null or u.created_at >= p_desde
    )
    select c.origem,
           count(*),
           count(*) filter (where exists (select 1 from public.anuncios a where a.autor_id = c.id and a.tipo = 'vaga')),
           count(*) filter (where exists (select 1 from public.anuncios a where a.autor_id = c.id and a.tipo = 'servico')),
           coalesce(sum((select count(*) from public.anuncios a where a.autor_id = c.id and a.status = 'ativo')), 0)::bigint,
           min(c.created_at),
           max(c.created_at)
      from contas c
     group by c.origem
     order by (c.origem = 'direto'), count(*) desc;
end
$$;
revoke execute on function public.admin_origens(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_origens(timestamptz) to service_role;

notify pgrst, 'reload schema';
