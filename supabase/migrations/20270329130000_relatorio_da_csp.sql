-- O relatório da política de scripts (09/11/2026, claude/plano-seguranca.md, item 1). Pode rodar a qualquer hora e
-- de novo.
--
-- O site manda a política de conteúdo (CSP) em modo de relatório: o navegador não bloqueia nada, mas avisa o que
-- bloquearia. Os avisos chegam em /api/csp e ficam aqui, contados (a regra, o site de onde veio o que seria
-- bloqueado e a página, sem a busca nem os segredos dos links). Com uma ou duas semanas sem aviso de coisa nossa,
-- a política passa a valer de verdade. Admin › Falhas mostra a lista.

create table if not exists privado.avisos_csp (
  diretiva text not null check (char_length(diretiva) between 1 and 60),
  bloqueado text not null check (char_length(bloqueado) between 1 and 200),
  pagina text not null check (char_length(pagina) between 1 and 200),
  vezes integer not null default 1,
  primeira timestamptz not null default now(),
  ultima timestamptz not null default now(),
  primary key (diretiva, bloqueado, pagina)
);
alter table privado.avisos_csp enable row level security;

-- O navegador (sem login) manda o aviso. No máximo 2000 combinações diferentes: o resto só soma nas que já existem.
create or replace function public.registrar_aviso_csp(p_diretiva text, p_bloqueado text, p_pagina text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d text := left(btrim(coalesce(p_diretiva, '')), 60);
  b text := left(btrim(coalesce(p_bloqueado, '')), 200);
  p text := left(btrim(coalesce(p_pagina, '')), 200);
begin
  if d = '' or b = '' or p = '' or d !~ '^[a-z-]+$' then
    return;
  end if;
  update privado.avisos_csp a
     set vezes = least(a.vezes, 2000000000) + 1, ultima = now()
   where a.diretiva = d and a.bloqueado = b and a.pagina = p;
  if found then
    return;
  end if;
  if (select count(*) from privado.avisos_csp) >= 2000 then
    return;
  end if;
  insert into privado.avisos_csp (diretiva, bloqueado, pagina) values (d, b, p)
  on conflict (diretiva, bloqueado, pagina) do update set vezes = privado.avisos_csp.vezes + 1, ultima = now();
end
$$;

revoke execute on function public.registrar_aviso_csp(text, text, text) from public;
grant execute on function public.registrar_aviso_csp(text, text, text) to anon, authenticated, service_role;

-- O admin (computador do dono) e a equipe publike.org leem; os mais frequentes primeiro
create or replace function public.admin_avisos_csp(p_limite integer default 200)
returns table (diretiva text, bloqueado text, pagina text, vezes integer, primeira timestamptz, ultima timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike vê os avisos da política de scripts.' using errcode = '42501';
  end if;
  return query
    select a.diretiva, a.bloqueado, a.pagina, a.vezes, a.primeira, a.ultima
      from privado.avisos_csp a
     order by a.ultima > now() - interval '7 days' desc, a.vezes desc
     limit greatest(1, least(coalesce(p_limite, 200), 1000));
end
$$;

-- Limpar a lista (depois de corrigir o que aparecia)
create or replace function public.admin_limpar_avisos_csp()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.eh_admin() then
    raise exception 'Só o admin limpa os avisos.' using errcode = '42501';
  end if;
  delete from privado.avisos_csp where true;
end
$$;

revoke execute on function public.admin_avisos_csp(integer), public.admin_limpar_avisos_csp() from public, anon;
grant execute on function public.admin_avisos_csp(integer) to authenticated, service_role;
grant execute on function public.admin_limpar_avisos_csp() to service_role;
