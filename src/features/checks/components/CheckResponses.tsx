'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

import AvatarLetter from '@/shared/components/AvatarLetter';
import { CheckResponse } from '../types';
import cn from '@/lib/tailwindMerge';

const MAX_VISIBLE_AVATARS = 4;

const ResponseItem = ({ response }: { response: CheckResponse }) => {
  const { user, response: res } = response;
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-full border border-neutral-800 pr-1.5',
        {
          'border-solid bg-neutral-900': res === 'down',
          'bg-neutral-925 border-dashed': res === 'waitlist',
        }
      )}
    >
      <AvatarLetter
        avatarLetter={user.avatar_letter}
        size="inline"
        highlight={res === 'down'}
        className="border-neutral-925 border-2 border-solid"
      />
      <span className={cn('text-tiny', { 'text-neutral-500': res === 'waitlist' })}>
        {user.display_name}
      </span>
    </div>
  );
};

export default function CheckResponses({
  checkId,
  responses,
}: {
  checkId: string;
  responses: CheckResponse[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const downs = responses.filter((r) => r.response == 'down');
  const waitlisted = responses.filter((r) => r.response == 'waitlist');

  if (!responses.length) {
    return <div className="text-tiny">no responses yet</div>;
  }

  // Show downs first, then waitlisted in avatar stack
  const orderedResponses = [...downs, ...waitlisted];

  return (
    <div className="text-tiny flex items-center">
      <div
        className="flex cursor-pointer items-center gap-2"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex">
          {orderedResponses.slice(0, MAX_VISIBLE_AVATARS).map((r) => (
            <AvatarLetter
              size="inline"
              avatarLetter={r.user.avatar_letter}
              highlight={r.response === 'down'}
              className={cn(
                'border-neutral-925 border-2 border-solid not-first:-ml-1.5',
                { 'opacity-50': r.response === 'waitlist' }
              )}
              key={`${r.id}-${r.response}`}
            />
          ))}
          {orderedResponses.length > MAX_VISIBLE_AVATARS && (
            <AvatarLetter
              size="inline"
              avatarLetter={`+${orderedResponses.length - MAX_VISIBLE_AVATARS}`}
              className="border-neutral-925 border-2 border-solid text-[0.5rem] not-first:-ml-1.5"
            />
          )}
        </div>
        {!!downs.length && <span className="text-dt">{downs.length} down</span>}
        {!!waitlisted.length && <span className="text-neutral-500">{waitlisted.length} waitlist</span>}
      </div>

      {isExpanded &&
        createPortal(
          <div className="pt-4">
            {!!downs.length && (
              <section className="not-last:mb-4">
                <h2 className="text-tiny mb-2 uppercase">
                  Down ({downs.length})
                </h2>
                <div className="flex flex-wrap justify-start gap-1">
                  {downs.map((r) => (
                    <ResponseItem response={r} key={r.id} />
                  ))}
                </div>
              </section>
            )}
            {!!waitlisted.length && (
              <section>
                <h2 className="text-tiny mb-2 uppercase text-neutral-500">
                  Waitlist ({waitlisted.length})
                </h2>
                <div className="flex flex-wrap justify-start gap-1">
                  {waitlisted.map((r) => (
                    <ResponseItem response={r} key={r.id} />
                  ))}
                </div>
              </section>
            )}
          </div>,
          document.getElementById(`check-${checkId}:responses-root`)!
        )}
    </div>
  );
}
