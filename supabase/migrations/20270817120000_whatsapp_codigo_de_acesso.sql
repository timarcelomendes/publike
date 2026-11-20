-- O código de entrar pelo WhatsApp (20/11/2026; Marcelo: "Sim", para quem chega pelo WhatsApp entrar com um código no
-- próprio WhatsApp em vez do e-mail). O Supabase Auth gera o código do celular e chama o gancho "Send SMS"
-- (/api/auth/codigo-whatsapp); o site manda o código pela conversa do Publike. Só dentro das 24 horas da Meta (a pessoa
-- escreveu há pouco): fora delas, o WhatsApp só aceita modelo aprovado, e o site pede um "oi" antes.
--
-- Esta função acha a conversa do número digitado (com ou sem o 9: o WhatsApp guarda o celular sem ele, 556282028335) e
-- diz se está na janela. O código nunca fica guardado: a conversa registra só "[Código de acesso enviado]".
--
-- Pode rodar de novo.
create or replace function public.servidor_whatsapp_codigo(p_chave text, p_numero text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
  v_sem9 text;
  v_com9 text;
  v_conversa text;
  v_numero text;
  v_janela boolean;
begin
  perform privado.exigir_servidor(p_chave);
  if v_d !~ '^55[1-9][0-9][0-9]{8,9}$' then
    return jsonb_build_object('conversa', null, 'numero', null, 'na_janela', false);
  end if;
  v_sem9 := case when v_d ~ '^55[1-9][0-9]9[0-9]{8}$' then substr(v_d, 1, 4) || substr(v_d, 6) else v_d end;
  v_com9 := case when v_d ~ '^55[1-9][0-9][6-9][0-9]{7}$' then substr(v_d, 1, 4) || '9' || substr(v_d, 5) else v_d end;
  select c.chave, c.numero, coalesce(c.ultima_da_pessoa_em > now() - interval '23 hours', false)
    into v_conversa, v_numero, v_janela
    from privado.whatsapp_conversas c
   where c.numero in (v_d, v_sem9, v_com9)
   order by c.ultima_da_pessoa_em desc nulls last
   limit 1;
  return jsonb_build_object('conversa', v_conversa, 'numero', v_numero, 'na_janela', coalesce(v_janela, false));
end
$$;
revoke execute on function public.servidor_whatsapp_codigo(text, text) from public;
grant execute on function public.servidor_whatsapp_codigo(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270817120000_whatsapp_codigo_de_acesso');
