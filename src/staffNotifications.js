import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { getSupabaseClient } from './db.js';
import { staffRequestEmail } from './emails/templates.js';
export async function notifyStaff(id, config) {
  if (!config.staffNotificationEmail) return { state: 'disabled' };
  const db = getSupabaseClient(), lease = randomUUID();
  const claimed = await db.rpc('lavemais_claim_notification', { p_id:id, p_lease:lease });
  if (claimed.error) throw claimed.error;
  if (!claimed.data) return { state: 'unchanged' };
  let sent = false;
  try {
    const smtp = config.smtp;
    const transport = nodemailer.createTransport({ host:smtp.host,port:smtp.port,secure:smtp.port===465,requireTLS:smtp.port!==465,
      auth:{user:smtp.user,pass:smtp.password},connectionTimeout:4000,greetingTimeout:4000,socketTimeout:8000 });
    await transport.sendMail({ from:smtp.from,to:config.staffNotificationEmail,...staffRequestEmail(config) });
    sent = true;
  } catch { console.error('Staff notification delivery failed'); }
  const finished = await db.rpc('lavemais_finish_notification', {p_id:id,p_lease:lease,p_sent:sent});
  if (finished.error) throw finished.error;
  return { state:sent?'sent':'failed' };
}
