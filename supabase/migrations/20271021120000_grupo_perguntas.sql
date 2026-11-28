-- As perguntas do Publike num grupo de avisos só delas (28/11/2026, Marcelo: "E separar os envios"). Um candidato
-- respondeu ao "Deu certo com a empresa?" pedindo para não receber mais; o "parar de receber" desse e-mail desligava o
-- grupo do andamento inteiro, e com ele os matches, as entrevistas e as respostas das empresas. Agora as perguntas
-- ("Deu certo?", "A empresa te respondeu?", "Alguém te chamou?", "Quem você contratou?", "A vaga ainda está aberta?")
-- são o grupo 'perguntas': desligar uma não desliga o andamento. Quem já tinha desligado o andamento fica também sem as
-- perguntas (a escolha de antes continua valendo).

alter table privado.avisos_desligados drop constraint if exists avisos_desligados_grupo_check;
alter table privado.avisos_desligados add constraint avisos_desligados_grupo_check
  check (grupo in ('mensagens', 'andamento', 'perguntas', 'conexoes', 'vagas_novas', 'semana', 'convites', 'noticias'));

do $$
declare
  f text;
  antes text;
begin
  -- o grupo: o "when" das perguntas vem antes do andamento (o case para no primeiro que serve)
  f := pg_get_functiondef('privado.grupo_do_aviso(text)'::regprocedure);
  if strpos(f, '''perguntas''') = 0 then
    antes := f;
    f := replace(f, 'select case' || chr(10) || '    when p_tipo = ''mensagem'' then ''mensagens''',
                 'select case' || chr(10)
                 || '    when p_tipo in (''conquista_pergunta'', ''conquista_confirmar'', ''conquista_parabens'', ''te_respondeu'','
                 || ' ''rota_pergunta'', ''quem_contratou'', ''vaga_continua'') then ''perguntas''' || chr(10)
                 || '    when p_tipo = ''mensagem'' then ''mensagens''');
    if f = antes then
      raise exception 'privado.grupo_do_aviso mudou: não achei o começo do case';
    end if;
    execute f;
  end if;

  -- o "parar de receber" do e-mail e as Preferências aceitam o grupo novo
  f := pg_get_functiondef('public.sair_dos_avisos(uuid, text)'::regprocedure);
  if strpos(f, '''perguntas''') = 0 then
    antes := f;
    f := replace(f, 'array[''mensagens'', ''andamento'',', 'array[''mensagens'', ''andamento'', ''perguntas'',');
    if f = antes then
      raise exception 'public.sair_dos_avisos mudou: não achei a lista dos grupos';
    end if;
    execute f;
  end if;

  f := pg_get_functiondef('public.mudar_aviso(text, text, boolean)'::regprocedure);
  if strpos(f, '''perguntas''') = 0 then
    antes := f;
    f := replace(f, 'not in (''mensagens'', ''andamento'',', 'not in (''mensagens'', ''andamento'', ''perguntas'',');
    if f = antes then
      raise exception 'public.mudar_aviso mudou: não achei a lista dos grupos';
    end if;
    execute f;
  end if;
end
$$;

-- quem tinha desligado o andamento continua sem as perguntas
insert into privado.avisos_desligados (conta_id, grupo, canal)
select d.conta_id, 'perguntas', d.canal from privado.avisos_desligados d where d.grupo = 'andamento'
on conflict do nothing;

select privado.migracao_aplicada('20271021120000_grupo_perguntas');
