-- Admin › Usuários: filtros pelo tipo da conta, por como entrou, pelo currículo e pelo que a conta procura
-- (21/11/2026; Marcelo: "quero filtros por tipo, perfil"). Os quatro parâmetros novos têm padrão null, então o site
-- de antes (que manda só os quatro de sempre) continua funcionando enquanto o deploy não chega. Pode rodar de novo.

drop function if exists public.admin_listar_usuarios(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_listar_usuarios(p_busca text DEFAULT NULL::text, p_filtro text DEFAULT 'todos'::text, p_limite integer DEFAULT 30, p_deslocamento integer DEFAULT 0,
  p_tipo text DEFAULT NULL::text, p_entrada text DEFAULT NULL::text, p_curriculo text DEFAULT NULL::text, p_procura text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, email text, telefone text, provedor text, criado_em timestamp with time zone, ultimo_acesso timestamp with time zone, nome text, tipo text, cidade text, bairro text, foto text, verificado boolean, whatsapp text, moderador boolean, suspenso_ate timestamp with time zone, suspensao_tipo text, anuncios_total integer, anuncios_no_ar integer, denuncias_recebidas integer, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  termo text := nullif(btrim(coalesce(p_busca, '')), '');
  digitos text := regexp_replace(coalesce(p_busca, ''), '\D', '', 'g');
begin
  perform privado.exigir_admin();
  return query
  select u.id, u.email::text, nullif(u.phone::text, ''),
         coalesce(u.raw_app_meta_data ->> 'provider',
                  case when coalesce(u.phone::text, '') <> '' then 'phone' else 'email' end),
         u.created_at, privado.ultimo_acesso(u.id),
         p.nome, p.tipo, p.cidade, p.bairro, p.foto, coalesce(p.verificado, false), ct.whatsapp,
         (mo.perfil_id is not null), s.fim, s.tipo,
         coalesce(an.total, 0)::integer, coalesce(an.no_ar, 0)::integer, coalesce(dn.total, 0)::integer,
         count(*) over ()
    from auth.users u
    left join public.perfis p on p.id = u.id
    left join public.contatos ct on ct.perfil_id = u.id
    left join public.moderadores mo on mo.perfil_id = u.id
    left join lateral (
      select s1.fim, s1.tipo from public.suspensoes s1
       where s1.usuario_id = u.id and s1.encerrada_em is null and s1.fim > now()
       order by s1.fim desc limit 1
    ) s on true
    left join lateral (
      select count(*) as total, count(*) filter (where a.status = 'ativo' and a.expira_em > now()) as no_ar
        from public.anuncios a where a.autor_id = u.id
    ) an on true
    left join lateral (
      select count(*) as total
        from public.denuncias d join public.anuncios a2 on a2.id = d.anuncio_id
       where a2.autor_id = u.id
    ) dn on true
   where (termo is null
          or public.sem_acento(coalesce(p.nome, '')) ilike '%' || public.sem_acento(termo) || '%'
          or u.email::text ilike '%' || termo || '%'
          or (char_length(digitos) >= 4
              and (coalesce(ct.whatsapp, '') like '%' || digitos || '%' or coalesce(u.phone::text, '') like '%' || digitos || '%')))
     and case coalesce(p_filtro, 'todos')
           when 'suspensos' then s.tipo = 'suspensao'
           when 'banidos' then s.tipo = 'banimento'
           when 'moderadores' then mo.perfil_id is not null
           when 'sem_perfil' then p.id is null
           when 'verificados' then coalesce(p.verificado, false)
           when 'agencias' then p.tipo = 'agencia'
           when 'agencias_a_verificar' then p.tipo = 'agencia' and not p.verificado
           else true
         end
     -- o tipo da conta: pessoa, comercio, empresa ou agencia
     and (p_tipo is null or p.tipo = p_tipo)
     -- como entrou: email, phone (celular/WhatsApp), google, facebook ou linkedin_oidc
     and (p_entrada is null
          or coalesce(u.raw_app_meta_data ->> 'provider',
                      case when coalesce(u.phone::text, '') <> '' then 'phone' else 'email' end) = p_entrada)
     -- o currículo (só de pessoa): com ou sem
     and case coalesce(p_curriculo, '')
           when 'com' then exists (select 1 from public.curriculos cv where cv.perfil_id = u.id)
           when 'sem' then p.tipo = 'pessoa' and not exists (select 1 from public.curriculos cv where cv.perfil_id = u.id)
           else true
         end
     -- o que procura, pelo que a conta fez: trabalho (curtiu vaga ou tem currículo), contrata (publicou vaga) ou
     -- oferece serviço (publicou serviço)
     and case coalesce(p_procura, '')
           when 'trabalho' then exists (select 1 from public.curtidas cu where cu.perfil_id = u.id)
                                or exists (select 1 from public.curriculos cv where cv.perfil_id = u.id)
           when 'contrata' then exists (select 1 from public.anuncios a3 where a3.autor_id = u.id and a3.tipo = 'vaga')
           when 'servico' then exists (select 1 from public.anuncios a3 where a3.autor_id = u.id and a3.tipo = 'servico')
           else true
         end
   order by u.created_at desc
   limit least(greatest(coalesce(p_limite, 30), 1), 100)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end
$function$;

revoke execute on function public.admin_listar_usuarios(text, text, integer, integer, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_listar_usuarios(text, text, integer, integer, text, text, text, text)
  to service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270821120000_admin_usuarios_filtros');
