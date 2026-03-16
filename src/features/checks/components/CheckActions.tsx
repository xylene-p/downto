import Button from '@/shared/components/Button';
import { startTransition, useOptimistic, useState } from 'react';
import {
  removeCheckResponse,
  updateCheckResponse,
} from '@/features/checks/services/check-responses';
import cn from '@/lib/tailwindMerge';
import { useAuth } from '@/app/providers/AuthProvider';
import { ResponseType } from '../types';

export default function CheckActions({
  checkId,
  response: initialResponse,
  isFull,
}: {
  checkId: string;
  response: ResponseType | null;
  isFull: boolean;
}) {
  const { user } = useAuth();
  const [response, setResponse] = useState(initialResponse);
  const [optimisticResponse, setOptimisticResponse] = useOptimistic(response);

  const handleDown = () => {
    if (optimisticResponse === 'down' || optimisticResponse === 'waitlist') {
      // Undo
      startTransition(async () => {
        setOptimisticResponse(null);
        await removeCheckResponse({ userId: user.id, checkId });
        setResponse(null);
      });
    } else {
      // Respond down (server may convert to waitlist via trigger)
      startTransition(async () => {
        setOptimisticResponse(isFull ? 'waitlist' : 'down');
        await updateCheckResponse({ userId: user.id, checkId, response: 'down' });
        // Server decides the actual response — we trust the optimistic for now
        setResponse(isFull ? 'waitlist' : 'down');
      });
    }
  };

  return (
    <div className="flex gap-1.5">
      {optimisticResponse === 'waitlist' ? (
        <Button
          size="small"
          variant="outline"
          onClick={handleDown}
          className="border-dashed text-neutral-500 before:mr-1 before:content-['✓']"
        >
          Waitlisted
        </Button>
      ) : (
        <Button
          size="small"
          variant={optimisticResponse === 'down' ? 'primary' : 'outline'}
          onClick={handleDown}
          className={cn({
            "text-bold before:mr-1 before:content-['✓']":
              optimisticResponse === 'down',
          })}
        >
          {optimisticResponse === 'down'
            ? 'Down'
            : isFull
              ? 'Join Waitlist'
              : 'Down'}
        </Button>
      )}
    </div>
  );
}
