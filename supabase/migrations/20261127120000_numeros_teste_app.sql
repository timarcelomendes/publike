-- O teste fechado do app na Play (27/10/2026): quantos abrem /testar-app (e de onde vieram) e quantos
-- tocam em cada passo (entrar no grupo, aceitar o teste, instalar) ou chamam alguém no WhatsApp. Só soma
-- por dia, sem guardar quem. O site conta por /api/teste-app; o admin lê (admin_numeros_teste_app).
-- Pode rodar de novo.

create table if not exists privado.teste_app_numeros (
  dia date not null,
  evento text not null check (evento in ('abriu', 'grupo', 'aceitar', 'instalar', 'whatsapp')),
  origem text not null check (origem in ('painel', 'instalar', 'whatsapp', 'outro')),
  total integer not null default 0,
  primary key (dia, evento, origem)
);
alter table privado.teste_app_numeros enable row level security;

create or replace function public.contar_teste_app(p_evento text, p_origem text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_evento not in ('abriu', 'grupo', 'aceitar', 'instalar', 'whatsapp') then
    return;
  end if;
  insert into privado.teste_app_numeros as n (dia, evento, origem, total)
  values (
    (now() at time zone 'America/Sao_Paulo')::date,
    p_evento,
    case when p_origem in ('painel', 'instalar', 'whatsapp') then p_origem else 'outro' end,
    1
  )
  on conflict (dia, evento, origem) do update set total = n.total + 1;
end
$$;
revoke execute on function public.contar_teste_app(text, text) from public;
grant execute on function public.contar_teste_app(text, text) to anon, authenticated;

-- os totais dos últimos dias, por passo e por origem (o admin soma)
create or replace function public.admin_numeros_teste_app(p_dias integer default 30)
returns table (evento text, origem text, total integer, hoje integer)
language sql
stable
security definer
set search_path = ''
as $$
  select n.evento, n.origem, sum(n.total)::integer,
         coalesce(sum(n.total) filter (where n.dia = (now() at time zone 'America/Sao_Paulo')::date), 0)::integer
    from privado.teste_app_numeros n
   where n.dia > (now() at time zone 'America/Sao_Paulo')::date - least(greatest(coalesce(p_dias, 30), 1), 365)
   group by 1, 2
$$;
revoke execute on function public.admin_numeros_teste_app(integer) from public, anon, authenticated;
grant execute on function public.admin_numeros_teste_app(integer) to service_role;
