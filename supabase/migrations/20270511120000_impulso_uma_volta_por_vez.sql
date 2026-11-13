-- Uma volta do robô do impulso por vez (13/11/2026). O robô (cuidarDosImpulsos) é chamado pelo cron-job.org a cada
-- minuto (/api/filas), pela tarefa do GitHub (a reserva) e pelas ações do site (o after() depois de pagar ou de
-- aprovar). Uma volta leva até 40 segundos, e duas voltas juntas podiam criar a mesma campanha duas vezes no Google.
-- Agora a volta pega a vez (config_impulso.robo_desde) e solta no fim; a outra pula, e o trabalho fica para a próxima
-- volta. A vez vence em 2 minutos: uma volta que caiu no meio não prende o robô. Pode rodar de novo.

alter table privado.config_impulso
  add column if not exists robo_desde timestamptz,
  add column if not exists robo_vez uuid;

-- A volta pega a vez: só se ninguém tem, ou se a vez de quem tinha passou de 2 minutos.
create or replace function public.servidor_impulsos_pegar_vez(p_chave text, p_vez uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.config_impulso
     set robo_desde = now(), robo_vez = p_vez
   where id and (robo_desde is null or robo_desde < now() - interval '2 minutes');
  return found;
end
$$;

-- No fim da volta: solta a vez, se ainda for dela.
create or replace function public.servidor_impulsos_soltar_vez(p_chave text, p_vez uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  update privado.config_impulso set robo_desde = null, robo_vez = null where id and robo_vez = p_vez;
end
$$;

revoke execute on function public.servidor_impulsos_pegar_vez(text, uuid), public.servidor_impulsos_soltar_vez(text, uuid)
  from public;
grant execute on function public.servidor_impulsos_pegar_vez(text, uuid), public.servidor_impulsos_soltar_vez(text, uuid)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
