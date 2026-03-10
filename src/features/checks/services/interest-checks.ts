'use server';

import {
  CheckExpiryType,
  SquadSizeType,
} from '@/features/checks/components/AddCheckModal';
import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { InterestCheck } from '../types';

// Create row in 'interest_checks' table
export async function createInterestCheck(
  _prevState: any,
  {
    text,
    expiry,
    squadSize,
  }: {
    text: string;
    expiry: CheckExpiryType;
    squadSize: SquadSizeType;
  }
) {
  let expiresAt = null;
  if (expiry !== 'open') {
    const d = new Date();
    d.setHours(d.getHours() + expiry);
    expiresAt = d.toISOString();
  }

  let maxSquadSize = undefined;
  if (squadSize != 'open') {
    maxSquadSize = squadSize;
  }

  const check = {
    text,
    expires_at: expiresAt,
    max_squad_size: maxSquadSize,
  };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('interest_checks')
    .insert({ ...check, author_id: user.id });

  if (error) {
    return error.message;
  }

  revalidatePath('/feed');
  redirect('/feed');
}
