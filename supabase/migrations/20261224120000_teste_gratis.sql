-- Teste Prático, etapa 1 (decisão do usuário, 30/10/2026): o teste sugerido vem grátis na vaga. Ao publicar, o
-- Publike põe na vaga o teste da Publike que combina com a função, e toda conta pode ter 1 teste da Publike por
-- vaga sem assinar. O pago fica nos extras: mais de um teste por vaga, os testes da casa e mandar o teste para
-- alguém (avaliacao_pedir continua pedindo o recurso). Pode rodar de novo.

-- o teste grátis da vaga: o primeiro da Publike que entrou nela (os outros valem com o recurso liberado)
create or replace function privado.teste_gratis(p_anuncio uuid, p_modelo uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_modelo = (select v.modelo_id
                                from privado.avaliacoes_da_vaga v
                                join privado.avaliacoes_modelos m on m.id = v.modelo_id
                               where v.anuncio_id = p_anuncio and m.conta_id is null and m.apagado_em is null
                               order by v.criado_em, v.modelo_id
                               limit 1), false)
$$;

-- a biblioteca: os da Publike para toda conta; os da casa com o recurso liberado
create or replace function public.avaliacoes_biblioteca()
returns table (id uuid, tipo text, area text, titulo text, descricao text, questoes integer, da_casa boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.tipo, m.area, m.titulo, m.descricao, jsonb_array_length(m.questoes), m.conta_id is not null
    from privado.avaliacoes_modelos m
   where (select auth.uid()) is not null and m.apagado_em is null
     and ((m.conta_id is null and m.publicado)
          or (m.conta_id = public.conta_atual() and privado.testes_liberado(public.conta_atual())))
   order by m.conta_id is null, m.tipo, m.titulo
$$;

-- os testes da vaga: grátis, 1 da Publike; mais testes ou os da casa pedem o recurso. Tirar é sempre livre.
create or replace function public.avaliacoes_salvar_na_vaga(p_anuncio uuid, p_itens jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  conta uuid := public.conta_atual();
begin
  perform privado.minha_vaga_qualquer(p_anuncio);
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 3 then
    raise exception 'Escolha até 3 testes por vaga.' using errcode = 'P0001';
  end if;
  for item in select * from jsonb_array_elements(p_itens) loop
    if not privado.modelo_disponivel((item ->> 'modelo_id')::uuid, conta) then
      raise exception 'Este teste não está disponível.' using errcode = 'P0001';
    end if;
  end loop;
  if jsonb_array_length(p_itens) > 0 and not privado.testes_liberado(conta)
     and (jsonb_array_length(p_itens) > 1
          or exists (select 1 from jsonb_array_elements(p_itens) x
                       join privado.avaliacoes_modelos m on m.id = (x ->> 'modelo_id')::uuid
                      where m.conta_id is not null)) then
    raise exception 'Sem assinar, a vaga tem 1 teste da Publike, grátis. Mais testes e os da sua empresa vêm com o Teste Prático.'
      using errcode = 'P0001', hint = 'testes_fechado';
  end if;
  delete from privado.avaliacoes_da_vaga v
   where v.anuncio_id = p_anuncio
     and v.modelo_id not in (select (x ->> 'modelo_id')::uuid from jsonb_array_elements(p_itens) x);
  insert into privado.avaliacoes_da_vaga (anuncio_id, modelo_id, obrigatoria)
  select p_anuncio, (x ->> 'modelo_id')::uuid, coalesce((x ->> 'obrigatoria')::boolean, false)
    from jsonb_array_elements(p_itens) x
  on conflict (anuncio_id, modelo_id) do update set obrigatoria = excluded.obrigatoria;
end
$$;

-- o que o candidato vê na vaga: os testes que valem (o grátis sempre; os outros com o recurso de quem publicou)
create or replace function public.avaliacoes_da_vaga(p_anuncio uuid)
returns table (modelo_id uuid, tipo text, titulo text, descricao text, questoes integer, obrigatoria boolean,
               da_casa boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.tipo, m.titulo, m.descricao, jsonb_array_length(m.questoes), v.obrigatoria, m.conta_id is not null
    from privado.avaliacoes_da_vaga v
    join privado.avaliacoes_modelos m on m.id = v.modelo_id
    join public.anuncios a on a.id = v.anuncio_id
   where v.anuncio_id = p_anuncio and m.apagado_em is null
     and (a.autor_id = public.conta_atual()
          or (a.status = 'ativo'
              and (privado.testes_liberado(a.autor_id) or privado.teste_gratis(v.anuncio_id, v.modelo_id))))
   order by v.criado_em
$$;

create or replace function public.avaliacao_da_vaga_para_mim(p_anuncio uuid, p_modelo uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_id uuid;
begin
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from privado.avaliacoes_da_vaga v join public.anuncios a on a.id = v.anuncio_id
                  where v.anuncio_id = p_anuncio and v.modelo_id = p_modelo
                    and (privado.testes_liberado(a.autor_id) or privado.teste_gratis(v.anuncio_id, v.modelo_id))) then
    raise exception 'Este teste não está nesta vaga.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = eu) then
    raise exception 'Curta a vaga primeiro: o teste vai junto com a sua candidatura.' using errcode = 'P0001';
  end if;
  select a.id into v_id from privado.avaliacoes_pedidas a
   where a.anuncio_id = p_anuncio and a.perfil_id = eu and a.modelo_id = p_modelo;
  if v_id is null then
    insert into privado.avaliacoes_pedidas (anuncio_id, perfil_id, modelo_id, origem)
    values (p_anuncio, eu, p_modelo, 'vaga') returning id into v_id;
  end if;
  return v_id;
end
$$;

revoke execute on function privado.teste_gratis(uuid, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
