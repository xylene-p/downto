import { format, formatDistanceToNow, isPast } from 'date-fns';

export function formatExpiresAt(expiresAt: string | null) {
  if (!expiresAt) {
    return 'open';
  }

  const d = new Date(expiresAt);
  if (isPast(d)) {
    return 'expired';
  }

  return formatDistanceToNow(d);
}

export function formatEventDateTime({
  eventDate,
  eventTime,
}: {
  eventDate: string | null;
  eventTime: string | null;
}) {
  if (!eventDate && !eventTime) {
    return 'date & time TBD';
  }

  return (
    (eventDate ? format(new Date(eventDate), 'eee, MMM d') : 'date TBD') +
    ' at ' +
    (eventTime ? eventTime : 'time TBD')
  );
}

export function getDistanceToExpire(
  expiresAt: string | null,
  startedAt?: string
) {
  if (!expiresAt) {
    return 0;
  }

  let start = new Date();
  if (startedAt) {
    start = new Date(startedAt);
  }

  const end = new Date(expiresAt);

  return end.getTime() - start.getTime();
}
