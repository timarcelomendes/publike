-- Números para o moderador (09/11/2026). Em Admin › Quem vê cada tela, "/admin/numeros" sem a marca "Somente
-- publike.org" quer dizer que o moderador vê os números, mas o banco (painel_no_site) ainda só aceitava a equipe
-- publike.org liberada: o moderador via a aba e o aviso "Os números são só para a equipe com e-mail @publike.org".
-- Agora o banco segue a marca. Pode rodar de novo.

-- O moderador vê os números quando a tela está sem a marca (sem a linha, conta como marcada)
create or replace function privado.moderador_ve_numeros()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.eh_moderador()
     and exists (select 1 from privado.telas_do_admin t where t.rota = '/admin/numeros' and not t.somente_publike)
$$;

revoke execute on function privado.moderador_ve_numeros() from public, anon, authenticated;

do $$
declare
  def text;
  antigo constant text := 'if not privado.pode_ver_painel_no_site() then';
  novo constant text := 'if not (privado.pode_ver_painel_no_site() or privado.moderador_ve_numeros()) then';
begin
  def := pg_get_functiondef('public.painel_no_site()'::regprocedure);
  if position('privado.moderador_ve_numeros' in def) > 0 then
    return; -- já trocada
  end if;
  if position(antigo in def) = 0 then
    raise exception 'Não achei a conferência antiga em public.painel_no_site.';
  end if;
  execute replace(def, antigo, novo);
end
$$;

-- Dentro do painel_no_site (e só lá, com a marca da sessão), as leituras do admin aceitam também o moderador
do $$
declare
  def text;
  antigo constant text := '= ''sim'' and privado.pode_ver_painel_no_site())';
  novo constant text := '= ''sim'' and (privado.pode_ver_painel_no_site() or privado.moderador_ve_numeros()))';
begin
  def := pg_get_functiondef('privado.eh_admin()'::regprocedure);
  if position('privado.moderador_ve_numeros' in def) > 0 then
    return;
  end if;
  if position(antigo in def) = 0 then
    raise exception 'Não achei a conferência do painel em privado.eh_admin.';
  end if;
  execute replace(def, antigo, novo);
end
$$;

notify pgrst, 'reload schema';
