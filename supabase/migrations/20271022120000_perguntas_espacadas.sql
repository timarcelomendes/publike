-- As perguntas do Publike por e-mail, espaçadas (28/11/2026, Marcelo: "E separar os envios"). Um candidato recebeu 17
-- e-mails em 7 dias, 7 deles "A empresa te respondeu?" (um por vaga). Agora sai no máximo um e-mail do grupo
-- 'perguntas' (migração 20271021120000) a cada 3 dias para a mesma pessoa; os outros ficam só no sino e no celular.

do $$
declare
  f text;
  antes text;
begin
  f := pg_get_functiondef('privado.enfileirar_email(uuid, text, jsonb)'::regprocedure);
  if strpos(f, 'perguntas do Publike, espaçadas') = 0 then
    antes := f;
    f := replace(f, '  -- e o limite por dia para a mesma pessoa (avisos de conta e de moderação passam sempre)',
                 '  -- as perguntas do Publike, espaçadas: no máximo um e-mail delas a cada 3 dias (migração 20271022120000)' || chr(10)
                 || '  if v_grupo = ''perguntas'' and exists (' || chr(10)
                 || '    select 1 from privado.fila_emails f' || chr(10)
                 || '     where f.usuario_id = p_usuario and f.criado_em > now() - interval ''3 days''' || chr(10)
                 || '       and privado.grupo_do_aviso(f.modelo) = ''perguntas''' || chr(10)
                 || '  ) then' || chr(10)
                 || '    return;' || chr(10)
                 || '  end if;' || chr(10)
                 || '  -- e o limite por dia para a mesma pessoa (avisos de conta e de moderação passam sempre)');
    if f = antes then
      raise exception 'privado.enfileirar_email mudou: não achei o limite por dia';
    end if;
    execute f;
  end if;
end
$$;

select privado.migracao_aplicada('20271022120000_perguntas_espacadas');
