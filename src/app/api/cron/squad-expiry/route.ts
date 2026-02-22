import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sets this automatically for cron routes)
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();
  const now = new Date().toISOString();
  const results = { graceMessages: 0, warnings: 0, expired: 0 };

  // 1. Send grace-period messages for check-based squads where timer expired
  //    but grace period hasn't started yet
  const { data: graceSquads } = await supabase
    .from('squads')
    .select('id, check_id')
    .not('check_id', 'is', null)
    .is('grace_started_at', null)
    .not('expires_at', 'is', null);

  if (graceSquads && graceSquads.length > 0) {
    // Check which of these have expired interest checks
    const checkIds = graceSquads.map(s => s.check_id!);
    const { data: expiredChecks } = await supabase
      .from('interest_checks')
      .select('id')
      .in('id', checkIds)
      .not('expires_at', 'is', null)
      .lt('expires_at', now);

    if (expiredChecks && expiredChecks.length > 0) {
      const expiredCheckIds = new Set(expiredChecks.map(c => c.id));
      const squadsToGrace = graceSquads.filter(s => expiredCheckIds.has(s.check_id!));

      for (const squad of squadsToGrace) {
        await supabase
          .from('squads')
          .update({ grace_started_at: now })
          .eq('id', squad.id);

        await supabase
          .from('messages')
          .insert({
            squad_id: squad.id,
            sender_id: null,
            text: "Timer's up — set a date to lock it in",
            is_system: true,
          });

        results.graceMessages++;
      }
    }
  }

  // 2. Send 1h warnings for squads expiring within the next hour
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data: warningSquads } = await supabase
    .from('squads')
    .select('id')
    .is('warned_at', null)
    .gt('expires_at', now)
    .lte('expires_at', oneHourFromNow);

  if (warningSquads) {
    for (const squad of warningSquads) {
      await supabase
        .from('squads')
        .update({ warned_at: now })
        .eq('id', squad.id);

      await supabase
        .from('messages')
        .insert({
          squad_id: squad.id,
          sender_id: null,
          text: 'This chat expires in 1 hour',
          is_system: true,
        });

      results.warnings++;
    }
  }

  // 3. Expire squads past their expires_at (cascade deletes messages + members)
  const { data: expiredSquads } = await supabase
    .from('squads')
    .select('id')
    .lt('expires_at', now);

  if (expiredSquads) {
    for (const squad of expiredSquads) {
      await supabase
        .from('squads')
        .delete()
        .eq('id', squad.id);

      results.expired++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
