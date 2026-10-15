-- =====================================================================
-- Vitrine de serviços montada pelo admin
--
-- Conta criada pela equipe pode ser de prestador de serviço: o admin monta a
-- vitrine em nome dela. As funções do admin "agem como" a conta só dentro da
-- própria chamada (a transação), para usar as mesmas regras do cadastro
-- "Meus serviços" (limite de 8, onde atende, moderação, renovação).
--
-- Rode depois de 20261015170000_boas_vindas.sql. Pode rodar de novo.
-- =====================================================================

-- Faz auth.uid() valer a conta até o fim da transação (só dentro das funções do admin).
-- publike.pelo_admin avisa os gatilhos que foi a equipe (não manda e-mail de boas-vindas).
create or replace function privado.agir_como(p_usuario uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_usuario::text, true);
  perform set_config('publike.pelo_admin', '1', true);
end
$$;
revoke execute on function privado.agir_como(uuid) from public;

-- Os serviços da conta, como ela vê em "Meus serviços".
create or replace function public.admin_servicos_de(p_usuario uuid)
returns table (
  id uuid,
  oficio text,
  categoria text,
  titulo text,
  descricao text,
  pagamento_valor numeric,
  pagamento_unidade text,
  fotos text[],
  atende text[],
  horario text,
  cidade text,
  bairro text,
  lat double precision,
  lng double precision,
  status text,
  expira_em timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  perform privado.agir_como(p_usuario);
  return query select * from public.meus_servicos();
end
$$;

-- Salva a vitrine da conta (as mesmas regras de salvar_meus_servicos).
create or replace function public.admin_salvar_servicos_de(
  p_usuario uuid,
  p_servicos jsonb,
  p_cidade text,
  p_bairro text,
  p_lat double precision,
  p_lng double precision,
  p_atende text[],
  p_horario text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
begin
  perform privado.exigir_admin();
  select p.nome into v_nome from public.perfis p where p.id = p_usuario;
  if v_nome is null then
    raise exception 'Esta conta ainda não tem perfil.' using errcode = 'P0001';
  end if;
  -- o registro sai em nome da equipe, antes de agir como a conta
  perform privado.registrar('servicos_em_nome', 'usuario', p_usuario::text, v_nome, '{}'::jsonb);
  perform privado.agir_como(p_usuario);
  return public.salvar_meus_servicos(p_servicos, p_cidade, p_bairro, p_lat, p_lng, p_atende, p_horario);
end
$$;

revoke execute on function public.admin_servicos_de(uuid),
  public.admin_salvar_servicos_de(uuid, jsonb, text, text, double precision, double precision, text[], text)
  from public, anon, authenticated;
grant execute on function public.admin_servicos_de(uuid),
  public.admin_salvar_servicos_de(uuid, jsonb, text, text, double precision, double precision, text[], text)
  to service_role;

notify pgrst, 'reload schema';
