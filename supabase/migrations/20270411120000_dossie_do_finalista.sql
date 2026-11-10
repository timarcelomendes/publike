-- Dossiê do finalista (10/11/2026; claude/plano-planos-empresa-e-agencia.md, etapa 2, recurso 4). Rode depois de
-- 20270410120000_garantia_com_o_cliente.sql. Pode rodar de novo.
--
-- No link dos finalistas, com o Plano Agência (ou a cortesia), cada finalista ganha uma página para o cliente ver ou
-- salvar em PDF, com a marca da agência: o que a Triagem com IA achou em cada critério, o resumo do currículo pela IA
-- (o que a agência já gerou no quadro), a nota do Teste Prático e o resumo da Entrevista em vídeo. O currículo e o
-- parecer vêm do link, como hoje. Nada de contato. Só o que já existe: o link não gera IA (sem custo por abertura).

create or replace function public.dossie_do_finalista(p_token text, p_finalista uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.links_finalistas;
  f public.finalistas;
  v_autor uuid;
  v_criterios jsonb;
  v_leitura jsonb;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into l from public.links_finalistas x where x.token = p_token and x.expira_em > now();
  if l.anuncio_id is null then
    return null;
  end if;
  select * into f from public.finalistas x where x.id = p_finalista and x.anuncio_id = l.anuncio_id;
  if f.id is null then
    return null;
  end if;
  select a.autor_id into v_autor from public.anuncios a where a.id = l.anuncio_id;
  if not privado.agencia_com_plano(v_autor) then
    return jsonb_build_object('liberado', false);
  end if;

  -- a Triagem: cada critério da vaga com o que a IA leu no currículo (sem o trecho, que pode ter dado pessoal)
  select v.criterios into v_criterios from privado.copiloto_vagas v where v.anuncio_id = l.anuncio_id;
  select t.resultado into v_leitura from privado.copiloto_avaliacoes t
   where t.anuncio_id = l.anuncio_id and t.perfil_id = f.perfil_id
   order by t.criado_em desc limit 1;

  return jsonb_build_object(
    'liberado', true,
    'triagem', case when v_leitura is null then null else (
      select coalesce(jsonb_agg(jsonb_build_object(
               'texto', c ->> 'texto',
               'obrigatorio', coalesce((c ->> 'obrigatorio')::boolean, false),
               'resultado', coalesce(r ->> 'resultado', 'sem_info'),
               'explicacao', left(coalesce(r ->> 'explicacao', ''), 300))
             order by coalesce((c ->> 'obrigatorio')::boolean, false) desc), '[]'::jsonb)
        from jsonb_array_elements(coalesce(v_criterios, '[]'::jsonb)) c
        left join lateral (select x from jsonb_array_elements(coalesce(v_leitura -> 'criterios', '[]'::jsonb)) x
                            where x ->> 'id' = c ->> 'id' limit 1) rr(r) on true) end,
    'resumo', (select jsonb_build_object('resumo', s.conteudo ->> 'resumo', 'fortes', s.conteudo -> 'fortes',
                                         'conferir', s.conteudo -> 'conferir')
                 from public.resumos_candidato s
                where s.anuncio_id = l.anuncio_id and s.perfil_id = f.perfil_id),
    'teste', (select jsonb_build_object('titulo', m.titulo, 'pontos', p.pontos, 'maximo', p.maximo,
                                        'feita_em', p.feita_em)
                from privado.avaliacoes_pedidas p
                left join privado.avaliacoes_modelos m on m.id = p.modelo_id
               where p.anuncio_id = l.anuncio_id and p.perfil_id = f.perfil_id and p.status = 'feita'
               order by p.feita_em desc nulls last limit 1),
    'video', (select jsonb_build_object('resumo', e.resumo ->> 'resumo', 'fortes', e.resumo -> 'fortes',
                                        'conferir', e.resumo -> 'conferir', 'enviada_em', e.enviada_em)
                from public.entrevistas_video e
               where e.anuncio_id = l.anuncio_id and e.perfil_id = f.perfil_id and e.resumo is not null
               order by e.enviada_em desc nulls last limit 1));
end
$$;

revoke execute on function public.dossie_do_finalista(text, uuid) from public;
grant execute on function public.dossie_do_finalista(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
