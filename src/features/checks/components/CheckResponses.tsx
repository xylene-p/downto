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
          'bg-neutral-925 border-dashed': res === 'maybe',
        }
      )}
    >
      <AvatarLetter
        avatarLetter={user.avatar_letter}
        size="inline"
        highlight={res === 'down'}
        className="border-neutral-925 border-2 border-solid"
      />
      <span className="text-tiny">{user.display_name}</span>
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
  const maybes = responses.filter((r) => r.response == 'maybe');

  if (!responses.length) {
    return <div className="text-tiny">no responses yet</div>;
  }

  return (
    <div className="text-tiny flex items-center">
      <div
        className="flex cursor-pointer items-center gap-2"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex">
          {responses.slice(0, MAX_VISIBLE_AVATARS).map((r) => (
            <AvatarLetter
              size="inline"
              avatarLetter={r.user.avatar_letter}
              highlight={r.response === 'down'}
              className="border-neutral-925 border-2 border-solid not-first:-ml-1.5"
              key={`${r.id}-${r.response}`}
            />
          ))}
          {responses.length > MAX_VISIBLE_AVATARS && (
            <AvatarLetter
              size="inline"
              avatarLetter={`+${responses.length - MAX_VISIBLE_AVATARS}`}
              className="border-neutral-925 border-2 border-solid text-[0.5rem] not-first:-ml-1.5"
            />
          )}
        </div>
        {!!downs.length && <span className="text-dt">{downs.length} down</span>}
        {!!maybes.length && <span>{maybes.length} maybe</span>}
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
            {!!maybes.length && (
              <section>
                <h2 className="text-tiny mb-2 uppercase">
                  Maybe ({maybes.length})
                </h2>
                <div className="flex flex-wrap justify-start gap-1">
                  {maybes.map((r) => (
                    <ResponseItem response={r} key={r.id} />
                  ))}
                </div>
              </section>
            )}
          </div>,
          document.getElementById(`check-${checkId}`)
        )}
    </div>
  );
}
