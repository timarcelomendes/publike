-- O convite do Instagram no WhatsApp (22/11/2026; Marcelo: "em algum momento minutos depois podemos mandar o link de
-- acesso ao Instagram"). Quem procura trabalho e já recebeu vagas no atendimento recebe, uma vez só, uns 30 minutos
-- depois da última mensagem do Publike (sem ter respondido), o convite para seguir o Publike no Instagram, com o botão.
-- Só na janela das 24 horas (22 horas, com folga), das 8h às 21h, e fora do teto do mês. Liga e desliga em Admin ›
-- WhatsApp › Conversas (começa ligado). Pode rodar de novo.

alter table privado.config_whatsapp add column if not exists instagram_convite boolean not null default true;
alter table privado.config_whatsapp add column if not exists instagram_minutos integer not null default 30;
alter table privado.config_whatsapp drop constraint if exists config_whatsapp_instagram_minutos;
alter table privado.config_whatsapp add constraint config_whatsapp_instagram_minutos check (instagram_minutos between 10 and 600);

-- Quem recebe agora: a última mensagem é do Publike, com vagas (ou a pergunta do currículo que ficou sem resposta), há
-- mais de N minutos e menos de 6 horas; nunca recebeu o convite
create or replace function public.servidor_whatsapp_convite_instagram(p_chave text, p_marca text, p_marcas_ok text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hora integer := extract(hour from now() at time zone 'America/Sao_Paulo')::integer;
  v_teto integer := coalesce((select c.atendimento_teto_mes from privado.config_whatsapp c where c.id), 0);
  v_minutos integer;
begin
  perform privado.exigir_servidor(p_chave);
  select c.instagram_minutos into v_minutos from privado.config_whatsapp c
   where c.id and c.ativo and c.atendimento_ligado and c.instagram_convite;
  if v_minutos is null or v_hora < 8 or v_hora >= 21 or coalesce(p_marca, '') = ''
     or coalesce(array_length(p_marcas_ok, 1), 0) = 0 then
    return '[]'::jsonb;
  end if;
  if v_teto > 0 and privado.whatsapp_respostas_do_mes() >= v_teto then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('chave', x.chave, 'numero', x.numero))
      from (
        select c.chave, c.numero
          from privado.whatsapp_conversas c
          join lateral (select m.de, m.texto, m.criado_em from privado.whatsapp_conversa_mensagens m
                         where m.chave = c.chave order by m.criado_em desc limit 1) u on true
         where c.situacao = 'robo'
           and c.perfil = 'trabalho'
           and c.ultima_da_pessoa_em > now() - interval '22 hours'
           and u.de = 'robo'
           and u.criado_em < now() - make_interval(mins => v_minutos)
           and u.criado_em > now() - interval '6 hours'
           and exists (select 1 from unnest(p_marcas_ok) mm where coalesce(mm, '') <> '' and strpos(u.texto, mm) > 0)
           and not exists (select 1 from privado.whatsapp_conversa_mensagens m
                            where m.chave = c.chave and m.de = 'robo' and strpos(m.texto, p_marca) > 0)
         limit 20
      ) x), '[]'::jsonb);
end
$$;
revoke execute on function public.servidor_whatsapp_convite_instagram(text, text, text[]) from public;
grant execute on function public.servidor_whatsapp_convite_instagram(text, text, text[]) to anon, authenticated, service_role;

-- O Admin
create or replace function public.admin_whatsapp_instagram()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  return (select jsonb_build_object('ligado', c.instagram_convite, 'minutos', c.instagram_minutos)
            from privado.config_whatsapp c where c.id);
end
$$;

create or replace function public.admin_salvar_instagram_whatsapp(p_ligado boolean, p_minutos integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (privado.eh_admin() or privado.equipe_publike()) then
    raise exception 'Só a equipe do Publike.' using errcode = '42501';
  end if;
  update privado.config_whatsapp
     set instagram_convite = coalesce(p_ligado, instagram_convite),
         instagram_minutos = least(greatest(coalesce(p_minutos, instagram_minutos), 10), 600),
         atualizado_em = now(),
         atualizado_por = auth.uid()
   where id;
end
$$;
revoke execute on function public.admin_whatsapp_instagram(), public.admin_salvar_instagram_whatsapp(boolean, integer) from public, anon;
grant execute on function public.admin_whatsapp_instagram(), public.admin_salvar_instagram_whatsapp(boolean, integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270911120000_whatsapp_convite_instagram');
