-- O aceite do WhatsApp (claude/plano-retorno-e-whatsapp.md, parte 3a). Pode rodar de novo.
-- A Meta exige o aceite da pessoa antes de a empresa mandar a primeira mensagem pelo WhatsApp oficial. A
-- integração ainda não está ligada (a conta da Meta está restrita); pedir o aceite já agora monta a base.
-- O WhatsApp é por aceite (o e-mail e o celular continuam ligados por padrão): sem linha, sem WhatsApp.

create table if not exists privado.whatsapp_permissoes (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  numero text not null check (numero ~ '^55[1-9][0-9][0-9]{8,9}$'),
  origem text not null check (origem in ('avisos', 'curtir', 'quadro')),
  aceito_em timestamptz not null default now(),
  cancelado_em timestamptz
);
alter table privado.whatsapp_permissoes enable row level security;
revoke all on table privado.whatsapp_permissoes from public, anon, authenticated;

-- o aceite da conta de quem está vendo (e o número que vai receber)
create or replace function public.whatsapp_da_conta()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  r privado.whatsapp_permissoes;
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  select * into r from privado.whatsapp_permissoes w where w.conta_id = conta;
  return jsonb_build_object(
    'aceito', found and r.cancelado_em is null,
    'numero', coalesce((select c.whatsapp from public.contatos c where c.perfil_id = conta), r.numero),
    'pode', (select public.papel_na_conta()) in ('dono', 'admin'));
end
$$;

create or replace function public.mudar_whatsapp(p_aceito boolean, p_origem text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  v_numero text;
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta escolhe os avisos.' using errcode = '42501';
  end if;
  if coalesce(p_origem, '') not in ('avisos', 'curtir', 'quadro') then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  if not coalesce(p_aceito, false) then
    update privado.whatsapp_permissoes set cancelado_em = now() where conta_id = conta and cancelado_em is null;
    return;
  end if;
  select c.whatsapp into v_numero from public.contatos c where c.perfil_id = conta;
  if v_numero is null then
    raise exception 'Ponha o seu WhatsApp no perfil primeiro.' using errcode = 'P0001', hint = 'sem_numero';
  end if;
  insert into privado.whatsapp_permissoes (conta_id, numero, origem, aceito_em, cancelado_em)
  values (conta, v_numero, p_origem, now(), null)
  on conflict (conta_id) do update
    set numero = excluded.numero, origem = excluded.origem, aceito_em = now(), cancelado_em = null;
end
$$;

revoke all on function public.whatsapp_da_conta(), public.mudar_whatsapp(boolean, text) from public, anon;
grant execute on function public.whatsapp_da_conta(), public.mudar_whatsapp(boolean, text) to authenticated;

notify pgrst, 'reload schema';
