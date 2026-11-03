-- "Quero testar" no /testar-app: quem tem conta põe o e-mail da conta Google da Play Store e entra sozinho em
-- Admin › Testadores do app, com o nome e o WhatsApp da conta. É a pessoa que pede (o consentimento está no
-- toque); o admin copia os e-mails para a lista da Play e manda o convite. Uma linha por conta: trocar o e-mail
-- antes do convite troca a linha. Depende de 20270128120000. Pode rodar de novo.

alter table privado.testadores_app add column if not exists conta_id uuid references public.perfis (id) on delete set null;
alter table privado.testadores_app add column if not exists origem text not null default 'admin'
  check (origem in ('admin', 'site'));
create index if not exists testadores_app_conta on privado.testadores_app (conta_id);

create or replace function public.quero_testar_app(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta uuid := (select auth.uid());
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nome text;
  v_whatsapp text;
begin
  if v_conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 200 then
    raise exception 'Confira o e-mail.' using errcode = '22023';
  end if;
  select p.nome, ct.whatsapp into v_nome, v_whatsapp
    from public.perfis p left join public.contatos ct on ct.perfil_id = p.id where p.id = v_conta;
  -- a conta trocou o e-mail antes do convite: sai a linha antiga
  delete from privado.testadores_app t
   where t.conta_id = v_conta and t.email <> v_email and t.whatsapp_em is null and t.email_em is null;
  insert into privado.testadores_app (nome, email, whatsapp, conta_id, origem)
  values (left(coalesce(nullif(btrim(v_nome), ''), split_part(v_email, '@', 1)), 80), v_email,
          case when v_whatsapp ~ '^55[1-9][0-9]{9,10}$' then v_whatsapp end, v_conta, 'site')
  on conflict (email) do update
    set conta_id = excluded.conta_id,
        whatsapp = coalesce(privado.testadores_app.whatsapp, excluded.whatsapp);
end
$$;
revoke execute on function public.quero_testar_app(text) from public, anon;
grant execute on function public.quero_testar_app(text) to authenticated;

-- a lista do admin: a conta ligada (quem pediu pelo site) ou a do mesmo e-mail
create or replace function public.admin_testadores_app()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object(
           'conta_id', c.conta_id, 'conta_nome', c.nome, 'conta_whatsapp', c.whatsapp)
           order by t.criado_em, t.nome), '[]'::jsonb)
    from privado.testadores_app t
    left join lateral (
      select x.* from (
        select p.id as conta_id, p.nome, ct.whatsapp, 0 as ordem
          from public.perfis p left join public.contatos ct on ct.perfil_id = p.id
         where p.id = t.conta_id
        union all
        select d.conta_id, d.nome, d.whatsapp, 1 from privado.conta_do_testador(t.email) d
      ) x order by x.ordem limit 1
    ) c on true
$$;
revoke execute on function public.admin_testadores_app() from public, anon, authenticated;
grant execute on function public.admin_testadores_app() to service_role;

notify pgrst, 'reload schema';
