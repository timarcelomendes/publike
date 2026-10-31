-- Finalistas para avaliar também na conta de empresa e de comércio (plano do retorno, parte 4).
-- O banco dos finalistas já não dependia de ser agência; só a tela escondia. Aqui:
-- 1) finalistas_do_link devolve o tipo da conta (a página do link fala "o gestor" ou "o cliente");
-- 2) adicionar_finalistas: fora da agência, o candidato não recebe "seu currículo foi enviado para a empresa";
-- 3) responder_finalista: sem o nome de quem respondeu, o aviso diz "Quem avaliou" fora da agência.
-- Pode rodar de novo.

create or replace function public.finalistas_do_link(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  l public.links_finalistas;
  v_situacao text;
  v_previa boolean;
  r jsonb;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into l from public.links_finalistas x where x.token = p_token;
  if not found then
    return null;
  end if;
  v_situacao := privado.situacao_link_finalistas(l);
  -- a própria agência olhando ("ver como o cliente"): não conta como o cliente abrindo
  v_previa := exists (select 1 from public.anuncios a where a.id = l.anuncio_id and a.autor_id = (select public.conta_atual()));
  if v_situacao = 'valido' and not v_previa then
    update public.links_finalistas x
       set aberto_em = now(), aberturas = x.aberturas + 1
     where x.anuncio_id = l.anuncio_id;
  end if;
  select jsonb_build_object(
    'situacao', v_situacao,
    'previa', v_previa,
    'expira_em', l.expira_em,
    'agencia', jsonb_build_object('nome', p.nome, 'foto', p.foto, 'verificado', p.verificado, 'tipo', p.tipo),
    'vaga', case when v_situacao = 'valido' then jsonb_build_object(
      'titulo', a.titulo,
      'cidade', a.cidade,
      'bairro', a.bairro,
      'regime', a.regime,
      'cliente', coalesce(ca.nome, nullif(btrim(a.contratante), '')),
      'perguntas', coalesce(a.perguntas, '[]'::jsonb)
    ) end,
    'finalistas', case when v_situacao = 'valido' then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id,
               'nome', pf.nome,
               'foto', pf.foto,
               'cidade', pf.cidade,
               'bairro', pf.bairro,
               'parecer', f.parecer,
               'decisao', f.decisao,
               'comentario', f.comentario,
               'quem', f.quem,
               'decidido_em', f.decidido_em,
               'respostas', c.respostas,
               'curriculo', case when cv.perfil_id is null then null else jsonb_build_object(
                 'titulo', cv.titulo,
                 'habilidades', cv.habilidades,
                 'escolaridade', cv.escolaridade,
                 'curso', cv.curso,
                 'estudos', cv.estudos,
                 'experiencias', cv.experiencias,
                 'cursos', cv.cursos,
                 'cnh', cv.cnh,
                 'disponibilidade', cv.disponibilidade,
                 'atualizado_em', cv.atualizado_em
               ) end
             ) order by f.criado_em, f.id)
        from public.finalistas f
        join public.curtidas c on c.anuncio_id = f.anuncio_id and c.perfil_id = f.perfil_id
        join public.perfis pf on pf.id = f.perfil_id
        left join public.curriculos cv on cv.perfil_id = f.perfil_id
       where f.anuncio_id = a.id and c.status = 'match'
    ), '[]'::jsonb) end
  ) into r
    from public.anuncios a
    join public.perfis p on p.id = a.autor_id
    left join public.clientes_agencia ca on ca.id = a.cliente_id
   where a.id = l.anuncio_id;
  return r;
end
$function$;

create or replace function public.responder_finalista(p_token text, p_id uuid, p_decisao text, p_comentario text DEFAULT NULL::text, p_quem text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  l public.links_finalistas;
  v_situacao text;
  v_comentario text := nullif(btrim(coalesce(p_comentario, '')), '');
  v_quem text := nullif(btrim(regexp_replace(coalesce(p_quem, ''), '\s+', ' ', 'g')), '');
  v_autor uuid;
  v_titulo text;
  v_entrevistar integer;
  v_nao integer;
  v_texto text;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' or p_id is null then
    return 'invalido';
  end if;
  if p_decisao is not null and p_decisao not in ('entrevistar', 'nao_seguir') then
    return 'invalido';
  end if;
  select * into l from public.links_finalistas x where x.token = p_token;
  if not found then
    return 'invalido';
  end if;
  v_situacao := privado.situacao_link_finalistas(l);
  if v_situacao <> 'valido' then
    return case when v_situacao = 'expirado' then 'expirado' else 'invalido' end;
  end if;
  update public.finalistas f
     set decisao = p_decisao,
         comentario = left(v_comentario, 600),
         quem = left(v_quem, 80),
         decidido_em = case when p_decisao is null and v_comentario is null then null else now() end,
         atualizado_em = now()
   where f.id = p_id
     and f.anuncio_id = l.anuncio_id
     and exists (select 1 from public.curtidas c
                  where c.anuncio_id = f.anuncio_id and c.perfil_id = f.perfil_id and c.status = 'match');
  if not found then
    return 'invalido';
  end if;

  select a.autor_id, a.titulo into v_autor, v_titulo from public.anuncios a where a.id = l.anuncio_id;
  select count(*) filter (where f.decisao = 'entrevistar'), count(*) filter (where f.decisao = 'nao_seguir')
    into v_entrevistar, v_nao
    from public.finalistas f where f.anuncio_id = l.anuncio_id;
  v_texto := left(coalesce(v_quem, case when exists (select 1 from public.perfis p where p.id = v_autor and p.tipo = 'agencia') then 'O cliente' else 'Quem avaliou' end) || ' respondeu sobre os finalistas de “' || v_titulo || '”: '
                  || v_entrevistar || ' para entrevistar e ' || v_nao || ' para não seguir.', 300);
  -- respondendo um atrás do outro: troca o aviso que a agência ainda não viu, sem outro e-mail
  update public.notificacoes n
     set texto = v_texto, criado_em = now()
   where n.destinatario_id = v_autor and n.tipo = 'finalistas' and n.anuncio_id = l.anuncio_id
     and not n.lida and n.criado_em > now() - interval '2 hours';
  if not found then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (v_autor, 'finalistas', l.anuncio_id, null, v_texto);
  end if;
  return 'ok';
end
$function$;

create or replace function public.adicionar_finalistas(p_anuncio uuid, p_perfis uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  eu uuid := (select public.conta_atual());
  v_titulo text := privado.minha_vaga_para_finalistas(p_anuncio);
  v_texto text;
  p uuid;
  n integer := 0;
  v_agencia boolean := exists (select 1 from public.perfis x where x.id = eu and x.tipo = 'agencia');
begin
  if cardinality(coalesce(p_perfis, '{}')) > 100 then
    raise exception 'Escolha até 100 pessoas de uma vez.' using errcode = '22023';
  end if;
  if (select count(*) from public.finalistas f where f.anuncio_id = p_anuncio)
     + cardinality(coalesce(p_perfis, '{}')) > 200 then
    raise exception 'A lista de finalistas desta vaga chegou a 200 pessoas.' using errcode = 'P0001';
  end if;
  v_texto := left('Boa notícia: seu currículo foi enviado para a empresa da vaga “' || v_titulo || '”.', 300);
  foreach p in array coalesce(p_perfis, '{}') loop
    insert into public.finalistas (anuncio_id, perfil_id)
    select c.anuncio_id, c.perfil_id
      from public.curtidas c
     where c.anuncio_id = p_anuncio and c.perfil_id = p and c.status = 'match'
    on conflict (anuncio_id, perfil_id) do nothing;
    if found then
      n := n + 1;
      -- empresa e comércio mandam ao gestor da própria casa: não é outra empresa, o candidato não recebe aviso
      continue when not v_agencia;
      -- um aviso por vaga: se ainda não viu um aviso de etapa desta vaga da última hora, troca o texto
      update public.notificacoes x
         set texto = v_texto, criado_em = now()
       where x.destinatario_id = p and x.tipo = 'etapa' and x.anuncio_id = p_anuncio
         and not x.lida and x.criado_em > now() - interval '1 hour';
      if not found then
        insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
        values (p, 'etapa', p_anuncio, eu, v_texto);
      end if;
    end if;
  end loop;
  return n;
end
$function$;
