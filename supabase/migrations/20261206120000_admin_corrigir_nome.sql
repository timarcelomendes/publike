-- O admin corrige o nome de uma conta (28/10/2026). Pode rodar de novo.
--
-- Admin › Usuários › conta › Perfil: o nome que aparece no perfil, nas vagas, nas conversas e nos
-- avisos novos. As mesmas regras do perfil (de 2 a 80 letras, sem telefone, e-mail ou link: o gatilho
-- perfis_antes_de_salvar confere). Fica no registro da equipe, com o nome de antes e o de depois.

create or replace function public.admin_corrigir_nome(p_usuario uuid, p_nome text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  antes text;
  depois text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
begin
  perform privado.exigir_admin();
  if char_length(depois) not between 2 and 80 then
    raise exception 'O nome precisa ter de 2 a 80 letras.' using errcode = 'P0001', hint = 'nome';
  end if;
  select p.nome into antes from public.perfis p where p.id = p_usuario;
  if antes is null then
    raise exception 'Essa conta ainda não tem perfil.' using errcode = 'P0001';
  end if;
  if antes = depois then
    return depois;
  end if;
  perform set_config('publike.sistema', 'on', true);
  update public.perfis set nome = depois where id = p_usuario;
  perform set_config('publike.sistema', '', true);
  perform privado.registrar('corrigir_nome', 'usuario', p_usuario::text, antes || ' → ' || depois,
                            jsonb_build_object('antes', antes, 'depois', depois));
  return depois;
exception when others then
  perform set_config('publike.sistema', '', true);
  raise;
end
$$;

revoke execute on function public.admin_corrigir_nome(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_corrigir_nome(uuid, text) to service_role;

notify pgrst, 'reload schema';
