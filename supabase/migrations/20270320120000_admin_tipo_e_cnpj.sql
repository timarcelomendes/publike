-- O admin muda o tipo da conta e o CNPJ (09/11/2026). Pode rodar de novo.
--
-- Admin › Usuários › conta › Perfil: trocar entre comércio, empresa e agência e corrigir ou tirar o CNPJ
-- (por exemplo, quem se cadastrou como agência por engano). As regras do perfil continuam valendo: agência
-- precisa de CNPJ válido (o gatilho perfis_verificar_agencia confere). Entre pessoa e as contas de quem
-- contrata não troca aqui: muda o currículo, as vagas e o painel.
--
-- O selo de verificado vale para aquele tipo e aquele CNPJ: mudou, o selo sai e a equipe liga de novo se
-- for o caso. O CNPJ tirado sai também do catálogo de empresas (privado.empresas) quando é o mesmo. Fica no
-- registro da equipe, com o antes e o depois.

create or replace function public.admin_mudar_tipo_e_cnpj(p_usuario uuid, p_tipo text, p_cnpj text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  antes record;
  novo_cnpj text := nullif(upper(regexp_replace(coalesce(p_cnpj, ''), '[^0-9A-Za-z]', '', 'g')), '');
  rotulo text;
begin
  perform privado.exigir_admin();
  if p_tipo is null or p_tipo not in ('comercio', 'empresa', 'agencia') then
    raise exception 'Escolha comércio, empresa ou agência.' using errcode = 'P0001', hint = 'tipo';
  end if;
  select p.tipo, p.cnpj, p.verificado into antes from public.perfis p where p.id = p_usuario;
  if not found then
    raise exception 'Essa conta ainda não tem perfil.' using errcode = 'P0001';
  end if;
  if antes.tipo = 'pessoa' then
    raise exception 'Conta de pessoa não vira empresa por aqui.' using errcode = 'P0001', hint = 'tipo';
  end if;
  if p_tipo = 'agencia' and novo_cnpj is null then
    raise exception 'Agência precisa de CNPJ.' using errcode = 'P0001', hint = 'cnpj';
  end if;
  if novo_cnpj is not null and not public.cnpj_valido(novo_cnpj) then
    raise exception 'Confira o CNPJ.' using errcode = 'P0001', hint = 'cnpj';
  end if;
  if antes.tipo = p_tipo and antes.cnpj is not distinct from novo_cnpj then
    return jsonb_build_object('tipo', p_tipo, 'cnpj', novo_cnpj, 'verificado', antes.verificado);
  end if;

  perform set_config('publike.sistema', 'on', true);
  update public.perfis
     set tipo = p_tipo,
         cnpj = novo_cnpj,
         -- o selo era daquele tipo e daquele CNPJ
         verificado = false
   where id = p_usuario;
  -- o CNPJ tirado (ou trocado) sai do catálogo de empresas quando era o da conta
  if antes.cnpj is not null and antes.cnpj is distinct from novo_cnpj then
    update privado.empresas set cnpj = novo_cnpj where perfil_id = p_usuario and cnpj = antes.cnpj;
  end if;
  perform set_config('publike.sistema', '', true);

  rotulo := antes.tipo || ' → ' || p_tipo
            || case when antes.cnpj is not distinct from novo_cnpj then ''
                    when novo_cnpj is null then '; CNPJ tirado'
                    else '; CNPJ trocado' end;
  perform privado.registrar('mudar_tipo', 'usuario', p_usuario::text, rotulo,
                            jsonb_build_object('tipo_antes', antes.tipo, 'tipo_depois', p_tipo,
                                               'cnpj_antes', antes.cnpj, 'cnpj_depois', novo_cnpj,
                                               'verificado_antes', antes.verificado));
  return jsonb_build_object('tipo', p_tipo, 'cnpj', novo_cnpj, 'verificado', false);
exception when others then
  perform set_config('publike.sistema', '', true);
  raise;
end
$$;

revoke execute on function public.admin_mudar_tipo_e_cnpj(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_mudar_tipo_e_cnpj(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
